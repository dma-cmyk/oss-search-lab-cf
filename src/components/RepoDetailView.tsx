import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Star,
  GitFork,
  CheckCircle,
  AlertTriangle,
  Code,
  Compass,
  Award,
  BookOpen,
  Sparkles,
  RefreshCw,
  ExternalLink,
  BookMarked,
  Layers,
  Terminal,
  Github,
  Gitlab,
  Share2,
  Copy,
  Check,
  Twitter,
  Link as LinkIcon,
  Save,
  Cpu,
  Settings,
} from "lucide-react";
import { Repository, RepoDetail, SavedReport } from "../types";
import { getUITranslations } from "../lib/translations";
import CustomMarkdown from "./CustomMarkdown";

import { AiEndpoint } from "../types";

interface RepoDetailViewProps {
  activeEndpoint: AiEndpoint;
  repository: Repository;
  onClose: () => void;
  lang: string;
  geminiApiKey: string;
  selectedModel: string;
  personaPrompt?: string;
  audiencePrompt?: string;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  bypassCache?: boolean;
  savedDetail?: RepoDetail | null;
  savedReports: SavedReport[];
  onSaveReport?: (detail: RepoDetail) => void;
  onOpenSettings: () => void;
}

export default function RepoDetailView({
  activeEndpoint,
  repository,
  onClose,
  lang,
  geminiApiKey,
  selectedModel,
  personaPrompt,
  audiencePrompt,
  isBookmarked,
  onToggleBookmark,
  bypassCache = false,
  savedDetail = null,
  savedReports,
  onSaveReport,
  onOpenSettings,
}: RepoDetailViewProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<RepoDetail | null>(savedDetail);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [mediaPopup, setMediaPopup] = useState<{ url: string, type: 'image' | 'video' } | null>(null);

  const isSaved = detail
    ? savedReports.some(
        (r) =>
          r.repository?.fullName?.toLowerCase() === repository?.fullName?.toLowerCase() &&
          r.articles?.some((art) => JSON.stringify(art.detail) === JSON.stringify(detail))
      )
    : false;

  const handleMediaClick = (url: string, type: 'image' | 'video' = 'image') => {
    setMediaPopup({ url, type });
  };

  const t = getUITranslations(lang);

  const getModelDisplayName = (modelId: string) => {
    const mapping: Record<string, string> = {
      "models/gemini-flash-lite-latest": "Gemini Flash-Lite Latest",
      "models/gemini-3.5-flash": "Gemini 3.5 Flash",
      "models/gemini-3.1-flash-lite": "Gemini 3.1 Flash-Lite",
      "models/gemini-3.1-pro-preview": "Gemini 3.1 Pro Preview",
      "models/gemini-3.1-flash-lite-image": "Gemini 3.1 Flash-Lite Image",
      "models/gemini-3.1-flash-image": "Gemini 3.1 Flash Image"
    };
    if (mapping[modelId]) return mapping[modelId];

    if (modelId?.startsWith("models/")) {
      const parts = modelId.replace("models/", "").split("-");
      return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    }
    return modelId || "Gemini";
  };

  const replaceGeminiWithModel = (text: string) => {
    if (!text) return text;
    const modelName = getModelDisplayName(selectedModel);
    return text.replace(/Gemini/g, modelName).replace(/gemini/g, modelName);
  };

  const fetchDetail = async (forceBypass: boolean = false) => {
    console.log("[DEBUG DETAIL VIEW] fetchDetail called. selectedModel prop is:", selectedModel);
    setDetail(null);
    setError(null);
    setLoading(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (geminiApiKey) headers["x-gemini-key"] = geminiApiKey;
      headers["x-ai-provider"] = activeEndpoint.type;
      headers["x-ai-endpoint"] = activeEndpoint.url;
      if (selectedModel) headers["x-gemini-model"] = selectedModel;
      if (bypassCache || forceBypass) headers["x-bypass-cache"] = "true";

      const response = await fetch("/api/detail", {
        method: "POST",
        headers,
        body: JSON.stringify({
          repoName: repository.fullName,
          description: repository.description,
          stars: repository.stargazersCount,
          language: repository.language,
          topics: repository.topics,
          lang: lang,
          personaPrompt: personaPrompt,
          audiencePrompt: audiencePrompt,
          source: repository.source || "github",
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate details. Status: ${response.status}`);
      }

      const data = await response.json();
      
      // Fully sanitize the detail data to ensure arrays and properties exist before rendering
      const sanitized = {
        title: typeof data.title === "string" ? data.title : "",
        overview: typeof data.overview === "string" ? data.overview : "",
        features: Array.isArray(data.features) ? data.features : [],
        useCases: Array.isArray(data.useCases) ? data.useCases : [],
        pros: Array.isArray(data.pros) ? data.pros : [],
        cons: Array.isArray(data.cons) ? data.cons : [],
        gettingStarted: typeof data.gettingStarted === "string" ? data.gettingStarted : "",
        alternatives: Array.isArray(data.alternatives) ? data.alternatives : [],
        aiEvaluation: typeof data.aiEvaluation === "string" ? data.aiEvaluation : "",
        readmeImages: Array.isArray(data.readmeImages) ? data.readmeImages : [],
      };
      
      setDetail(sanitized);
    } catch (err: any) {
      console.log("Fetch detail error:", err);
      setError(err.message || "An unexpected error occurred while analyzing the repository.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (savedDetail) {
      setDetail(savedDetail);
      setLoading(false);
      setError(null);
    } else {
      fetchDetail();
    }
    // Scroll to top when view is mounted
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [repository, lang, geminiApiKey, selectedModel, personaPrompt, audiencePrompt, savedDetail]);

  const [sharing, setSharing] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const handleShareToShowcase = async () => {
    if (!detail) return;
    setSharing(true);
    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: repository,
          data: detail,
          stars: repository.stargazersCount,
          summary: detail.overview?.slice(0, 120) + "..."
        })
      });
      if (!response.ok) throw new Error("Failed to generate share link");
      const resData = await response.json();
      
      const absoluteShareUrl = `${window.location.origin}${window.location.pathname}?share=${resData.id}`;
      await navigator.clipboard.writeText(absoluteShareUrl);
      
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 3000);
    } catch (err) {
      console.error("Share error:", err);
      alert(lang === "ja" ? "共有リンクの作成に失敗したわ。" : "Failed to create share link.");
    } finally {
      setSharing(false);
    }
  };

  const shareUrl = `${window.location.origin}${window.location.pathname}?source=${repository.source}&repo=${encodeURIComponent(repository.fullName)}&model=${encodeURIComponent(selectedModel)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch(err => {
      console.log("Failed to copy link: ", err);
    });
  };

  const handleTweet = () => {
    const text = lang === "ja" 
      ? `AIが解説する「${repository.fullName}」の詳細解析をチェック！`
      : `Check out the AI analysis for "${repository.fullName}"!`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex-1 flex flex-col bg-[#fcfbf9] min-h-screen text-slate-900 selection:bg-indigo-100 selection:text-indigo-900" id="repo-detail-view-container">
      {/* Editorial Navigation Sticky Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-2.5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4" id="detail-view-header">
        <div className="flex items-center justify-between sm:justify-start space-x-3 sm:space-x-4 min-w-0 w-full sm:w-auto" id="detail-header-left">
          <button
            type="button"
            onClick={onClose}
            className="group p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center shrink-0 cursor-pointer"
            id="detail-back-btn"
            title={t.backToSearchHome}
          >
            <ArrowLeft className="w-5 h-5 mr-1 sm:mr-1.5 transition-transform group-hover:-translate-x-0.5" />
            <span className="text-xs font-bold hidden sm:inline">{t.backToSearchHome || "戻る"}</span>
            <span className="text-xs font-bold sm:hidden">{lang === "ja" ? "戻る" : "Back"}</span>
          </button>
          
          <div className="h-4 w-px bg-slate-200"></div>

          <div className="flex items-center space-x-2 min-w-0">
            <span className="text-[9px] sm:text-[10px] font-mono tracking-wider sm:tracking-widest text-indigo-600 font-bold uppercase shrink-0 truncate">
              {lang === "ja" ? "技術検証特報" : "TECH ARCHIVE"}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div 
          className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 justify-start sm:justify-end shrink-0" 
          id="detail-header-right"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {detail && (
            <button
              type="button"
              onClick={handleShareToShowcase}
              disabled={sharing}
              className={`p-2 rounded-full border transition cursor-pointer flex items-center justify-center w-8.5 h-8.5 sm:w-9 sm:h-9 ${
                copiedShareLink
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-900"
              }`}
              title={lang === "ja" ? "みんなに公開 (ショーケースに追加＆リンクコピー)" : "Publish to Showcase & Copy Link"}
            >
              {sharing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : copiedShareLink ? (
                <Check className="w-4 h-4" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyLink}
            className={`p-2 rounded-full border transition cursor-pointer flex items-center justify-center w-8.5 h-8.5 sm:w-9 sm:h-9 ${
              copiedLink
                ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
            title={lang === "ja" ? "リンクをコピー" : "Copy Link"}
          >
            {copiedLink ? <Check className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
          </button>
          
          <button
            type="button"
            onClick={handleTweet}
            className="flex p-2 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-[#1DA1F2] hover:text-white hover:border-[#1DA1F2] transition cursor-pointer items-center justify-center w-8.5 h-8.5 sm:w-9 sm:h-9"
            title={lang === "ja" ? "Xでシェア" : "Share on X"}
          >
            <Twitter className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleBookmark}
            className={`p-2 sm:px-4 sm:py-2 rounded-full border text-xs font-bold flex items-center justify-center transition cursor-pointer w-8.5 h-8.5 sm:w-auto ${
              isBookmarked
                ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            id="detail-bookmark-btn"
            title={isBookmarked ? (lang === "ja" ? "お気に入りから削除" : "Remove from Bookmarks") : (lang === "ja" ? "お気に入りに追加" : "Add to Bookmarks")}
          >
            <BookMarked className={`w-4 h-4 shrink-0 ${isBookmarked ? "fill-amber-500 text-amber-600" : "text-slate-400"}`} />
            <span className="hidden sm:inline ml-1.5">{isBookmarked ? (lang === "ja" ? "お気に入り中" : "Bookmarked") : (lang === "ja" ? "お気に入りに追加" : "Add to Bookmarks")}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchDetail(true)}
            disabled={loading}
            className="flex p-2 sm:px-4 sm:py-2 rounded-full border text-xs font-bold items-center justify-center transition cursor-pointer w-8.5 h-8.5 sm:w-auto bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            title={lang === "ja" ? "AIで詳細解析を再生成" : "Regenerate detailed analysis with AI"}
          >
            <RefreshCw className={`w-4 h-4 shrink-0 text-slate-400 ${loading ? "animate-spin text-indigo-500" : ""}`} />
            <span className="hidden sm:inline ml-1.5">{lang === "ja" ? "再解析" : "Regenerate"}</span>
          </button>

          {detail && onSaveReport && (
            <button
              type="button"
              onClick={() => !isSaved && onSaveReport(detail)}
              disabled={isSaved}
              className={`p-2 sm:px-4 sm:py-2 rounded-full border text-xs font-bold flex items-center justify-center transition cursor-pointer w-8.5 h-8.5 sm:w-auto ${
                isSaved
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default"
                  : "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 hover:border-indigo-700 shadow-sm"
              }`}
              id="detail-save-report-btn"
              title={isSaved ? (lang === "ja" ? "レポート保存済み" : "Report Saved") : (lang === "ja" ? "レポートをローカル保存" : "Save Report Locally")}
            >
              <Save className={`w-4 h-4 shrink-0 ${isSaved ? "text-emerald-600" : "text-white"}`} />
              <span className="hidden sm:inline ml-1.5">
                {isSaved ? (lang === "ja" ? "レポート保存済み" : "Report Saved") : (lang === "ja" ? "レポートを保存" : "Save Report")}
              </span>
            </button>
          )}

          <a
            href={repository.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 sm:px-4 sm:py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full text-xs font-bold flex items-center justify-center transition cursor-pointer w-8.5 h-8.5 sm:w-auto"
            id="detail-github-btn"
            title={repository.source === "gitlab" ? "GitLab" : "GitHub"}
          >
            {repository.source === "gitlab" ? (
              <Gitlab className="w-4 h-4 shrink-0" />
            ) : (
              <Github className="w-4 h-4 shrink-0" />
            )}
            <span className="hidden sm:inline ml-1.5">{repository.source === "gitlab" ? "GitLab" : "GitHub"}</span>
          </a>

          {/* Settings button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer flex items-center justify-center w-8.5 h-8.5 sm:w-9 sm:h-9"
            title={lang === "ja" ? "設定を開く" : "Settings"}
            id="detail-settings-btn"
          >
            <Settings className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </header>

      {/* Main Journal Layout */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-8 md:py-12" id="detail-view-main">
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 space-y-4" id="detail-loading-state">
            <div className="p-4 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full animate-spin">
              <RefreshCw className="w-8 h-8" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-800">{replaceGeminiWithModel(t.analyzingRepo)}</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                {replaceGeminiWithModel(t.analyzingDesc)}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-8 bg-red-50 border border-red-200 rounded-3xl text-center max-w-md mx-auto my-12" id="detail-error-state">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-red-800">{t.errorPerforming}</h3>
            <p className="text-xs text-red-600 mt-1">{error}</p>
            <button
              type="button"
              onClick={fetchDetail}
              className="mt-5 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              id="detail-retry-btn"
            >
              {t.retrySearch}
            </button>
          </div>
        )}

        {!loading && !error && detail && (
          <div className="space-y-8 sm:space-y-12" id="detail-editorial-layout">
            
            {/* ARTICLE HERO SECTION */}
            <header className="max-w-4xl mx-auto text-center space-y-6" id="editorial-article-hero">
              {/* Category Breadcrumb */}
              <div className="inline-flex items-center space-x-2 bg-indigo-50 border border-indigo-100/50 text-indigo-700 px-3.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{lang === "ja" ? "特別技術検証レポート" : "SPECIAL TECH REVIEW REPORT"}</span>
              </div>

              {/* Title (Journal Headline Style) */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.15] max-w-3xl mx-auto" id="editorial-headline">
                {detail?.title || (lang === "ja" 
                  ? `世界を熱狂させる「${repository.fullName}」の正体に迫る。その圧倒的ポテンシャルと現実的な技術制約`
                  : `Inside ${repository.fullName}: Architectural Auditing, Operational Trade-offs, and Developer Verdict`)}
              </h1>

              {/* Journal Byline / Metadata Section */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 pt-2 pb-6 border-b border-slate-200/80 max-w-2xl mx-auto text-xs text-slate-500">
                <div className="flex items-center space-x-2">
                  {repository.owner.avatarUrl ? (
                    <img
                      src={repository.owner.avatarUrl}
                      alt={repository.owner.login}
                      className="w-6 h-6 rounded-full border border-slate-200 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-slate-200 shrink-0" />
                  )}
                  <span className="font-bold text-slate-800">
                    {lang === "ja" ? `リポジトリ著者: ${repository.owner.login}` : `Author: ${repository.owner.login}`}
                  </span>
                </div>
                
                <span className="hidden sm:inline text-slate-300">•</span>

                <div>
                  <span className="font-semibold text-slate-700">
                    {lang === "ja" ? "公開日: " : "Published: "}
                  </span>
                  <span>2026.07.04</span>
                </div>

                <span className="hidden sm:inline text-slate-300">•</span>

                <div className="flex items-center text-slate-500">
                  <BookOpen className="w-3.5 h-3.5 mr-1" />
                  <span>{lang === "ja" ? "読了目安 4分" : "4 min read"}</span>
                </div>
              </div>
            </header>

            {/* HERO PREVIEW BANNER */}
            {repository.source !== "gitlab" && (
              <div className="max-w-5xl mx-auto overflow-hidden rounded-3xl border border-slate-200/80 shadow-md bg-slate-100" id="article-og-image-wrapper">
                <img
                  src={`https://opengraph.githubassets.com/1/${repository.fullName}`}
                  alt={`${repository.fullName} Social Banner`}
                  className="w-full h-auto object-cover aspect-[2.1/1]"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            
            {/* TWO-COLUMN EDITORIAL READING LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-start max-w-5xl mx-auto" id="editorial-two-column">
              
              {/* LEFT COLUMN: Clean Reading Flow (Takes 8 cols) */}
              <article className="lg:col-span-8 space-y-10" id="editorial-reading-column">
                
                {/* 1. What is it / Introduction */}
                <section className="space-y-4" id="editorial-sec-overview">
                  <div className="flex items-center space-x-2 text-indigo-600">
                    <span className="text-xs font-bold tracking-widest font-mono uppercase">01 / INTRODUCTION</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {t.whatIsIt}
                  </h3>
                  <div className="text-slate-700 text-sm sm:text-base leading-relaxed font-medium text-justify">
                    <CustomMarkdown content={detail.overview} onMediaClick={handleMediaClick} />
                  </div>
                </section>

                {/* Highly Styled AI Opinion / Blockquote (Verdit Accent) */}
                <section className="relative py-2" id="editorial-sec-blockquote">
                  <div className="absolute top-0 left-0 text-7xl font-serif text-indigo-200 pointer-events-none leading-none -translate-x-3 -translate-y-4">
                    “
                  </div>
                  <div className="bg-white border-l-4 border-slate-900 p-6 sm:p-8 rounded-r-3xl shadow-sm space-y-2">
                    <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase font-mono block">
                      {lang === "ja" ? "AI主任技術評論家の本音" : "AI CRITIC VERDICT"}
                    </span>
                    <p className="text-base sm:text-lg font-bold text-slate-800 leading-relaxed italic relative z-10">
                      &ldquo;{detail.aiEvaluation}&rdquo;
                    </p>
                  </div>
                </section>

                {/* 2. Key Features - Beautiful curated highlights list */}
                <section className="space-y-4" id="editorial-sec-features">
                  <div className="flex items-center space-x-2 text-indigo-600">
                    <span className="text-xs font-bold tracking-widest font-mono uppercase">02 / ARCHITECTURE & FEATURES</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {t.techHighlights}
                  </h3>
                  <div className="space-y-3">
                    {detail.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start bg-white border border-slate-200/60 hover:border-slate-300 rounded-2xl p-4 sm:p-5 shadow-sm transition">
                        <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mr-4">
                          {idx + 1}
                        </div>
                        <div className="text-sm text-slate-700 font-medium leading-relaxed overflow-hidden">
                          <CustomMarkdown content={feature} onMediaClick={handleMediaClick} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 3. Pros and Cons - Journalistic Checklist Comparison */}
                <section className="space-y-5" id="editorial-sec-proscons">
                  <div className="flex items-center space-x-2 text-indigo-600">
                    <span className="text-xs font-bold tracking-widest font-mono uppercase">03 / STRENGTHS & CONSTRAINTS</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {lang === "ja" ? "実用におけるメリットと懸念すべき課題" : "Strengths & Operational Constraints"}
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Pros */}
                    <div className="bg-emerald-50/10 border border-emerald-200/75 rounded-2xl p-6 shadow-sm space-y-4">
                      <h4 className="text-sm font-extrabold text-emerald-800 flex items-center tracking-wider uppercase font-mono">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                        {t.pros || "PROS"}
                      </h4>
                      <ul className="space-y-3 pl-1 text-xs sm:text-sm text-slate-600">
                        {detail.pros.map((pro, idx) => (
                          <li key={idx} className="flex items-start">
                            <CheckCircle className="w-4 h-4 text-emerald-500 mr-2.5 shrink-0 mt-0.5" />
                            <div className="leading-relaxed font-medium text-slate-700 overflow-hidden w-full"><CustomMarkdown content={pro} onMediaClick={handleMediaClick} /></div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Cons */}
                    <div className="bg-rose-50/10 border border-rose-200/75 rounded-2xl p-6 shadow-sm space-y-4">
                      <h4 className="text-sm font-extrabold text-rose-800 flex items-center tracking-wider uppercase font-mono">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mr-2"></span>
                        {t.cons || "CONS"}
                      </h4>
                      <ul className="space-y-3 pl-1 text-xs sm:text-sm text-slate-600">
                        {detail.cons.map((con, idx) => (
                          <li key={idx} className="flex items-start">
                            <AlertTriangle className="w-4 h-4 text-rose-500 mr-2.5 shrink-0 mt-0.5" />
                            <div className="leading-relaxed font-medium text-slate-700 overflow-hidden w-full"><CustomMarkdown content={con} onMediaClick={handleMediaClick} /></div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>

                {/* 4. Practical Use Cases */}
                <section className="space-y-4" id="editorial-sec-scenarios">
                  <div className="flex items-center space-x-2 text-indigo-600">
                    <span className="text-xs font-bold tracking-widest font-mono uppercase">05 / IDEAL USE SCENARIOS</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {t.idealScenarios}
                  </h3>
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                    {detail.useCases.map((useCase, idx) => (
                      <div key={idx} className="flex items-start">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 mr-3.5 shrink-0"></div>
                        <div className="text-sm sm:text-[15px] text-slate-700 leading-relaxed font-medium">
                          <CustomMarkdown content={useCase} onMediaClick={handleMediaClick} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 5. Getting Started - Tech Magazine styled code-runner frame */}
                <section className="space-y-4" id="editorial-sec-getstarted">
                  <div className="flex items-center space-x-2 text-indigo-600">
                    <span className="text-xs font-bold tracking-widest font-mono uppercase">05 / INSTALLATION & USAGE</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {t.gettingStarted}
                  </h3>
                  <div className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 overflow-hidden">
                    {/* Mock Terminal Header */}
                    <div className="bg-slate-950 px-4 py-3 flex items-center justify-between border-b border-slate-800">
                      <div className="flex space-x-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-500 flex items-center">
                        <Terminal className="w-3.5 h-3.5 mr-1 text-slate-600" />
                        bash
                      </span>
                    </div>
                    {/* Content */}
                    <div className="p-5 overflow-x-auto text-slate-300 font-mono text-xs leading-relaxed">
                      <CustomMarkdown content={detail.gettingStarted} theme="dark" onMediaClick={handleMediaClick} />
                    </div>
                  </div>
                </section>

              </article>

              {/* RIGHT COLUMN: Sticky Technical Scorecard / Editor reference (Takes 4 cols) */}
              <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24" id="editorial-sidebar">
                
                {/* Tech Journal Scorecard Card */}
                <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 space-y-5" id="sidebar-scorecard">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="min-w-0">
                      <span className="text-[9px] font-mono font-bold text-indigo-600 tracking-wider uppercase block">
                        {lang === "ja" ? "監査分析シート" : "AUDIT REPORT"}
                      </span>
                      <h4 className="font-extrabold text-slate-800 text-sm truncate mt-0.5">
                        {repository.name}
                      </h4>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    </div>
                  </div>

                  {/* Core Stats Sheet */}
                  <div className="space-y-4" id="sidebar-scores">
                    {/* Stargazers */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold text-slate-500">
                        <span>{t.stars || "Stargazers"}</span>
                        <span className="font-mono text-slate-800">{(repository.stargazersCount || 0).toLocaleString()}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-amber-400 rounded-full" 
                          style={{ width: `${Math.min(100, (repository.stargazersCount / 100000) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Forks */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold text-slate-500">
                        <span>{t.forks || "Forks"}</span>
                        <span className="font-mono text-slate-800">{(repository.forksCount || 0).toLocaleString()}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 rounded-full" 
                          style={{ width: `${Math.min(100, (repository.forksCount / 20000) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Primary Language Info */}
                    <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100">
                      <span className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">
                        {lang === "ja" ? "主要開発言語" : "Primary Language"}
                      </span>
                      <span className="font-semibold bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] border border-indigo-100/50">
                        {repository.language || "N/A"}
                      </span>
                    </div>

                    {/* Owner detail info */}
                    <div className="flex justify-between items-center text-xs pt-1">
                      <span className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">
                        {lang === "ja" ? "開発元" : "Owner"}
                      </span>
                      <span className="font-bold text-slate-700">
                        @{repository.owner.login}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Curated Ecological Alternatives */}
                {detail.alternatives && detail.alternatives.length > 0 && (
                  <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 space-y-4" id="sidebar-curated-alternatives">
                    <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                      <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                        {t.ecoAlternatives || "Alternatives"}
                      </h4>
                    </div>

                    <div className="space-y-3.5" id="sidebar-alternatives-list">
                      {detail.alternatives.map((alt, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl border border-slate-100 hover:border-slate-200 bg-slate-50/50 transition-colors"
                        >
                          <h5 className="text-xs font-bold text-slate-900 tracking-tight">
                            {alt.name}
                          </h5>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed font-medium">
                            {alt.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interactive Sidebar Quote Box */}
                <div className="bg-slate-900 text-slate-300 rounded-3xl p-6 shadow-md text-xs space-y-3" id="sidebar-callout-info">
                  <span className="text-[9px] font-mono tracking-widest text-indigo-400 font-black uppercase">
                    {lang === "ja" ? "最新の検証エンジン搭載" : "POWERED BY GEMINI"}
                  </span>
                  <p className="leading-relaxed font-medium">
                    {lang === "ja" 
                      ? "本技術レポートは、ユーザー指定のカスタムAIペルソナおよび分析ターゲット視点に基づいて完全にリアルタイム生成されています。"
                      : "This analytic report is compiled dynamically based on your custom AI personas, models, and selected target reader profiles."}
                  </p>
                  
                  {/* Collapsible Metadata */}
                  <details className="mt-3 pt-3 border-t border-slate-800 text-[10px] text-slate-400 cursor-pointer group" id="metadata-accordion">
                    <summary className="font-semibold select-none list-none flex items-center gap-1 hover:text-indigo-300 transition outline-none">
                      <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{lang === "ja" ? "生成メタデータを確認" : "View Generation Metadata"}</span>
                    </summary>
                    <div className="mt-2.5 space-y-2 font-mono leading-relaxed text-[9px] text-slate-400 bg-slate-950/40 rounded-xl p-3 border border-slate-800/80" id="metadata-accordion-content">
                      <div>
                        <span className="text-slate-500">{lang === "ja" ? "モデル: " : "Model: "}</span>
                        <span className="text-slate-300">{selectedModel}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">{lang === "ja" ? "プロバイダー: " : "Provider: "}</span>
                        <span className="text-slate-300">{activeEndpoint.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">{lang === "ja" ? "エンドポイント: " : "Endpoint: "}</span>
                        <span className="text-slate-300 truncate block" title={activeEndpoint.url}>{activeEndpoint.url}</span>
                      </div>
                      {personaPrompt && (
                        <div className="space-y-1">
                          <span className="text-slate-500 block">{lang === "ja" ? "ペルソナ: " : "Persona: "}</span>
                          <span className="text-slate-400 block pl-2 border-l border-slate-800 max-h-24 overflow-y-auto whitespace-pre-wrap leading-normal">{personaPrompt}</span>
                        </div>
                      )}
                      {audiencePrompt && (
                        <div className="space-y-1">
                          <span className="text-slate-500 block">{lang === "ja" ? "ターゲット層: " : "Audience: "}</span>
                          <span className="text-slate-400 block pl-2 border-l border-slate-800 max-h-24 overflow-y-auto whitespace-pre-wrap leading-normal">{audiencePrompt}</span>
                        </div>
                      )}
                    </div>
                  </details>
                </div>

              </aside>

            </div>

            {/* Bottom Call to Action Section (Reviewer Box) */}
            <footer className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6" id="editorial-footer-author">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {lang === "ja" ? "本記事についてのご意見・ソースコードの閲覧" : "Interested in this repository?"}
                  </h4>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {lang === "ja" 
                  ? `この技術スタックが解決する課題をより深く理解するため、${repository.source === "gitlab" ? "GitLab" : "GitHub"}リポジトリでコードを直接確認しましょう。`
                  : `Explore the codebase, issues, and active development milestones directly on ${repository.source === "gitlab" ? "GitLab" : "GitHub"}.`}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center w-full sm:w-auto">
            {repository.source !== "gitlab" && (
              <>
                <a
                  href={`https://deepwiki.com/gh/${repository.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-full border border-indigo-100 transition flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
                  title="Analyze repository on DeepWiki"
                >
                  <span>🧠 DeepWiki</span>
                </a>
                <a
                  href={`https://codewiki.google/github.com/${repository.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-full border border-emerald-100 transition flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
                  title="Generate documentation on Google Code Wiki"
                >
                  <span>🤖 CodeWiki</span>
                </a>
              </>
            )}
            
            <a
              href={repository.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs rounded-full shadow-sm transition flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
            >
              {repository.source === "gitlab" ? <Gitlab className="w-4 h-4" /> : <Github className="w-4 h-4" />}
              <span>{repository.source === "gitlab" ? (lang === "ja" ? "GitLabでコードを見る" : "View Code on GitLab") : t.viewCodeOnGithub}</span>
            </a>
          </div>
        </footer>

          </div>
        )}
      </main>

      {/* Media Popup Overlay */}
      {mediaPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm" onClick={() => setMediaPopup(null)}>
          <div className="relative max-w-5xl max-h-[90vh] w-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <button 
              className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white transition bg-slate-800 hover:bg-slate-700 rounded-full cursor-pointer"
              onClick={() => setMediaPopup(null)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            {mediaPopup.type === 'video' ? (
              <video src={mediaPopup.url} controls autoPlay className="max-w-full max-h-[90vh] rounded-lg shadow-2xl bg-black" />
            ) : (
              <img src={mediaPopup.url} alt="Popup visual" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl bg-white/5" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
