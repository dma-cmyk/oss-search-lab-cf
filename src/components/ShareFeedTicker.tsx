import React, { useEffect, useState, useRef } from "react";
import { Sparkles, ArrowRight, List } from "lucide-react";

interface ShareFeedTickerProps {
  lang: string;
}

interface FeedItem {
  id: string;
  repo: string | { name: string; fullName: string };
  title: string;
  timestamp: string;
}

// 6大言語対応の多言語ローカライズ辞書よ♡
const TICKER_TRANSLATIONS = {
  ja: {
    label: "新着フィード",
    defaultTitle: (repoName: string, title: string) => `${repoName} : ${title}`,
    justNow: "たった今",
    minsAgo: (m: number) => `${m}分前`,
    hoursAgo: (h: number) => `${h}時間前`,
    today: "今日",
    allTitle: "最近の共有レポート"
  },
  zh: {
    label: "最新动态",
    defaultTitle: (repoName: string, _title: string) => `${repoName} : 深度解析报告`,
    justNow: "刚刚",
    minsAgo: (m: number) => `${m}分钟前`,
    hoursAgo: (h: number) => `${h}小时前`,
    today: "今天",
    allTitle: "最近共享报告"
  },
  es: {
    label: "Recientes",
    defaultTitle: (repoName: string, _title: string) => `${repoName} : Informe de Análisis`,
    justNow: "ahora mismo",
    minsAgo: (m: number) => `hace ${m}m`,
    hoursAgo: (h: number) => `hace ${h}h`,
    today: "hoy",
    allTitle: "Informes Recientes"
  },
  de: {
    label: "Neuigkeiten",
    defaultTitle: (repoName: string, _title: string) => `${repoName} : Detailanalyse-Bericht`,
    justNow: "gerade eben",
    minsAgo: (m: number) => `vor ${m} Min.`,
    hoursAgo: (h: number) => `vor ${h} Std.`,
    today: "heute",
    allTitle: "Kürzliche Berichte"
  },
  fr: {
    label: "Nouveau",
    defaultTitle: (repoName: string, _title: string) => `${repoName} : Rapport d'Analyse`,
    justNow: "à l'instant",
    minsAgo: (m: number) => `il y a ${m} min`,
    hoursAgo: (h: number) => `il y a ${h} h`,
    today: "aujourd'hui",
    allTitle: "Rapports Récents"
  },
  en: {
    label: "New",
    defaultTitle: (repoName: string, _title: string) => `${repoName} : Deep Dive Analysis`,
    justNow: "just now",
    minsAgo: (m: number) => `${m}m ago`,
    hoursAgo: (h: number) => `${h}h ago`,
    today: "today",
    allTitle: "Recent Shared Reports"
  }
};

export default function ShareFeedTicker({ lang }: ShareFeedTickerProps) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [animate, setAnimate] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // 2. カルーセルの自動縦スライド切り替え（4秒ごと）
  useEffect(() => {
    if (feed.length <= 1) return;
    const slideInterval = setInterval(() => {
      setAnimate(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % Math.min(feed.length, 5));
        setAnimate(true);
      }, 300); // スライドアウト演出待ち
    }, 4000);
    return () => clearInterval(slideInterval);
  }, [feed]);

  // ドロップダウンを外側クリックで閉じる処理
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (feed.length === 0) return null;

  const currentLang = (lang || "en").toLowerCase();
  const t = TICKER_TRANSLATIONS[currentLang as keyof typeof TICKER_TRANSLATIONS] || TICKER_TRANSLATIONS.en;
  
  const displayItems = feed.slice(0, 5);
  const currentItem = displayItems[currentIndex] || displayItems[0];

  const handleClick = (id: string) => {
    window.location.search = `?share=${id}`;
  };

  // タップ・クリック時の制御
  const handleTickerClick = (id: string) => {
    // スマホ（768px未満）の時は、誤遷移を防いで全タイトルをしっかり見せるために、ポップオーバー一覧をトグルするわね♡
    if (window.innerWidth < 768) {
      setIsOpen(!isOpen);
    } else {
      // PCならホバーでツールチップが見えるから、クリックで即レポートへジャンプよ♡
      handleClick(id);
    }
  };

  // リポジトリ名の抽出
  const getRepoName = (repo: any) => {
    if (!repo) return "";
    if (typeof repo === "string") {
      return repo.split("/").pop() || repo;
    }
    return repo.name || repo.fullName?.split("/").pop() || "";
  };

  // 時差の表記
  const getRelativeTime = (isoString: string) => {
    const now = new Date();
    const past = new Date(isoString);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return t.justNow;
    if (diffMins < 60) return t.minsAgo(diffMins);
    if (diffHours < 24) return t.hoursAgo(diffHours);
    return t.today;
  };

  const repoName = getRepoName(currentItem.repo);
  const displayTitle = t.defaultTitle(repoName, currentItem.title);

  return (
    <div className="relative w-full max-w-xl mx-auto mb-5" ref={dropdownRef} id="share-feed-ticker-wrapper">
      {/* 1行スリムピルティッカーよ♡ */}
      <div 
        className="flex items-center justify-between p-1.5 px-3.5 rounded-full border border-indigo-200/50 bg-gradient-to-r from-indigo-50/70 via-white/95 to-purple-50/70 backdrop-blur-md shadow-xs dark:from-slate-900/80 dark:via-slate-900/95 dark:to-slate-900/80 dark:border-indigo-900/40 hover:border-indigo-300 transition-all duration-300"
        id="share-feed-ticker"
        title={displayTitle} // PCホバー用
      >
        {/* 左：新着バッジ */}
        <div className="flex items-center space-x-1.5 shrink-0 mr-2">
          <span className="flex items-center justify-center p-1 rounded-full bg-indigo-500 text-white shadow-xs">
            <Sparkles className="w-2.5 h-2.5 animate-pulse" />
          </span>
          <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 tracking-wider uppercase bg-indigo-50/60 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded-md border border-indigo-100/50 dark:border-indigo-900/30">
            {t.label}
          </span>
        </div>

        {/* 中央：自動スライドアニメーション表示 */}
        <div 
          onClick={() => handleTickerClick(currentItem.id)}
          className={`flex-1 overflow-hidden cursor-pointer mr-2 transition-all duration-300 transform ${
            animate ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
          }`}
        >
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate block hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            {displayTitle}
          </span>
        </div>

        {/* 右：時間と一覧展開トグルボタン */}
        <div className="flex items-center space-x-2 shrink-0">
          <span className={`text-[9px] text-slate-400 font-semibold transition-all duration-300 ${
            animate ? "opacity-100" : "opacity-0"
          }`}>
            {getRelativeTime(currentItem.timestamp)}
          </span>
          
          <div className="h-3 w-px bg-slate-200 dark:bg-slate-800" />
          
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`p-1.5 rounded-md text-slate-400 hover:text-indigo-500 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition cursor-pointer flex items-center justify-center ${
              isOpen ? "text-indigo-500 bg-indigo-50/50" : ""
            }`}
            title="List recent shares"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ふわっと浮かび上がる5件一覧のポップオーバーパネルよ♡ */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-30 p-3 rounded-2xl border border-indigo-200/50 bg-white/98 dark:bg-slate-900/98 backdrop-blur-lg shadow-lg animate-fade-in max-h-60 overflow-y-auto space-y-1">
          <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase pb-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span>{t.allTitle}</span>
            <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full dark:bg-indigo-950/40 dark:text-indigo-400">
              {displayItems.length}
            </span>
          </div>
          <div className="space-y-0.5 pt-1">
            {displayItems.map((item, idx) => {
              const rName = getRepoName(item.repo);
              const dTitle = t.defaultTitle(rName, item.title);
              return (
                <div
                  key={item.id}
                  onClick={() => handleClick(item.id)}
                  className={`flex items-start justify-between p-1.5 px-2 rounded-xl border border-transparent hover:border-indigo-200/50 hover:bg-indigo-50/30 dark:hover:bg-slate-800/80 cursor-pointer transition-all group ${
                    idx === currentIndex ? "bg-indigo-50/40 dark:bg-slate-800/40 border-indigo-150/40" : ""
                  }`}
                >
                  <div className="flex items-start space-x-2 overflow-hidden flex-1 mr-2 pt-0.5">
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0 mt-0.5" />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-normal break-words group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-relaxed">
                      {dTitle}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-semibold shrink-0 ml-2 pt-0.5">
                    {getRelativeTime(item.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
