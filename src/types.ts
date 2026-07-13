export interface Repository {
  id: number;
  name: string;
  fullName: string;
  source?: string;
  owner: {
    login: string;
    avatarUrl: string;
    htmlUrl: string;
  };
  htmlUrl: string;
  description: string | null;
  stargazersCount: number;
  forksCount: number;
  watchersCount: number;
  openIssuesCount: number;
  language: string | null;
  topics: string[];
  updatedAt: string;
  createdAt: string;
  aiTitle?: string;
  aiSummary: string;
  aiTags: string[];
}

export interface AISearchSummary {
  title?: string;
  overview?: string;
  overallSummary?: string;
  trendSummary?: string;
}

export interface SearchResponse {
  query: string;
  repositories: Repository[];
  aiSummary: AISearchSummary;
}

export interface RepoDetailAlternative {
  name: string;
  description: string;
}

export interface RepoDetail {
  title?: string;
  overview: string;
  features: string[];
  useCases: string[];
  pros: string[];
  cons: string[];
  gettingStarted: string;
  alternatives: RepoDetailAlternative[];
  aiEvaluation: string;
  readmeImages?: string[];
}

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
}

export interface SavedReportArticle {
  id: string;
  detail: RepoDetail;
  savedAt: number;
  modelUsed?: string;
  personaName?: string;
  audienceName?: string;
}

export interface SavedReport {
  id: string;
  repository: Repository;
  articles: SavedReportArticle[];
}

export interface LanguageOption {
  code: string;
  name: string;
  label: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "auto", name: "Auto (Browser)", label: "🌐 自動 (ブラウザ設定)" },
  { code: "ja", name: "Japanese", label: "🇯🇵 日本語" },
  { code: "en", name: "English", label: "🇺🇸 English" },
  { code: "zh", name: "Simplified Chinese", label: "🇨🇳 简体中文" },
  { code: "es", name: "Spanish", label: "🇪🇸 Español" },
  { code: "de", name: "German", label: "🇩🇪 Deutsch" },
  { code: "fr", name: "French", label: "🇫🇷 Français" },
];

export interface AIPersona {
  id: string;
  name: string;
  prompt: string;
  isPreset?: boolean;
}

export interface AITargetAudience {
  id: string;
  name: string;
  prompt: string;
  isPreset?: boolean;
}


export interface AiEndpoint {
  id: string;
  name: string;
  url: string;
  type: 'gemini' | 'openai';
  isPreset?: boolean;
}

export const PRESET_ENDPOINTS: AiEndpoint[] = [
  { id: 'gemini-default', name: 'Google Gemini', url: '', type: 'gemini', isPreset: true },
  { id: 'openai-default', name: 'OpenAI', url: 'https://api.openai.com/v1', type: 'openai', isPreset: true },
  { id: 'anthropic-default', name: 'Anthropic', url: 'https://api.anthropic.com/v1', type: 'openai', isPreset: true },
];
