import React, { useEffect, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";

interface ShareFeedTickerProps {
  lang: string;
}

interface FeedItem {
  id: string;
  repo: string | { name: string; fullName: string };
  title: string;
  timestamp: string;
}

export default function ShareFeedTicker({ lang }: ShareFeedTickerProps) {
  const [feed, setFeed] = useState<FeedItem[]>([]);

  // 1. 新着フィードのフェッチ（15秒ごと）
  const fetchFeed = async () => {
    try {
      const res = await fetch("/api/share/feed");
      if (res.ok) {
        const data = await res.json();
        setFeed(data);
      }
    } catch (err) {
      console.error("Failed to fetch share feed:", err);
    }
  };

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 15000);
    return () => clearInterval(interval);
  }, []);

  if (feed.length === 0) return null;

  // 最新の5件を表示するわよ♡
  const displayItems = feed.slice(0, 5);

  const handleClick = (id: string) => {
    window.location.search = `?share=${id}`;
  };

  // 時差の表記（簡易計算）
  const getRelativeTime = (isoString: string) => {
    const now = new Date();
    const past = new Date(isoString);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return lang === "ja" ? "たった今" : "just now";
    if (diffMins < 60) return lang === "ja" ? `${diffMins}分前` : `${diffMins}m ago`;
    if (diffHours < 24) return lang === "ja" ? `${diffHours}時間前` : `${diffHours}h ago`;
    return lang === "ja" ? "今日" : "today";
  };

  const labelText = lang === "ja" ? "新着共有フィード" : "Recent Shares";

  return (
    <div 
      className="w-full max-w-3xl mx-auto mb-6 p-4 rounded-2xl border border-indigo-200/50 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-pink-50/20 backdrop-blur-md shadow-sm dark:from-slate-900/80 dark:via-slate-900/60 dark:to-slate-900/40 dark:border-indigo-900/30"
      id="share-feed-ticker"
    >
      {/* ヘッダータイトル */}
      <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-indigo-100/50 dark:border-slate-800">
        <span className="flex items-center justify-center p-1 rounded-lg bg-indigo-500 text-white shadow-sm">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
        </span>
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase">
          {labelText}
        </h3>
      </div>
      
      {/* 5件のリスト */}
      <div className="space-y-2">
        {displayItems.map((item) => (
          <div
            key={item.id}
            onClick={() => handleClick(item.id)}
            className="flex items-center justify-between p-2 rounded-xl bg-white/50 dark:bg-slate-900/30 border border-transparent hover:border-indigo-200/60 hover:bg-white/90 dark:hover:bg-slate-800/80 dark:hover:border-indigo-800/50 cursor-pointer transition-all duration-200 group"
          >
            <div className="flex items-center space-x-2 overflow-hidden flex-1 mr-2">
              <ArrowRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {item.title}
              </span>
            </div>
            
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold shrink-0 ml-2">
              {getRelativeTime(item.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
