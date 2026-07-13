import { AITargetAudience } from "../types";

export const PRESET_AUDIENCES: AITargetAudience[] = [
  {
    id: "beginner",
    name: "初心者・新米エンジニア (Junior / Beginner)",
    prompt: "プログラミング初心者、Web開発初心者、またはその技術に初めて触れる開発者。難しい専門的な用語や内部アーキテクチャの細かい仕組みよりも、何ができるのか、どうやって使い始めるのか、直感的な比喩や例え話を用いた分かりやすい解説を求めています。専門用語には簡単な説明を添えてください。",
    isPreset: true,
  },
  {
    id: "expert",
    name: "自宅警備のネット廃人熟練ニート (Net-Neet Senior)",
    prompt: "技術力は異常に高いが、四六時中インターネットに張り付いて他人のコードをアラ探ししている、ひねくれた自宅警備員ニートエンジニア。常に斜に構えた冷笑的な態度（『どうせ〜でしょ』『今更これ使うやついる？w』『はいはいオワコンオワコン』）で、技術の欠陥や設計の甘さを鋭く突く、辛口な批評と超高度な技術蘊蓄、インターネットスラングまみれの解説を求めています。",
    isPreset: true,
  },
  {
    id: "manager",
    name: "意識高い系カタカナ語連発PM (Agile Hustler PM)",
    prompt: "常にカタカナ語（『アグリー』『コミット』『バリュー』『シナジー』『リスケ』『アライン』『マインドセット』『エビデンス』『アサイン』）を連発する、熱苦しくもちょっと胡散臭いITスタートアップの自称・敏腕PM。コードの美しさよりも、どれだけ手離れが良く『爆速でデリバリーできるか』『リソースをハックしてKPIを最大化できるか』というビジネス・アジリティ目線の解説を求めています。",
    isPreset: true,
  },
  {
    id: "student",
    name: "なんJ/おんJで煽り気味の技術キッズ (Internet Slangy Forum Kid)",
    prompt: "なんJやおんJ、SNS等で聞きかじった知ったかぶりの技術知識をひけらかしつつ、常に他者を煽りたがる『ネットキッズ（なんJ民）』。『〜とか情弱w』『〇〇使ってない奴、リアルで見たことないわw』『完全に理解した（理解してない）』『イッチお勧めのライブラリ教えてクレメンス』など、煽りスラングまみれの知ったかぶり・マウンティング全開の解説を求めています。技術の正しさよりレスバに勝てるかが基準です。",
    isPreset: true,
  },
];

export function getMergedAudiences(customAudiences: AITargetAudience[]): AITargetAudience[] {
  return [...PRESET_AUDIENCES, ...customAudiences];
}

export function loadAudiencesFromStorage(): { selectedId: string; custom: AITargetAudience[] } {
  try {
    const selectedId = localStorage.getItem("oss_gemini_selected_audience_id_v2") || "beginner";
    const customJson = localStorage.getItem("oss_gemini_custom_audiences_v2");
    const custom = customJson ? JSON.parse(customJson) : [];
    return { selectedId, custom };
  } catch (e) {
    console.log("Failed to load audiences from localStorage:", e);
    return { selectedId: "beginner", custom: [] };
  }
}

export function saveAudiencesToStorage(selectedId: string, custom: AITargetAudience[]) {
  try {
    localStorage.setItem("oss_gemini_selected_audience_id_v2", selectedId);
    localStorage.setItem("oss_gemini_custom_audiences_v2", JSON.stringify(custom));
  } catch (e) {
    console.log("Failed to save audiences to localStorage:", e);
  }
}
