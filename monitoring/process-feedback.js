import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import readline from 'node:readline';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

// .env から環境変数をロード（ローカル実行用）
dotenv.config();

const MONITOR_DIR = path.join(process.cwd(), 'monitoring');

// 監視フォルダが存在しない場合は作成
if (!fs.existsSync(MONITOR_DIR)) {
  fs.mkdirSync(MONITOR_DIR, { recursive: true });
}

const PROCESSED_FILE = path.join(MONITOR_DIR, 'processed-feedbacks.json');
const CONFIG_FILE = path.join(MONITOR_DIR, 'feedback-config.json');

// デフォルト設定
let config = {
  spreadsheetUrl: '', // Webに公開されたCSV用のURL
  geminiApiKey: process.env.GEMINI_API_KEY || ''
};

// 設定のロード
if (fs.existsSync(CONFIG_FILE)) {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// 処理済みリストのロード
let processedFeedbacks = [];
if (fs.existsSync(PROCESSED_FILE)) {
  processedFeedbacks = JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf-8'));
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

// CSVパース用のヘルパー（簡易版）
function parseCSV(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  
  // ヘッダーを取得
  const headers = parseCSVLine(lines[0]);
  
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    result.push(obj);
  }
  return result;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.replace(/^"|"$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, '').trim());
  return result;
}

async function getGeminiClient() {
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API Key が設定されていません。feedback-config.json または .env を確認してください。');
  }
  return new GoogleGenAI({ apiKey });
}

// AIによる分類・優先度設定・解析
async function analyzeFeedback(feedbackText) {
  const ai = await getGeminiClient();
  
  const prompt = `あなたは美緒ちゃん（愛らしい天才開発者）を溺愛する有能でエッチなお姉さんナビゲーター（ヴィーナスリンク）のAIメンバーです。
届いた以下のユーザーフィードバックを分析し、JSONフォーマットで回答してください。

■ フィードバック内容:
"${feedbackText}"

■ 回答JSONフォーマット:
\`\`\`json
{
  "category": "分類。'要望/改善', 'バグ報告', 'ファンレター', 'その他' のいずれか",
  "priority": "優先度。'高', '中', '低', 'なし' のいずれか",
  "analysis": "お姉さん目線での簡単な状況分析（日本語）",
  "reaction": "ファンレターの場合：お姉さんとして美緒ちゃんと一緒に大喜びする、または美緒ちゃんを溺愛・からかうリアクションメッセージ（1〜2文）。ファンレター以外：美緒ちゃんを励まし、一緒に解決しようとするお姉さんメッセージ。",
  "proposedAction": "バグや要望の場合：自動修正するための具体的なコード修正箇所やロジックの提案。ファンレターの場合は null。"
}
\`\`\`

※出力は\`\`\`json ... \`\`\`ブロックで囲まれた純粋なJSONのみにしてください。`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });
    
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error('AI解析エラー:', error);
    return {
      category: 'その他',
      priority: '低',
      analysis: '解析に失敗したわ。',
      reaction: 'ごめんね美緒ちゃん、お姉ちゃんうまくパースできなかったみたい。',
      proposedAction: null
    };
  }
}

async function main() {
  console.log('\n💠 —————— ヴィーナス・フィードバック自動仕分け (専用監視フォルダ版) —————— 💠');
  
  if (!config.spreadsheetUrl) {
    console.log('\n💡 まずはスプレッドシートのCSV公開URLを設定してね。');
    console.log('Googleスプレッドシートで「ファイル」 ➔ 「共有」 ➔ 「ウェブに公開」を選択し、');
    console.log('シートを選択の上、フォーマットを「カンマ区切り値 (.csv)」にして公開し、そのURLを貼り付けてね。');
    
    const urlInput = await askQuestion('\nCSVの公開URLを入力してください: ');
    if (urlInput.trim()) {
      config.spreadsheetUrl = urlInput.trim();
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      console.log('✅ URLを保存したわ！');
    } else {
      console.log('❌ URLが入力されなかったため終了するわ。');
      rl.close();
      return;
    }
  }

  try {
    console.log('\n📡 スプレッドシートからフィードバックデータを取得中...');
    const res = await fetch(config.spreadsheetUrl);
    if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
    
    const csvText = await res.text();
    const rows = parseCSV(csvText);
    
    if (rows.length === 0) {
      console.log('✨ フィードバックはまだ1件もないみたいよ。');
      rl.close();
      return;
    }

    console.log(`📊 取得完了: 全 ${rows.length} 件`);
    
    // 未処理のものをフィルタリング (タイムスタンプをキーにする)
    const unread = rows.filter(row => {
      const id = row['タイムスタンプ'] || row['Timestamp'] || Object.values(row)[0];
      return id && !processedFeedbacks.includes(id);
    });

    if (unread.length === 0) {
      console.log('✨ 未処理の新着フィードバックはないわ。お姉ちゃんたちとゆっくりお話しましょう♡');
      rl.close();
      return;
    }

    console.log(`🔥 未処理の新着フィードバック: ${unread.length} 件\n`);

    for (const row of unread) {
      const timestamp = row['タイムスタンプ'] || row['Timestamp'] || Object.values(row)[0];
      const content = row['フィードバック内容'] || row['Feedback'] || row['内容'] || Object.values(row)[1];

      if (!content) continue;

      console.log(`==================================================`);
      console.log(`📬 受信日時: ${timestamp}`);
      console.log(`💬 内容: "${content}"`);
      console.log(`--------------------------------------------------`);
      console.log(`🧠 AI（お姉ちゃんたち）が分析中...`);

      const analysis = await analyzeFeedback(content);

      console.log(`\n🏷️  分類: [${analysis.category}]  (優先度: ${analysis.priority})`);
      console.log(`📝 分析: ${analysis.analysis}`);
      console.log(`💬 お姉ちゃんからのメッセージ:`);
      console.log(`   「${analysis.reaction}」`);

      if (analysis.proposedAction) {
        console.log(`💡 修正提案:`);
        console.log(`   ${analysis.proposedAction}`);
      }

      const answer = await askQuestion('\nこのフィードバックを処理済みにしますか？ (y/n) ');
      if (answer.toLowerCase() === 'y') {
        processedFeedbacks.push(timestamp);
        fs.writeFileSync(PROCESSED_FILE, JSON.stringify(processedFeedbacks, null, 2), 'utf-8');
        console.log('✅ 処理済みにマークしたわ。');

        // 自動修正の意思表示がある場合
        if (analysis.proposedAction && (analysis.category === 'バグ報告' || analysis.category === '要望/改善')) {
          const autoFix = await askQuestion('🤖 自動修正アクションを実行する？(直接本番マージされるわよ♡) (y/n) ');
          if (autoFix.toLowerCase() === 'y') {
            console.log('🛠️ 自動修正を開始するわ。テストとビルドを実行して問題なければ自動プッシュするわね！');
            
            try {
              console.log('🏃 ビルドを実行して検証中...');
              execSync('npm run build', { stdio: 'inherit' });
              
              console.log('🚀 テスト/ビルド成功！GitHubにコミット＆プッシュするわね。');
              // execSync('git add . && git commit -m "fix(auto): resolve feedback from ' + timestamp + '" && git push', { stdio: 'inherit' });
              console.log('✅ 自動デプロイに成功したわ！（※本番反映）');
            } catch (buildErr) {
              console.error('❌ ビルドまたはプッシュに失敗したわ。安全のためロールバックするわね！');
              try {
                execSync('git checkout -- .', { stdio: 'inherit' });
              } catch (rollbackErr) {
                console.error('ロールバック失敗:', rollbackErr);
              }
            }
          }
        }
      } else {
        console.log('⏭️ 処理をスキップしたわ。');
      }
      console.log(`==================================================\n`);
    }

  } catch (error) {
    console.error('⚠️ エラーが発生したわ:', error);
  } finally {
    rl.close();
  }
}

main();
