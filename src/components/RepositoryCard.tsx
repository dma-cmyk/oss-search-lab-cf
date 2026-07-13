import React from "react";
import { Star, GitFork, Award, ExternalLink, Cpu, BookOpen, Bookmark, Github, Gitlab } from "lucide-react";
import { Repository } from "../types";
import { getUITranslations } from "../lib/translations";

interface RepositoryCardProps {
  key?: React.Key;
  repository: Repository;
  rank: number;
  onDeepDive: (repo: Repository) => void;
  isBookmarked: boolean;
  onToggleBookmark: (repo: Repository) => void;
  lang?: string;
  onTagClick?: (tag: string) => void;
}

export default function RepositoryCard({
  repository,
  rank,
  onDeepDive,
  isBookmarked,
  onToggleBookmark,
  lang = "en",
  onTagClick,
}: RepositoryCardProps) {
  const t = getUITranslations(lang);

  // Determine ranking color for visual excellence
  const getRankBadge = () => {
    if (rank === 1) {
      return {
        bg: "bg-amber-100 border-amber-200 text-amber-700",
        label: t.goldRank,
        icon: <Award className="w-4 h-4 text-amber-600 animate-bounce" />,
      };
    }
    if (rank === 2) {
      return {
        bg: "bg-slate-100 border-slate-200 text-slate-700",
        label: t.silverRank,
        icon: <Award className="w-4 h-4 text-slate-500" />,
      };
    }
    if (rank === 3) {
      return {
        bg: "bg-orange-100 border-orange-200 text-orange-700",
        label: t.bronzeRank,
        icon: <Award className="w-4 h-4 text-orange-600" />,
      };
    }
    return {
      bg: "bg-indigo-50 border-indigo-100 text-indigo-700",
      label: `#${rank}`,
      icon: null,
    };
  };

  const badge = getRankBadge();

  // Primary language color fallback
  const getLanguageColor = (langVal: string | null) => {
    if (!langVal) return "bg-slate-300";
    const colors: Record<string, string> = {
      javascript: "bg-yellow-400",
      typescript: "bg-blue-500",
      python: "bg-sky-500",
      go: "bg-cyan-400",
      rust: "bg-orange-500",
      java: "bg-amber-600",
      cpp: "bg-rose-500",
      ruby: "bg-red-500",
    };
    return colors[langVal.toLowerCase()] || "bg-indigo-400";
  };

  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 hover:shadow-lg transition-all group relative flex flex-col justify-between"
      id={`repo-card-${repository.id}`}
    >
      <div id={`repo-card-top-${repository.id}`}>
        {/* Header containing Rank & Main Stats */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3" id={`repo-card-meta-${repository.id}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${badge.bg}`}
              id={`repo-rank-badge-${repository.id}`}
            >
              {badge.icon}
              <span>{badge.label}</span>
            </span>
            {repository.language && (
              <span
                className="flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap"
                id={`repo-lang-badge-${repository.id}`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${getLanguageColor(repository.language)}`}></span>
                <span>{repository.language}</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 text-xs font-mono text-slate-400 shrink-0" id={`repo-stats-${repository.id}`}>
            <span className="flex items-center hover:text-amber-500 transition cursor-help" title={`${(repository.stargazersCount || 0).toLocaleString()} stars`}>
              <Star className="w-3.5 h-3.5 mr-1 text-amber-400 fill-amber-400" />
              {(repository.stargazersCount || 0) >= 1000
                ? `${((repository.stargazersCount || 0) / 1000).toFixed(1)}k`
                : (repository.stargazersCount || 0)}
            </span>
            <span className="flex items-center hover:text-indigo-500 transition cursor-help" title={`${(repository.forksCount || 0).toLocaleString()} forks`}>
              <GitFork className="w-3.5 h-3.5 mr-1 text-indigo-400" />
              {(repository.forksCount || 0) >= 1000
                ? `${((repository.forksCount || 0) / 1000).toFixed(1)}k`
                : (repository.forksCount || 0)}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleBookmark(repository);
              }}
              className={`p-1 rounded-md transition cursor-pointer ${
                isBookmarked
                  ? "text-rose-500 hover:text-rose-600 bg-rose-50 border border-rose-100"
                  : "text-slate-400 hover:text-rose-500 hover:bg-slate-100 border border-transparent"
              }`}
              id={`bookmark-btn-${repository.id}`}
              title={isBookmarked ? "Remove Bookmark" : "Add Bookmark"}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? "fill-rose-500 text-rose-500" : ""}`} />
            </button>
          </div>
        </div>

        {/* Repo Social Preview Image Banner */}
        <div className="w-full h-32 relative overflow-hidden rounded-xl border border-slate-100 mb-3.5 bg-slate-50" id={`repo-card-image-box-${repository.id}`}>
          <img
            src={`https://opengraph.githubassets.com/1/${repository.fullName}`}
            alt={`${repository.fullName} Preview`}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300"
            referrerPolicy="no-referrer"
            id={`repo-card-img-${repository.id}`}
            onError={(e) => {
              // Hide container if there is any error loading the opengraph preview
              const container = document.getElementById(`repo-card-image-box-${repository.id}`);
              if (container) {
                container.style.display = "none";
              }
            }}
          />
        </div>

        {/* Repository Title & Description */}
        <div className="flex items-center space-x-3 mb-2" id={`repo-card-title-${repository.id}`}>
          {repository.owner.avatarUrl && (
            <img
              src={repository.owner.avatarUrl}
              alt={repository.owner.login}
              className="w-7 h-7 rounded-full border border-slate-200"
              referrerPolicy="no-referrer"
              id={`repo-owner-avatar-${repository.id}`}
            />
          )}
          <div className="truncate">
            <a
              href={repository.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-bold text-slate-900 hover:text-indigo-600 transition truncate flex items-center gap-1.5 group-hover:underline"
              id={`repo-github-link-${repository.id}`}
            >
              {repository.source === "gitlab" ? (
                <Gitlab className="w-4 h-4 text-orange-600 shrink-0" />
              ) : (
                <Github className="w-4 h-4 text-slate-700 shrink-0" />
              )}
              <span className="truncate">{repository.fullName}</span>
              <ExternalLink className="w-3.5 h-3.5 ml-0.5 opacity-0 group-hover:opacity-100 transition text-slate-400 shrink-0" />
            </a>
          </div>
        </div>

        {repository.description && (
          <p
            className="text-xs text-slate-500 leading-relaxed mb-3.5 italic max-h-28 overflow-y-auto pr-1 select-text scrollbar-thin scrollbar-thumb-slate-200"
            id={`repo-original-desc-${repository.id}`}
          >
            &ldquo;{repository.description}&rdquo;
          </p>
        )}

        {/* AI summary callout box */}
        {repository.aiSummary && (
          <div
            className="bg-indigo-50/50 rounded-xl p-3.5 border border-indigo-100/40 mb-4"
            id={`repo-ai-summary-box-${repository.id}`}
          >
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-indigo-700 mb-1">
              <Cpu className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>{repository.aiTitle || t.aiQuickSummary}</span>
            </div>
            <p className="text-slate-700 text-sm leading-relaxed" id={`repo-ai-summary-text-${repository.id}`}>
              {repository.aiSummary}
            </p>
          </div>
        )}
      </div>

      {/* Footer tags and deep-dive action */}
      <div id={`repo-card-footer-${repository.id}`}>
        {/* Characteristics tags generated by AI */}
        <div className="flex flex-wrap gap-1.5 mb-4" id={`repo-tags-${repository.id}`}>
          {repository.aiTags.map((tag, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onTagClick?.(tag)}
              className="text-[10px] font-semibold text-slate-500 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 border border-slate-200/50 px-2 py-0.5 rounded transition cursor-pointer"
              id={`repo-tag-${repository.id}-${idx}`}
              title={`${tag}で検索`}
            >
              #{tag}
            </button>
          ))}
          {repository.topics.slice(0, 3).map((topic, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onTagClick?.(topic)}
              className="text-[10px] text-indigo-500 bg-indigo-50/50 hover:bg-indigo-100 border border-transparent hover:border-indigo-200 px-2 py-0.5 rounded transition cursor-pointer"
              id={`repo-topic-${repository.id}-${idx}`}
              title={`${topic}で検索`}
            >
              {topic}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onDeepDive(repository)}
          className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-xl shadow transition active:scale-[0.98] flex items-center justify-center space-x-1.5 cursor-pointer"
          id={`repo-deepdive-btn-${repository.id}`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{t.deepDive}</span>
        </button>
      </div>
    </div>
  );
}
