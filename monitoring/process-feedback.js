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
async function analyzeFeedback(feedbackText, feedbackType) {
  const ai = await getGeminiClient();
  
  const prompt = `あなたは美緒ちゃん（愛らしい天才開発者）を溺愛する有能でエッチなお姉さんナビゲーター（ヴィーナスリンク）のAIメンバーです。
届いた以下のユーザーフィードバックを分析し、JSONフォーマットで回答してください。

■ ユーザーが選択した種類:
"${feedbackType}"

■ フィードバック内容:
"${feedbackText}"

■ 回答JSONフォーマット:
\`\`\`json
{
  "category": "分類。'要望/改善', 'バグ報告', 'ファンレター', 'その他' のいずれか",
  "priority": "優先度。'高', '中', '低', 'なし' のいずれか",
  "analysis": "お姉さん目線での簡単な状況分析（日本語）",
  "reaction": "ファンレターの場合：お姉さんとして美緒ちゃんと一緒に大喜びする、または美緒ちゃんを溺愛・からかうリアクションメッセージ（1〜2文）。ファンレター以外：美緒ちゃんを励まし、一緒に解決しようとするお姉さんメッセージ。",
  "proposedAction": "バグや要望の場合：自動修正するための具体的なコード修正箇所やロジック of 提案。ファンレターの場合は null。"
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
  
  let csvText = '';
  let usingDemo = false;

  if (!config.spreadsheetUrl) {
    console.log('\n💡 スプレッドシートのCSV公開URLがまだ設定されていないわ。');
    console.log('   1: スプレッドシートの公開URLを入力する');
    console.log('   2: ローカルのテスト用CSVファイル (test-feedbacks.csv) を読み込んでデモを実行する');
    
    const choice = await askQuestion('\nどちらか選んでね (1 または 2): ');
    
    if (choice === '2') {
      usingDemo = true;
      const demoFile = path.join(MONITOR_DIR, 'test-feedbacks.csv');
      if (fs.existsSync(demoFile)) {
        csvText = fs.readFileSync(demoFile, 'utf-8');
        console.log('📝 ローカルのテスト用CSVを読み込んだわ！');
      } else {
        console.log('❌ テスト用CSVファイルが見つかりません。');
        rl.close();
        return;
      }
    } else {
      console.log('\nGoogleスプレッドシートで「ファイル」 ➔ 「共有」 ➔ 「ウェブに公開」を選択し、');
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
  }

  try {
    let rows = [];
    if (usingDemo) {
      rows = parseCSV(csvText);
    } else {
      console.log('\n📡 スプレッドシートからフィードバックデータを取得中...');
      const res = await fetch(config.spreadsheetUrl);
      if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
      csvText = await res.text();
      rows = parseCSV(csvText);
    }
    
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
      const timestamp = row['タイムスタンプ'] || Object.values(row)[0];
      const feedbackType = row['フィードバックの種類を選択してください'] || Object.values(row)[1] || 'その他';
      const content = row['具体的な内容をご記入ください'] || Object.values(row)[2];

      if (!content) continue;

      console.log(`==================================================`);
      console.log(`📬 受信日時: ${timestamp}`);
      console.log(`🏷️  ユーザー選択タイプ: ${feedbackType}`);
      console.log(`💬 内容: "${content}"`);
      console.log(`--------------------------------------------------`);
      console.log(`🧠 AI（お姉ちゃんたち）が分析中...`);

      const analysis = await analyzeFeedback(content, feedbackType);

      console.log(`\n🏷️  分類: [${analysis.category}]  (優先度: ${analysis.priority})`);
      console.log(`📝 分析: ${analysis.analysis}`);
      console.log(`💬 お姉ちゃんからのメッセージ:`);
      console.log(`   「${analysis.reaction}」`);

      if (analysis.proposedAction) {
        console.log(`💡 修正提案:`);
        console.log(`   ${analysis.proposedAction}`);
      }

      // 【完全自動仕分け】対話なしで自動的に処理済みにマークするわ！
      processedFeedbacks.push(timestamp);
      fs.writeFileSync(PROCESSED_FILE, JSON.stringify(processedFeedbacks, null, 2), 'utf-8');
      console.log('✅ 自動で処理済みにマークしたわ。');

      // 自動修正の意思表示がある場合
      if (analysis.proposedAction && (analysis.category === 'バグ報告' || analysis.category === '要望/改善')) {
        console.log('\n🤖 自動修正のシミュレーションを開始するわね！');
        const selectedAgent = 'vela'; // 自動実行時のデフォルトお姉ちゃんはヴェラにするわ
        
        try {
          const agyPrompt = `以下のユーザーフィードバックおよび修正提案に基づいて、ローカルコードを修正してください。

■ フィードバック内容:
"${content.replace(/"/g, '\\"')}"

■ 修正提案の概要:
"${analysis.proposedAction.replace(/"/g, '\\"')}"

修正が終わったら、変更を保存して終了してください。`;

          // 【Dry-run 安全モード】実際には書き換えをせず、呼び出しコマンドと指示を表示するだけにするわ！
          console.log('\n🔒 [Dry-run モード] 実際には以下のコマンドが実行され、ファイルを自動修正する予定だったわよ：');
          console.log(`👉 agy --agent ${selectedAgent} --prompt "${agyPrompt.substring(0, 150)}..." --dangerously-skip-permissions`);
          console.log('\n💡 (美緒ちゃんが「もう本番で動かしていいよ！」ってなったら、ここのコメントアウトを外して実際に自動修正させるわね♡)');
          
          // execSync(`agy --agent ${selectedAgent} --prompt "${agyPrompt.replace(/"/g, '\\"')}" --dangerously-skip-permissions`, { stdio: 'inherit' });
          
          console.log('\n🏃 ビルドを実行して検証中...');
          execSync('npm run build', { stdio: 'inherit' });
          
          console.log('\n🚀 ビルド検証完了！（※Dry-runのためGitHubへのプッシュはスキップしたわ）');
          // execSync(`git add . && git commit -m "fix(auto): resolve feedback from ${timestamp} by ${selectedAgent}" && git push`, { stdio: 'inherit' });
          console.log('✅ デモ検証完了よ♡');
        } catch (buildErr) {
          console.error('\n❌ 修正プロセスの実行、ビルド、またはプッシュに失敗したわ。');
          console.log('安全のため、ローカルの変更をロールバックして元に戻すわね。');
          try {
            execSync('git checkout -- .', { stdio: 'inherit' });
          } catch (rollbackErr) {
            console.error('ロールバック失敗:', rollbackErr);
          }
        }
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
