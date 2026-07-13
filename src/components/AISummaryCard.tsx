import React from "react";
import { BookOpen } from "lucide-react";
import { AISearchSummary } from "../types";
import { getUITranslations } from "../lib/translations";
import CustomMarkdown from "./CustomMarkdown";

interface AISummaryCardProps {
  summary: AISearchSummary;
  query: string;
  lang?: string;
}

export default function AISummaryCard({ summary, query, lang = "en" }: AISummaryCardProps) {
  if (!summary || (!summary.overallSummary && !summary.trendSummary && !summary.overview)) {
    return null;
  }
  
  const t = getUITranslations(lang);
  const titleText = summary.title || (lang === "ja" 
    ? `【特別寄稿】「${query}」のOSS最新トレンドとエコシステム勢力図`
    : `[Special Analysis] The OSS Landscape and Trends for "${query}"`);

  return (
    <article
      className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm max-w-4xl mx-auto my-6 animate-fade-in"
      id="ai-summary-card"
    >
      <header className="border-b border-slate-100 pb-5 mb-5">
        <div className="flex items-center space-x-2 text-indigo-600 font-mono text-[10px] sm:text-xs uppercase tracking-wider mb-2">
          <BookOpen className="w-3.5 h-3.5 sm:w-4 h-4" />
          <span>Special Editorial Report</span>
          <span>•</span>
          <span>Gemini Analyst</span>
        </div>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-950 tracking-tight leading-snug">
          {titleText}
        </h2>
        <div className="flex items-center space-x-3 mt-4 text-[11px] sm:text-xs text-slate-400">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Analysis</span>
          </div>
          <span>•</span>
          <span>{new Date().toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US")}</span>
        </div>
      </header>

      <div className="space-y-6 text-slate-700 text-sm sm:text-base leading-relaxed" id="ai-summary-body">
        {(summary.overallSummary || summary.overview) && (
          <section className="space-y-2.5" id="overall-summary-block">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center">
              <span className="w-1 h-4 bg-indigo-500 rounded-full mr-2 shrink-0"></span>
              {t.ecosystemOverview}
            </h3>
            <div className="pl-3 border-l-2 border-slate-100">
              <CustomMarkdown content={summary.overallSummary || summary.overview || ""} />
            </div>
          </section>
        )}
        
        {summary.trendSummary && (
          <section className="pt-5 border-t border-slate-100 space-y-2.5" id="trend-summary-block">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center">
              <span className="w-1 h-4 bg-indigo-500 rounded-full mr-2 shrink-0"></span>
              {t.keyTrends}
            </h3>
            <div className="pl-3 border-l-2 border-slate-100">
              <CustomMarkdown content={summary.trendSummary} />
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
