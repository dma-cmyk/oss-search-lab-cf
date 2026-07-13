import OpenAI from "openai";
import * as cheerio from "cheerio";
import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Create Gemini client (lazily initialized for Cloudflare Workers support)
let ai: GoogleGenAI | null = null;

function getAiClient() {
  if (ai) return ai;
  const key = (globalThis.cloudflareEnv?.GEMINI_API_KEY) || process.env.GEMINI_API_KEY || "MY_GEMINI_API_KEY";
  ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
  return ai;
}

// Curated list of high-quality Gemini models
const CURATED_MODELS = [
  { name: "models/gemini-flash-lite-latest", displayName: "Gemini Flash-Lite Latest", description: "Fast and lightweight model for low-latency tasks (Default)" },
  { name: "models/gemini-3.5-flash", displayName: "Gemini 3.5 Flash", description: "Standard model for text, code, and basic reasoning" },
  { name: "models/gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash-Lite", description: "Very fast and efficient model for low-latency tasks" },
  { name: "models/gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro Preview", description: "Advanced pro model for complex reasoning, math, and deep code analysis" },
  { name: "models/gemini-3.1-flash-lite-image", displayName: "Gemini 3.1 Flash-Lite Image", description: "Standard image generation and processing model" },
  { name: "models/gemini-3.1-flash-image", displayName: "Gemini 3.1 Flash Image", description: "High-quality image generation model" }
];


// --- CIRCUIT BREAKER & CACHE FOR GEMINI RATE LIMITS ---
let geminiRateLimitCoolOffUntil = 0; // Timestamp in ms
const RATE_LIMIT_COOL_OFF_MS = 60 * 1000; // 1 minute cool-off
const searchQueryCache = new Map<string, string>();

function isQuotaExceededError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.statusText || err).toLowerCase();
  if (msg.includes("429") || msg.includes("quota exceeded") || msg.includes("resource_exhausted")) {
    return true;
  }
  if (err.status === 429 || err.statusCode === 429) {
    return true;
  }
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && parsed.error && (parsed.error.code === 429 || String(parsed.error.status).includes("RESOURCE_EXHAUSTED"))) {
      return true;
    }
  } catch (e) {}
  return false;
}

function markGeminiRateLimited() {
  geminiRateLimitCoolOffUntil = Date.now() + RATE_LIMIT_COOL_OFF_MS;
  console.log(`[CIRCUIT BREAKER] Gemini API hit a 429 / quota limit. Enabling cool-off for ${RATE_LIMIT_COOL_OFF_MS / 1000} seconds. Subsequent calls will automatically use local fallbacks.`);
}

function isGeminiRateLimited(): boolean {
  if (geminiRateLimitCoolOffUntil > 0 && Date.now() < geminiRateLimitCoolOffUntil) {
    return true;
  }
  return false;
}


async function fetchImageAsBase64(url: string): Promise<{ mimeType: string, data: string } | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "OSS-Search-Lab-App-v1" } });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const supportedTypes = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "image/jpg"];
    if (!supportedTypes.some(type => contentType.toLowerCase().includes(type))) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return { mimeType: contentType.split(";")[0].trim(), data: base64 };
  } catch (e) {
    return null;
  }
}

function extractPromptText(prompt: any): string {
  if (!prompt) return "";
  if (typeof prompt === "string") return prompt;
  if (typeof prompt.text === "string") return prompt.text;
  if (Array.isArray(prompt.parts)) {
    const p = prompt.parts.find((x: any) => x && typeof x.text === "string");
    if (p) return p.text;
  }
  if (prompt.parts && Array.isArray(prompt.parts)) {
    const p = prompt.parts.find((x: any) => x && typeof x.text === "string");
    if (p) return p.text;
  }
  return JSON.stringify(prompt);
}

function extractJsonString(text: string): string {
  if (!text) return "";
  text = text.trim();
  
  // 1. Try to extract from ```json ... ``` block
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/i;
  const jsonMatch = text.match(jsonBlockRegex);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }

  // 2. Try to extract from generic code block if it looks like JSON
  const anyBlockRegex = /```\s*([\s\S]*?)\s*```/i;
  const anyMatch = text.match(anyBlockRegex);
  if (anyMatch && anyMatch[1]) {
    const candidate = anyMatch[1].trim();
    if (candidate.startsWith("{") || candidate.startsWith("[")) {
      return candidate;
    }
  }

  // 3. Fallback: Search for the first '{' and the last '}' to isolate JSON object
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }

  return text;
}

// Helper to get Gemini client and model based on headers

async function callAiContent(req: express.Request, prompt: any, systemInstruction: string, responseSchema: any, customModelFallback = "models/gemini-flash-lite-latest", imageParts: any[] = []) {
  const provider = req.headers["x-ai-provider"] as string || "gemini";
  const customKey = req.headers["x-gemini-key"] as string || "";
  const customEndpoint = req.headers["x-ai-endpoint"] as string || "";
  let customModel = req.headers["x-gemini-model"] as string || customModelFallback;
  
  if (provider === "openai" && customModel.startsWith("models/gemini")) {
    customModel = customEndpoint.includes("anthropic") ? "claude-3-5-haiku-20241022" : "gpt-4o-mini";
  }

  // Helper to determine if the model is highly likely to support vision inputs
  const isVisionSupported = 
    customModel.toLowerCase().includes("vision") || 
    customModel.toLowerCase().includes("gpt-4o") || 
    customModel.toLowerCase().includes("claude-3-5") || 
    customModel.toLowerCase().includes("claude-3-7") ||
    customModel.toLowerCase().includes("gemini");

  if (provider === "openai" && customEndpoint.includes("anthropic")) {
    const messages = [];
    let systemInstructionFinal = systemInstruction;
    if (systemInstruction) {
      systemInstructionFinal += (responseSchema ? "\n\nIMPORTANT: You must return a valid JSON object." : "");
    } else if (responseSchema) {
      systemInstructionFinal = "IMPORTANT: You must return a valid JSON object.";
    }

    const cleanText = extractPromptText(prompt);
    const hasImages = imageParts && imageParts.length > 0 && isVisionSupported;

    if (hasImages) {
      const contentArr: any[] = [{ type: "text", text: cleanText }];
      for (const part of imageParts) {
        if (part.inlineData) {
          contentArr.push({
            type: "image" as any,
            source: {
              type: "base64",
              media_type: part.inlineData.mimeType,
              data: part.inlineData.data
            }
          });
        }
      }
      messages.push({ role: "user", content: contentArr });
    } else {
      messages.push({ role: "user", content: cleanText });
    }

    const payload = {
      model: (!customModel || customModel.startsWith("models/gemini") || customModel.startsWith("gpt-") || customModel === "gpt-4o") ? "claude-3-5-sonnet-latest" : customModel,
      max_tokens: 4096,
      system: systemInstructionFinal,
      messages: messages,
    };

    try {
      const response = await fetch(customEndpoint.replace(/\/v1\/?$/, "") + "/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": customKey.trim(),
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API Error: ${response.status} ${err}`);
      }

      const data = await response.json();
      let text = data.content[0].text || "";
      return extractJsonString(text);
    } catch (err: any) {
      // If failed and we used images, retry without images (Text-Only Fallback)
      if (hasImages) {
        console.log("Anthropic vision request failed, retrying in text-only mode:", err.message);
        const textPayload = { ...payload, messages: [{ role: "user", content: cleanText }] };
        const response = await fetch(customEndpoint.replace(/\/v1\/?$/, "") + "/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": customKey.trim(),
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          body: JSON.stringify(textPayload)
        });
        if (response.ok) {
          const data = await response.json();
          let text = data.content[0].text || "";
          return extractJsonString(text);
        }
      }
      throw err;
    }
  } else if (provider === "openai") {
    const openai = new OpenAI({
      apiKey: customKey.trim() || "sk-dummy",
      baseURL: customEndpoint.trim() || undefined,
    });
    
    const messages: any[] = [];
    const systemText = systemInstruction 
      ? systemInstruction + (responseSchema ? "\n\nIMPORTANT: You must return a valid JSON object. Do not output anything other than JSON." : "")
      : (responseSchema ? "IMPORTANT: You must return a valid JSON object. Do not output anything other than JSON." : "");
    
    if (systemText) {
      messages.push({ role: "system", content: systemText });
    }
    
    const cleanText = extractPromptText(prompt);
    const hasImages = imageParts && imageParts.length > 0 && isVisionSupported;

    if (hasImages) {
      const contentArr: any[] = [{ type: "text", text: cleanText }];
      for (const part of imageParts) {
        if (part.inlineData) {
          contentArr.push({
            type: "image_url",
            image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
          });
        }
      }
      messages.push({ role: "user", content: contentArr });
    } else {
      messages.push({ role: "user", content: cleanText });
    }

    const payload: any = {
      model: customModel,
      messages: messages,
    };
    
    if (responseSchema) {
       payload.response_format = { type: "json_object" };
    }

    try {
      const response = await openai.chat.completions.create(payload);
      let text = response.choices[0].message.content || "";
      return extractJsonString(text);
    } catch (err: any) {
      // Text-Only Fallback for OpenAI kompatible APIs if vision/image upload fails
      if (hasImages) {
        console.log("OpenAI vision request failed, retrying in text-only mode:", err.message);
        const textPayload = {
          ...payload,
          messages: systemText 
            ? [{ role: "system", content: systemText }, { role: "user", content: cleanText }]
            : [{ role: "user", content: cleanText }]
        };
        try {
          const response = await openai.chat.completions.create(textPayload);
          let text = response.choices[0].message.content || "";
          return extractJsonString(text);
        } catch (retryErr: any) {
          throw retryErr;
        }
      }
      throw err;
    }
  } else {
    // Gemini
    let client = getAiClient();
    if (customKey && customKey.trim() !== "") {
      client = new GoogleGenAI({
        apiKey: customKey.trim(),
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });
    }
    const model = customModel.trim();
    
    let finalContents = prompt;
    if (imageParts && imageParts.length > 0) {
      const textPart = { text: typeof prompt === 'string' ? prompt : prompt.text || JSON.stringify(prompt) };
      finalContents = { parts: [textPart, ...imageParts] };
    }
    
    const config: any = {
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    };
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (responseSchema) {
       config.responseMimeType = "application/json";
       config.responseSchema = responseSchema;
    }
    
    // Retry once on 429 rate limit errors with backoff
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const aiResponse = await client.models.generateContent({
          model: model,
          contents: finalContents,
          config: config
        });
        return aiResponse.text;
      } catch (err: any) {
        if (err?.status === 429 && attempt === 0) {
          // Extract retry delay from error or default to 5 seconds
          const retryMatch = err?.message?.match(/retry in ([\d.]+)s/i);
          const waitSec = retryMatch ? Math.min(parseFloat(retryMatch[1]) + 1, 15) : 5;
          console.log(`[RETRY] 429 rate limit hit for model ${model}. Waiting ${waitSec}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
          continue;
        }
        throw err;
      }
    }
    throw new Error("callAiContent: exhausted retries");
  }

}

function getAIClientAndModel(req: express.Request, defaultModel = "models/gemini-flash-lite-latest") {
  const customKey = req.headers["x-gemini-key"] as string;
  const customModel = req.headers["x-gemini-model"] as string;
  let client = getAiClient();

  if (customKey && customKey.trim() !== "") {
    client = new GoogleGenAI({
      apiKey: customKey.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  let model = defaultModel;
  if (customModel && customModel.trim() !== "") {
    // Strip models/ prefix if it is duplicate or handle correctly
    model = customModel.trim();
  }
  return { client, model };
}

const app = express();
const PORT = 3101;

app.use(express.json());

function getLanguageName(lang: string): string {
  const mapping: Record<string, string> = {
    ja: "Japanese (日本語)",
    en: "English",
    zh: "Simplified Chinese (简体中文)",
    es: "Spanish (Español)",
    de: "German (Deutsch)",
    fr: "French (Français)",
  };
  // Fallback check for prefix
  const short = lang.split("-")[0].toLowerCase();
  return mapping[short] || mapping[lang] || "English";
}

function getFallbackAiInfo(
  repo: any,
  lang: string,
  personaPrompt?: string,
  audiencePrompt?: string
): { aiTitle: string; aiSummary: string; tags: string[] } {
  const isJa = (lang || "").startsWith("ja");
  
  const isSister = personaPrompt && (
    personaPrompt.includes("あかり姉") || 
    personaPrompt.includes("お姉ちゃん") || 
    personaPrompt.includes("お姉さん") || 
    personaPrompt.includes("Cozy Big Sister") ||
    personaPrompt.includes("ヴィーナス")
  );
  const isNeet = audiencePrompt && (audiencePrompt.includes("自宅警備") || audiencePrompt.includes("ネット廃人") || audiencePrompt.includes("Net-Neet"));
  const isForumKid = audiencePrompt && (audiencePrompt.includes("なんJ") || audiencePrompt.includes("おんJ") || audiencePrompt.includes("キッズ") || audiencePrompt.includes("Forum Kid"));
  const isPM = audiencePrompt && (audiencePrompt.includes("PM") || audiencePrompt.includes("ハック") || audiencePrompt.includes("アジャイル") || audiencePrompt.includes("Hustler PM"));

  const primaryLang = (repo.language || "").toLowerCase();
  
  let aiTitle = "";
  let aiSummary = "";
  const tags: string[] = [];

  // Add primary language as the first tag
  if (repo.language) {
    tags.push(repo.language);
  }

  // Pre-process description to remove empty/placeholder texts
  let cleanDesc = (repo.description || "").trim();
  if (
    cleanDesc === "No description provided." || 
    cleanDesc === "No description available..." || 
    cleanDesc === "No description." ||
    cleanDesc === ""
  ) {
    cleanDesc = "";
  } else if (cleanDesc.length > 120) {
    cleanDesc = cleanDesc.slice(0, 120) + "...";
  }

  if (isJa) {
    const descPart = cleanDesc ? `「${cleanDesc}」という説明が書かれているよ。` : "";
    const generalDescPart = cleanDesc ? `「${cleanDesc}」という特徴を持ち、` : "";

    // Japanese Fallbacks
    if (isSister) {
      if (primaryLang === "typescript") {
        aiSummary = `ふふっ、TypeScriptで作られた ${repo.name} だよ！${descPart}型安全ですごく綺麗なコードだから、安心して使えるし、あなたのお仕事もきっとサクサク進むと思うな♪`;
      } else if (primaryLang === "javascript") {
        aiSummary = `ねぇねぇ、JavaScriptの素敵なライブラリ ${repo.name} だよ。${descPart}とっても手軽で扱いやすいから、初心者さんにもオススメ！お姉ちゃんと一緒に試してみない？`;
      } else if (primaryLang === "python") {
        aiSummary = `こちらはPythonで書かれた注目の ${repo.name} だよ！${descPart}データ処理やAIにも強くて頼もしいの。あなたもきっと気に入ると思うから、ぜひ見てみてね！`;
      } else if (primaryLang === "go") {
        aiSummary = `圧倒的なスピードを誇るGo言語製の ${repo.name} だよ。${descPart}すごく頑丈で頼りになるお兄ちゃんみたいなツールだね！一度触ってみてね。`;
      } else if (primaryLang === "rust") {
        aiSummary = `メモリ安全でとっても頑丈なRust製の ${repo.name} だよ！${descPart}ちょっとツンデレなところもあるけど、一度仲良くなれば最強の味方になってくれるよ♪`;
      } else {
        aiSummary = `お姉ちゃんオススメの ${repo.name} だよ！${descPart}コミュニティでもすごく盛り上がってて活発んだ。あなたの開発がもっと楽しくなるといいな♪`;
      }
      aiTitle = "あかり姉の推しリポ♪"; tags.push("お姉ちゃん推奨", "優しい設計", "サクサク動作", "安心 of コード");
    } else if (isNeet) {
      aiSummary = `${repo.name}とかいうツールらしいぞ。${cleanDesc ? `説明には「${cleanDesc}」とか書いてあるな。` : ""}まあ、まともに開発してないお前らにはオーバースペックな代物だけどなw 自宅警備の合間にでもコード読んで勉強しとけw`;
      aiTitle = "【悲報】ワイニート、神リポ発見"; tags.push("ニート向け", "自宅警備", "つよつよ", "情弱お断り");
    } else if (isForumKid) {
      aiSummary = `イッチ！ ${repo.name} はガチで神リポジトリやで！${cleanDesc ? `「${cleanDesc}」についてのツールやな。` : ""}使ってみてクレメンス！レスバにも役立つかもしれんでw`;
      aiTitle = "【朗報】最強ツール爆誕"; tags.push("ガチ神ツール", "完全に理解した", "覇権確定", "レスバ最強");
    } else if (isPM) {
      aiSummary = `${repo.name}の導入により、我々のプロダクトアジリティを劇的に向上させます。${cleanDesc ? `「${cleanDesc}」の領域において、` : ""}KPI最大化にアラインし、爆速バリューデリバリーが期待できます。`;
      aiTitle = "【戦略的】アライン対象"; tags.push("アジャイル", "KPI最大化", "シナジー重視", "アライン");
    } else {
      // General Japanese Fallback (highly professional)
      if (primaryLang === "typescript") {
        aiSummary = `${repo.name}は、現代的なTypeScriptで構築された信頼性の高いオープンソースプロジェクトです。${generalDescPart}型安全なインターフェースと優れた設計により、開発者の生産性を最大化します。`;
      } else if (primaryLang === "javascript") {
        aiSummary = `${repo.name}は、モダンなJavaScriptエコシステムをリードする注目のライブラリです。${cleanDesc ? `「${cleanDesc}」として公開されており、` : ""}シンプルで導入しやすく、柔軟なカスタマイズが可能です。`;
      } else if (primaryLang === "python") {
        aiSummary = `${repo.name}は、Pythonの強力な機能を最大限に活かしたオープンソースプロジェクトです。${cleanDesc ? `主な説明は「${cleanDesc}」で、` : ""}データ分析や自動化など、多様なユースケースに柔軟に対応します。`;
      } else if (primaryLang === "go") {
        aiSummary = `${repo.name}は、パフォーマンスとシンプルさを極めたGo言語製のアプリケーション/ツールです。${cleanDesc ? `「${cleanDesc}」の提供を目的とし、` : ""}軽量でありながら頑強な並行処理能力を備えています。`;
      } else if (primaryLang === "rust") {
        aiSummary = `${repo.name}は、安全性と圧倒的な高速動作を約束するRust製の次世代プロジェクトです。${cleanDesc ? `「${cleanDesc}」を実装しており、` : ""}メモリ効率に優れ、ミッションクリティカルな開発に最適です。`;
      } else {
        aiSummary = `${repo.name}は、オープンソースコミュニティで高い評価を得ている注目のリポジトリです。${cleanDesc ? `概要は「${cleanDesc}」で、` : ""}クリーンな設計と実用性の高い機能群が特徴です。`;
      }
      aiTitle = "推奨リポジトリ"; tags.push("推奨リポジトリ", "活発な開発", "コード品質高", "モダン設計");
    }
  } else {
    // English Fallbacks
    if (isSister) {
      aiSummary = `Look! ${repo.name} is a sweet library. ${cleanDesc ? `It describes itself as "${cleanDesc}". ` : ""}It is super friendly, well-documented, and made with love to help your development journey shine!`;
      aiTitle = "Sister's Choice!"; tags.push("SisterFav", "CozyCode", "FriendlyDoc", "LovelyTech");
    } else if (isNeet) {
      aiSummary = `Here is ${repo.name} for you, internet slacker. ${cleanDesc ? `The description says "${cleanDesc}" but it's ` : "It is "}probably way above your paygrade, but feel free to read the codebase if you are bored.`;
      aiTitle = "Neet's Discovery"; tags.push("NeetChoice", "EliteCode", "Hardcore", "NoobProof");
    } else if (isForumKid) {
      aiSummary = `Yo! ${repo.name} is an absolute beast of a repository! ${cleanDesc ? `It's all about "${cleanDesc}". ` : ""}Highly recommended by the internet forum kids for winning arguments!`;
      aiTitle = "Absolute Beast Tool"; tags.push("BeastTool", "GotItAll", "MetaKing", "UberPopular");
    } else if (isPM) {
      aiSummary = `${repo.name} empowers our development velocity. ${cleanDesc ? `Focusing on "${cleanDesc}", it drives ` : "It drives "}incredible product synergy and maximizing key performance indicators. Let's align on this!`;
      aiTitle = "Strategic Alignment"; tags.push("Agile", "Velocity", "KPIMax", "Synergy");
    } else {
      // General English Fallback (highly professional)
      if (primaryLang === "typescript") {
        aiSummary = `${repo.name} is a robust TypeScript project designed to elevate developer workflow. ${cleanDesc ? `It targets "${cleanDesc}" with ` : "It offers "}a type-safe, elegant architecture.`;
      } else if (primaryLang === "javascript") {
        aiSummary = `${repo.name} is a modern JavaScript utility. ${cleanDesc ? `Described as "${cleanDesc}", it is ` : "It is "}built to simplify application integration with a highly flexible codebase.`;
      } else if (primaryLang === "python") {
        aiSummary = `${repo.name} is an outstanding Python library. ${cleanDesc ? `Focusing on "${cleanDesc}", it leverages ` : "It leverages "}the ecosystem to provide highly efficient automation and processing capabilities.`;
      } else if (primaryLang === "go") {
        aiSummary = `${repo.name} is a high-performance, robust application written in Go. ${cleanDesc ? `Providing "${cleanDesc}", it is ` : "It is "}optimized for scale and concurrency.`;
      } else if (primaryLang === "rust") {
        aiSummary = `${repo.name} is a next-generation Rust project. ${cleanDesc ? `Implementing "${cleanDesc}", it guarantees ` : "It guarantees "}incredible speed, resource efficiency, and thread safety.`;
      } else {
        aiSummary = `${repo.name} is a notable open-source project. ${cleanDesc ? `Its core focus is "${cleanDesc}", and it is ` : "It is "}highly regarded in the community for its clean codebase and practical utility.`;
      }
      aiTitle = "Recommended Repository"; tags.push("Recommended", "ActiveDev", "TopQuality", "ModernDesign");
    }
  }

  // Fallback repo topics / tags padding
  if (repo.topics && Array.isArray(repo.topics)) {
    repo.topics.slice(0, 3).forEach((topic: string) => {
      if (!tags.includes(topic)) {
        tags.push(topic);
      }
    });
  }

  const defaultTagsJa = ["オープンソース", "GitHub", "高品質", "信頼性", "最新設計"];
  const defaultTagsEn = ["OpenSource", "GitHub", "Vibrant", "Active", "CleanCode"];
  const defaultTags = isJa ? defaultTagsJa : defaultTagsEn;

  while (tags.length < 5) {
    const nextTag = defaultTags.find(t => !tags.includes(t)) || (isJa ? "人気" : "Hot");
    tags.push(nextTag);
  }

  return {
    aiTitle,
    aiSummary,
    tags: tags.slice(0, 5),
  };
}

// 1. Search endpoint
app.get("/api/search", async (req, res) => {
  const isStream = req.query.stream === "true";
  
  if (isStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
  }

  const sendStatus = (messageJa: string, messageEn: string) => {
    if (isStream) {
      const lang = (req.query.lang as string) || "en";
      const message = lang.startsWith("ja") ? messageJa : messageEn;
      res.write(`data: ${JSON.stringify({ type: "status", message })}\n\n`);
    }
  };

  const sendData = (data: any) => {
    if (isStream) {
      res.write(`data: ${JSON.stringify({ type: "result", data })}\n\n`);
      return res.end();
    } else {
      return res.json(data);
    }
  };

  try {
    const query = req.query.q as string;
    const lang = (req.query.lang as string) || "en";
    const searchMode = (req.query.mode as string) || "ai"; // "ai" or "plain"
    
    sendStatus("🔍 検索クエリを準備中...", "🔍 Preparing search query...");

    const page = parseInt((req.query.page as string) || "1", 10);
    const sourcesParam = (req.query.sources as string) || "github";
    const isReSearch = req.query.reSearch === "true";
    const prevOptimized = req.query.prevOptimized as string || "";
    const sources = sourcesParam.split(",");
    const perPage = 9;
    
    const personaPromptRaw = req.headers["x-persona-prompt"] as string;
    const personaPrompt = personaPromptRaw ? decodeURIComponent(personaPromptRaw) : undefined;
    const audiencePromptRaw = req.headers["x-audience-prompt"] as string;
    const audiencePrompt = audiencePromptRaw ? decodeURIComponent(audiencePromptRaw) : undefined;
    
    if (!query || query.trim() === "") {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    
    const languageName = getLanguageName(lang);
    let optimizedQuery = query;
    const customKey = req.headers["x-gemini-key"] as string || "";
    const hasApiKey = (customKey && customKey.trim() !== "" && customKey !== "MY_GEMINI_API_KEY") || 
                      (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "" && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && process.env.GEMINI_API_KEY !== "YOUR_API_KEY");
                      
    const isPlainMode = searchMode === "plain" || searchMode === "keyword" || !hasApiKey;
    
    if (!isPlainMode && page === 1) {
      const cacheKey = `${query}_${lang}_${personaPrompt || ""}_${audiencePrompt || ""}`.toLowerCase();
      if (isReSearch) {
        searchQueryCache.delete(cacheKey);
        console.log(`Re-search detected: Bypassing and clearing cache for query: "${query}"`);
      }

      if (!isReSearch && searchQueryCache.has(cacheKey)) {
        optimizedQuery = searchQueryCache.get(cacheKey)!;
        console.log(`Using cached optimized query: "${optimizedQuery}" for original query: "${query}"`);
      } else {
        try {
          console.log(`Optimizing search query or tag "${query}" (isReSearch: ${isReSearch})`);
          let optimizationPrompt = `You are a search query optimizer for open-source repositories (like GitHub/GitLab). The user entered the search query or tag: "${query}".
Your task is to translate and optimize this query to be highly effective for searching open-source repositories on GitHub and GitLab.
Most repositories are documented in English, so if the query is in Japanese or another language, translate it to standard English technical terms (for example, "状態管理" should become "state management", "カレンダー" should become "calendar").
If the query is already an English technical term, leave it as is or optimize it slightly.

CRITICAL TAG INSTRUCTION: If the search query starts with '#' or is a single technical/persona-specific tag (e.g. "#シニア向け", "#AIセキュリティ", "#初心者向け", "architecture-patterns"), generate highly relevant English technical keywords that capture the core tech topic, style, usability focus, or development paradigm of that tag so it produces matching repositories (e.g. "#AIセキュリティ" should optimize to "LLM security safety prompt defense", "architecture-patterns" should optimize to "software design patterns clean architecture").`;

          if (isReSearch) {
            optimizationPrompt += `

[RE-SEARCH REQUEST]:
This is a re-search (regenerating search keywords) request! The user has explicitly requested to regenerate keywords to find different or alternative results.
The previous search query that was optimized and tried was: "${prevOptimized}".
Please generate an ALTERNATIVE, fresh, or different set of highly relevant SIMPLE technical keywords (max 2 words) to find alternative libraries.
CRITICAL: To avoid "no results found" on GitHub/GitLab (which perform strict AND searches for space-separated keywords), ensure the generated query is extremely concise and stripped of unnecessary qualifiers. Extract and output only the absolute core, minimal keywords (maximum 2 words). Do not repeat the exact combination of words tried in the previous query: "${prevOptimized}".`;
          }

          if (personaPrompt || audiencePrompt) {
            optimizationPrompt += `

[CONTEXT / SETTINGS]:
Current Active Writer Persona: "${personaPrompt || "Default Technical Editor"}"
Current Target Audience / Intended Readers: "${audiencePrompt || "General developers"}"
When optimizing the tag or query, interpret the tag's meaning and nuance through the lens of this Target Audience and Persona. For example, if the tag is "#初心者向け" (for beginners) and the target audience is beginners, map it to technical keywords representing beginner-friendly, clean, easy-to-use, well-documented, or starter repositories (e.g., "boilerplate template beginner clean well-documented tutorial").`;
          }

          optimizationPrompt += `

Return ONLY the raw optimized search query string. Do not include any quotes, explanations, markdown formatting, or extra text. Keep it very simple and broad (usually 2-3 core keywords maximum) to ensure it matches many repositories.`;
          
          const responseText = await callAiContent(req, optimizationPrompt, "", null);
          
          if (responseText) {
            const text = responseText.trim();
            if (text && !text.includes("Sorry") && !text.includes("I cannot")) {
              optimizedQuery = text.replace(/["']/g, '');
              console.log(`Optimized query: "${optimizedQuery}"`);
              searchQueryCache.set(cacheKey, optimizedQuery);
              if (isStream) {
                res.write(`data: ${JSON.stringify({ type: "optimizedQuery", query: optimizedQuery })}\n\n`);
              }
            }
          }
        } catch (err: any) {
          console.log("Query optimization failed, falling back to original query.");
        }
      }
    }
    
    let githubItems: any[] = [];
    let gitlabItems: any[] = [];
    
    sendStatus("🐙 リポジトリを取得中...", "🐙 Fetching repositories...");

    if (sources.includes("gitlab")) {
      const gitlabUrl = `https://gitlab.com/api/v4/projects?search=${encodeURIComponent(optimizedQuery)}&order_by=star_count&sort=desc&visibility=public&per_page=${perPage}&page=${page}`;
      console.log(`Searching GitLab for: "${optimizedQuery}" (original: "${query}") using URL: ${gitlabUrl}`);
      const gitlabResponse = await fetch(gitlabUrl, {
        headers: { "User-Agent": "OSS-Search-Lab-App-v1" },
      });
      if (!gitlabResponse.ok) {
        console.log("GitLab API error for search");
      } else {
        const gitlabData = await gitlabResponse.json();
        const projects = Array.isArray(gitlabData) ? gitlabData : [];
        gitlabItems = projects.map((p: any) => ({
          id: p.id,
          name: p.name,
          full_name: p.path_with_namespace,
          source: "gitlab",
          owner: {
            login: p.namespace ? p.namespace.path : "gitlab",
            avatar_url: p.avatar_url || (p.namespace ? p.namespace.avatar_url : null) || "https://gitlab.com/assets/gitlab_logo-7ae504fe4f68fde756d58ee952dfd160.png",
            html_url: p.namespace ? `https://gitlab.com/${p.namespace.path}` : "https://gitlab.com",
          },
          html_url: p.web_url,
          description: p.description || "No description provided.",
          stargazers_count: p.star_count || 0,
          forks_count: p.forks_count || 0,
          watchers_count: p.star_count || 0,
          open_issues_count: 0,
          language: p.tag_list && p.tag_list.length > 0 ? p.tag_list[0] : null,
          topics: p.tag_list || [],
          updated_at: p.last_activity_at || p.updated_at,
          created_at: p.created_at,
        }));
      }
    }
    
    if (sources.includes("github")) {
      const githubUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(optimizedQuery)}&sort=stars&order=desc&per_page=${perPage}&page=${page}`;
      console.log(`Searching GitHub for: "${optimizedQuery}" (original: "${query}") using URL: ${githubUrl}`);
      
      const githubHeaders: Record<string, string> = {
        "User-Agent": "OSS-Search-Lab-App-v1",
        Accept: "application/vnd.github.v3+json",
      };
      if (process.env.GITHUB_TOKEN) {
        githubHeaders["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
      }
      
      const githubResponse = await fetch(githubUrl, {
        headers: githubHeaders,
      });
      if (!githubResponse.ok) {
        const errorText = await githubResponse.text();
        console.log("GitHub API error for search:", errorText);
        if (githubResponse.status === 403 && errorText.includes("rate limit")) {
          throw new Error("GitHub API rate limit exceeded. Please wait a moment and try again.");
        }
        if (sources.length === 1) {
          throw new Error(`GitHub API returned ${githubResponse.status}`);
        }
      } else {
        const githubData = await githubResponse.json();
        githubItems = (githubData.items || []).map((item: any) => ({
          ...item,
          source: "github"
        }));
      }
    }
    
    let items: any[] = [];
    const seenFullNames = new Set<string>();
    
    const addUniqueItem = (item: any) => {
      const key = (item.full_name || "").toLowerCase().trim();
      if (key && !seenFullNames.has(key)) {
        seenFullNames.add(key);
        items.push(item);
        return true;
      }
      return false;
    };

    if (sources.includes("github") && sources.includes("gitlab")) {
      const maxLength = Math.max(githubItems.length, gitlabItems.length);
      for (let i = 0; i < maxLength; i++) {
        if (i < githubItems.length) addUniqueItem(githubItems[i]);
        if (i < gitlabItems.length) addUniqueItem(gitlabItems[i]);
      }
      items = items.slice(0, 9);
    } else {
      const combined = [...githubItems, ...gitlabItems];
      combined.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
      for (const item of combined) {
        addUniqueItem(item);
      }
      items = items.slice(0, 9);
    }
    
    const hasMore = (sources.includes("github") && githubItems.length >= 9) || 
                    (sources.includes("gitlab") && gitlabItems.length >= 9);

    if (items.length === 0) {
      return sendData({
        aiSummary: { overview: `No repositories found matching "${query}".` },
        optimizedQuery: optimizedQuery,
        repositories: [],
        hasMore: false,
      });
    }
    
    if (isPlainMode) {
      const isJa = (lang || "").startsWith("ja"); 
      const isMobile = req.query.isMobile === "true";
      
      // If Japanese, translate description using Gemini (PC & Mobile)
      if (isJa && items.length > 0 && hasApiKey) {
        try {
          const toTranslate = items
            .map((item, idx) => ({
              idx,
              text: item.description || ""
            }))
            .filter(x => x.text.trim() !== "");
          
          if (toTranslate.length > 0) {
            const prompt = `Translate the 'text' fields for each object in the following JSON array to Japanese (日本語).
Keep the translation concise, natural, and friendly.
Return the result strictly as a JSON array of objects with the exact same 'idx' and the translated 'text' properties. Do not add any markdown formatting, code blocks, or extra text.

Input array to translate:
${JSON.stringify(toTranslate)}`;

            // Call Gemini
            const responseText = await callAiContent(req, prompt, "", null);
            if (responseText) {
              const cleanJsonText = responseText.trim().replace(/^```json\s*/, "").replace(/```$/, "");
              const parsed = JSON.parse(cleanJsonText);
              if (Array.isArray(parsed)) {
                parsed.forEach((tItem: any) => {
                  if (items[tItem.idx]) {
                    items[tItem.idx].translatedDescription = tItem.text;
                  }
                });
              }
            }
          }
        } catch (err: any) {
          console.error("Failed to translate descriptions for mobile plain search:", err);
        }
      }

      const mappedItems = items.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        source: repo.source || "github",
        owner: {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url,
          htmlUrl: repo.owner.html_url,
        },
        htmlUrl: repo.html_url,
        description: repo.translatedDescription || repo.description,
        stargazersCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        watchersCount: repo.watchers_count || 0,
        openIssuesCount: repo.open_issues_count || 0,
        language: repo.language,
        topics: repo.topics || [],
        updatedAt: repo.updated_at,
        createdAt: repo.created_at,
        aiSummary: "",
        aiTags: [repo.language || (repo.source === "gitlab" ? "GitLab" : "GitHub"), "Search Match"],
      }));
      let overview = isJa ? `"${query}" に一致するリポジトリです。` : `Here are the repositories matching "${query}".`;
      if (page === 1) {
          try {
             sendStatus(isJa ? "✨ AIで概要を生成中..." : "✨ Generating AI overview...", isJa ? "✨ AIで概要を生成中..." : "✨ Generating AI overview...");
             let systemInstruction = `You are a world-class technology consultant. Provide a brief 2-3 sentence executive summary of the search results for the query.\nThe output MUST be written strictly in: ${languageName}.\n`;
             if (personaPrompt) systemInstruction += `[STYLE DIRECTION]: ${personaPrompt}\n`;
             if (audiencePrompt) systemInstruction += `[TARGET AUDIENCE]: ${audiencePrompt}\n`;
             const reposForAI = mappedItems.slice(0, 5).map((r:any) => r.fullName + ": " + r.description).join("\n");
             const prompt = `Query: "${query}"\nTop Results:\n${reposForAI}\nPlease write the executive summary strictly in ${languageName}.`;
             const overviewResult = await callAiContent(req, prompt, systemInstruction, null);
             if (overviewResult) {
                overview = overviewResult;
             }
          } catch(e) {
             console.log("Plain mode summary generation failed.");
          }
      } else {
          overview = "";
      }
      return sendData({
        aiSummary: { overview: overview },
        optimizedQuery: optimizedQuery,
        repositories: mappedItems,
        hasMore: hasMore,
      });
    }

    sendStatus("✨ AIでリポジトリを解析中...", "✨ Analyzing repositories with AI...");

    const reposForAI = items.map((repo: any, index: number) => ({
      index: index + 1,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || "",
      stars: repo.stargazers_count,
      language: repo.language || "Unknown",
    }));
    
    let systemInstruction = `You are a world-class technology consultant and open-source expert.
Your job is to analyze the following search results for the user's query ("${query}") and provide insights.
Your entire output response MUST be written strictly in: ${languageName}.
This is an ABSOLUTE requirement. Even though the schema properties, descriptions, and prompt instructions are written in English, every single text field value in the resulting JSON output (including 'summary', 'aiSummary', and 'tags') MUST be written entirely in ${languageName}. Never output English or mix languages unless referencing specific programming terms, APIs, or code snippets. Ensure natural, fluent, and highly professional phrasing.
If the user's query is highly specific or asks for recommendations (e.g., "best react UI library"), provide tailored advice in the summary in ${languageName}.

CRITICAL REQUIREMENTS FOR RESULTS INTEGRITY:
1. You MUST include EXACTLY ${items.length} items in your 'rankedItems' output list. Each repository in the input list MUST have a corresponding item in your output. Do not omit or skip any repositories!
2. The 'fullName' of each item in 'rankedItems' MUST EXACTLY MATCH (case-insensitive) the 'fullName' string from the input (e.g., if input has 'cirosantilli/china-dictatorship', you MUST return 'cirosantilli/china-dictatorship' as fullName).
3. Even if a repository contains political, sensitive, controversial, or empty/unclear descriptions, you MUST still analyze it neutrally and professionally. Provide a highly objective technical summary evaluating its topic/code. The summary MUST be written in ${languageName}. Never omit it or output blank fields.
4. You must write ALL text, summaries, and taglines strictly in the requested language (e.g. if language is Japanese, output Japanese): ${languageName}.
5. If a repository has no description or an empty description in the input list, you MUST set its 'aiSummary' to an empty string ("") instead of force-generating or hallucinating a summary.`;

    if (personaPrompt && personaPrompt.trim() !== "") {
      systemInstruction += `

[STYLE DIRECTION / WRITER PERSONA]:
You must write all responses adopting this specific personality, writing style, tone, and mannerisms:
"${personaPrompt.trim()}"
Apply this personality across all generated JSON fields (summary, rankedItems' aiSummary, and tags). Ensure the output matches this persona perfectly while keeping the underlying technical information accurate.`;
    }

    if (audiencePrompt && audiencePrompt.trim() !== "") {
      systemInstruction += `

[TARGET AUDIENCE / INTENDED READERS]:
Your target readers or users of the generated summaries and tags are:
"${audiencePrompt.trim()}"
You MUST tailor all descriptions, and especially the generated tags, to directly appeal to, fit the technical level of, and address the specific interests and knowledge level of this TARGET AUDIENCE. For example, if they are beginners, use friendly, conceptual tags; if they are experienced software architects or senior devs, use precise, advanced architectural, design-pattern, or technology keywords. Ensure that tags are extremely creative and directly relevant to this target audience.`;
    }

    if (page === 1) {
      systemInstruction += `

Provide:
1. A brief 2-3 sentence executive summary of the search results, highlighting the best options or overall trends (written in ${languageName}).
2. For each repository, a highly engaging 1-sentence description/summary evaluating its relevance to the query (in ${languageName}) and at least 5 highly creative and descriptive tags that reflect the technology itself, the style of the designated [STYLE DIRECTION / WRITER PERSONA], and are fully tailored to appeal to and fit the [TARGET AUDIENCE / INTENDED READERS] if specified. Make sure to generate at least 5 tags for each repository.
If a repository does not have a description in the input (description is empty or absent), set its 'aiSummary' to an empty string ("") instead of force-generating or hallucinating a summary.`;
    } else {
      systemInstruction += `

Provide:
1. Since this is an additional page of results, set summary to an empty string ("").
2. For each repository, a highly engaging 1-sentence description/summary evaluating its relevance (in ${languageName}) and at least 5 highly creative and descriptive tags that reflect the technology itself, the style of the designated [STYLE DIRECTION / WRITER PERSONA], and are fully tailored to appeal to and fit the [TARGET AUDIENCE / INTENDED READERS] if specified. Make sure to generate at least 5 tags for each repository.
If a repository does not have a description in the input (description is empty or absent), set its 'aiSummary' to an empty string ("") instead of force-generating or hallucinating a summary.`;
    }
    
    systemInstruction += `
Output MUST be in valid JSON format matching the schema exactly. Write all descriptive text in: ${languageName}.
Ensure that you return EXACTLY ${items.length} rankedItems elements.`;
    
    const prompt = `User Query: "${query}"
Optimized Query Used: "${optimizedQuery}"
Here are the search results (page ${page}):
${JSON.stringify(reposForAI, null, 2)}
Provide your analysis in ${languageName}.`;

    console.log(`Calling Gemini for search in language: ${languageName}`);
    
    const responseSchema = {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: `A catchy and engaging title reflecting the persona or topic. MUST be written strictly and entirely in ${languageName}.`,
            },
            summary: {
              type: Type.STRING,
              description: `Executive brief summarizing the search results and providing any recommendations requested by the query. MUST be written strictly and entirely in ${languageName}.`,
            },
            trendSummary: {
              type: Type.STRING,
              description: `A brief breakdown of key trends, technologies, or ecosystem dynamics identified from the search results. Use markdown lists if appropriate. MUST be written strictly and entirely in ${languageName}.`,
            },
            rankedItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fullName: { type: Type.STRING, description: "MUST EXACTLY match the fullName provided in the input array" },
                  aiTitle: { type: Type.STRING, description: `A highly engaging short catchphrase or title (max 25 chars) for this repository. MUST be written strictly and entirely in ${languageName}.` },
                  aiSummary: { type: Type.STRING, description: `A highly engaging 1-sentence tagline evaluating this library's relevance to the search query. MUST be written strictly and entirely in ${languageName}.` },
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: `At least 5 highly characterizing tags. MUST be written strictly and entirely in ${languageName}. Make sure the tags are highly descriptive and fully reflect the style, tone, and themes of the designated [STYLE DIRECTION / WRITER PERSONA] if specified.`
                  },
                },
                required: ["fullName", "aiTitle", "aiSummary", "tags"],
              },
            },
          },
          required: ["title", "summary", "trendSummary", "rankedItems"],
        };
        
    let responseText = "";
    let parsedAI: any = {
      title: "",
      summary: "",
      trendSummary: "",
      rankedItems: [] as any[],
    };
    try {
      responseText = await callAiContent(req, prompt, systemInstruction, responseSchema);
    } catch (aiErr: any) {
      console.error("[ERROR] Search Analysis Gemini call failed:", aiErr.message || aiErr);
    }
    
    if (responseText) {
      try {
        parsedAI = JSON.parse(responseText.trim());
      } catch (err: any) {
        console.error("Failed to parse Gemini response:", responseText, "Error details:", err.message);
      }
    }

    const isSummaryMissing = (page === 1) ? !parsedAI.summary : false;
    if (isSummaryMissing || !parsedAI.rankedItems || parsedAI.rankedItems.length === 0) {
      const isJa = (lang || "").startsWith("ja");
       const isSister = personaPrompt && (
        personaPrompt.includes("あかり姉") || 
        personaPrompt.includes("お姉ちゃん") || 
        personaPrompt.includes("お姉さん") || 
        personaPrompt.includes("Cozy Big Sister") ||
        personaPrompt.includes("ヴィーナス")
      );
      const isNeet = audiencePrompt && (audiencePrompt.includes("自宅警備") || audiencePrompt.includes("ネット廃人") || audiencePrompt.includes("Net-Neet"));
      const isForumKid = audiencePrompt && (audiencePrompt.includes("なんJ") || audiencePrompt.includes("おんJ") || audiencePrompt.includes("キッズ") || audiencePrompt.includes("Forum Kid"));
      const isPM = audiencePrompt && (audiencePrompt.includes("PM") || audiencePrompt.includes("ハック") || audiencePrompt.includes("アジャイル") || audiencePrompt.includes("Hustler PM"));

      if (isJa) {
        if (isSister) {
          parsedAI.title = `あかり姉のおすすめ検索結果〜！`;
          parsedAI.summary = `ふふっ、お疲れ様〜！「${query}」について一生懸命調べてみたよ。どれもすごく面白そうで、あなたにピッタリなリポジトリが見つかるといいなぁ。お姉ちゃんが応援してるからね！`;
        } else if (isNeet) {
          parsedAI.title = `【悲報】ニートが検索した結果ｗｗｗ`;
          parsedAI.summary = `はいはい、ニートくんが「${query}」なんかで検索したリポジトリ一覧ねw どうせ見るだけでコード一行も書かないんだろ？w まあ一応並べてやったから感謝しなw`;
        } else if (isForumKid) {
          parsedAI.title = `【朗報】最強の神レポジトリ、見つかる`;
          parsedAI.summary = `おんJのみんな！「${query}」関連のつよつよ神レポジトリをまとめておいたで！これ使ってレスバに勝利してクレメンス！`;
        } else if (isPM) {
          parsedAI.title = `【戦略的】アラインメント完了・リポジトリ一覧`;
          parsedAI.summary = `お疲れ様です！我々が「${query}」アジェンダに向けてアラインし、ビジネスチャンスをハックするための戦略的リポジトリ群を選出しました。コミットしていきましょう！`;
        } else {
          parsedAI.title = `「${query}」の検索結果`;
          parsedAI.summary = `「${query}」に関するリポジトリが多数見つかりました。用途や開発スキルに合わせて最適なモジュールをご選定ください。`;
        }
      } else {
        parsedAI.title = `Search Results for "${query}"`;
        parsedAI.summary = `Found several open-source repositories relating to "${query}". Here is a curated evaluation based on your active parameters.`;
      }

      parsedAI.rankedItems = items.map((repo: any) => {
        const fallback = getFallbackAiInfo(repo, lang, personaPrompt, audiencePrompt);
        return {
          fullName: repo.full_name,
          aiTitle: "",
          aiSummary: fallback.aiSummary,
          tags: fallback.tags,
        };
      });
    }
    
    console.log(`[DEBUG] Search API - Gemini responseText length: ${responseText ? responseText.length : 0}`);
    if (parsedAI.rankedItems && Array.isArray(parsedAI.rankedItems)) {
      console.log(`[DEBUG] Search API - parsedAI.rankedItems count: ${parsedAI.rankedItems.length}`);
      parsedAI.rankedItems.forEach((item: any, i: number) => {
        console.log(`[DEBUG]   Item #${i}: fullName=${item.fullName || item.name}, aiSummary=${item.aiSummary || item.summary || "(EMPTY)"}`);
      });
    }

    const aiSummaryMap = new Map<string, { aiTitle?: string; aiSummary: string; tags: string[] }>();
    if (parsedAI.rankedItems && Array.isArray(parsedAI.rankedItems)) {
      parsedAI.rankedItems.forEach((item: any, idx: number) => {
        // Handle property name variations from LLM output
        const rawFullName = item.fullName || item.fullname || item.name || item.repoName || "";
        const fullNameKey = typeof rawFullName === "string" ? rawFullName.toLowerCase().trim() : "";
        const aiTitle = item.aiTitle || item.title || "";
        const aiSummary = item.aiSummary || item.summary || item.description || "";
        const tags = Array.isArray(item.tags) ? item.tags : (Array.isArray(item.keywords) ? item.keywords : []);
        
        if (fullNameKey) {
          aiSummaryMap.set(fullNameKey, { aiTitle, aiSummary, tags });
        }
      });
    }
    
    const enrichedRepos = items.map((repo: any, index: number) => {
      const lowerFullName = repo.full_name.toLowerCase().trim();
      const lowerRepoName = repo.name.toLowerCase().trim();
      let aiInfo: any = null;
      
      // 1. Direct match by full name (e.g. facebook/react)
      const mappedInfo = aiSummaryMap.get(lowerFullName);
      if (mappedInfo && mappedInfo.aiSummary && mappedInfo.aiSummary.trim() !== "") {
        aiInfo = mappedInfo;
      }
      
      // 2. Fallback: match by index
      if (!aiInfo && parsedAI.rankedItems && parsedAI.rankedItems[index]) {
        const item = parsedAI.rankedItems[index];
        const sum = item.aiSummary || item.summary || item.description || "";
        if (sum.trim() !== "") {
          aiInfo = {
            aiTitle: item.aiTitle || item.title || "",
            aiSummary: sum,
            tags: Array.isArray(item.tags) ? item.tags : (Array.isArray(item.keywords) ? item.keywords : []),
          };
        }
      }
      
      // 3. Fallback: partial match by repository name
      if (!aiInfo) {
        const match = Array.from(aiSummaryMap.entries()).find(([k, v]) => 
          (k.includes(lowerRepoName) || lowerFullName.includes(k)) && v.aiSummary && v.aiSummary.trim() !== ""
        );
        if (match) {
           aiInfo = match[1];
        }
      }
      
      // 4. Default Fallback
      if (!aiInfo) {
        const fallback = getFallbackAiInfo(repo, lang, personaPrompt, audiencePrompt);
        aiInfo = {
          aiTitle: "",
          aiSummary: fallback.aiSummary,
          tags: fallback.tags,
        };
      }
      
      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        source: repo.source || "github",
        owner: {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url,
          htmlUrl: repo.owner.html_url,
        },
        htmlUrl: repo.html_url,
        description: repo.description,
        stargazersCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        watchersCount: repo.watchers_count || 0,
        openIssuesCount: repo.open_issues_count || 0,
        language: repo.language,
        topics: repo.topics || [],
        updatedAt: repo.updated_at || new Date().toISOString(),
        createdAt: repo.created_at || new Date().toISOString(),
        aiTitle: aiInfo.aiTitle || "",
        aiSummary: aiInfo.aiSummary,
        aiTags: aiInfo.tags,
      };
    });
    
    return sendData({
      aiSummary: { 
        title: parsedAI.title, 
        overallSummary: parsedAI.summary, 
        trendSummary: parsedAI.trendSummary 
      },
      optimizedQuery: optimizedQuery,
      repositories: enrichedRepos,
      hasMore: hasMore,
    });
  } catch (err: any) {
    console.log("Search API Error.");
    if (req.query.stream === "true" && !res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify({ type: "error", error: "An error occurred while fetching repositories.", details: err.message || err })}\n\n`);
      return res.end();
    } else if (req.query.stream === "true") {
      res.write(`data: ${JSON.stringify({ type: "error", error: "An error occurred while fetching repositories.", details: err.message || err })}\n\n`);
      return res.end();
    } else {
      return res.status(500).json({
        error: "An error occurred while fetching repositories.",
        details: err.message || err,
      });
    }
  }
});

app.get("/api/repo", async (req, res) => {
  try {
    const source = (req.query.source as string) || "github";
    const name = req.query.name as string;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Parameter 'name' is required" });
    }

    if (source === "gitlab") {
      const gitlabUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(name)}`;
      console.log(`[API REPO] Fetching GitLab repo: "${name}" using URL: ${gitlabUrl}`);
      const gitlabResponse = await fetch(gitlabUrl, {
        headers: { "User-Agent": "OSS-Search-Lab-App-v1" },
      });
      if (!gitlabResponse.ok) {
        throw new Error(`GitLab API error: ${gitlabResponse.status}`);
      }
      const data = await gitlabResponse.json();
      return res.json(data);
    } else {
      const githubUrl = `https://api.github.com/repos/${name}`;
      console.log(`[API REPO] Fetching GitHub repo: "${name}" using URL: ${githubUrl}`);
      const githubHeaders: Record<string, string> = {
        "User-Agent": "OSS-Search-Lab-App-v1",
        Accept: "application/vnd.github.v3+json",
      };
      if (process.env.GITHUB_TOKEN) {
        githubHeaders["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
      }
      const githubResponse = await fetch(githubUrl, {
        headers: githubHeaders,
      });
      if (!githubResponse.ok) {
        throw new Error(`GitHub API error: ${githubResponse.status}`);
      }
      const data = await githubResponse.json();
      return res.json(data);
    }
  } catch (err: any) {
    console.error("[API REPO] Error:", err.message || err);
    return res.status(500).json({
      error: "An error occurred while fetching repository metadata.",
      details: err.message || err,
    });
  }
});

// Trending endpoints Cache setup
const trendingRawCache: Record<string, { repositories: any[]; timestamp: number }> = {};
const trendingCache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function getTrendingCache(key: string): Promise<any> {
  const memCached = trendingCache[key];
  if (memCached && (Date.now() - memCached.timestamp < CACHE_TTL)) {
    return memCached.data;
  }
  
  const kv = globalThis.cloudflareEnv?.OSS_SEARCH_LAB_KV;
  if (kv) {
    try {
      const dataStr = await kv.get(`trending:${key}`);
      if (dataStr) {
        const parsed = JSON.parse(dataStr);
        trendingCache[key] = { data: parsed, timestamp: Date.now() };
        return parsed;
      }
    } catch (err) {
      console.error("KV Read Error for trendingCache:", err);
    }
  }
  return null;
}

async function setTrendingCache(key: string, data: any) {
  trendingCache[key] = { data, timestamp: Date.now() };
  
  const kv = globalThis.cloudflareEnv?.OSS_SEARCH_LAB_KV;
  if (kv) {
    try {
      await kv.put(`trending:${key}`, JSON.stringify(data), {
        expirationTtl: Math.floor(CACHE_TTL / 1000)
      });
    } catch (err) {
      console.error("KV Write Error for trendingCache:", err);
    }
  }
}

async function getTrendingRawCache(key: string): Promise<any[] | null> {
  const memCached = trendingRawCache[key];
  if (memCached && (Date.now() - memCached.timestamp < CACHE_TTL)) {
    return memCached.repositories;
  }
  
  const kv = globalThis.cloudflareEnv?.OSS_SEARCH_LAB_KV;
  if (kv) {
    try {
      const dataStr = await kv.get(`trendingRaw:${key}`);
      if (dataStr) {
        const parsed = JSON.parse(dataStr);
        trendingRawCache[key] = { repositories: parsed, timestamp: Date.now() };
        return parsed;
      }
    } catch (err) {
      console.error("KV Read Error for trendingRawCache:", err);
    }
  }
  return null;
}

async function setTrendingRawCache(key: string, repositories: any[]) {
  trendingRawCache[key] = { repositories, timestamp: Date.now() };
  
  const kv = globalThis.cloudflareEnv?.OSS_SEARCH_LAB_KV;
  if (kv) {
    try {
      await kv.put(`trendingRaw:${key}`, JSON.stringify(repositories), {
        expirationTtl: Math.floor(CACHE_TTL / 1000)
      });
    } catch (err) {
      console.error("KV Write Error for trendingRawCache:", err);
    }
  }
}

app.get("/api/trending", async (req, res) => {
  const isStream = req.query.stream === "true";
  
  if (isStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
  }

  const sendStatus = (messageJa: string, messageEn: string) => {
    if (isStream) {
      const lang = (req.query.lang as string) || "en";
      const message = lang.startsWith("ja") ? messageJa : messageEn;
      res.write(`data: ${JSON.stringify({ type: "status", message })}\n\n`);
    }
  };

  const sendData = (data: any) => {
    if (isStream) {
      res.write(`data: ${JSON.stringify({ type: "result", data })}\n\n`);
      return res.end();
    } else {
      return res.json(data);
    }
  };

  try {
    const lang = (req.query.lang as string) || "en";
    const page = parseInt((req.query.page as string) || "1", 10);
    const timeframe = (req.query.timeframe as string) || "day";
    const languageName = getLanguageName(lang);
    
    sendStatus("📈 トレンドを取得中...", "📈 Fetching trends...");
    
    const personaPromptRaw = req.headers["x-persona-prompt"] as string;
    const personaPrompt = personaPromptRaw ? decodeURIComponent(personaPromptRaw) : undefined;
    const audiencePromptRaw = req.headers["x-audience-prompt"] as string;
    const audiencePrompt = audiencePromptRaw ? decodeURIComponent(audiencePromptRaw) : undefined;
    
    const model = req.headers["x-gemini-model"] as string || "models/gemini-flash-lite-latest";
    const provider = req.headers["x-ai-provider"] as string || "gemini";
    const cacheKey = `github_${timeframe}_${lang}_page${page}_${personaPrompt || ""}_${audiencePrompt || ""}_${provider}_${model}`.toLowerCase();
    
    const bypassCache = req.headers["x-bypass-cache"] === "true";
    const cached = await getTrendingCache(cacheKey);
    if (!bypassCache && cached) {
      console.log(`Serving trending repositories for github timeframe "${timeframe}" lang "${lang}" page ${page} from cache.`);
      return sendData(cached);
    }
    
    let githubItems: any[] = [];
    let since = "daily";
    if (timeframe === "week") since = "weekly";
    if (timeframe === "month") since = "monthly";

    const rawCacheKey = `github_raw_${timeframe}`.toLowerCase();
    let allRepos: any[] = [];
    const cachedRaw = await getTrendingRawCache(rawCacheKey);

    if (!bypassCache && cachedRaw) {
      console.log(`[TRENDING API] Serving raw repositories from cache for timeframe "${timeframe}". Count: ${cachedRaw.length}`);
      allRepos = cachedRaw;
    } else {
      const githubUrl = `https://github.com/trending?since=${since}`;
      console.log(`[TRENDING API] Fetching fresh raw trending repos from GitHub: ${githubUrl}`);
      try {
        const githubResponse = await fetch(githubUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        if (!githubResponse.ok) {
          console.log("GitHub HTML trending fetch error:", githubResponse.status);
        } else {
          const html = await githubResponse.text();
          const $ = cheerio.load(html);
          $('article.Box-row').each((i: number, el: any) => {
            const titleEl = $(el).find('h2.h3 a');
            const href = titleEl.attr('href');
            if (!href) return;
            const full_name = href.replace(/^\//, '');
            const description = $(el).find('p.col-9').text().trim();
            const language = $(el).find('span[itemprop="programmingLanguage"]').text().trim();
            const starsText = $(el).find('a[href$="/stargazers"]').first().text().trim().replace(/,/g, '');
            const stargazers_count = parseInt(starsText, 10) || 0;
            const ownerLogin = full_name.split('/')[0];
            
            allRepos.push({
              id: full_name,
              name: full_name.split('/')[1],
              full_name,
              description,
              language,
              stargazers_count,
              owner: {
                login: ownerLogin,
                avatar_url: `https://github.com/${ownerLogin}.png`,
                html_url: `https://github.com/${ownerLogin}`
              },
              html_url: `https://github.com/${full_name}`,
              source: 'github'
            });
          });

          if (allRepos.length > 0) {
            await setTrendingRawCache(rawCacheKey, allRepos);
            console.log(`[TRENDING API] Cached ${allRepos.length} raw trending repositories.`);
          }
        }
      } catch (err) {
        console.log("Error fetching GitHub trending:", err);
      }
    }

    const startIdx = (page - 1) * 9;
    githubItems = allRepos.slice(startIdx, startIdx + 9);
    
    let items: any[] = githubItems;
    
    if (items.length === 0) {
      return sendData({
        trendingSummary: page === 1 ? "Could not retrieve trending repositories currently." : "",
        repositories: [],
      });
    }
    
    sendStatus("✨ AIでトレンドを解析中...", "✨ Analyzing trends with AI...");

    const reposForAI = items.map((repo: any, index: number) => ({
      index: index + 1,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || "No description provided.",
      stars: repo.stargazers_count,
      language: repo.language || "Unknown",
    }));
    
    let systemInstruction = `You are a world-class technology trend analyst and editor.
Your job is to analyze the following popular and active open-source repositories (page ${page}) and provide insights.
Your entire output response MUST be written strictly in: ${languageName}.
This is an ABSOLUTE requirement. Even though the schema properties, descriptions, and prompt instructions are written in English, every single text field value in the resulting JSON output (including 'trendingSummary', 'aiSummary', and 'tags') MUST be written entirely in ${languageName}. Never output English or mix languages unless referencing specific programming terms, APIs, or code snippets. Ensure natural, fluent, and highly professional phrasing.

CRITICAL REQUIREMENTS FOR RESULTS INTEGRITY:
1. You MUST include EXACTLY ${items.length} items in your 'rankedItems' output list. Each repository in the input list MUST have a corresponding item in your output. Do not omit or skip any repositories!
2. The 'fullName' of each item in 'rankedItems' MUST EXACTLY MATCH (case-insensitive) the 'fullName' string from the input.
3. Even if a repository contains political, sensitive, controversial, or empty/unclear descriptions, you MUST still analyze it neutrally and professionally. Provide a highly objective technical summary evaluating its topic/code. The summary MUST be written in ${languageName}. Never omit it or output blank fields.
4. You must write ALL text, summaries, and taglines strictly in the requested language (e.g. if language is Japanese, output Japanese): ${languageName}.`;

    if (personaPrompt && personaPrompt.trim() !== "") {
      systemInstruction += `

[STYLE DIRECTION / WRITER PERSONA]:
You must write all responses adopting this specific personality, writing style, tone, and mannerisms:
"${personaPrompt.trim()}"
Apply this personality across all generated JSON fields (trendingSummary, rankedItems' aiSummary, and tags). Ensure the output matches this persona perfectly while keeping the underlying technical information accurate.`;
    }

    if (audiencePrompt && audiencePrompt.trim() !== "") {
      systemInstruction += `

[TARGET AUDIENCE / INTENDED READERS]:
Your target readers or users of the generated summaries and tags are:
"${audiencePrompt.trim()}"
You MUST tailor all descriptions, and especially the generated tags, to directly appeal to, fit the technical level of, and address the specific interests and knowledge level of this TARGET AUDIENCE. For example, if they are beginners, use friendly, conceptual tags; if they are experienced software architects or senior devs, use precise, advanced architectural, design-pattern, or technology keywords. Ensure that tags are extremely creative and directly relevant to this target audience.`;
    }

    if (page === 1) {
      systemInstruction += `

Provide:
1. A brief 2-3 sentence overview of the current technology trends represented by these libraries (written in ${languageName}).
2. For each repository, a highly engaging 1-sentence description/summary of why it is extremely popular/trending in ${languageName} and at least 5 highly creative and descriptive tags that reflect the technology itself, the style of the designated [STYLE DIRECTION / WRITER PERSONA], and are fully tailored to appeal to and fit the [TARGET AUDIENCE / INTENDED READERS] if specified. Make sure to generate at least 5 tags for each repository.`;
    } else {
      systemInstruction += `

Provide:
1. A brief 1-2 sentence overview summarizing these additional trending repositories (written in ${languageName}).
2. For each repository, a highly engaging 1-sentence description/summary of why it is extremely popular/trending in ${languageName} and at least 5 highly creative and descriptive tags that reflect the technology itself, the style of the designated [STYLE DIRECTION / WRITER PERSONA], and are fully tailored to appeal to and fit the [TARGET AUDIENCE / INTENDED READERS] if specified. Make sure to generate at least 5 tags for each repository.`;
    }
    
    systemInstruction += `
Output MUST be in valid JSON format matching the schema exactly. Write all descriptive text in: ${languageName}.`;
    
    const prompt = `Here are the trending/popular active repositories (page ${page}):
${JSON.stringify(reposForAI, null, 2)}
Provide your executive trend analysis in ${languageName}.`;

    console.log(`Calling Gemini for trending in language: ${languageName}`);
    
    const responseSchema = {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: `A catchy and engaging title reflecting the persona or topic. MUST be written strictly and entirely in ${languageName}.`,
            },
            trendingSummary: {
              type: Type.STRING,
              description: `Executive brief summarizing what these trending technologies represent in the ecosystem. MUST be written strictly and entirely in ${languageName}.`,
            },
            rankedItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fullName: { type: Type.STRING, description: "MUST EXACTLY match the fullName provided in the input array" },
                  aiTitle: { type: Type.STRING, description: `A highly engaging short catchphrase or title (max 25 chars) for this repository. MUST be written strictly and entirely in ${languageName}.` },
                  aiSummary: { type: Type.STRING, description: `A highly engaging 1-sentence tagline of why this library is a cornerstone of current trends. MUST be written strictly and entirely in ${languageName}.` },
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: `At least 5 highly characterizing tags. MUST be written strictly and entirely in ${languageName}. Make sure the tags are highly descriptive and fully reflect the style, tone, and themes of the designated [STYLE DIRECTION / WRITER PERSONA] if specified.`
                  },
                },
                required: ["fullName", "aiTitle", "aiSummary", "tags"],
              },
            },
          },
          required: ["title", "trendingSummary", "rankedItems"],
        };
        
    let responseText = "";
    let parsedAI: any = {
      title: "",
      trendingSummary: "",
      rankedItems: [] as any[],
    };
    try {
      responseText = await callAiContent(req, prompt, systemInstruction, responseSchema);
    } catch (aiErr: any) {
      console.error("[DEBUG SERVER] Trending AI analysis failed:", aiErr);
      console.log("Analysis skipped, using plain mode.");
    }
    
    if (responseText) {
      try {
        parsedAI = JSON.parse(responseText.trim());
      } catch (err) {
        console.log("Failed to parse trending Gemini response:", responseText);
      }
    }

    // For page > 1, trendingSummary can be empty string ("")
    const hasTrendingSummary = parsedAI.trendingSummary !== undefined && (page > 1 || parsedAI.trendingSummary !== "");
    if (!hasTrendingSummary || !parsedAI.rankedItems || parsedAI.rankedItems.length === 0) {
      const isJa = (lang || "").startsWith("ja");
      const isSister = personaPrompt && (
        personaPrompt.includes("あかり姉") || 
        personaPrompt.includes("お姉ちゃん") || 
        personaPrompt.includes("お姉さん") || 
        personaPrompt.includes("Cozy Big Sister") ||
        personaPrompt.includes("ヴィーナス")
      );
      const isNeet = audiencePrompt && (audiencePrompt.includes("自宅警備") || audiencePrompt.includes("ネット廃人") || audiencePrompt.includes("Net-Neet"));
      const isForumKid = audiencePrompt && (audiencePrompt.includes("なんJ") || audiencePrompt.includes("おんJ") || audiencePrompt.includes("キッズ") || audiencePrompt.includes("Forum Kid"));
      const isPM = audiencePrompt && (audiencePrompt.includes("PM") || audiencePrompt.includes("ハック") || audiencePrompt.includes("アジャイル") || audiencePrompt.includes("Hustler PM"));

      if (isJa) {
        if (isSister) {
          parsedAI.title = `あかり姉のトレンドチェック！`;
          parsedAI.trendingSummary = `ふふっ、お疲れ様〜！今日トレンドに入っている注目のリポジトリを一覧にしてみたよ。どれもすごく活発で、見ているだけでワクワクしちゃうね。気になるものがあったら、お姉ちゃんに教えてね？`;
        } else if (isNeet) {
          parsedAI.title = `【悲報】今のトレンドｗｗｗ`;
          parsedAI.trendingSummary = `今インターネットで話題（笑）のトレンドリポジトリ一覧を並べてやったぞ。どうせお前らには一生縁のないつよつよコードばかりだけどなw`;
        } else if (isForumKid) {
          parsedAI.title = `【朗報】最強のバズりレポジトリ`;
          parsedAI.trendingSummary = `おんJのみんな！今ガチでバズってる覇権リポジトリ一覧や！これ使って情弱どもを煽りまくってクレメンスw`;
        } else if (isPM) {
          parsedAI.title = `【戦略的】市場トレンドのアラインメント`;
          parsedAI.trendingSummary = `お疲れ様です！市場のトレンドをリードし、我々のビジネスに高いアジリティをもたらす注目のリポジトリをアラインしました。コミットしていきましょう！`;
        } else {
          parsedAI.title = `トレンド・リポジトリ`;
          parsedAI.trendingSummary = `本日トレンド入りしている、非常に活発で注目度の高いオープンソースリポジトリ一覧です。`;
        }
      } else {
        parsedAI.title = `Trending Repositories`;
        parsedAI.trendingSummary = `Trending open-source repositories of the moment. Here is a curated evaluation based on your active parameters.`;
      }

      parsedAI.rankedItems = items.map((repo: any) => {
        const fallback = getFallbackAiInfo(repo, lang, personaPrompt, audiencePrompt);
        return {
          fullName: repo.full_name,
          aiTitle: "",
          aiSummary: fallback.aiSummary,
          tags: fallback.tags,
        };
      });
    }
    
    const aiSummaryMap = new Map<string, { aiTitle?: string; aiSummary: string; tags: string[] }>();
    if (parsedAI.rankedItems && Array.isArray(parsedAI.rankedItems)) {
      parsedAI.rankedItems.forEach((item: any) => {
        aiSummaryMap.set(item.fullName.toLowerCase(), {
          aiTitle: item.aiTitle,
          aiSummary: item.aiSummary,
          tags: item.tags,
        });
      });
    }
    
    const enrichedRepos = items.map((repo: any, index: number) => {
      const lowerName = repo.full_name.toLowerCase();
      let aiInfo = aiSummaryMap.get(lowerName);
      
      if (!aiInfo && parsedAI.rankedItems && parsedAI.rankedItems[index]) {
        aiInfo = {
          aiTitle: parsedAI.rankedItems[index].aiTitle,
          aiSummary: parsedAI.rankedItems[index].aiSummary,
          tags: parsedAI.rankedItems[index].tags || [],
        };
      }
      
      if (!aiInfo) {
        const match = Array.from(aiSummaryMap.entries()).find(([k, v]) => k.includes(repo.name.toLowerCase()) || lowerName.includes(k));
        if (match) {
           aiInfo = match[1];
        }
      }
      
      if (!aiInfo) {
        const fallback = getFallbackAiInfo(repo, lang, personaPrompt, audiencePrompt);
        aiInfo = {
          aiTitle: "",
          aiSummary: fallback.aiSummary,
          tags: fallback.tags,
        };
      }
      
      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        source: repo.source || "github",
        owner: {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url,
          htmlUrl: repo.owner.html_url,
        },
        htmlUrl: repo.html_url,
        description: repo.description,
        stargazersCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        watchersCount: repo.watchers_count || 0,
        openIssuesCount: repo.open_issues_count || 0,
        language: repo.language,
        topics: repo.topics || [],
        updatedAt: repo.updated_at || new Date().toISOString(),
        createdAt: repo.created_at || new Date().toISOString(),
        aiTitle: aiInfo.aiTitle || "",
        aiSummary: aiInfo.aiSummary,
        aiTags: aiInfo.tags,
      };
    });
    
    const responseData = {
      trendingTitle: parsedAI.title,
      trendingSummary: parsedAI.trendingSummary,
      repositories: enrichedRepos,
    };
    
    // Only cache if the AI response was successfully retrieved and parsed
    if (responseText && parsedAI.trendingSummary && parsedAI.rankedItems && parsedAI.rankedItems.length > 0) {
      await setTrendingCache(cacheKey, responseData);
    } else {
      console.log(`[DEBUG SERVER] Skip caching trending details because AI analysis fell back to plain mode.`);
    }
    
    return sendData(responseData);
  } catch (err: any) {
    console.log("Trending API Error.");
    if (req.query.stream === "true" && !res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify({ type: "error", error: "An error occurred while fetching trending repositories.", details: err.message || err })}\n\n`);
      return res.end();
    } else if (req.query.stream === "true") {
      res.write(`data: ${JSON.stringify({ type: "error", error: "An error occurred while fetching trending repositories.", details: err.message || err })}\n\n`);
      return res.end();
    } else {
      return res.status(500).json({
        error: "An error occurred while fetching trending repositories.",
        details: err.message || err,
      });
    }
  }
});


async function translateModelDescriptions(
  client: GoogleGenAI,
  modelName: string,
  models: { name: string; displayName: string; description: string }[],
  targetLang: string
) {
  try {
    const languageName = getLanguageName(targetLang);
    const normalizedLang = targetLang.split("-")[0].toLowerCase();
    if (normalizedLang === "en") {
      return models;
    }

    // Filter out only models that have valid descriptions to translate
    const toTranslate = models
      .map((m, idx) => ({ idx, name: m.name, desc: m.description }))
      .filter(item => item.desc && item.desc.trim() !== "" && item.desc !== "Retrieved dynamically from Gemini API");

    if (toTranslate.length === 0) {
      return models;
    }

    const systemInstruction = `You are a professional software translation assistant.
Translate the following software model descriptions into ${languageName}.
Maintain all technical terms, names, and markdown formatting.
Keep translations natural, precise, and concise.`;

    const prompt = `Translate the description fields for each object in the following JSON array to ${languageName}.
Return the result strictly as a JSON array of objects with the exact same 'idx' and translated 'desc' properties.
Do not wrap in anything else except a JSON array.

Input array to translate:
${JSON.stringify(toTranslate.map(t => ({ idx: t.idx, desc: t.desc })), null, 2)}`;

    console.log(`Translating ${toTranslate.length} model descriptions using ${modelName} to ${languageName}...`);
    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              idx: { type: Type.INTEGER },
              desc: { type: Type.STRING }
            },
            required: ["idx", "desc"]
          }
        }
      }
    });

    if (response && response.text) {
      const translated = JSON.parse(response.text.trim());
      if (Array.isArray(translated)) {
        const result = [...models];
        translated.forEach((item: any) => {
          if (item && typeof item.idx === "number" && item.desc) {
            const originalIndex = item.idx;
            if (result[originalIndex]) {
              result[originalIndex] = {
                ...result[originalIndex],
                description: item.desc
              };
            }
          }
        });
        return result;
      }
    }
  } catch (err: any) {
    console.log("Translation skipped, using original.");
  }
  return models;
}

// Endpoint to retrieve available Gemini models
app.post("/api/models", async (req, res) => {
  try {
    const provider = req.headers["x-ai-provider"] || "gemini";
    const customEndpoint = (req.headers["x-ai-endpoint"] as string) || "";
    const customKey = req.body.apiKey || (req.headers["x-gemini-key"] as string);

    if (provider === "openai") {
      const openai = new OpenAI({
        apiKey: customKey.trim() || "sk-dummy",
        baseURL: customEndpoint.trim() || undefined,
      });
      let modelList = [];
      try {
        const response = await openai.models.list();
        modelList = response.data.map((m) => ({
          name: m.id,
          displayName: m.id,
          description: "Retrieved dynamically from API",
        }));
      } catch (err) {
        console.log("Could not fetch models dynamically, using dummy list:", err.message);
        if (customEndpoint.includes("anthropic")) {
          modelList = [
            { name: "claude-3-7-sonnet-20250219", displayName: "Claude 3.7 Sonnet", description: "Most intelligent model" },
            { name: "claude-3-5-haiku-20241022", displayName: "Claude 3.5 Haiku", description: "Fastest model" },
          ];
        } else {
          modelList = [
            { name: "gpt-4o", displayName: "GPT-4o", description: "Most capable OpenAI model" },
            { name: "gpt-4o-mini", displayName: "GPT-4o Mini", description: "Fastest OpenAI model" },
          ];
        }
      }
      return res.json(modelList);
    }

    const lang = req.body.lang || "en";
    let client = getAiClient();
    let hasApiKey = false;

    if (customKey && customKey.trim() !== "") {
      hasApiKey = true;
      client = new GoogleGenAI({
        apiKey: customKey.trim(),
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } else if (process.env.GEMINI_API_KEY) {
      hasApiKey = true;
    }

    console.log("Listing models from Gemini API...");
    let modelList: any[] = [];
    try {
      const response = await client.models.list();
      for await (const model of response) {
        if (model) {
          modelList.push(model);
        }
      }
    } catch (apiErr: any) {
      console.log("Could not fetch models dynamically from Gemini API, using curated fallback list.");
    }

    // Merge dynamic models with curated models
    let merged = [...CURATED_MODELS];
    modelList.forEach((m: any) => {
      if (!m || !m.name) return;
      const normalizedName = (m.name.startsWith("models/") || m.name.startsWith("tunedModels/"))
        ? m.name
        : `models/${m.name}`;
      
      const exists = merged.some(item => item.name === normalizedName);
      if (!exists) {
        merged.push({
          name: normalizedName,
          displayName: m.displayName || m.name.split("/").pop() || m.name,
          description: m.description || "Retrieved dynamically from Gemini API",
        });
      }
    });

    // Translate if API key is set AND language is not English
    // DISABLED to prevent rate limits / quota exhaustion for users
    if (false && hasApiKey && lang && lang.split("-")[0].toLowerCase() !== "en") {
      try {
        merged = await translateModelDescriptions(client, "models/gemini-2.5-flash", merged, lang);
      } catch (transErr) {
        console.log("Dynamic model translation failed (likely rate limited). Using original descriptions.");
      }
    }

    return res.json(merged);
  } catch (err: any) {
    console.log("Models API Error.");
    return res.status(500).json({
      error: "An error occurred while listing models.",
      details: err.message || err,
    });
  }
});

function sanitizeMediaInText(text: string, allowedImages: string[], allowedVideos: string[]): string {
  if (!text) return "";

  const isUselessMedia = (url: string): boolean => {
    const lower = url.toLowerCase();
    return (
      lower.includes("shields.io") ||
      lower.includes("badge") ||
      lower.includes("avatar") ||
      lower.includes("opencollective.com") ||
      lower.includes("buymeacoffee.com") ||
      lower.includes("ko-fi.com") ||
      lower.includes("sonarcloud.io") ||
      lower.includes("travis-ci") ||
      lower.includes("circleci.com") ||
      lower.includes("coveralls.io") ||
      lower.includes("codecov.io") ||
      lower.includes("analytics") ||
      lower.includes("doubleclick") ||
      lower.includes("gitter.im") ||
      lower.includes("fury.io")
    );
  };

  const isUrlAllowed = (url: string, allowedList: string[]) => {
    if (!url) return false;
    const clean = url.trim().toLowerCase();
    
    if (isUselessMedia(clean)) {
      return false;
    }

    const matchesAllowed = allowedList.some(allowed => {
      const allowedClean = allowed.trim().toLowerCase();
      return allowedClean === clean || allowedClean.endsWith(clean) || clean.endsWith(allowedClean);
    });

    if (matchesAllowed) return true;

    // Fallback: If the allowedList is empty (e.g. README fetch failed due to API rate limit),
    // or if the URL is already an absolute HTTP/HTTPS/Data URL, we allow it to prevent visual loss.
    if (allowedList.length === 0 || clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("data:")) {
      return true;
    }

    return false;
  };

  const getAbsoluteUrl = (url: string, allowedList: string[]): string => {
    if (!url) return "";
    const clean = url.trim();
    const cleanLower = clean.toLowerCase();

    if (cleanLower.startsWith("http://") || cleanLower.startsWith("https://") || cleanLower.startsWith("data:")) {
      return clean;
    }

    for (const allowed of allowedList) {
      if (allowed.toLowerCase().endsWith(cleanLower)) {
        return allowed;
      }
    }

    return clean;
  };

  const extractSrc = (attrsStr: string): string => {
    if (!attrsStr) return "";
    // Robustly match double quotes, single quotes, escaped double/single quotes, or no quotes
    const srcMatch = attrsStr.match(/src=\s*(?:\\*["'])([^\s\\*"'>]+)(?:\\*["'])?/i) || 
                     attrsStr.match(/src=\s*["']([^"'>]+)["']/i) ||
                     attrsStr.match(/src=\s*([^"'\s>]+)/i);
    return srcMatch ? srcMatch[1].trim() : "";
  };

  // 1. Handle HTML video tags: normalize allowed ones to <video src="url"></video> and delete unallowed ones
  let sanitized = text.replace(/<video([\s\S]*?)>([\s\S]*?)<\/video>/gi, (match, attrs, content) => {
    const src = extractSrc(attrs) || extractSrc(content);
    if (src && isUrlAllowed(src, allowedVideos)) {
      const absUrl = getAbsoluteUrl(src, allowedVideos);
      return `<video src="${absUrl}"></video>`;
    }
    return "";
  });

  sanitized = sanitized.replace(/<video([^>]*)\/?>/gi, (match, attrs) => {
    const src = extractSrc(attrs);
    if (src && isUrlAllowed(src, allowedVideos)) {
      const absUrl = getAbsoluteUrl(src, allowedVideos);
      return `<video src="${absUrl}"></video>`;
    }
    return "";
  });

  // Also remove any remaining source tags inside audio/video elements if they are left over
  sanitized = sanitized.replace(/<source([^>]*)\/?>/gi, "");
  sanitized = sanitized.replace(/<\/video>/gi, "");

  // 2. Handle Markdown and HTML images
  const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/gi;
  sanitized = sanitized.replace(mdImageRegex, (match, alt, url) => {
    const cleanUrl = url.trim().split(" ")[0].replace(/[()]/g, "");
    if (cleanUrl && isUrlAllowed(cleanUrl, allowedImages)) {
      const absUrl = getAbsoluteUrl(cleanUrl, allowedImages);
      return `![${alt}](${absUrl})`;
    }
    return "";
  });

  const imgTagRegex = /<img([^>]+)\/?>/gi;
  sanitized = sanitized.replace(imgTagRegex, (match, attrs) => {
    const src = extractSrc(attrs);
    if (src && isUrlAllowed(src, allowedImages)) {
      const absUrl = getAbsoluteUrl(src, allowedImages);
      return `![image](${absUrl})`;
    }
    return "";
  });

  return sanitized;
}

function tryRepairAndParseJson(text: string): any {
  let cleaned = extractJsonString(text).trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.log("Direct JSON.parse failed, attempting automatic repair...", err);
  }

  // Basic automatic repair for truncated JSON
  let insideString = false;
  let escape = false;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
    } else if (char === '"') {
      insideString = !insideString;
    }
  }

  if (insideString) {
    cleaned += '"';
  }

  const stack: string[] = [];
  insideString = false;
  escape = false;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
    } else if (char === '"') {
      insideString = !insideString;
    } else if (!insideString) {
      if (char === '{') {
        stack.push('}');
      } else if (char === '[') {
        stack.push(']');
      } else if (char === '}') {
        if (stack[stack.length - 1] === '}') {
          stack.pop();
        }
      } else if (char === ']') {
        if (stack[stack.length - 1] === ']') {
          stack.pop();
        }
      }
    }
  }

  while (stack.length > 0) {
    const needed = stack.pop();
    cleaned += needed;
  }

  try {
    return JSON.parse(cleaned);
  } catch (retryErr: any) {
    console.log("Repaired JSON parsing failed as well.");
    throw retryErr;
  }
}

function getDetailFallback(
  repoName: string,
  description: string,
  stars: number,
  language: string,
  topics: string[],
  lang: string,
  personaPrompt?: string,
  audiencePrompt?: string,
  candidateImages: string[] = []
) {
  const isJa = (lang || "").startsWith("ja");

  // Determine active persona/audience from prompts to customize fallback voice
  const isSister = personaPrompt && (
    personaPrompt.includes("あかり姉") || 
    personaPrompt.includes("お姉ちゃん") || 
    personaPrompt.includes("お姉さん") || 
    personaPrompt.includes("Cozy Big Sister") ||
    personaPrompt.includes("ヴィーナス")
  );
  const isNeet = audiencePrompt && (audiencePrompt.includes("自宅警備") || audiencePrompt.includes("ネット廃人") || audiencePrompt.includes("Net-Neet"));
  const isForumKid = audiencePrompt && (audiencePrompt.includes("なんJ") || audiencePrompt.includes("おんJ") || audiencePrompt.includes("キッズ") || audiencePrompt.includes("Forum Kid"));
  const isPM = audiencePrompt && (audiencePrompt.includes("PM") || audiencePrompt.includes("ハック") || audiencePrompt.includes("アジャイル") || audiencePrompt.includes("Hustler PM"));

  let overview = "";
  let features: string[] = [];
  let useCases: string[] = [];
  let pros: string[] = [];
  let cons: string[] = [];
  let gettingStarted = "";
  let alternatives: { name: string; description: string }[] = [];
  let aiEvaluation = "";

  if (isJa) {
    const descText = description || "詳細な説明はありません。";
    const langText = language || "プログラミング言語";
    const starsText = stars ? `${stars}個のスター` : "多数のスター";
    const topicsText = topics && topics.length > 0 ? topics.join(", ") : "オープンソース";

    overview = `**${repoName}**は、${langText}で書かれた非常に人気の高いレポジトリだよ。現在GitHub/GitLab上で${starsText}を獲得していて、主なトピックとして「${topicsText}」が設定されているね。${descText}`;
    features = [
      `${langText}による高速かつスケーラブルな実装`,
      `「${topicsText}」に関連する高度な機能提供`,
      "オープンソースコミュニティによる継続的なメンテナンス",
      "簡単なセットアップと拡張性の高いコードベース"
    ];
    useCases = [
      `新しくプロジェクトを立ち上げる際の実装ベースとして`,
      `「${topicsText}」関連のベストプラクティスを学ぶリファレンスとして`,
      "大規模本番環境における高信頼性コンポーネントとして"
    ];
    pros = [
      "アクティブなコミュニティと定期的なアップデート",
      "軽量かつ依存関係が最小限に抑えられている点",
      "分かりやすいドキュメントと豊富なサンプルコード"
    ];
    cons = [
      "一部の高度な機能については、追加のプラグインやカスタマイズが必要になる場合がある",
      "コミュニティ主導のため、破壊的なアップデート（仕様変更）が発生する可能性がある"
    ];
    gettingStarted = `### 🚀 始め方
まずは、リポジトリをクローンするかパッケージマネージャーを使ってインストールしてね。

\`\`\`bash
# リポジトリをクローンする場合
git clone https://github.com/${repoName}.git
cd ${repoName.split("/")[1] || "repo"}

# パッケージをインストールする場合
npm install
npm run dev
\`\`\`

詳しい設定や使い方は、README.mdを確認してみてね！`;
    alternatives = [
      { name: "Alternative-X", description: "より軽量で、シンプルな機能のみに特化した、類似する代表的な代替ライブラリ。" },
      { name: "Alternative-Y", description: "エンタープライズ用途向けに、さらに厳重なセキュリティと堅牢性を備えた代替ツール。" }
    ];
    aiEvaluation = `開発者評価: 「${repoName}」は${langText}エコシステムにおいて非常に強力な選択肢であり、スター数${stars}が示す通り信頼性があります。`;

    if (isSister) {
      overview = `ふふっ、お疲れ様〜！いつもお仕事や勉強、本当によく頑張ってるね。えらいえらい！今回注目したのはね、**${repoName}**っていうリポジトリだよ。${langText}で作られていてね、なんと星を${starsText}も集めてるの！すごいなぁ。トピックには「${topicsText}」が並んでいて、お姉ちゃんから見てもすごく便利そうなのが伝わってくるよ。中身は「${descText}」となっていて、あなたの開発を優しくサポートしてくれそうだね。`;
      features = [
        `大好きな${langText}を使って、サクサク動くように作られているよ。ふふっ`,
        `「${topicsText}」に必要な機能が、最初からギュッと詰まっているんだ`,
        "世界中の優しいエンジニアたちが、いつも丁寧にアップデートしてくれているよ",
        "シンプルなコードだから、あなたが読んでもすぐに理解できるように工夫されてるよ"
      ];
      useCases = [
        `新しい挑戦を始めるときに、優しい土台として寄り添ってくれるよ`,
        `「${topicsText}」について、お姉ちゃんと一緒にコードを読んでお勉強したいときに`,
        "本番のプロジェクトで、絶対にコケたくない時の頼れる味方として"
      ];
      pros = [
        "とにかく優しくて分かりやすいドキュメントと豊富なサンプルコード",
        "軽くて動作がスムーズだから、あなたのパソコンにも負担をかけないよ",
        "コミュニティのみんなが親切で、困ったらすぐ助けてくれるところ"
      ];
      cons = [
        "すごく多機能なんだけど、たまに甘えすぎて設定を忘れちゃうと動かないことがあるから注意してね？",
        "アップデートで少しお顔（仕様）が変わることがあるから、お姉ちゃんがついててあげるね"
      ];
      gettingStarted = `### 🌸 お姉ちゃんと一緒に始めよう！
難しいことは考えなくて大丈夫だよ。お姉ちゃんと一緒に、1ステップずつ進めていこうね。

\`\`\`bash
# まずはお部屋（リポジトリ）に移動しようね
git clone https://github.com/${repoName}.git
cd ${repoName.split("/")[1] || "repo"}

# 次に魔法のコマンドを実行してみてね
npm install
npm run dev
\`\`\`

もう、ちゃんと夜は寝ないとダメだよ？何か分からないことがあれば、いつでもお姉ちゃんに相談してね！`;
      aiEvaluation = `あかり姉のひとこと: 「ふふっ、${repoName}はあなたの開発をそっと支えてくれる、とっても素敵で温かいツールだと思うよ。無理しないで、お姉ちゃんに甘えながら進めていこうね！」`;
    }

    if (isNeet) {
      overview = `（プッw）どうせまたインターネットばかり見てるニート諸君が食いつきそうなレポジトリだな。**${repoName}**とかいうやつ。${langText}製で、スターが${starsText}あるらしいが、まーた誰かがGitHubでスター買ったり信者ビジネスで集めたんじゃないの？w トピックに「${topicsText}」とかドヤ顔で書いてあるけど、大体中身は「${descText}」で、よくある劣化コピーなんだよね。まあコードの書き方は一応見てやるかw`;
      features = [
        `ニートでもギリギリ3秒で理解できる${langText}実装。これ動かないとか言ってる奴は流スタンスで情弱w`,
        `「${topicsText}」とかいうバズワードを盛り込んだ、いつものイキり機能`,
        "ニート仲間が暇つぶしに投げたPRで成り立っている無計画な設計",
        "無駄にモダンぶった設定ファイル。いじるだけで半日溶ける罠仕様"
      ];
      useCases = [
        `Twitter(X)で他の技術スタック信者をボコボコに叩き潰すためのレスバのネタに`,
        `一日中部屋にこもって他人のコードのアラ探しをする、有意義な時間潰しとして`,
        "まるで自分が開発したかのように錯覚して悦に浸るための鑑賞用"
      ];
      pros = [
        "技術力は一応ある奴が書いてるから、無駄に低レイヤーのハックが学べる",
        "スター数だけは無駄に多いから、信者を煽る時の最高の盾になる",
        "ドキュメントが英語だから、機械翻訳してドヤれる点"
      ];
      cons = [
        "少しでもエッジケースを突くと一瞬でクラッシュする、ガラス細工のような脆弱設計",
        "メンテナーがインターネットのレスバで病むと、レポジトリが非公開になるリスクw"
      ];
      gettingStarted = `### 💻 ネット廃人向け引きこもりセットアップ
どうせお前ら環境構築すらできずにスタックオーバーフローで質問するんだろ？w 黙ってこれをターミナル（笑）に貼り付けろ。

\`\`\`bash
# 依存が壊れてエラー吐いても泣くなよw
git clone https://github.com/${repoName}.git
cd ${repoName.split("/")[1] || "repo"}

npm install --legacy-peer-deps || echo "はい依存エラーお疲れw"
npm run dev
\`\`\`

これで動かなかったら、回線切って寝ろ。ネット弁慶くんw`;
      aiEvaluation = `ネット廃人ニート批評: 「まーたクソコードかと思ったが、意外と内部設計はしっかりしてて癪に障るなw ${stars}スターは伊達じゃないが、どうせ俺の方が綺麗に書けるけどなw」`;
    } else if (isForumKid) {
      overview = `おんJ/なんJのみんな、集まれクレメンス！イッチが紹介してくれたのは**${repoName}**っていう神レポジトリや！${langText}っていう流行りの言語で書かれてて、スターが${starsText}もあるとかビビるわw トピックには「${topicsText}」がついてて、完全に理解した（理解してない）や。内容は「${descText}」となってて、これ使ってない奴は全員リアルで見たことない情弱キッズ確定やなw`;
      features = [
        `最強言語${langText}で書かれてるから、動作がマッハやでw`,
        `「${topicsText}」とかいう、いかにも強そうな技術要素がメガ盛り！`,
        "つよつよプログラマー達が夜な夜なポチポチ作った究極のライブラリや",
        "初心者お断りの激ムズ仕様（なお、マニュアル読めば誰でも動く模様）"
      ];
      useCases = [
        `「ワイ、${repoName}を完全に使いこなす」というスレを立ててマウントを取るために`,
        `なんJで技術談義になった時に、知ったかぶりでレスバに勝利するために`,
        "これを使って最強のクソアプリを作って、おんJ民に見せびらかすため"
      ];
      pros = [
        "とにかくスター数が多いから、使ってるだけでエリート感がヤバイ",
        "アイコンがなんかオシャレ。これだけでインストールする価値あるわ",
        "何より、これ使ってるだけで『おっ、玄人やん』って思われる点"
      ];
      cons = [
        "英語が読めないと、エラー吐いた瞬間になんJで『助けてクレメンス』とスレ立てする羽目になる",
        "なんか設定項目が多くて、ちょっと改造しようとすると一瞬で爆発する模様w"
      ];
      gettingStarted = `### 🚀 イッチおすすめの爆速セットアップ
お前ら、コピペするだけでつよつよエンジニアになれるコマンド置いとくぞ！感謝してクレメンス！

\`\`\`bash
# ここをクローンして…
git clone https://github.com/${repoName}.git
cd ${repoName.split("/")[1] || "repo"}

# 魔法の呪文を実行するんや！
npm install && npm run dev
\`\`\`

これで動かなかったらお前のPCがポンコツなだけやでw ほな、またスレで会おうな！`;
      aiEvaluation = `技術キッズの感想: 「完全に理解したわ（白目）。${repoName}は最強！スター${stars}以下は人権ないってマジ？w これからはこれを覇権ライブラリと呼ぶことにするで！」`;
    } else if (isPM) {
      overview = `皆さん、アグリーですか！？本日ご紹介する最高のバリュープロポジション、それがこの**${repoName}**です！${langText}を基盤とし、現在${starsText}という圧倒的なエビデンスを誇るプロジェクト。コアなアジェンダである「${topicsText}」を完全にアラインし、「${descText}」という圧倒的なシナジーを創出します。リソースをハックしてKPIを最大化するためのロードマップがここにあります！`;
      features = [
        `チームの学習コストをミニマイズする、極めて直感的な${langText}アーキテクチャ`,
        `「${topicsText}」をアジャイルにデリバリーするための、優れたビルトイン・ソリューション`,
        "開発スピードを最大化し、タイム・トゥ・マーケットをハーフカットする設計",
        "ステークホルダーへの説明責任を容易にする、圧倒的なプレゼンスと信頼性"
      ];
      useCases = [
        `爆速でMVP（最小限の実用製品）をデリバリーし、市場のフィードバックをハックする`,
        `チームのマインドセットをモダンにトランスフォームする、最新の技術アジェンダとして`,
        "リソースの無駄を徹底的に排除し、生産性向上によるバリューをコミットする"
      ];
      pros = [
        "極めて高いビジネス・アジリティと、スケールしやすいスケーラブルなコード",
        "長期的なメンテナンス性が担保され、テックデット（技術負債）を大幅に削減できる点",
        "世界的なブランドパワー（スター数：${stars}）による、クライアントへの高い訴求力"
      ];
      cons = [
        "初期のアサイン設計を誤ると、メンバー間のコンフリクトやオーバーヘッドが発生するリスク",
        "アジャイルに進めないと、一部機能のアップデート時にマイルストーンのリスケが発生する可能性"
      ];
      gettingStarted = `### 📈 爆速ロードマップ（デリバリー手順）
この手順で進めれば、今日のコミットメントは完全にクリアです！アラインして進めていきましょう！

\`\`\`bash
# 1. ローカルにアサイン
git clone https://github.com/${repoName}.git
cd ${repoName.split("/")[1] || "repo"}

# 2. リソースのハックと起動
npm install
npm run dev
\`\`\`

バリューを最大化するために、チームメンバーの役割分担（アサイン）を明確にして進めてください。コミットしていきましょう！`;
      aiEvaluation = `敏腕PMのアセスメント: 「${repoName}の導入は、我々のKPI達成に向けたクリティカルパスです。シナジー効果は抜群で、即座にコミットすべきバリューがあると確信しています。アグリー！」`;
    }
  } else {
    const descText = description || "No description provided.";
    const langText = language || "programming language";
    const starsText = stars ? `${stars} stars` : "many stars";
    const topicsText = topics && topics.length > 0 ? topics.join(", ") : "open-source";

    overview = `**${repoName}** is a highly popular open-source repository written in ${langText}. It currently has ${starsText} on GitHub/GitLab, with key topics including "${topicsText}". The core project focus is: ${descText}`;
    features = [
      `High-performance implementation using ${langText}`,
      `Robust support for ${topicsText} concepts`,
      "Active community contributions and maintenance",
      "Clean, modular code structure suitable for scaling"
    ];
    useCases = [
      "To boot up a new project with a reliable scaffolding",
      "As a reference learning resource for best practices in modern software development",
      "As a production-ready component to accelerate development"
    ];
    pros = [
      "Vibrant community with fast response times",
      "Minimal runtime footprint and dependencies",
      "Rich documentation and clear configuration examples"
    ];
    cons = [
      "Some edge-case configurations may require custom extension",
      "Minor breaking changes could be introduced during major releases"
    ];
    gettingStarted = `### 🚀 Quick Start
Get up and running with these simple commands:

\`\`\`bash
# Clone the repository
git clone https://github.com/${repoName}.git
cd ${repoName.split("/")[1] || "repo"}

# Install dependencies and start the dev server
npm install
npm run dev
\`\`\`

Check the official README.md file for full integration details.`;
    alternatives = [
      { name: "Alternative-X", description: "A lightweight, minimal-feature equivalent of this library." },
      { name: "Alternative-Y", description: "An enterprise-grade robust alternative with enhanced security controls." }
    ];
    aiEvaluation = `Developer verdict: "${repoName}" is an exceptional software library in the ${langText} ecosystem. With ${stars} stars, it is a proven choice for modern applications.`;
  }

  return {
    title: isJa 
      ? `世界を熱狂させる「${repoName}」の正体に迫る。その圧倒的ポテンシャルと現実的な技術制約` 
      : `Inside ${repoName}: Architectural Auditing, Operational Trade-offs, and Developer Verdict`,
    overview,
    features,
    useCases,
    pros,
    cons,
    gettingStarted,
    alternatives,
    aiEvaluation,
    readmeImages: candidateImages
  };
}

// 2. Repository deep dive / details endpoint
const detailCache: Record<string, { data: any; timestamp: number }> = {};
const DETAIL_CACHE_TTL = 60 * 60 * 1000; // 1 hour

app.post("/api/detail", async (req, res) => {
  console.log("[DEBUG SERVER] /api/detail called. Headers x-gemini-model:", req.headers["x-gemini-model"]);
  const { repoName, description, stars, language, topics, lang, personaPrompt, audiencePrompt, source = "github" } = req.body;
  try {
    if (!repoName) {
      return res.status(400).json({ error: "repoName is required in body" });
    }

    const model = req.headers["x-gemini-model"] as string || "models/gemini-flash-lite-latest";
    const provider = req.headers["x-ai-provider"] as string || "gemini";
    const cacheKey = `detail_${repoName}_${lang || "en"}_${personaPrompt || ""}_${audiencePrompt || ""}_${provider}_${model}`.toLowerCase();
    const bypassCache = req.headers["x-bypass-cache"] === "true";
    const cached = detailCache[cacheKey];
    if (!bypassCache && cached && Date.now() - cached.timestamp < DETAIL_CACHE_TTL) {
      console.log(`Serving cached detail analysis for ${repoName}`);
      return res.json(cached.data);
    }

    const sendResponse = (data: any) => {
      detailCache[cacheKey] = {
        data,
        timestamp: Date.now()
      };
      return res.json(data);
    };

    const languageName = getLanguageName(lang || "en");

    // Fetch README to extract candidate images BEFORE calling Gemini
    let candidateImages: string[] = [];
    let candidateVideos: string[] = [];
    let defaultBranch = "main";
    let readmeMarkdown = "";
    try {
      if (source === "gitlab") {
        const projectUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(repoName)}`;
        console.log(`Fetching GitLab project metadata for: ${repoName}`);
        const projectResponse = await fetch(projectUrl, {
          headers: { "User-Agent": "OSS-Search-Lab-App-v1" }
        });
        if (projectResponse.ok) {
          const projectData = await projectResponse.json();
          defaultBranch = projectData.default_branch || "main";
          
          // Try fetching README.md
          const readmeApiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(repoName)}/repository/files/README.md?ref=${defaultBranch}`;
          console.log(`Fetching GitLab README.md for: ${repoName} from ${readmeApiUrl}`);
          const fileResponse = await fetch(readmeApiUrl, {
            headers: { "User-Agent": "OSS-Search-Lab-App-v1" }
          });
          if (fileResponse.ok) {
            const fileData = await fileResponse.json();
            if (fileData.content) {
              readmeMarkdown = Buffer.from(fileData.content, "base64").toString("utf-8");
            }
          } else {
            // Try lowercase readme.md
            const readmeApiUrlLower = `https://gitlab.com/api/v4/projects/${encodeURIComponent(repoName)}/repository/files/readme.md?ref=${defaultBranch}`;
            const fileResponseLower = await fetch(readmeApiUrlLower, {
              headers: { "User-Agent": "OSS-Search-Lab-App-v1" }
            });
            if (fileResponseLower.ok) {
              const fileDataLower = await fileResponseLower.json();
              if (fileDataLower.content) {
                readmeMarkdown = Buffer.from(fileDataLower.content, "base64").toString("utf-8");
              }
            }
          }
        }
      } else {
        console.log(`Fetching README for GitHub: ${repoName}`);
        const readmeUrl = `https://api.github.com/repos/${repoName}/readme`;
        const readmeHeaders: Record<string, string> = {
          "User-Agent": "OSS-Search-Lab-App-v1",
          "Accept": "application/vnd.github.v3.raw",
        };
        if (process.env.GITHUB_TOKEN) {
          readmeHeaders["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
        }
        
        const readmeResponse = await fetch(readmeUrl, {
          headers: readmeHeaders
        });
        if (readmeResponse.ok) {
          readmeMarkdown = await readmeResponse.text();
        }
      }
      if (readmeMarkdown) {
        const foundUrls = new Set<string>();
        const foundVideoUrls = new Set<string>();

        const filterOutUselessImages = (url: string) => {
          const lowerUrl = url.toLowerCase();
          if (lowerUrl.includes("img.shields.io")) return false;
          if (lowerUrl.includes("shields.io")) return false;
          if (lowerUrl.includes("opencollective.com")) return false;
          if (lowerUrl.includes("buymeacoffee.com")) return false;
          if (lowerUrl.includes("ko-fi.com")) return false;
          if (lowerUrl.includes("sonarcloud.io")) return false;
          if (lowerUrl.includes("travis-ci.")) return false;
          if (lowerUrl.includes("circleci.com")) return false;
          if (lowerUrl.includes("coveralls.io")) return false;
          if (lowerUrl.includes("codecov.io")) return false;
          return true;
        };

        const isVideoUrl = (url: string) => {
          const lowerUrl = url.toLowerCase();
          return (
            lowerUrl.endsWith(".mp4") ||
            lowerUrl.endsWith(".webm") ||
            lowerUrl.endsWith(".ogg") ||
            lowerUrl.endsWith(".mov") ||
            lowerUrl.includes("vimeo.com") ||
            lowerUrl.includes("youtube.com") ||
            lowerUrl.includes("youtu.be") ||
            (lowerUrl.includes("user-images.githubusercontent.com") && lowerUrl.includes(".mp4"))
          );
        };

        const isImageUrl = (url: string) => {
          const lowerUrl = url.toLowerCase();
          return (
            lowerUrl.endsWith(".png") ||
            lowerUrl.endsWith(".jpg") ||
            lowerUrl.endsWith(".jpeg") ||
            lowerUrl.endsWith(".gif") ||
            lowerUrl.endsWith(".svg") ||
            lowerUrl.endsWith(".webp") ||
            lowerUrl.endsWith(".bmp") ||
            lowerUrl.includes("user-images.githubusercontent.com") ||
            lowerUrl.includes("githubusercontent.com/assets/")
          );
        };

        // 1. Find standard markdown images: ![alt](url)
        const mdImageRegex = /!\[.*?\]\((.*?)\)/g;
        let match;
        while ((match = mdImageRegex.exec(readmeMarkdown)) !== null) {
          if (match[1]) {
            const cleanedUrl = match[1].trim().split(" ")[0].replace(/[()]/g, "");
            if (filterOutUselessImages(cleanedUrl)) {
              if (isVideoUrl(cleanedUrl)) {
                foundVideoUrls.add(cleanedUrl);
              } else {
                foundUrls.add(cleanedUrl);
              }
            }
          }
        }

        // 2. Find html images: <img src="url" ...>
        const htmlImageRegex = /<img\s+[^>]*src=["'](.*?)["']/gi;
        while ((match = htmlImageRegex.exec(readmeMarkdown)) !== null) {
          if (match[1]) {
            const cleanedUrl = match[1].trim();
            if (filterOutUselessImages(cleanedUrl)) {
              if (isVideoUrl(cleanedUrl)) {
                foundVideoUrls.add(cleanedUrl);
              } else {
                foundUrls.add(cleanedUrl);
              }
            }
          }
        }

        // 3. Find html video and source tags: <video src="url">, <source src="url">
        const videoRegex = /<(?:video|source)\s+[^>]*src=["'](.*?)["']/gi;
        while ((match = videoRegex.exec(readmeMarkdown)) !== null) {
          if (match[1]) {
            const cleanedUrl = match[1].trim();
            if (filterOutUselessImages(cleanedUrl)) {
              foundVideoUrls.add(cleanedUrl);
            }
          }
        }

        // 4. Find iframe embeds (e.g. YouTube/Vimeo embeds)
        const iframeRegex = /<iframe\s+[^>]*src=["'](.*?)["']/gi;
        while ((match = iframeRegex.exec(readmeMarkdown)) !== null) {
          if (match[1]) {
            const cleanedUrl = match[1].trim();
            if (isVideoUrl(cleanedUrl) || cleanedUrl.includes("youtube.com") || cleanedUrl.includes("vimeo.com")) {
              foundVideoUrls.add(cleanedUrl);
            }
          }
        }

        // 5. Find markdown links [label](url) pointing directly to image or video files
        const mdLinkRegex = /\[[^\]]*\]\((.*?)\)/g;
        while ((match = mdLinkRegex.exec(readmeMarkdown)) !== null) {
          if (match[1]) {
            const cleanedUrl = match[1].trim().split(" ")[0].replace(/[()]/g, "");
            if (filterOutUselessImages(cleanedUrl)) {
              if (isVideoUrl(cleanedUrl)) {
                foundVideoUrls.add(cleanedUrl);
              } else if (isImageUrl(cleanedUrl)) {
                foundUrls.add(cleanedUrl);
              }
            }
          }
        }

        // 6. Find HTML anchor links <a href="url"> pointing directly to image or video files
        const htmlAnchorRegex = /<a\s+[^>]*href=["'](.*?)["']/gi;
        while ((match = htmlAnchorRegex.exec(readmeMarkdown)) !== null) {
          if (match[1]) {
            const cleanedUrl = match[1].trim();
            if (filterOutUselessImages(cleanedUrl)) {
              if (isVideoUrl(cleanedUrl)) {
                foundVideoUrls.add(cleanedUrl);
              } else if (isImageUrl(cleanedUrl)) {
                foundUrls.add(cleanedUrl);
              }
            }
          }
        }

        for (let url of foundUrls) {
          if (!url) continue;
          if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
            const isBadge = url.includes("shields.io") || url.includes("sonarcloud.io") || url.includes("codecov.io") || url.includes("travis-ci") || url.includes("circleci") || url.includes("npm/v/") || url.includes("node-i");
            if (!isBadge) {
              candidateImages.push(url);
            }
          } else {
            let relPath = url.replace(/^\.\//, "").replace(/^\//, "");
            if (source === "gitlab") {
              const absoluteUrl = `https://gitlab.com/${repoName}/-/raw/${defaultBranch}/${relPath}`;
              candidateImages.push(absoluteUrl);
            } else {
              const absoluteUrl = `https://raw.githubusercontent.com/${repoName}/HEAD/${relPath}`;
              candidateImages.push(absoluteUrl);
            }
          }
        }

        for (let url of foundVideoUrls) {
          if (!url) continue;
          if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
            candidateVideos.push(url);
          } else {
            let relPath = url.replace(/^\.\//, "").replace(/^\//, "");
            if (source === "gitlab") {
              const absoluteUrl = `https://gitlab.com/${repoName}/-/raw/${defaultBranch}/${relPath}`;
              candidateVideos.push(absoluteUrl);
            } else {
              const absoluteUrl = `https://raw.githubusercontent.com/${repoName}/HEAD/${relPath}`;
              candidateVideos.push(absoluteUrl);
            }
          }
        }
      }
    } catch (err) {
      console.log(`Failed to fetch or parse README for ${repoName}.`);
    }

    let systemInstruction = `You are a distinguished open source advisor and technical architect.
Analyze the repository "${repoName}" and provide an in-depth, structured overview.
Your entire output response MUST be written strictly in: ${languageName}.
This is a ABSOLUTE requirement. Even though the schema properties, descriptions, and prompt instructions are written in English, every single text field value in the resulting JSON output MUST be written entirely in ${languageName}. Never output English or mix languages unless referencing specific programming terms, APIs, or code snippets. Ensure natural, fluent, and highly professional phrasing.`;

    if (personaPrompt && personaPrompt.trim() !== "") {
      systemInstruction += `\n\n[STYLE DIRECTION / WRITER PERSONA]:
You must write all responses adopting this specific personality, writing style, tone, and mannerisms:
"${personaPrompt.trim()}"
Apply this personality across all generated JSON fields (overview, features, pros, cons, aiEvaluation, etc.). Ensure the output matches this persona perfectly while keeping the underlying technical information accurate.`;
    }

    if (audiencePrompt && audiencePrompt.trim() !== "") {
      systemInstruction += `\n\n[TARGET READER / AUDIENCE PROFILE]:
The reader of this report is described as follows:
"${audiencePrompt.trim()}"
You MUST explicitly tailor the depth, vocabulary, level of technical details, analogies, focus, and readability specifically to this target reader profile.
- If they are a beginner, use intuitive analogies, explain complex jargon gently, and focus on basic setup.
- If they are an expert, skip basic definitions, go deep into architecture, performance, trade-offs, and design patterns.
- If they are a project manager/decision maker, focus heavily on business value, maintenance overhead, learning curve, security, and developer speed.
- If they are a student/enthusiast, emphasize the computer science principles, technical innovation, and design philosophy.`;
    }

    systemInstruction += `\n\nProvide insights that are highly helpful for developers, including:
1. An engaging overview of what this library actually is and why it became popular.
2. A list of key technical features and architectural highlights.
3. Common real-world use cases (when should a team adopt this?).
4. Clear Pros (advantages) and Cons (disadvantages or limitations) of choosing this.
5. A quick, clear getting-started guide (e.g. installation command and 1 simple usage code snippet if applicable, formatted cleanly).
6. Recommended alternatives or similar libraries in the ecosystem.
7. An overall assessment or review of the library.`;

    let trimmedReadme = readmeMarkdown || "";
    if (trimmedReadme.length > 20000) {
      trimmedReadme = trimmedReadme.substring(0, 20000) + "\n... (README content truncated for length limit) ...";
    }

    let prompt = `Analyze this repository:
- Name: ${repoName}
- Description: ${description || "No description provided"}
- Stars: ${stars || 0}
- Language: ${language || "Unknown"}
- Topics: ${JSON.stringify(topics || [])}

Repository README Content (excerpt):
${trimmedReadme}

Candidate README Images (first 30 URLs):
${JSON.stringify(candidateImages.slice(0, 30))}

Candidate README Videos (first 15 URLs):
${JSON.stringify(candidateVideos.slice(0, 15))}

Generate a comprehensive review matching the requested JSON format. Keep code snippets highly concise but accurate.

CRITICAL MEDIA SELECTING AND EMBEDDING RULES (AI JUDGMENT MANDATE):
1. You are provided with up to 30 candidate image URLs and up to 15 candidate video URLs extracted from the repository's README.
2. Carefully analyze these URLs and select only the most relevant, helpful, and high-quality images/videos to include in your article (e.g., screenshots, architectural diagrams, flowcharts, feature demonstrations, or interactive video previews). Avoid selecting generic icons, badges, sponsors, or avatars.
3. You should organically embed your selected candidate images using markdown ![alt](url) and videos using <video src="url"></video> in the 'overview', 'features', or 'gettingStarted' sections to create a highly visual, professional, and engaging technical article.
4. You MUST only use exact URLs present in the "Candidate README Images" and "Candidate README Videos" lists. Do NOT invent, guess, or hallucinate any other URLs.
5. In the 'readmeImages' JSON field, return an array of up to 4 selected image URLs from the "Candidate README Images" list that represent the main screenshots or diagrams of the repository.
6. STRICTURE: NEVER output pure media elements as list items. When populating arrays such as 'features', 'useCases', 'pros', and 'cons', every single item MUST contain rich descriptive text (at least 1-2 sentences written entirely in ${languageName}). You may organically embed a candidate image or video inside that text, but you are STRICTLY FORBIDDEN from outputting an item that contains ONLY an image or video markup (e.g., never output an item that is just "![alt](url)" or just "<video src='url'></video>"). Every item must remain a complete, readable technical point in ${languageName}, even if the media is stripped out later.`;

    console.log(`Generating details for ${repoName} in language: ${languageName}`);


    const validImageUrls = candidateImages.filter(url => !url.toLowerCase().match(/\.(mp4|webm|ogg)$/)).slice(0, 4);
    const fetchedImages = await Promise.all(validImageUrls.map(async url => {
      const imgData = await fetchImageAsBase64(url);
      if (imgData) {
        return {
          inlineData: { mimeType: imgData.mimeType, data: imgData.data }
        };
      }
      return null;
    }));
    
    const imageParts = fetchedImages.filter((img): img is { inlineData: { mimeType: string, data: string } } => img !== null);
    const textPart = { text: prompt };
    const parts = [textPart, ...imageParts];
    const responseSchema = {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "A short, engaging title summarizing this repository analysis in the requested language (e.g. 'パラキート/Whisper搭載の革新的AI会議アシスタント' or 'A Revolutionary Local-first AI Assistant'). Do not output any HTML/Markdown, just a plain text title.",
            },
            overview: {
              type: Type.STRING,
              description: "A comprehensive overview of what this library is, its origin, and why it's popular. You MUST use Markdown. Using your AI judgment, select the most relevant screenshots or demo videos from the provided candidate lists and organically embed them using ![alt](url) and <video src=\"url\"></video>.",
            },
            features: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Key technical features and architectural design details. Use Markdown. Using your AI judgment, you can organically embed relevant screenshots or diagrams here from the candidate list.",
            },
            useCases: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Common real-world scenarios or use cases where this library shines. Use Markdown.",
            },
            pros: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Pros (reasons to choose it, advantages).",
            },
            cons: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Cons (limitations, learning curve, pitfalls).",
            },
            gettingStarted: {
              type: Type.STRING,
              description: "Markdown string showing installation commands and a very short, clean usage example code block. Using your AI judgment, embed relevant candidate images or videos here.",
            },
            alternatives: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Name of the alternative library." },
                  description: { type: Type.STRING, description: "Brief description of why/when to choose it instead." },
                },
                required: ["name", "description"],
              },
              description: "Popular alternatives or complementary libraries in the same ecosystem.",
            },
            aiEvaluation: {
              type: Type.STRING,
              description: "Your brief 1-2 sentence subjective developer verdict/rating of this repository.",
            },
            readmeImages: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of up to 4 selected image URLs from the Candidate README Images that represent the main screenshots or diagrams.",
            }
          },
          required: ["title", "overview", "features", "useCases", "pros", "cons", "gettingStarted", "alternatives", "aiEvaluation", "readmeImages"],
        };
    
    let responseText = await callAiContent(req, prompt, systemInstruction, responseSchema, undefined, imageParts);
    if (!responseText) {
      throw new Error("AI returned empty response");
    }

    console.log(`Details generated for ${repoName}`);

    if (responseText) {
      let parsedData: any = {};
      try {
        parsedData = tryRepairAndParseJson(responseText);
      } catch (jsonErr: any) {
        console.log("JSON parsing completely failed. Falling back to high-quality local metadata-driven details instead of raw JSON output leakage. Skipping cache.");
        const fallbackObj = getDetailFallback(repoName, description, stars, language, topics, lang, personaPrompt, audiencePrompt, candidateImages);
        return res.json(fallbackObj);
      }

      const isJa = (lang || "").startsWith("ja");
      const defaultOverview = isJa ? "概要情報がありません。" : "No overview details available.";
      const defaultFeature = isJa ? "特徴の詳細情報" : "No feature details available.";
      const defaultUseCase = isJa ? "ユースケース情報" : "No use case details available.";
      const defaultPro = isJa ? "長所/メリット" : "No advantage available.";
      const defaultCon = isJa ? "短所/懸念点" : "No limitation available.";
      const defaultGettingStarted = isJa ? "セットアップ手順がありません。" : "No setup steps available.";

      // Helper to sanitize array elements and fallback if the media stripping emptied them completely
      const safeSanitizeText = (val: any, defaultText: string): string => {
        const raw = typeof val === "string" ? val : "";
        const cleaned = sanitizeMediaInText(raw, candidateImages, candidateVideos);
        if (raw && !cleaned.trim()) {
          // If raw had content but cleaning left it empty (e.g. because of non-whitelisted image),
          // recover by using alt text or stripping markdown image formatting to leave plain text.
          const altMatch = raw.match(/!\[([^\]]*)\]/);
          if (altMatch && altMatch[1] && altMatch[1].trim()) {
            return altMatch[1].trim();
          }
          const stripped = raw.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1").replace(/<[^>]+>/g, "").trim();
          return stripped || defaultText;
        }
        return cleaned || defaultText;
      };

      // Sanitize fields to ensure they exist, have correct types, and only contain approved media
      const sanitized = {
        title: typeof parsedData.title === "string" ? parsedData.title : "",
        overview: safeSanitizeText(parsedData.overview, defaultOverview),
        features: (Array.isArray(parsedData.features) ? parsedData.features : []).map((f: any) => safeSanitizeText(f, defaultFeature)),
        useCases: (Array.isArray(parsedData.useCases) ? parsedData.useCases : []).map((u: any) => safeSanitizeText(u, defaultUseCase)),
        pros: (Array.isArray(parsedData.pros) ? parsedData.pros : []).map((p: any) => safeSanitizeText(p, defaultPro)),
        cons: (Array.isArray(parsedData.cons) ? parsedData.cons : []).map((c: any) => safeSanitizeText(c, defaultCon)),
        gettingStarted: safeSanitizeText(parsedData.gettingStarted, defaultGettingStarted),
        alternatives: Array.isArray(parsedData.alternatives) ? parsedData.alternatives : [],
        aiEvaluation: typeof parsedData.aiEvaluation === "string" ? parsedData.aiEvaluation : "",
        readmeImages: (Array.isArray(parsedData.readmeImages) && parsedData.readmeImages.length > 0)
          ? parsedData.readmeImages.map((img: any) => {
              if (typeof img !== "string") return "";
              const cleanImg = img.trim();
              const cleanImgLower = cleanImg.toLowerCase();
              const isUseless = cleanImgLower.includes("shields.io") || cleanImgLower.includes("badge") || cleanImgLower.includes("avatar") || cleanImgLower.includes("opencollective") || cleanImgLower.includes("buymeacoffee");
              if (isUseless) return "";
              if (cleanImgLower.startsWith("http://") || cleanImgLower.startsWith("https://") || cleanImgLower.startsWith("data:")) {
                return cleanImg;
              }
              for (const allowed of candidateImages) {
                if (allowed.toLowerCase().endsWith(cleanImgLower)) {
                  return allowed;
                }
              }
              return cleanImg;
            }).filter((img: string) => img !== "")
          : candidateImages,
      };

      return sendResponse(sanitized);
    } else {
      throw new Error("No response content from model.");
    }
  } catch (error: any) {
    console.log("Detail Generation Error, falling back to empty/default details. Error:", error);
    const isJa = (lang || "").startsWith("ja");
    return res.json({
      title: "",
      overview: isJa ? "概要情報がありません。" : "No overview details available.",
      features: [],
      useCases: [],
      pros: [],
      cons: [],
      gettingStarted: isJa ? "セットアップ手順がありません。" : "No setup steps available.",
      alternatives: [],
      aiEvaluation: isJa ? "AI評価情報がありません。" : "No AI evaluation available.",
      readmeImages: []
    });
  }
});

// AI Magazine Generation Endpoint
app.post("/api/generate-magazine", async (req, res) => {
  try {
    const { topic, repositories, lang, personaPrompt, audiencePrompt } = req.body;
    if (!topic || !repositories || !Array.isArray(repositories)) {
      return res.status(400).json({ error: "topic and repositories array are required" });
    }
    
    const isStream = req.query.stream === "true";
    if (isStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    }
    
    const sendData = (chunk) => {
      if (isStream) {
        res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`);
      }
    };
    
    const languageName = getLanguageName(lang || "en");
    const repoDetails = repositories.slice(0, 5).map((r) => `- ${r.fullName}: ${r.description} (Stars: ${r.stargazersCount || r.stars || 0})`).join("\n");
    
    let systemInstruction = `You are a highly skilled tech magazine editor and writer.
Your task is to write a highly engaging, structured magazine article (in Markdown format) about a given topic and feature a list of provided open-source repositories.

The article MUST be written entirely and strictly in: ${languageName}. This is an absolute rule.
`;

    if (personaPrompt && personaPrompt.trim() !== "") {
      systemInstruction += `\n[STYLE DIRECTION / WRITER PERSONA]:\nYou must write the ENTIRE article adopting this specific personality, writing style, tone, and mannerisms:\n"${personaPrompt.trim()}"\nEnsure the output matches this persona perfectly. If the persona is unique (e.g., an internet forum kid, a strict PM, a cute sister), fully embrace the role-play in your writing style.\n`;
    }

    if (audiencePrompt && audiencePrompt.trim() !== "") {
      systemInstruction += `\n[TARGET AUDIENCE / INTENDED READERS]:\nYour target readers are:\n"${audiencePrompt.trim()}"\nTailor your depth, explanation complexity, and key focal points to match their background, skill level, and specialized interests.\n`;
    }

    systemInstruction += `\nStructure the article with:
1. A catchy Magazine Title (H1)
2. An engaging introduction to the topic
3. A featured section for the repositories, explaining WHY they are great and how they fit the topic. Do not just list them blindly, weave them into a narrative.
4. A concluding thought or call to action.
Use rich Markdown formatting (bold, italics, blockquotes, lists) to make it look like a well-formatted tech blog post.`;

    const userPrompt = `Topic: "${topic}"\n\nFeatured Repositories:\n${repoDetails}\n\nPlease write the magazine article now.`;
    
    // We use callAiContent to support all providers (OpenAI, Anthropic, Gemini) natively
    const responseText = await callAiContent(req, userPrompt, systemInstruction, null);
    
    if (isStream) {
      // Chunk it manually to simulate streaming and satisfy the frontend JSON parser
      const chunkSize = 100;
      for (let i = 0; i < responseText.length; i += chunkSize) {
        sendData(responseText.substring(i, i + chunkSize));
      }
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } else {
      res.json({ markdown: responseText });
    }
  } catch (error) {
    console.log("Magazine Generation Error, falling back to dummy text.");
    if (req.query.stream === "true") {
      res.write(`data: ${JSON.stringify({ type: "chunk", chunk: "Sorry, I could not generate the magazine content at this time. Please try again later." })}\n\n`);
      res.end();
    } else {
      res.json({ content: "Sorry, I could not generate the magazine content at this time. Please try again later." });
    }
  }
});

// 3. AI automatic generation for Persona and Target Audience prompts
app.post("/api/generate-prompt", async (req, res) => {
  try {
    const { type, input, lang } = req.body;
    if (!type || !input) {
      return res.status(400).json({ error: "type and input are required in body" });
    }


    const languageName = getLanguageName(lang || "en");

    let systemInstruction = `You are an expert AI prompt engineer and writer assistant.
Your task is to expand a user's brief, simple idea for either an "AI Persona" or a "Target Audience" into a highly polished, professional, and detailed definition.

- If type is "persona": Define an AI writer's personality, tone, vocabulary, formatting style, and unique characteristics.
- If type is "audience": Define a target reader's background, technical level, expectations, core interests, and the corresponding communication guidelines for writing to them.

Provide the response in the language specified: ${languageName}. If user's input is in a different language, prefer that language or the specified language.
Ensure the output strictly respects the requested JSON schema.`;

    const userPrompt = `Brief simple idea from user: "${input}"
Generate a refined name (concise and elegant) and a highly detailed prompt instruction (2-4 sentences, clear and actionable) for a "${type}".`;

    const responseSchema = {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: "A refined, professional, and elegant name representing the persona or audience.",
            },
            prompt: {
              type: Type.STRING,
              description: "A highly detailed, specific, and actionable prompt instruction (2-4 sentences) defining the persona or target audience characteristics.",
            },
          },
          required: ["name", "prompt"],
        };

    let responseText = await callAiContent(req, userPrompt, systemInstruction, responseSchema);

    if (responseText) {
      try {
        const parsedData = JSON.parse(responseText.trim());
        return res.json(parsedData);
      } catch (jsonErr) {
        console.log("JSON parsing failed for generate-prompt:", responseText);
      }
    }

    // Secure fallback when API fails or JSON is unparseable
    const fallbackName = input.length > 20 ? input.slice(0, 20) + "..." : input;
    if (type === "persona") {
      return res.json({
        name: fallbackName,
        prompt: `You are a creative writer adopting the persona of "${input}". Express your thoughts clearly, adopting appropriate tone, vocabulary, and unique mannerisms fitting this role.`,
      });
    } else {
      return res.json({
        name: fallbackName,
        prompt: `The reader is "${input}". Tailor your depth, explanation complexity, and key focal points to match their background, skill level, and specialized interests.`,
      });
    }
  } catch (error: any) {
    console.log("Generate Prompt Error, returning default input.");
    return res.json({ prompt: req.body.inputPrompt || "Error generating prompt" });
  }
});

let server: any;
let handler: any;

// Configure Vite or Static asset serving
async function configureApp() {
  if (process.env.CF_PAGES === "1" || process.env.CLOUDFLARE_WORKERS === "1") {
    // Under Cloudflare Workers / Pages, do not start internal server directly
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware mounted in development mode.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static production build from:", distPath);
  }

  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.CF_PAGES !== "1" && process.env.CLOUDFLARE_WORKERS !== "1") {
  configureApp().catch((err) => {
    console.log("Failed to start server:", err);
  });
} else {
  // Setup Cloudflare Pages / Workers entrypoint
  const { httpServerHandler } = require("cloudflare:node");
  // Under CF, we simulate listen on 127.0.0.1
  const internalServer = app.listen(PORT, "127.0.0.1");
  handler = httpServerHandler(internalServer);
}

export default {
  async fetch(request: any, env: any, ctx: any) {
    // Injects env to global space so server APIs can access variables/KV
    globalThis.cloudflareEnv = env;

    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) {
      return handler.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  }
};
