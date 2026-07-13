import React, { useState, useEffect, useRef } from "react";
import { BookOpen, X, Sparkles, Loader2 } from "lucide-react";
import CustomMarkdown from "./CustomMarkdown";
import { Repository } from "../types";
import { getUITranslations } from "../lib/translations";

interface MagazineViewProps {
  topic: string;
  repositories: Repository[];
  onClose: () => void;
  lang: string;
  geminiApiKey: string | null;
  selectedModel: string;
  activeEndpoint: { type: string; url: string };
  personaPrompt: string;
  audiencePrompt: string;
}

export default function MagazineView({
  topic,
  repositories,
  onClose,
  lang,
  geminiApiKey,
  selectedModel,
  activeEndpoint,
  personaPrompt,
  audiencePrompt,
}: MagazineViewProps) {
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const isJa = lang.startsWith("ja");
  const t = getUITranslations(isJa ? "ja" : "en");

  useEffect(() => {
    let isMounted = true;
    const generateMagazine = async () => {
      setLoading(true);
      setError(null);
      setMarkdown("");

      try {
        const response = await fetch(`/api/generate-magazine?stream=true&lang=${lang}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-key": geminiApiKey || "",
            "x-gemini-model": selectedModel || "",
            "x-ai-provider": activeEndpoint.type,
            "x-ai-endpoint": activeEndpoint.url,
          },
          body: JSON.stringify({
            topic,
            repositories,
            lang,
            personaPrompt,
            audiencePrompt,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate magazine");
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");

        if (!reader) throw new Error("No reader stream");

        let done = false;
        while (!done && isMounted) {
          const { value, done: readerDone } = await reader.read();
          if (value) {
            const chunkText = decoder.decode(value, { stream: true });
            const lines = chunkText.split("\n\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "chunk") {
                    setMarkdown((prev) => prev + data.text);
                  } else if (data.type === "done") {
                    done = true;
                  } else if (data.type === "error") {
                    throw new Error(data.message);
                  }
                } catch (e) {
                  // ignore JSON parse error on incomplete chunks
                }
              }
            }
          }
          if (readerDone) done = true;
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Failed to generate magazine");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    generateMagazine();

    return () => {
      isMounted = false;
    };
  }, [topic, repositories, lang, geminiApiKey, selectedModel, personaPrompt, audiencePrompt]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" id="magazine-modal-backdrop">
      <div 
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up" 
        id="magazine-modal-content"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-none mb-1">
                {isJa ? "AI マガジン" : "AI Magazine"}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {topic}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-slate-50 relative" ref={scrollRef}>
          {loading && !markdown ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] space-y-4">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
              <div className="flex items-center space-x-2 text-slate-600 font-medium">
                <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span>{isJa ? "執筆中..." : "Writing article..."}</span>
              </div>
            </div>
          ) : error && !markdown ? (
            <div className="bg-red-50 text-red-600 p-6 rounded-2xl flex flex-col items-center justify-center h-full min-h-[300px]">
              <p className="font-semibold mb-2">{isJa ? "エラーが発生しました" : "An error occurred"}</p>
              <p className="text-sm opacity-80">{error}</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 rounded-2xl shadow-sm border border-slate-100">
              <CustomMarkdown content={markdown} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
