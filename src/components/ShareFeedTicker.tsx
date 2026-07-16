import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState(true);

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

  // 2. カルーセルの切り替えとフェードアニメーション（5秒ごと）
  useEffect(() => {
    if (feed.length <= 1) return;

    const timer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % feed.length);
        setFade(true);
      }, 300); // フェードアウトの時間
    }, 5000);

    return () => clearInterval(timer);
  }, [feed]);

  if (feed.length === 0) return null;

  const currentItem = feed[currentIndex];
  if (!currentItem) return null;

  // クリックしたときはURLパラメータを書き換えてディープリンクで開くわよ♡
  const handleClick = () => {
    window.location.search = `?share=${currentItem.id}`;
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

  const labelText = lang === "ja" ? "新着共有" : "New Share";

  return (
    <div 
      onClick={handleClick}
      className="w-full max-w-3xl mx-auto mb-4 cursor-pointer flex items-center justify-between px-4 py-2.5 rounded-xl border border-indigo-200/50 bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-pink-50/30 backdrop-blur-md shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-300 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-900/30 dark:border-indigo-900/30 dark:hover:border-indigo-700/50"
      id="share-feed-ticker"
    >
      <div className="flex items-center space-x-3 overflow-hidden flex-1">
        {/* バッジ */}
        <span className="flex items-center space-x-1 flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm animate-pulse">
          <Sparkles className="w-3 h-3" />
          <span>{labelText}</span>
        </span>
        
        {/* タイトル */}
        <div className={`flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
          {currentItem.title}
        </div>
      </div>
      
      {/* タイムスタンプ */}
      <span className={`text-[10px] sm:text-xs text-indigo-500 dark:text-indigo-400 font-semibold ml-2 flex-shrink-0 transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
        {getRelativeTime(currentItem.timestamp)}
      </span>
    </div>
  );
}
