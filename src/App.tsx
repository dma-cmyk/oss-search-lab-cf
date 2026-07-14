import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Sparkles,
  Award,
  BookOpen,
  ArrowRight,
  TrendingUp,
  History,
  AlertCircle,
  Globe,
  ChevronDown,
  ChevronLeft,
  Settings,
  Github,
  Gitlab,
  Save,
  Menu,
  X,
  Trash2,
  Clock,
  Star,
  Edit2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import {
  Repository,
  AISearchSummary,
  SearchHistoryItem,
  SUPPORTED_LANGUAGES,
  AIPersona,
  AITargetAudience,
  AiEndpoint,
  PRESET_ENDPOINTS,
  SavedReport,
  SavedReportArticle,
  RepoDetail } from "./types";
import { PRESET_PERSONAS } from "./lib/personas";
import { PRESET_AUDIENCES } from "./lib/audiences";
import { getUITranslations } from "./lib/translations";
import SearchInput from "./components/SearchInput";
import RepositoryCard from "./components/RepositoryCard";
import AISummaryCard from "./components/AISummaryCard";
import RepoDetailView from "./components/RepoDetailView";
import SearchHeader from "./components/SearchHeader";
import SettingsModal from "./components/SettingsModal";
import MagazineView from "./components/MagazineView";

const migrateToArticlesStructure = (reports: any[]): SavedReport[] => {
  const newReportsMap: Record<string, SavedReport> = {};

  reports.forEach((item) => {
    if (!item) return;

    if (item.articles && Array.isArray(item.articles)) {
      if (!item.repository) return; // Skip invalid records without a repository
      const repoKey = item.id || `${item.repository.id}_${item.repository.source || "github"}`;
      if (!newReportsMap[repoKey]) {
        newReportsMap[repoKey] = item;
      } else {
        const existingIds = new Set(newReportsMap[repoKey].articles.map(a => a.id));
        item.articles.forEach((art: any) => {
          if (!existingIds.has(art.id)) {
            newReportsMap[repoKey].articles.push(art);
          }
        });
      }
      return;
    }

    const repo = item.repository;
    if (!repo) return;
    const repoKey = `${repo.id}_${repo.source || "github"}`;
    const article: SavedReportArticle = {
      id: item.id || `art_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      detail: item.detail,
      savedAt: item.savedAt || Date.now(),
      modelUsed: item.modelUsed,
      personaName: item.personaName,
      audienceName: item.audienceName,
    };

    if (!newReportsMap[repoKey]) {
      newReportsMap[repoKey] = {
        id: repoKey,
        repository: repo,
        articles: [article],
      };
    } else {
      if (!newReportsMap[repoKey].articles.some((a) => a.id === article.id)) {
        newReportsMap[repoKey].articles.push(article);
      }
    }
  });

  Object.values(newReportsMap).forEach(r => {
    if (r && r.articles) {
      r.articles.sort((a, b) => b.savedAt - a.savedAt);
    }
  });

  return Object.values(newReportsMap);
};

export default function App() {
  const [mode, setMode] = useState<"home" | "results" | "showcase">("home");
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [optimizedQuery, setOptimizedQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"ai" | "plain">("ai");
  const [searchSources, setSearchSources] = useState<string[]>(["github", "gitlab"]);
  const [trendingTimeframe, setTrendingTimeframe] = useState<"day" | "week" | "month">("day");
  const [lang, setLang] = useState(() => {
    return localStorage.getItem("oss_search_lang_v1") || "auto";
  }); // Default to Auto or saved value
  const [resolvedLang, setResolvedLang] = useState("ja"); // Internal code after auto-resolve
  
  const t = getUITranslations(resolvedLang);

  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [aiSummary, setAiSummary] = useState<AISearchSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Shared reports & Showcase states
  const [sharedReportData, setSharedReportData] = useState<any | null>(null);
  const [isSharedView, setIsSharedView] = useState(false);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [showcaseList, setShowcaseList] = useState<any[]>([]);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
  const [showcaseSearch, setShowcaseSearch] = useState("");
  const [showcaseSort, setShowcaseSort] = useState<"latest" | "stars" | "count">("latest");
  const [selectedShowcaseRepo, setSelectedShowcaseRepo] = useState<any | null>(null);

  // Pagination States
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerRef = useRef<HTMLDivElement | null>(null);

  // Persona States
  const [selectedPersonaId, setSelectedPersonaId] = useState(() => {
    return localStorage.getItem("oss_gemini_selected_persona_id_v2") || "architect";
  });
  const [customPersonas, setCustomPersonas] = useState<AIPersona[]>(() => {
    try {
      const json = localStorage.getItem("oss_gemini_custom_personas_v2");
      return json ? JSON.parse(json) : [];
    } catch (e) {
      return [];
    }
  });

  const handleSelectPersonaId = (id: string) => {
    setSelectedPersonaId(id);
    localStorage.setItem("oss_gemini_selected_persona_id_v2", id);
  };

  const handleUpdateCustomPersonas = (newCustom: AIPersona[]) => {
    setCustomPersonas(newCustom);
    localStorage.setItem("oss_gemini_custom_personas_v2", JSON.stringify(newCustom));
  };

  const allPersonas = [...PRESET_PERSONAS, ...customPersonas];
  const activePersona = allPersonas.find(p => p.id === selectedPersonaId) || PRESET_PERSONAS[0];

  // Target Audience States
  const [selectedAudienceId, setSelectedAudienceId] = useState(() => {
    return localStorage.getItem("oss_gemini_selected_audience_id_v2") || "beginner";
  });
  const [customAudiences, setCustomAudiences] = useState<AITargetAudience[]>(() => {
    try {
      const json = localStorage.getItem("oss_gemini_custom_audiences_v2");
      return json ? JSON.parse(json) : [];
    } catch (e) {
      return [];
    }
  });

  const handleSelectAudienceId = (id: string) => {
    setSelectedAudienceId(id);
    localStorage.setItem("oss_gemini_selected_audience_id_v2", id);
  };

  const handleUpdateCustomAudiences = (newCustom: AITargetAudience[]) => {
    setCustomAudiences(newCustom);
    localStorage.setItem("oss_gemini_custom_audiences_v2", JSON.stringify(newCustom));
  };

  const allAudiences = [...PRESET_AUDIENCES, ...customAudiences];
  const activeAudience = allAudiences.find(a => a.id === selectedAudienceId) || PRESET_AUDIENCES[0];

  // Trending States
  const [trendingRepos, setTrendingRepos] = useState<Repository[]>([]);
  const [trendingSummary, setTrendingSummary] = useState("");
  const [trendingTitle, setTrendingTitle] = useState("");
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const [trendingPage, setTrendingPage] = useState(1);
  const [trendingHasMore, setTrendingHasMore] = useState(true);
  const [trendingLoadingMore, setTrendingLoadingMore] = useState(false);
  const [trendingLoadMoreError, setTrendingLoadMoreError] = useState<string | null>(null);
  const trendingObserverRef = useRef<HTMLDivElement | null>(null);
  const isFetchingMoreRef = useRef(false);
  const isTrendingFetchingMoreRef = useRef(false);

  // Persistence States
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [bookmarks, setBookmarks] = useState<Repository[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Saved Reports States (Now SavedReport[])
  const [savedReports, setSavedReports] = useState<SavedReport[]>(() => {
    try {
      const savedV2 = localStorage.getItem("oss_saved_reports_v2");
      if (savedV2) {
        const parsed = JSON.parse(savedV2);
        const migrated = migrateToArticlesStructure(parsed);
        if (JSON.stringify(migrated) !== savedV2) {
          localStorage.setItem("oss_saved_reports_v2", JSON.stringify(migrated));
        }
        return migrated;
      }
      
      const savedV1 = localStorage.getItem("oss_saved_reports_v1");
      if (savedV1) {
        const parsedV1 = JSON.parse(savedV1) as Record<string, any>;
        const oldV1Array = Object.entries(parsedV1).map(([key, value], idx) => {
          let savedTimestamp = Date.now();
          try {
            if (value.savedAt) {
              const parsedDate = Date.parse(value.savedAt);
              if (!isNaN(parsedDate)) savedTimestamp = parsedDate;
            }
          } catch (dateErr) {}

          return {
            id: `report_${Date.now()}_${idx}`,
            repository: value.repository,
            detail: value.detail,
            savedAt: savedTimestamp,
            modelUsed: value.modelUsed || "gemini-default",
          };
        });
        const migrated = migrateToArticlesStructure(oldV1Array);
        localStorage.setItem("oss_saved_reports_v2", JSON.stringify(migrated));
        return migrated;
      }
      return [];
    } catch (e) {
      return [];
    }
  });
  const [showSavedReports, setShowSavedReports] = useState(false);
  const [expandedRepoId, setExpandedRepoId] = useState<string | null>(null);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");

  const handleSaveReport = (repo: Repository, detailData: RepoDetail) => {
    if (!repo) return;
    const repoKey = `${repo.id}_${repo.source || "github"}`;
    
    // Create clean default title from editorial article headline style
    const defaultTitle = detailData.title || (resolvedLang === "ja" 
      ? `世界を熱狂させる「${repo.fullName}」の正体に迫る。その圧倒的ポテンシャルと現実的な技術制約` 
      : `Inside ${repo.fullName}: Architectural Auditing, Operational Trade-offs, and Developer Verdict`);

    const newArticle: SavedReportArticle = {
      id: `art_${Date.now()}`,
      detail: {
        ...detailData,
        title: defaultTitle,
      },
      savedAt: Date.now(),
      modelUsed: selectedModel,
      personaName: activePersona.name,
      audienceName: activeAudience.name,
    };

    // Safe findIndex using optional chaining
    const existingIndex = savedReports.findIndex(
      (r) => r.repository && `${r.repository.id}_${r.repository.source || "github"}` === repoKey
    );

    let updated: SavedReport[];
    if (existingIndex > -1) {
      const target = savedReports[existingIndex];
      // Compare without title prop for duplicate check since saved article detail has the defaultTitle injected
      const isDuplicate = target.articles?.some((a) => {
        const { title: aTitle, ...aRest } = a.detail || {};
        const { title: dTitle, ...dRest } = detailData || {};
        return JSON.stringify(aRest) === JSON.stringify(dRest);
      }) || false;
      
      if (isDuplicate) {
        alert(resolvedLang === "ja" ? "このレポートはすでに保存されています。" : "This report is already saved.");
        return;
      }
      
      const updatedArticles = target.articles ? [newArticle, ...target.articles] : [newArticle];
      const updatedReport = {
        ...target,
        articles: updatedArticles,
      };
      
      updated = [...savedReports];
      updated[existingIndex] = updatedReport;
    } else {
      const newReport: SavedReport = {
        id: repoKey,
        repository: repo,
        articles: [newArticle],
      };
      updated = [newReport, ...savedReports];
    }

    setSavedReports(updated);
    localStorage.setItem("oss_saved_reports_v2", JSON.stringify(updated));
    alert(resolvedLang === "ja" ? "マイライブラリに保存しました。" : "Saved to My Library.");
  };

  const handleRenameArticle = (reportId: string, articleId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    const updated = savedReports.map((r) => {
      if (r.id !== reportId) return r;
      return {
        ...r,
        articles: r.articles.map((art) => {
          if (art.id !== articleId) return art;
          return {
            ...art,
            detail: {
              ...art.detail,
              title: newTitle,
            },
          };
        }),
      };
    });
    setSavedReports(updated);
    localStorage.setItem("oss_saved_reports_v2", JSON.stringify(updated));
  };

  const handleDeleteReport = (reportId: string) => {
    const updated = savedReports.filter((r) => r.id !== reportId);
    setSavedReports(updated);
    localStorage.setItem("oss_saved_reports_v2", JSON.stringify(updated));
    if (expandedRepoId === reportId) {
      setExpandedRepoId(null);
    }
  };

  const handleDeleteArticle = (reportId: string, articleId: string) => {
    const updated = savedReports
      .map((r) => {
        if (r.id === reportId) {
          return {
            ...r,
            articles: r.articles.filter((a) => a.id !== articleId),
          };
        }
        return r;
      })
      .filter((r) => r.articles.length > 0);

    setSavedReports(updated);
    localStorage.setItem("oss_saved_reports_v2", JSON.stringify(updated));
  };

  // Magazine State
  const [showMagazine, setShowMagazine] = useState(false);
  const [magazineTopic, setMagazineTopic] = useState("");
  const [magazineRepos, setMagazineRepos] = useState<Repository[]>([]);

  // Active Selected Repo for modal analysis
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedSavedReportDetail, setSelectedSavedReportDetail] = useState<RepoDetail | null>(null);
  const [isHeaderLangOpen, setIsHeaderLangOpen] = useState(false);
  
  const [savedScrollPosition, setSavedScrollPosition] = useState(0);

  const handleOpenRepoDetail = (repo: Repository | null) => {
    if (repo) {
      setSavedScrollPosition(window.scrollY);
    }
    setSelectedRepo(repo);
  };

  // Restore scroll position when returning from detail view
  useEffect(() => {
    if (!selectedRepo && savedScrollPosition > 0) {
      const timer = setTimeout(() => {
        window.scrollTo(0, savedScrollPosition);
        setSavedScrollPosition(0);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [selectedRepo, savedScrollPosition]);
  const [isHomeLangOpen, setIsHomeLangOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Settings States
  
  const [customEndpoints, setCustomEndpoints] = useState<AiEndpoint[]>(() => {
    const saved = localStorage.getItem("oss_custom_endpoints_v1");
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedEndpointId, setSelectedEndpointId] = useState(() => {
    return localStorage.getItem("oss_selected_endpoint_id_v1") || "gemini-default";
  });

  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return localStorage.getItem("oss_gemini_api_key_v1") || "";
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    let saved = localStorage.getItem("oss_gemini_selected_model_v1");
    console.log("[DEBUG APP] Initial selectedModel from localStorage:", saved);
    // Migrate away from exhausted gemini-2.5-flash
    if (saved === "models/gemini-2.5-flash" || saved === "models/gemini-2.0-flash") {
      saved = "models/gemini-flash-lite-latest";
      try { localStorage.setItem("oss_gemini_selected_model_v1", saved); } catch(e) {}
      console.log("[DEBUG APP] Migrated to gemini-flash-lite-latest");
    }
    return saved || "models/gemini-flash-lite-latest";
  });
  const [availableModels, setAvailableModels] = useState<{ name: string; displayName: string; description: string; }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsSearchTerm, setModelsSearchTerm] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [bypassCache, setBypassCache] = useState(() => {
    return localStorage.getItem("oss_bypass_cache_v1") === "true";
  });

  const handleSaveApiKey = (key: string) => {
    setGeminiApiKey(key);
    localStorage.setItem("oss_gemini_api_key_v1", key);
  };

  
  const getActiveEndpoint = () => {
    const allEndpoints = [...PRESET_ENDPOINTS, ...customEndpoints];
    return allEndpoints.find(e => e.id === selectedEndpointId) || PRESET_ENDPOINTS[0];
  };


  const handleSelectModel = (modelName: string) => {
    console.log("[DEBUG APP] handleSelectModel called with:", modelName);
    setSelectedModel(modelName);
    try {
      localStorage.setItem("oss_gemini_selected_model_v1", modelName);
    } catch (e) {
      console.log("Failed to save to localStorage:", e);
    }
  };

  const getModelDisplayName = (modelId: string) => {
    // Check if it's in availableModels
    const found = availableModels.find(m => m.name === modelId);
    if (found) return found.displayName;
    
    // Hardcoded fallback mappings
    const mapping: Record<string, string> = {
      "models/gemini-flash-lite-latest": "Gemini Flash-Lite Latest",
      "models/gemini-3.5-flash": "Gemini 3.5 Flash",
      "models/gemini-3.1-flash-lite": "Gemini 3.1 Flash-Lite",
      "models/gemini-3.1-pro-preview": "Gemini 3.1 Pro Preview",
      "models/gemini-3.1-flash-lite-image": "Gemini 3.1 Flash-Lite Image",
      "models/gemini-3.1-flash-image": "Gemini 3.1 Flash Image"
    };
    if (mapping[modelId]) return mapping[modelId];

    // If it starts with models/, remove it and prettify
    if (modelId.startsWith("models/")) {
      const parts = modelId.replace("models/", "").split("-");
      return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    }
    return modelId;
  };

  const replaceGeminiWithModel = (text: string) => {
    if (!text) return text;
    const modelName = getModelDisplayName(selectedModel);
    // Replace "Gemini", "gemini" and "ジェミニ" (if any) with the friendly model name
    return text.replace(/Gemini/g, modelName).replace(/gemini/g, modelName);
  };

  // Fetch models list function
  const fetchModelsList = async (keyToUse?: string) => {
    setModelsLoading(true);
    setModelsError(null);
    const key = keyToUse !== undefined ? keyToUse : geminiApiKey;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (key) {
        headers["x-gemini-key"] = key;
        const endpoint = getActiveEndpoint();
        headers["x-ai-provider"] = endpoint.type;
        headers["x-ai-endpoint"] = endpoint.url;
      }
      const response = await fetch("/api/models", {
        method: "POST",
        headers,
        body: JSON.stringify({ apiKey: key, lang: resolvedLang })
      });
      if (!response.ok) {
        throw new Error(`Failed to load models list. Please verify your API key.`);
      }
      const data = await response.json();
      setAvailableModels(data || []);
    } catch (err: any) {
      console.log("Failed to load models:", err);
      setModelsError(err.message || "Failed to load models list.");
    } finally {
      setModelsLoading(false);
    }
  };

  // Fetch models on mount or when API key or resolved language changes
  useEffect(() => {
    fetchModelsList();
  }, [geminiApiKey, resolvedLang]);

  // On mount: Load history & bookmarks from localStorage & URL
  useEffect(() => {
    // Check if there is a model parameter in the URL and apply then remove it
    const searchParams = new URLSearchParams(window.location.search);
    const urlModel = searchParams.get("model");
    if (urlModel) {
      console.log("[DEBUG APP] Loaded model from URL parameter:", urlModel);
      setSelectedModel(urlModel);
      try {
        localStorage.setItem("oss_gemini_selected_model_v1", urlModel);
      } catch (e) {}
      
      // Clean up URL parameter to prevent it from resetting other choices on next reload
      searchParams.delete("model");
      const newQuery = searchParams.toString();
      const newUrl = `${window.location.pathname}${newQuery ? "?" + newQuery : ""}`;
      window.history.replaceState({}, "", newUrl);
    }

    const savedHistory = localStorage.getItem("oss_search_history_v1");
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (err) {
        console.log("Failed to parse history", err);
      }
    }

    const savedBookmarks = localStorage.getItem("oss_search_bookmarks_v1");
    if (savedBookmarks) {
      try {
        setBookmarks(JSON.parse(savedBookmarks));
      } catch (err) {
        console.log("Failed to parse bookmarks", err);
      }
    }
    

    // Check URL parameters for deep link
    const shareParam = searchParams.get("share");
    const sourceParam = searchParams.get("source");
    const repoParam = searchParams.get("repo");
    
    if (shareParam) {
      setSharedLoading(true);
      fetch(`/api/share?id=${encodeURIComponent(shareParam)}`)
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch shared report");
          return res.json();
        })
        .then(sharedData => {
          const repoObj: Repository = {
            id: sharedData.repo?.id || Math.random().toString(),
            name: sharedData.repo?.name || sharedData.repo?.fullName?.split("/")[1] || "shared",
            fullName: sharedData.repo?.fullName || sharedData.repo || "shared-repo",
            source: sharedData.repo?.source || "github",
            owner: sharedData.repo?.owner || {
              login: (sharedData.repo?.fullName || sharedData.repo || "owner/repo").split("/")[0],
              avatarUrl: "",
              htmlUrl: ""
            },
            htmlUrl: sharedData.repo?.htmlUrl || "",
            description: sharedData.repo?.description || "",
            stargazersCount: sharedData.repo?.stargazersCount || sharedData.stars || 0,
            forksCount: sharedData.repo?.forksCount || 0,
            watchersCount: sharedData.repo?.watchersCount || 0,
            openIssuesCount: sharedData.repo?.openIssuesCount || 0,
            language: sharedData.repo?.language || null,
            topics: sharedData.repo?.topics || [],
            updatedAt: sharedData.repo?.updatedAt || new Date().toISOString(),
            createdAt: sharedData.repo?.createdAt || new Date().toISOString(),
            aiTitle: sharedData.repo?.aiTitle || "",
            aiSummary: sharedData.repo?.aiSummary || "",
            aiTags: sharedData.repo?.aiTags || []
          };
          setSelectedRepo(repoObj);
          setSharedReportData(sharedData.data);
          setIsSharedView(true);
        })
        .catch(err => {
          console.log("Failed to load shared view:", err);
        })
        .finally(() => {
          setSharedLoading(false);
        });
    } else if (repoParam) {
      const sourceToUse = sourceParam || "github";
      fetch(`/api/repo?source=${sourceToUse}&name=${encodeURIComponent(repoParam)}`)
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch repository metadata");
          return res.json();
        })
        .then(data => {
          // Construct Repository object
          const repoObj: Repository = {
            id: data.id,
            name: data.name,
            fullName: data.full_name || data.path_with_namespace,
            source: sourceToUse,
            owner: {
              login: sourceToUse === "gitlab" ? (data.namespace?.path || "gitlab") : data.owner.login,
              avatarUrl: sourceToUse === "gitlab" ? (data.avatar_url || data.namespace?.avatar_url || "") : data.owner.avatar_url,
              htmlUrl: sourceToUse === "gitlab" ? (data.namespace ? `https://gitlab.com/${data.namespace.path}` : "https://gitlab.com") : data.owner.html_url,
            },
            htmlUrl: data.web_url || data.html_url,
            description: data.description || "",
            stargazersCount: data.star_count || data.stargazers_count || 0,
            forksCount: data.forks_count || 0,
            watchersCount: data.star_count || data.watchers_count || 0,
            openIssuesCount: data.open_issues_count || 0,
            language: data.language || (data.tag_list && data.tag_list.length > 0 ? data.tag_list[0] : null),
            topics: data.topics || data.tag_list || [],
            updatedAt: data.last_activity_at || data.updated_at,
            createdAt: data.created_at,
            aiTitle: "",
            aiSummary: "",
            aiTags: []
          };
          setSelectedRepo(repoObj);
        })
        .catch(err => {
          console.log("Deep link error:", err);
        });
    }
  }, []);

  // Save history to localStorage
  const saveHistory = (updatedHistory: SearchHistoryItem[]) => {
    setHistory(updatedHistory);
    localStorage.setItem("oss_search_history_v1", JSON.stringify(updatedHistory));
  };

  // Save bookmarks to localStorage
  const saveBookmarks = (updatedBookmarks: Repository[]) => {
    setBookmarks(updatedBookmarks);
    localStorage.setItem("oss_search_bookmarks_v1", JSON.stringify(updatedBookmarks));
  };

  // Resolve language based on browser environment if 'auto'
  useEffect(() => {
    localStorage.setItem("oss_search_lang_v1", lang);
    if (lang === "auto") {
      const browserLang = navigator.language.split("-")[0];
      const matches = ["ja", "en", "zh", "es", "de", "fr"];
      if (matches.includes(browserLang)) {
        setResolvedLang(browserLang);
      } else {
        setResolvedLang("en"); // Fallback to English
      }
    } else {
      setResolvedLang(lang);
    }
  }, [lang]);

  // Fetch shared reports showcase list when mode changes to 'showcase'
  useEffect(() => {
    if (mode === "showcase") {
      setShowcaseLoading(true);
      fetch("/api/share/list")
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch showcase list");
          return res.json();
        })
        .then(data => {
          setShowcaseList(data);
        })
        .catch(err => {
          console.error("Failed to load showcase list:", err);
        })
        .finally(() => {
          setShowcaseLoading(false);
        });
    }
  }, [mode]);

  // Fetch trending repositories
  useEffect(() => {
    const fetchTrending = async () => {
      setTrendingLoading(true);
      setLoadingStatus(null);
      setTrendingRepos([]);
      setTrendingError(null);
      setTrendingLoadMoreError(null);
      setTrendingPage(1);
      setTrendingHasMore(true);
      try {
        const headers: Record<string, string> = {};
        if (geminiApiKey) headers["x-gemini-key"] = geminiApiKey;
      const endpoint = getActiveEndpoint();
      headers["x-ai-provider"] = endpoint.type;
      headers["x-ai-endpoint"] = endpoint.url;
        if (selectedModel) headers["x-gemini-model"] = selectedModel;
        if (bypassCache) headers["x-bypass-cache"] = "true";
        if (activePersona.prompt) {
          headers["x-persona-prompt"] = encodeURIComponent(activePersona.prompt);
        }
        if (activeAudience.prompt) {
          headers["x-audience-prompt"] = encodeURIComponent(activeAudience.prompt);
        }

        const sourcesParam = searchSources.length > 0 ? searchSources.join(",") : "github";
        const response = await fetch(`/api/trending?lang=${resolvedLang}&page=1&sources=${sourcesParam}&timeframe=${trendingTimeframe}&stream=true&t=${Date.now()}`, { headers });
        if (!response.ok) {
          throw new Error(`Failed to fetch trending repositories. Status: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        
        if (reader) {
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            
            let eolIndex;
            while ((eolIndex = buffer.indexOf("\n\n")) >= 0) {
              const line = buffer.slice(0, eolIndex);
              buffer = buffer.slice(eolIndex + 2);
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "status") {
                    setLoadingStatus(data.message);
                  } else if (data.type === "error") {
                    setTrendingError(data.error + (data.details ? ` (${data.details})` : ""));
                    break;
                  } else if (data.type === "optimizedQuery") {
                  setOptimizedQuery(data.query);
                } else if (data.type === "result") {
                    setTrendingRepos(data.data.repositories || []);
                    setTrendingSummary(data.data.trendingSummary || "");
                    setTrendingTitle(data.data.trendingTitle || "");
                    if ((data.data.repositories || []).length < 9) {
                      setTrendingHasMore(false);
                    }
                  }
                } catch (e: any) {
                if (e instanceof SyntaxError) {
                  // Ignore JSON parse errors for incomplete chunks
                } else {
                  throw e; // Re-throw actual API errors
                }
              }
              }
            }
          }
        }
      } catch (err: any) {
        console.log("Failed to load trending data:", err);
        setTrendingError(err.message || "Could not retrieve trending repositories.");
      } finally {
        setTrendingLoading(false);
      }
    };

    fetchTrending();
  }, [resolvedLang, geminiApiKey, selectedModel, activePersona.prompt, activeAudience.prompt, searchSources, trendingTimeframe, bypassCache]);

  // Load more trending repositories
  const loadMoreTrending = async () => {
    if (trendingLoading || trendingLoadingMore || !trendingHasMore || mode !== "home" || isTrendingFetchingMoreRef.current) return;

    isTrendingFetchingMoreRef.current = true;
    setTrendingLoadingMore(true);
    setLoadingStatus(null);
    const nextPage = trendingPage + 1;
    console.log(`Loading page ${nextPage} of trending repositories`);

    try {
      const headers: Record<string, string> = {};
      if (geminiApiKey) headers["x-gemini-key"] = geminiApiKey;
      const endpoint = getActiveEndpoint();
      headers["x-ai-provider"] = endpoint.type;
      headers["x-ai-endpoint"] = endpoint.url;
      if (selectedModel) headers["x-gemini-model"] = selectedModel;
      if (bypassCache) headers["x-bypass-cache"] = "true";
      if (activePersona.prompt) {
        headers["x-persona-prompt"] = encodeURIComponent(activePersona.prompt);
      }
      if (activeAudience.prompt) {
        headers["x-audience-prompt"] = encodeURIComponent(activeAudience.prompt);
      }

      const sourcesParam = searchSources.length > 0 ? searchSources.join(",") : "github";
      const response = await fetch(`/api/trending?lang=${resolvedLang}&page=${nextPage}&sources=${sourcesParam}&timeframe=${trendingTimeframe}&stream=true&t=${Date.now()}`, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch trending repositories page ${nextPage}. Status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let data = null;
      
      if (reader) {
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          
          let eolIndex;
          while ((eolIndex = buffer.indexOf("\n\n")) >= 0) {
            const line = buffer.slice(0, eolIndex);
            buffer = buffer.slice(eolIndex + 2);
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.type === "status") {
                  setLoadingStatus(parsed.message);
                } else if (parsed.type === "error") {
                  setTrendingError(parsed.error + (parsed.details ? ` (${parsed.details})` : ""));
                  break;
                } else if (parsed.type === "result") {
                  data = parsed.data;
                }
              } catch (e: any) {
                if (e instanceof SyntaxError) {
                  // Ignore JSON parse errors for incomplete chunks
                } else {
                  throw e; // Re-throw actual API errors
                }
              }
            }
          }
        }
      }

      if (!data) throw new Error("No data received");

      const newRepos = data.repositories || [];

      if (newRepos.length === 0) {
        setTrendingHasMore(false);
      } else {
        setTrendingRepos((prev) => {
          const existingKeys = new Set(prev.map((r) => `${r.source}_${r.id}`));
          const filteredNew = newRepos.filter((r: Repository) => !existingKeys.has(`${r.source}_${r.id}`));
          if (filteredNew.length === 0) {
            setTrendingHasMore(false);
          }
          return [...prev, ...filteredNew];
        });
        setTrendingPage(nextPage);
        if (newRepos.length < 9) {
          setTrendingHasMore(false);
        }
      }
    } catch (err: any) {
      console.log("Load more trending fetch error:", err);
      setTrendingLoadMoreError(err.message || String(err));
      setTrendingHasMore(false);
    } finally {
      setTrendingLoadingMore(false);
      isTrendingFetchingMoreRef.current = false;
    }
  };

  // Set up intersection observer for infinite scroll on trending
  useEffect(() => {
    if (trendingLoading || trendingLoadingMore || !trendingHasMore || mode !== "home" || trendingRepos.length === 0) return;

    const currentObserverRef = trendingObserverRef.current;
    if (!currentObserverRef) {
      console.log("[TRENDING OBSERVER] Ref is null, skipping setup.");
      return;
    }

    console.log("[TRENDING OBSERVER] Setting up observer. Repos count:", trendingRepos.length);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          console.log("[TRENDING OBSERVER] Trigger element intersected! Loading more...");
          loadMoreTrending();
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );

    observer.observe(currentObserverRef);

    return () => {
      if (currentObserverRef) {
        console.log("[TRENDING OBSERVER] Cleaning up observer.");
        observer.unobserve(currentObserverRef);
      }
    };
  }, [trendingLoading, trendingLoadingMore, trendingHasMore, mode, trendingPage, resolvedLang, geminiApiKey, selectedModel, activePersona.prompt, activeAudience.prompt, searchSources, selectedRepo, trendingRepos.length]);

  const handleOpenMagazine = () => {
    if (mode === "home") {
      setMagazineTopic(resolvedLang === "ja" ? "注目のトレンドリポジトリ" : "Trending Repositories");
      setMagazineRepos(trendingRepos.slice(0, 10));
    } else {
      if (showBookmarks) {
        setMagazineTopic(resolvedLang === "ja" ? "ブックマークまとめ" : "My Bookmarks");
        setMagazineRepos(bookmarks.slice(0, 10));
      } else {
        setMagazineTopic(resolvedLang === "ja" ? `「${searchQuery}」に関する特集` : `Featured: "${searchQuery}"`);
        setMagazineRepos(repositories.slice(0, 10));
      }
    }
    setShowMagazine(true);
  };

  // Main search function
  const handleSearch = async (targetQuery: string, overrideMode?: "ai" | "plain", isReSearchOverride?: boolean) => {
    if (!targetQuery.trim()) return;

    const activeSearchMode = overrideMode || searchMode;
    const isReSearch = isReSearchOverride || (targetQuery.toLowerCase() === searchQuery.toLowerCase() && mode === "results");
    const previousQuery = optimizedQuery; // Preserve the current optimized query before resetting

    setLoading(true);
    setLoadingStatus(null);
    setError(null);
    setOptimizedQuery("");
    setSearchQuery(targetQuery);
    setQuery(targetQuery);
    setMode("results");
    setShowBookmarks(false);
    setShowSavedReports(false);
    setPage(1);
    setHasMore(true);

    // Save search query into history
    const isExist = history.find((h) => h.query.toLowerCase() === targetQuery.toLowerCase());
    let newHistory = [...history];
    if (isExist) {
      newHistory = newHistory.filter((h) => h.query.toLowerCase() !== targetQuery.toLowerCase());
    }
    newHistory.unshift({ query: targetQuery, timestamp: Date.now() });
    saveHistory(newHistory.slice(0, 15)); // Cap at 15 items

    try {
      const headers: Record<string, string> = {};
      if (geminiApiKey) headers["x-gemini-key"] = geminiApiKey;
      const endpoint = getActiveEndpoint();
      headers["x-ai-provider"] = endpoint.type;
      headers["x-ai-endpoint"] = endpoint.url;
      if (selectedModel) headers["x-gemini-model"] = selectedModel;
      if (activePersona.prompt) {
        headers["x-persona-prompt"] = encodeURIComponent(activePersona.prompt);
      }
      if (activeAudience.prompt) {
        headers["x-audience-prompt"] = encodeURIComponent(activeAudience.prompt);
      }

      const sourcesParam = searchSources.length > 0 ? searchSources.join(",") : "github";
      // Fetch from our full-stack endpoint
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(targetQuery)}&lang=${resolvedLang}&mode=${activeSearchMode}&sources=${sourcesParam}${isReSearch ? `&reSearch=true&prevOptimized=${encodeURIComponent(previousQuery)}` : ""}&stream=true&isMobile=${window.innerWidth < 768}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`Failed to retrieve results from server. Status: ${response.status}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      
      if (reader) {
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          
          let eolIndex;
          while ((eolIndex = buffer.indexOf("\n\n")) >= 0) {
            const line = buffer.slice(0, eolIndex);
            buffer = buffer.slice(eolIndex + 2);
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "status") {
                  setLoadingStatus(data.message);
                } else if (data.type === "error") {
                    setError(data.error + (data.details ? ` (${data.details})` : ""));
                    break;
                  } else if (data.type === "optimizedQuery") {
                  setOptimizedQuery(data.query || "");
                } else if (data.type === "result") {
                  setRepositories(data.data.repositories || []);
                  setAiSummary(data.data.aiSummary || null);
                  setOptimizedQuery(data.data.optimizedQuery || "");
                  if (data.data.hasMore !== undefined) {
                    setHasMore(data.data.hasMore);
                  } else if ((data.data.repositories || []).length < 9) {
                    setHasMore(false);
                  }
                }
              } catch (e: any) {
                if (e instanceof SyntaxError) {
                  // Ignore JSON parse errors for incomplete chunks
                } else {
                  throw e; // Re-throw actual API errors
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.log("Search fetch error:", err);
      setError(err.message || "An error occurred while connecting to the AI Search server.");
    } finally {
      setLoading(false);
    }
  };

  const handleTagClick = (tag: string) => {
    const searchTag = tag.startsWith("#") ? tag : `#${tag}`;
    handleSearch(searchTag, "ai");
  };

  // Load more repositories for infinite scroll
  const loadMoreRepositories = async () => {
    if (loading || loadingMore || !hasMore || showBookmarks || isFetchingMoreRef.current) return;

    isFetchingMoreRef.current = true;
    setLoadingMore(true);
    setLoadingStatus(null);
    const nextPage = page + 1;
    const queryToUseForLog = (searchMode === "ai" && optimizedQuery) ? optimizedQuery : searchQuery;
    console.log(`Loading page ${nextPage} of repositories for: ${queryToUseForLog}`);

    try {
      const headers: Record<string, string> = {};
      if (geminiApiKey) headers["x-gemini-key"] = geminiApiKey;
      const endpoint = getActiveEndpoint();
      headers["x-ai-provider"] = endpoint.type;
      headers["x-ai-endpoint"] = endpoint.url;
      if (selectedModel) headers["x-gemini-model"] = selectedModel;
      if (activePersona.prompt) {
        headers["x-persona-prompt"] = encodeURIComponent(activePersona.prompt);
      }
      if (activeAudience.prompt) {
        headers["x-audience-prompt"] = encodeURIComponent(activeAudience.prompt);
      }

      const sourcesParam = searchSources.length > 0 ? searchSources.join(",") : "github";
      // Fetch from our full-stack endpoint with page parameter
      const queryToUse = (searchMode === "ai" && optimizedQuery) ? optimizedQuery : searchQuery;
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(queryToUse)}&lang=${resolvedLang}&mode=${searchMode}&page=${nextPage}&sources=${sourcesParam}&stream=true&isMobile=${window.innerWidth < 768}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`Failed to retrieve results from server. Status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let data = null;

      if (reader) {
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          
          let eolIndex;
          while ((eolIndex = buffer.indexOf("\n\n")) >= 0) {
            const line = buffer.slice(0, eolIndex);
            buffer = buffer.slice(eolIndex + 2);
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.type === "status") {
                  setLoadingStatus(parsed.message);
                } else if (parsed.type === "error") {
                  setError(parsed.error + (parsed.details ? ` (${parsed.details})` : ""));
                  break;
                } else if (parsed.type === "result") {
                  data = parsed.data;
                }
              } catch (e: any) {
                if (e instanceof SyntaxError) {
                  // Ignore JSON parse errors for incomplete chunks
                } else {
                  throw e; // Re-throw actual API errors
                }
              }
            }
          }
        }
      }
      
      if (!data) throw new Error("No data received");

      const newRepos = data.repositories || [];
      
      if (newRepos.length === 0) {
        setHasMore(false);
      } else {
        setRepositories((prev) => {
          // Prevent duplicates by checking source and id
          const existingKeys = new Set(prev.map((r) => `${r.source}_${r.id}`));
          const filteredNew = newRepos.filter((r: Repository) => !existingKeys.has(`${r.source}_${r.id}`));
          if (filteredNew.length === 0) {
            setHasMore(false);
          }
          return [...prev, ...filteredNew];
        });
        setPage(nextPage);
        if (data.hasMore !== undefined) {
          setHasMore(data.hasMore);
        } else if (newRepos.length < 9) {
          setHasMore(false);
        }
      }
    } catch (err: any) {
      console.log("Load more fetch error:", err);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  };

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (loading || loadingMore || !hasMore || showBookmarks || mode !== "results") return;

    const currentObserverRef = observerRef.current;
    if (!currentObserverRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRepositories();
        }
      },
      { threshold: 0.1, rootMargin: "300px" } // Triggers early for seamless browsing
    );

    observer.observe(currentObserverRef);

    return () => {
      if (currentObserverRef) {
        observer.unobserve(currentObserverRef);
      }
    };
  }, [loading, loadingMore, hasMore, showBookmarks, mode, page, searchQuery, resolvedLang, searchMode, selectedRepo]);

  const handleClearHistory = () => {
    saveHistory([]);
  };

  const handleRemoveHistoryItem = (q: string) => {
    const updated = history.filter((item) => item.query !== q);
    saveHistory(updated);
  };

  const handleToggleBookmark = (repo: Repository) => {
    const isBookmarked = bookmarks.some((b) => b.id === repo.id && b.source === repo.source);
    let updated: Repository[];
    if (isBookmarked) {
      updated = bookmarks.filter((b) => b.id !== repo.id || b.source !== repo.source);
    } else {
      updated = [...bookmarks, repo];
    }
    saveBookmarks(updated);
  };

  const activeLangOption =
    SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];

  const displayedRepos = showBookmarks
    ? bookmarks
    : repositories;

  if (selectedRepo) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900" id="app-root-container">
        <RepoDetailView
          repository={selectedRepo}
          activeEndpoint={getActiveEndpoint()}
          onClose={() => {
            setSelectedRepo(null);
            setSelectedSavedReportDetail(null);
            if (isSharedView) {
              setIsSharedView(false);
              setSharedReportData(null);
              // Clean up share parameter from URL
              const url = new URL(window.location.href);
              url.searchParams.delete("share");
              window.history.replaceState({}, "", url.pathname + url.search);
            }
          }}
          lang={resolvedLang}
          geminiApiKey={geminiApiKey}
          selectedModel={selectedModel}
          personaPrompt={activePersona.prompt}
          audiencePrompt={activeAudience.prompt}
          isBookmarked={bookmarks.some((b) => b.id === selectedRepo.id && b.source === selectedRepo.source)}
          onToggleBookmark={() => handleToggleBookmark(selectedRepo)}
          bypassCache={bypassCache}
          savedDetail={isSharedView ? sharedReportData : selectedSavedReportDetail}
          savedReports={savedReports}
          onSaveReport={(detailData) => handleSaveReport(selectedRepo, detailData)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          customEndpoints={customEndpoints}
          onUpdateCustomEndpoints={(endpoints) => {
            setCustomEndpoints(endpoints);
            localStorage.setItem("oss_custom_endpoints_v1", JSON.stringify(endpoints));
          }}
          selectedEndpointId={selectedEndpointId}
          onSelectEndpointId={(id) => {
            setSelectedEndpointId(id);
            localStorage.setItem("oss_selected_endpoint_id_v1", id);
            // Auto refresh models when endpoint changes
            setTimeout(() => fetchModelsList(), 0);
          }}
          onClose={() => setIsSettingsOpen(false)}
          apiKey={geminiApiKey}
          onSaveApiKey={handleSaveApiKey}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          availableModels={availableModels}
          loading={modelsLoading}
          error={modelsError}
          bypassCache={bypassCache}
          onToggleBypassCache={(val) => {
            setBypassCache(val);
            localStorage.setItem("oss_bypass_cache_v1", String(val));
          }}
          onRefreshModels={(key) => fetchModelsList(key)}
          lang={resolvedLang}
          selectedPersonaId={selectedPersonaId}
          onSelectPersonaId={handleSelectPersonaId}
          customPersonas={customPersonas}
          onUpdateCustomPersonas={handleUpdateCustomPersonas}
          selectedAudienceId={selectedAudienceId}
          onSelectAudienceId={handleSelectAudienceId}
          customAudiences={customAudiences}
          onUpdateCustomAudiences={handleUpdateCustomAudiences}
          searchSources={searchSources}
          onSearchSourcesChange={setSearchSources}
          trendingTimeframe={trendingTimeframe}
          onTrendingTimeframeChange={setTrendingTimeframe}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900" id="app-root-container">
      
      {/* 1. Results / Showcase mode header */}
      {(mode === "results" || mode === "showcase") && (
        <SearchHeader
          query={query}
          onSearch={handleSearch}
          selectedLang={resolvedLang}
          onLangChange={setLang}
          onGoHome={() => {
            setMode("home");
            setQuery("");
            setSearchQuery("");
            setOptimizedQuery("");
            setRepositories([]);
            setAiSummary(null);
            setShowBookmarks(false);
            setShowSavedReports(false);
          }}
          bookmarkedCount={bookmarks.length}
          onShowBookmarks={() => {
            setMode("results");
            setShowBookmarks(!showBookmarks);
            setShowSavedReports(false);
          }}
          showBookmarks={showBookmarks && mode === "results"}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenMagazine={handleOpenMagazine}
          searchMode={searchMode}
          onSearchModeChange={setSearchMode}
          savedReportsCount={savedReports.length}
          onShowSavedReports={() => {
            setMode("results");
            setShowSavedReports(!showSavedReports);
            setShowBookmarks(false);
          }}
          showSavedReports={showSavedReports && mode === "results"}
          onShowShowcase={() => {
            if (mode === "showcase") {
              setMode("home");
            } else {
              setMode("showcase");
              setShowBookmarks(false);
              setShowSavedReports(false);
            }
          }}
          showShowcase={mode === "showcase"}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />
      )}

      {/* 1b. Home mode sticky header */}
      {mode === "home" && (
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3 flex items-center justify-between w-full shadow-sm" id="home-sticky-header">
          <div className="flex items-center space-x-2 select-none">
            <div className="p-1.5 bg-indigo-600 rounded-lg shadow-sm">
              <Search className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-black tracking-tight select-none">
              <span className="text-indigo-600">oss-search</span>
              <span className="text-slate-400 font-medium">-</span>
              <span className="text-slate-600">lab</span>
            </span>
          </div>

          {/* Desktop Right Side Actions */}
          <div className="hidden sm:flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                setMode("showcase");
                setShowBookmarks(false);
                setShowSavedReports(false);
              }}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-600 shadow-sm transition cursor-pointer"
              id="home-sticky-showcase-btn"
            >
              <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="hidden sm:inline">{resolvedLang === "ja" ? "みんなのレポート" : "Showcase"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("results");
                setShowBookmarks(true);
                setShowSavedReports(false);
              }}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-600 shadow-sm transition cursor-pointer"
              id="home-sticky-bookmarks-btn"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="hidden sm:inline">{t.bookmarks} ({bookmarks.length})</span>
              <span className="sm:hidden">{bookmarks.length}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("results");
                setShowSavedReports(true);
                setShowBookmarks(false);
              }}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-600 shadow-sm transition cursor-pointer"
              id="home-sticky-library-btn"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="hidden sm:inline">{resolvedLang === "ja" ? "マイライブラリ" : "My Library"} ({savedReports.length})</span>
              <span className="sm:hidden">{savedReports.length}</span>
            </button>

            {/* Language Selection inside Header */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsHeaderLangOpen(!isHeaderLangOpen)}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 transition cursor-pointer"
                id="home-sticky-lang-btn"
              >
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">{activeLangOption.label}</span>
                <span className="sm:hidden font-mono uppercase">{lang === 'auto' ? '🌐' : lang}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isHeaderLangOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-150 rounded-2xl shadow-xl z-50 py-1.5 overflow-hidden text-left" id="home-sticky-lang-dropdown">
                  {SUPPORTED_LANGUAGES.map((langOption) => (
                    <button
                      key={langOption.code}
                      type="button"
                      onClick={() => {
                        setLang(langOption.code);
                        setIsHeaderLangOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-xs transition flex items-center justify-between ${
                        lang === langOption.code
                          ? "bg-indigo-50 font-bold text-indigo-700"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                      id={`home-sticky-lang-option-${langOption.code}`}
                    >
                      <span>{langOption.label}</span>
                      {lang === langOption.code && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleOpenMagazine}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl text-xs font-bold text-indigo-700 shadow-sm transition cursor-pointer"
              id="home-sticky-magazine-btn"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="hidden sm:inline">{lang === "ja" ? "AI マガジン" : "AI Magazine"}</span>
            </button>
            <a
              href="https://forms.gle/NmUusbUxy4FbWn3L8"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-600 shadow-sm transition cursor-pointer"
              id="home-sticky-feedback-btn"
            >
              <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="hidden sm:inline">{resolvedLang === "ja" ? "フィードバック" : "Feedback"}</span>
            </a>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-600 shadow-sm transition cursor-pointer"
              id="home-sticky-settings-btn"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="hidden sm:inline">{t.settings}</span>
            </button>
          </div>

          {/* Mobile-only menu button */}
          <div className="flex sm:hidden items-center shrink-0">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 transition cursor-pointer"
              id="home-mobile-menu-btn"
              title="Menu"
            >
              <Menu className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </header>
      )}

      {/* Main Body */}
      <main className="flex-1 w-full flex flex-col">
        {mode === "home" ? (
          /* ==================== HOME SCREEN VIEW ==================== */
          <div className="relative flex-1 flex flex-col items-center justify-center p-6" id="home-view-wrapper">

            <div className="w-full max-w-3xl space-y-8 text-center py-12">
              
              {/* Header Title with animated gradient feel */}
              <div className="space-y-3" id="home-title-box">
                <div className="inline-flex items-center space-x-2 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5 text-xs font-semibold text-indigo-700 mx-auto">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>{t.searchTagline}</span>
                </div>
                
                <h1 className="text-4xl xs:text-5xl md:text-6xl font-black tracking-tight select-none whitespace-nowrap flex items-center justify-center" id="brand-logo-display">
                  <span className="text-indigo-600 drop-shadow-sm">oss-search</span>
                  <span className="text-slate-400 font-medium">-</span>
                  <span className="text-slate-800">lab</span>
                </h1>
                
                <p className="text-slate-500 text-sm max-w-md mx-auto" id="brand-tagline">
                  {t.brandDesc}
                </p>
              </div>

              {/* Search Mode and Source Segmented Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2" id="home-controls-container">
                {/* Search Mode Segmented Control */}
                <div className="inline-flex bg-slate-100 p-1 rounded-full border border-slate-200 shadow-sm animate-fade-in" id="home-search-mode-inner">
                  <button
                    type="button"
                    onClick={() => setSearchMode("ai")}
                    className={`px-3 sm:px-5 py-1.5 sm:py-2 text-[10px] xs:text-xs font-bold rounded-full transition flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                      searchMode === "ai"
                        ? "bg-white text-indigo-700 shadow-md font-extrabold"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    id="home-mode-ai-btn"
                  >
                    <Sparkles className={`w-3.5 h-3.5 text-indigo-500 shrink-0 ${searchMode === "ai" ? "animate-pulse" : ""}`} />
                    <span className="whitespace-nowrap">{t.aiSearchMode}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode("plain")}
                    className={`px-3 sm:px-5 py-1.5 sm:py-2 text-[10px] xs:text-xs font-bold rounded-full transition flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                      searchMode === "plain"
                        ? "bg-white text-indigo-700 shadow-md font-extrabold"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    id="home-mode-plain-btn"
                  >
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="whitespace-nowrap">{t.plainSearchMode}</span>
                  </button>
                </div>
              </div>

              {/* Main Elegant Search Bar */}
              <div id="home-search-bar-wrap" className="space-y-3">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  onSearch={handleSearch}
                  history={history}
                  onClearHistory={handleClearHistory}
                  onRemoveHistoryItem={handleRemoveHistoryItem}
                  size="large"
                  lang={resolvedLang}
                />
                <p className="text-slate-400 text-[11px] mt-1.5 max-w-md mx-auto leading-relaxed" id="search-mode-helper-desc">
                  💡 {searchMode === "ai" ? replaceGeminiWithModel(t.aiSearchDesc) : t.plainSearchDesc}
                </p>
              </div>





            </div>

            {/* Dynamic AI-Augmented Trending Section */}
            <div className="pt-10 pb-16 border-t border-slate-200/80 w-full text-left space-y-6 max-w-7xl mx-auto px-4 sm:px-6 md:px-8" id="home-trending-section">
              <div className="flex flex-wrap items-center gap-2 text-indigo-700 font-bold text-sm uppercase tracking-wider" id="trending-section-title">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="whitespace-nowrap">{t.trendingTitle}</span>
                </div>
                <span className="inline-flex items-center bg-indigo-50/80 border border-indigo-100 rounded-full px-2 py-0.5 text-[9px] font-bold text-indigo-600 tracking-normal normal-case">
                  {replaceGeminiWithModel(resolvedLang === "ja" ? "Geminiによる要約" : "Gemini summarized")}
                </span>
              </div>

              {trendingLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3 bg-white border border-slate-150 rounded-2xl p-6" id="trending-loading-spinner">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl animate-spin">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-500">{loadingStatus || t.trendingLoading}</span>
                </div>
              ) : trendingError ? (
                <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl text-xs text-slate-500 text-center" id="trending-error-container">
                  {trendingError}
                </div>
              ) : (
                <div className="space-y-6" id="trending-content-wrapper">
                  {trendingSummary && (
                    <p className="text-slate-600 text-xs bg-indigo-50/60 border border-indigo-100/70 rounded-2xl p-4 leading-relaxed font-medium" id="trending-summary-para">
                      ✨ <span className="font-semibold text-indigo-900">{trendingTitle || t.trendingSummaryTitle}:</span> {trendingSummary}
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="trending-repositories-grid">
                    {trendingRepos.map((repo, index) => {
                      const isBookmarked = bookmarks.some((b) => b.id === repo.id && b.source === repo.source);
                      return (
                        <RepositoryCard
                          key={`${repo.source}_${repo.id}`}
                          repository={repo}
                          rank={index + 1}
                          onDeepDive={handleOpenRepoDetail}
                          isBookmarked={isBookmarked}
                          onToggleBookmark={handleToggleBookmark}
                          lang={resolvedLang}
                          onTagClick={handleTagClick}
                        />
                      );
                    })}
                  </div>

                  {/* Infinite Scroll target and loader indicator for trending */}
                  <div className="pt-4 pb-8 flex flex-col items-center justify-center space-y-2" id="trending-infinite-scroll-container">
                    {trendingLoadingMore && (
                      <div className="flex items-center space-x-2 bg-indigo-50/60 border border-indigo-100/50 rounded-full px-4 py-2 shadow-sm animate-pulse" id="trending-loading-more-spinner">
                        <Sparkles className="w-4 h-4 text-indigo-500 animate-spin" />
                        <span className="text-xs font-semibold text-indigo-700">
                          {loadingStatus || (resolvedLang === "ja" ? "急上昇リポジトリを追加読み込み中..." : "Loading more trending repositories...")}
                        </span>
                      </div>
                    )}
                    
                    {trendingHasMore && trendingRepos.length > 0 && (
                      <div ref={trendingObserverRef} className="h-4 w-full opacity-0" id="trending-infinite-scroll-trigger" />
                    )}

                    {trendingLoadMoreError && (
                      <p className="text-red-500 text-[11px] text-center mt-2 font-medium" id="trending-load-more-error">
                        ⚠️ {resolvedLang === "ja" ? "追加読み込みエラー: " : "Error loading more: "}{trendingLoadMoreError}
                      </p>
                    )}

                    {!trendingHasMore && trendingRepos.length > 0 && (
                      <p className="text-slate-400 text-[11px] text-center mt-2 font-medium" id="trending-no-more-indicator">
                        ✨ {resolvedLang === "ja" ? "すべての急上昇リポジトリを表示しました。" : "You have reached the end of the trending list."}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : mode === "showcase" ? (
          /* ==================== SHOWCASE VIEW ==================== */
          <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6" id="showcase-view-wrapper">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-xl font-bold text-slate-800" id="showcase-title-heading">
                {selectedShowcaseRepo 
                  ? (resolvedLang === "ja" ? "共有されている記事一覧" : "Shared Articles")
                  : (resolvedLang === "ja" ? "みんなのAIレポート" : "Shared AI Reports")}
              </h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-1" id="showcase-subtitle">
                {selectedShowcaseRepo
                  ? (resolvedLang === "ja" 
                      ? `「${selectedShowcaseRepo.fullName}」に対して開発者が共有したレポート一覧です。` 
                      : `List of shared AI reports for ${selectedShowcaseRepo.fullName}.`)
                  : (resolvedLang === "ja" 
                      ? "世界中の開発者が共有した、OSSのAI解析レポート（技術検証特報）が集まる広場です。" 
                      : "Explore AI-generated analysis reports shared by developers worldwide.")}
              </p>
            </div>

            {showcaseLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3 bg-white border border-slate-200 rounded-2xl" id="showcase-loading">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl animate-spin">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-slate-500">
                  {resolvedLang === "ja" ? "レポート一覧を読み込み中..." : "Loading shared reports..."}
                </span>
              </div>
            ) : showcaseList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4 bg-white border border-slate-150 rounded-2xl p-6 text-center" id="showcase-empty">
                <div className="p-4 bg-slate-50 text-slate-400 rounded-full">
                  <Globe className="w-10 h-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-slate-800 font-bold text-sm">
                    {resolvedLang === "ja" ? "共有レポートはまだありません" : "No shared reports yet"}
                  </h3>
                  <p className="text-slate-500 text-xs max-w-xs leading-relaxed">
                    {resolvedLang === "ja" 
                      ? "リポジトリの解析詳細画面にある「みんなに公開」ボタンから、あなたのレポートを最初に共有してみませんか？" 
                      : "Be the first to publish a report using the share button on the repository analysis page!"}
                  </p>
                </div>
              </div>
            ) : (
              (() => {
                // 1. Group by repository
                const groupedRepos: any[] = [];
                showcaseList.forEach((item: any) => {
                  const fullName = item.repo?.fullName || item.repo || "unknown/repo";
                  let existing = groupedRepos.find(g => g.fullName === fullName);
                  if (!existing) {
                    existing = {
                      fullName,
                      repo: item.repo,
                      stars: item.stars || item.repo?.stargazersCount || 0,
                      latestTimestamp: item.timestamp,
                      shares: []
                    };
                    groupedRepos.push(existing);
                  }
                  
                  if (new Date(item.timestamp) > new Date(existing.latestTimestamp)) {
                    existing.latestTimestamp = item.timestamp;
                  }
                  
                  existing.shares.push({
                    id: item.id,
                    title: item.title || item.repo?.aiTitle || (resolvedLang === "ja" ? "AI解析レポート" : "AI Report"),
                    summary: item.summary,
                    timestamp: item.timestamp
                  });
                });

                // 2. Filter by search query
                let filteredRepos = groupedRepos.filter(g => 
                  g.fullName.toLowerCase().includes(showcaseSearch.toLowerCase()) ||
                  (g.repo?.description || "").toLowerCase().includes(showcaseSearch.toLowerCase())
                );

                // 3. Sort
                if (showcaseSort === "stars") {
                  filteredRepos.sort((a, b) => b.stars - a.stars);
                } else if (showcaseSort === "count") {
                  filteredRepos.sort((a, b) => b.shares.length - a.shares.length);
                } else { // "latest"
                  filteredRepos.sort((a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime());
                }

                // Rendering Logic
                if (selectedShowcaseRepo) {
                  // Find selected repository's current shares
                  const currentRepoGroup = groupedRepos.find(g => g.fullName === selectedShowcaseRepo.fullName);
                  const sharesList = currentRepoGroup ? currentRepoGroup.shares : [];

                  return (
                    <div className="space-y-6 animate-fade-in" id="showcase-shares-view">
                      {/* Back header button */}
                      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                        <div className="flex items-center space-x-3">
                          <button
                            type="button"
                            onClick={() => setSelectedShowcaseRepo(null)}
                            className="p-2 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 transition cursor-pointer flex items-center justify-center"
                            id="showcase-back-btn"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <div>
                            <h3 className="font-bold text-slate-800 text-lg sm:text-xl break-all">
                              {selectedShowcaseRepo.fullName}
                            </h3>
                            <div className="flex items-center space-x-2 mt-1">
                              {selectedShowcaseRepo.repo?.language && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 font-mono px-2 py-0.5 rounded-full border border-slate-200/60">
                                  {selectedShowcaseRepo.repo.language}
                                </span>
                              )}
                              <span className="text-xs text-slate-500">
                                {resolvedLang === "ja" ? `共有レポート: ${sharesList.length}件` : `${sharesList.length} shared reports`}
                              </span>
                            </div>
                          </div>
                        </div>

                        {selectedShowcaseRepo.stars > 0 && (
                          <div className="flex items-center space-x-1 text-sm text-amber-500 font-bold bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                            <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                            <span>{selectedShowcaseRepo.stars.toLocaleString()}</span>
                          </div>
                        )}
                      </div>

                      {/* Repository Description (if available) */}
                      {selectedShowcaseRepo.repo?.description && (
                        <p className="text-slate-600 text-xs sm:text-sm bg-slate-50/80 border border-slate-100 rounded-2xl p-4 leading-relaxed">
                          {selectedShowcaseRepo.repo.description}
                        </p>
                      )}

                      {/* Shares Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="showcase-shares-grid">
                        {sharesList.map((share: any) => (
                          <div
                            key={share.id}
                            onClick={() => {
                              setSharedLoading(true);
                              fetch(`/api/share?id=${share.id}`)
                                .then(res => {
                                  if (!res.ok) throw new Error("Failed to fetch shared details");
                                  return res.json();
                                })
                                .then(sharedData => {
                                  const repoObj: Repository = {
                                    id: sharedData.repo?.id || Math.random().toString(),
                                    name: sharedData.repo?.name || sharedData.repo?.fullName?.split("/")[1] || "shared",
                                    fullName: sharedData.repo?.fullName || sharedData.repo || "shared-repo",
                                    source: sharedData.repo?.source || "github",
                                    owner: sharedData.repo?.owner || {
                                      login: (sharedData.repo?.fullName || sharedData.repo || "owner/repo").split("/")[0],
                                      avatarUrl: "",
                                      htmlUrl: ""
                                    },
                                    htmlUrl: sharedData.repo?.htmlUrl || "",
                                    description: sharedData.repo?.description || "",
                                    stargazersCount: sharedData.repo?.stargazersCount || sharedData.stars || 0,
                                    forksCount: sharedData.repo?.forksCount || 0,
                                    watchersCount: sharedData.repo?.watchersCount || 0,
                                    openIssuesCount: sharedData.repo?.openIssuesCount || 0,
                                    language: sharedData.repo?.language || null,
                                    topics: sharedData.repo?.topics || [],
                                    updatedAt: sharedData.repo?.updatedAt || new Date().toISOString(),
                                    createdAt: sharedData.repo?.createdAt || new Date().toISOString(),
                                    aiTitle: sharedData.repo?.aiTitle || "",
                                    aiSummary: sharedData.repo?.aiSummary || "",
                                    aiTags: sharedData.repo?.aiTags || []
                                  };
                                  setSelectedRepo(repoObj);
                                  setSharedReportData(sharedData.data);
                                  setIsSharedView(true);
                                  
                                  // Set URL history so reload works
                                  const url = new URL(window.location.href);
                                  url.searchParams.set("share", share.id);
                                  window.history.pushState({}, "", url.pathname + url.search);
                                })
                                .catch(err => {
                                  console.log("Failed to load details from showcase:", err);
                                  alert(resolvedLang === "ja" ? "レポートの読み込みに失敗したわ。" : "Failed to load report.");
                                })
                                .finally(() => {
                                  setSharedLoading(false);
                                });
                            }}
                            className="bg-white border border-slate-150 rounded-2xl p-5 hover:shadow-md hover:border-indigo-200 transition cursor-pointer flex flex-col justify-between group relative h-full min-h-[160px]"
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {new Date(share.timestamp).toLocaleDateString(resolvedLang === "ja" ? "ja-JP" : "en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}
                                </span>
                                <span className="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full border border-indigo-100/50">
                                  {resolvedLang === "ja" ? "技術特報" : "Report"}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition text-sm sm:text-base leading-snug break-all">
                                  {share.title}
                                </h4>
                                <p className="text-slate-500 text-xs line-clamp-3 leading-relaxed">
                                  {share.summary || (resolvedLang === "ja" ? "AI要約はまだありません。" : "No AI summary available.")}
                                </p>
                              </div>
                            </div>

                            <div className="pt-4 mt-auto border-t border-slate-100 flex items-center justify-end">
                              <span className="text-xs font-bold text-indigo-600 group-hover:translate-x-1 transition flex items-center space-x-1">
                                <span>{resolvedLang === "ja" ? "レポートを読む" : "Read Report"}</span>
                                <span>➔</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6" id="showcase-repos-view">
                    {/* Search and Sort Controls */}
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 border border-slate-150 rounded-2xl p-4" id="showcase-controls">
                      {/* Search Input */}
                      <div className="relative flex-1 w-full">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder={resolvedLang === "ja" ? "リポジトリを検索..." : "Search repositories..."}
                          value={showcaseSearch}
                          onChange={(e) => setShowcaseSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 rounded-xl text-xs font-semibold text-slate-700 shadow-xs outline-none transition"
                          id="showcase-search-input"
                        />
                        {showcaseSearch && (
                          <button
                            type="button"
                            onClick={() => setShowcaseSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Sort Select */}
                      <div className="flex items-center space-x-2 w-full sm:w-auto shrink-0 justify-end">
                        <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                          {resolvedLang === "ja" ? "並び替え:" : "Sort:"}
                        </span>
                        <select
                          value={showcaseSort}
                          onChange={(e: any) => setShowcaseSort(e.target.value)}
                          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-xs outline-none focus:border-indigo-400 cursor-pointer"
                          id="showcase-sort-select"
                        >
                          <option value="latest">{resolvedLang === "ja" ? "最新共有順" : "Latest Shared"}</option>
                          <option value="stars">{resolvedLang === "ja" ? "スター数順" : "Star Count"}</option>
                          <option value="count">{resolvedLang === "ja" ? "レポート数順" : "Report Count"}</option>
                        </select>
                      </div>
                    </div>

                    {/* Empty state for search */}
                    {filteredRepos.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 space-y-3 bg-white border border-slate-150 rounded-2xl text-center" id="showcase-search-empty">
                        <div className="p-3 bg-slate-50 text-slate-400 rounded-full">
                          <Search className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-slate-800 font-bold text-xs">
                            {resolvedLang === "ja" ? "一致するリポジトリが見つかりません" : "No matching repositories"}
                          </h4>
                          <p className="text-slate-500 text-[11px]">
                            {resolvedLang === "ja" ? "検索ワードを変えてみてください。" : "Try adjusting your search keywords."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* Repositories Grid (First Level) */
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="showcase-repos-grid">
                        {filteredRepos.map((group: any) => (
                          <div
                            key={group.fullName}
                            onClick={() => setSelectedShowcaseRepo(group)}
                            className="bg-white border border-slate-155 hover:border-indigo-200 hover:shadow-md rounded-2xl p-5 transition cursor-pointer flex flex-col justify-between group h-full relative min-h-[160px]"
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 font-mono">
                                  {group.repo?.source === "gitlab" ? <Gitlab className="w-3 h-3 text-orange-500" /> : <Github className="w-3 h-3 text-slate-700" />}
                                  <span>{group.repo?.source || "github"}</span>
                                </div>
                                {group.stars > 0 && (
                                  <div className="flex items-center space-x-0.5 text-xs text-amber-500 font-semibold bg-amber-50/50 px-2 py-0.5 rounded-full border border-amber-100/70">
                                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                    <span>{group.stars.toLocaleString()}</span>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-1">
                                <h3 className="font-bold text-slate-800 group-hover:text-indigo-600 transition text-sm sm:text-base leading-snug break-all">
                                  {group.fullName}
                                </h3>
                                <p className="text-slate-500 text-xs line-clamp-3 leading-relaxed">
                                  {group.repo?.description || (resolvedLang === "ja" ? "説明文はありません。" : "No description available.")}
                                </p>
                              </div>
                            </div>

                            <div className="pt-4 mt-auto border-t border-slate-100 flex items-center justify-between">
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-100/50">
                                {resolvedLang === "ja" ? `共有数: ${group.shares.length}件` : `Reports: ${group.shares.length}`}
                              </span>
                              <span className="text-xs font-bold text-indigo-600 group-hover:translate-x-1 transition flex items-center space-x-1">
                                <span>{resolvedLang === "ja" ? "レポート一覧" : "View Reports"}</span>
                                <span>➔</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        ) : (
          /* ==================== SEARCH RESULTS VIEW ==================== */
          <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6" id="results-view-wrapper">
            
            {/* Context bar / query header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 gap-4" id="results-context-bar">
              <div>
                <h2 className="text-xl font-bold text-slate-800" id="results-title-heading">
                  {showBookmarks ? t.bookmarksTitle : `${t.searchResultsFor}: "${searchQuery}"`}
                </h2>
                {!showBookmarks && searchMode === "ai" && optimizedQuery && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2" id="ai-optimized-search-badge-wrapper">
                    <div className="inline-flex items-center space-x-1 bg-indigo-50 border border-indigo-100/70 rounded-full px-2.5 py-0.5 text-[10px] text-indigo-700 font-semibold shadow-sm" id="ai-optimized-search-badge">
                      <Sparkles className="w-3 h-3 text-indigo-500 shrink-0 animate-pulse" />
                      <span>
                        {resolvedLang === "ja"
                          ? `AI検索キーワード最適化: "${optimizedQuery}"`
                          : resolvedLang === "zh"
                          ? `AI 优化的搜索词: "${optimizedQuery}"`
                          : resolvedLang === "es"
                          ? `IA Optimizado: "${optimizedQuery}"`
                          : resolvedLang === "fr"
                          ? `IA Optimisé: "${optimizedQuery}"`
                          : resolvedLang === "de"
                          ? `KI Optimiert: "${optimizedQuery}"`
                          : `AI Optimized: "${optimizedQuery}"`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSearch(searchQuery, "ai", true)}
                      className="inline-flex items-center space-x-1 bg-white hover:bg-indigo-50 text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-all duration-200 cursor-pointer shadow-sm active:scale-95"
                      id="ai-regenerate-search-keywords-btn"
                      title={resolvedLang === "ja" ? "検索キーワードを再生成して再検索" : "Regenerate keywords and re-search"}
                    >
                      <span className="text-[10px] select-none inline-block transform hover:rotate-180 transition-transform duration-500">🔄</span>
                      <span>
                        {resolvedLang === "ja" ? "他のキーワードで再生成" : "Regenerate alternative keywords"}
                      </span>
                    </button>
                  </div>
                )}
                {!showBookmarks && searchMode === "plain" && (
                  <div className="mt-1.5 inline-flex items-center space-x-1 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-0.5 text-[10px] text-slate-600 font-semibold" id="plain-search-badge">
                    <Search className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>
                      {resolvedLang === "ja" ? "通常キーワード検索 (AI要約つき)" : "Plain Keyword Search (with AI Summary)"}
                    </span>
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-1" id="results-subheading">
                  {showBookmarks
                    ? `${t.bookmarks}: ${bookmarks.length}`
                    : ""}
                </p>
              </div>

              {/* Back to Home */}
              <button
                type="button"
                onClick={() => {
                  setMode("home");
                  setQuery("");
                  setSearchQuery("");
                  setOptimizedQuery("");
                  setRepositories([]);
                  setAiSummary(null);
                  setShowBookmarks(false);
                }}
                className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition flex items-center cursor-pointer"
                id="back-to-home-btn"
              >
                {t.backToSearchHome}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </button>
            </div>

            {/* Error alerts */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start space-x-3 text-red-700" id="results-error-alert">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">{t.failedRetrieveResults}</h4>
                  <p className="text-xs text-red-600 mt-1">{error}</p>
                  <button
                    type="button"
                    onClick={() => handleSearch(searchQuery, undefined, true)}
                    className="text-xs font-semibold underline text-red-800 mt-2 hover:text-red-950 transition cursor-pointer"
                    id="error-retry-action"
                  >
                    {t.retrySearch}
                  </button>
                </div>
              </div>
            )}

            {/* Loading block */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 space-y-4" id="results-loading-state">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 animate-spin">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <h3 className="text-base font-bold text-slate-800">{loadingStatus || t.searchingAndSummarizing}</h3>
                  <p className="text-xs text-slate-400 max-w-xs mt-1 mx-auto leading-relaxed">
                    {searchMode === "plain"
                      ? (resolvedLang === "ja" 
                          ? "検索ワードはそのまま使用します" 
                          : "Using plain keywords...")
                      : replaceGeminiWithModel(t.connectingToGithub)}
                  </p>
                </div>
              </div>
            )}

            {/* Content Display */}
            {!loading && !error && (
              <div className="space-y-8" id="results-content-holder">
                {showSavedReports ? (
                  <div className="space-y-6" id="saved-reports-library-view">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-200 pb-4">
                      <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center">
                          <Sparkles className="w-5 h-5 mr-2 text-indigo-600" />
                          {resolvedLang === "ja" ? "マイ・AIレポートライブラリ" : "My AI Reports Library"}
                        </h2>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {resolvedLang === "ja" 
                            ? "ローカルブラウザに永続保存された、Geminiによる詳細解析レポートです。" 
                            : "Detailed analysis reports generated by Gemini and saved locally on your browser."}
                        </p>
                      </div>
                    </div>

                    {savedReports.length === 0 ? (
                      <div className="py-20 text-center max-w-sm mx-auto space-y-4" id="library-empty-state">
                        <div className="w-16 h-16 bg-slate-100 border border-slate-200 rounded-3xl flex items-center justify-center mx-auto">
                          <Save className="w-7 h-7 text-slate-400" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-800">
                            {resolvedLang === "ja" ? "ライブラリは空です" : "Library is Empty"}
                          </h3>
                          <p className="text-xs text-slate-400 mt-1">
                            {resolvedLang === "ja"
                              ? "リポジトリの詳細解析画面にある「レポートを保存」ボタンを押すと、ここに記事が保存されます。"
                              : "Click the 'Save Report' button inside any repository details view to save articles here."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start" id="library-cards-grid">
                        {savedReports.map((report) => {
                          const isExpanded = expandedRepoId === report.id;
                          const articlesCount = report.articles ? report.articles.length : 0;
                          
                          // Display name is simply the repository full name (e.g. Leonxlnx/taste-skill)
                          const displayTitle = report.repository?.fullName || "Unknown Repository";
                          
                          return (
                            <div 
                              key={report.id}
                              className="bg-white border border-slate-150 rounded-3xl p-5 hover:shadow-lg transition duration-300 relative group overflow-hidden flex flex-col justify-between"
                            >
                              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
                              
                              <div className="space-y-4 flex-1">
                                <div className="space-y-1.5 cursor-pointer" onClick={() => setExpandedRepoId(isExpanded ? null : report.id)}>
                                  <div className="flex flex-col gap-1">
                                    <h4 className="font-black text-slate-800 text-base leading-snug hover:text-indigo-600 transition truncate">
                                      {displayTitle}
                                    </h4>
                                  </div>
                                  <p className="text-xs text-slate-500 line-clamp-2 mt-1 italic">
                                    {report.repository?.aiSummary || report.repository?.description || "No description provided"}
                                  </p>
                                </div>

                                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 bg-slate-50/50 rounded-2xl p-2.5 border border-slate-100">
                                  <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1">
                                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                      {report.repository?.stargazersCount?.toLocaleString() || "0"}
                                    </span>
                                    {report.repository?.language && (
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                                        {report.repository.language}
                                      </span>
                                    )}
                                  </div>
                                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg text-[9px] font-bold">
                                    {resolvedLang === "ja" ? `レポート ${articlesCount} 件` : `${articlesCount} Reports`}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => setExpandedRepoId(isExpanded ? null : report.id)}
                                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition flex items-center justify-center gap-1"
                                >
                                  {isExpanded 
                                    ? (resolvedLang === "ja" ? "閉じる" : "Close") 
                                    : (resolvedLang === "ja" ? "レポート一覧を見る" : "View Reports")}
                                  <ChevronDown className={`w-3.5 h-3.5 transition duration-200 ${isExpanded ? "rotate-180 text-indigo-500" : ""}`} />
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReport(report.id)}
                                  className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer border border-transparent hover:border-rose-100"
                                  title={resolvedLang === "ja" ? "このリポジトリをライブラリから削除" : "Delete entire repository from library"}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Articles List inside Accordion */}
                              {isExpanded && report.articles && (
                                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                                  <h5 className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                                    {resolvedLang === "ja" ? "保存された解析レポート一覧" : "Saved Analysis Reports"}
                                  </h5>
                                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {report.articles.map((article) => {
                                      const formattedDate = new Date(article.savedAt).toLocaleString(
                                        resolvedLang === "ja" ? "ja-JP" : "en-US",
                                        {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        }
                                      );
                                      
                                      // Get formatted dynamic fallback title for old reports using the editorial article headline style
                                      const getFallbackTitle = () => {
                                        if (article.detail?.title) return article.detail.title;
                                        const fullName = report.repository?.fullName || "Unknown";
                                        return resolvedLang === "ja" 
                                          ? `世界を熱狂させる「${fullName}」の正体に迫る。その圧倒的ポテンシャルと現実的な技術制約` 
                                          : `Inside ${fullName}: Architectural Auditing, Operational Trade-offs, and Developer Verdict`;
                                      };
                                      
                                      const articleTitle = getFallbackTitle();
                                      const isEditing = editingArticleId === article.id;
                                      
                                      return (
                                        <div 
                                          key={article.id}
                                          className="p-3 bg-slate-50 hover:bg-indigo-50/40 border border-slate-150 rounded-2xl flex flex-col gap-2 cursor-pointer transition group/art relative text-left"
                                          onClick={() => {
                                            if (report.repository) {
                                              handleOpenRepoDetail(report.repository);
                                              setSelectedSavedReportDetail(article.detail);
                                            }
                                          }}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            {isEditing ? (
                                              <input
                                                type="text"
                                                value={editTitleValue}
                                                onChange={(e) => setEditTitleValue(e.target.value)}
                                                onBlur={() => {
                                                  handleRenameArticle(report.id, article.id, editTitleValue);
                                                  setEditingArticleId(null);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") {
                                                    handleRenameArticle(report.id, article.id, editTitleValue);
                                                    setEditingArticleId(null);
                                                  } else if (e.key === "Escape") {
                                                    setEditingArticleId(null);
                                                  }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="font-bold text-xs text-slate-700 bg-white border border-indigo-300 rounded px-2 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                autoFocus
                                              />
                                            ) : (
                                              <div className="font-bold text-xs text-slate-700 leading-snug group-hover/art:text-indigo-600 transition duration-150 flex-1 line-clamp-2 flex items-center gap-1.5">
                                                <span>{articleTitle}</span>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingArticleId(article.id);
                                                    setEditTitleValue(articleTitle);
                                                  }}
                                                  className="opacity-0 group-hover/art:opacity-100 p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition cursor-pointer"
                                                  title={resolvedLang === "ja" ? "タイトルを編集" : "Edit Title"}
                                                >
                                                  <Edit2 className="w-3 h-3" />
                                                </button>
                                              </div>
                                            )}
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteArticle(report.id, article.id);
                                              }}
                                              className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer shrink-0"
                                              title={resolvedLang === "ja" ? "この記事を削除" : "Delete Article"}
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                          
                                          <div className="flex flex-wrap items-center justify-between gap-2 mt-1 pt-1.5 border-t border-slate-100/50">
                                            <div className="flex items-center gap-1 text-[9px] text-slate-400 font-semibold">
                                              <Clock className="w-3 h-3 text-slate-300" />
                                              {formattedDate}
                                            </div>
                                            <div className="flex flex-wrap gap-1 items-center">
                                              {article.modelUsed && (
                                                <span className="bg-white border border-slate-200 text-slate-500 px-1 py-0.5 rounded text-[8px] font-bold tracking-tight">
                                                  🤖 {article.modelUsed.replace("models/", "")}
                                                </span>
                                              )}
                                              {article.personaName && (
                                                <span className="bg-indigo-50 border border-indigo-100 text-indigo-600 px-1 py-0.5 rounded text-[8px] font-bold tracking-tight">
                                                  👤 {article.personaName}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* 1. Global AI Summary Card */}
                    {!showBookmarks && aiSummary && (
                      <AISummaryCard summary={aiSummary} query={searchQuery} lang={resolvedLang} />
                    )}

                    {/* 2. Repositories list / Empty state */}
                    {displayedRepos.length === 0 ? (
                      <div className="py-20 text-center max-w-sm mx-auto space-y-4" id="results-empty-state">
                        <div className="w-16 h-16 bg-slate-100 border border-slate-200 rounded-3xl flex items-center justify-center mx-auto">
                          <Search className="w-7 h-7 text-slate-400" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-800">{t.noResultsTitle}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                            {showBookmarks
                              ? t.bookmarksEmpty
                              : t.noResultsDesc}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4" id="results-listing-container">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                          <Award className="w-4 h-4 mr-1.5 text-slate-400" />
                          {showBookmarks ? t.bookmarkedItems : t.topRankedRepos}
                        </h3>

                        {/* Repository Card Grid Layout */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="repo-cards-grid">
                          {displayedRepos.map((repo, index) => {
                            const isBookmarked = bookmarks.some((b) => b.id === repo.id && b.source === repo.source);
                            return (
                              <RepositoryCard
                                key={`${repo.source}_${repo.id}`}
                                repository={repo}
                                rank={index + 1}
                                onDeepDive={handleOpenRepoDetail}
                                isBookmarked={isBookmarked}
                                onToggleBookmark={handleToggleBookmark}
                                lang={resolvedLang}
                                onTagClick={handleTagClick}
                              />
                            );
                          })}
                        </div>

                        {/* Infinite Scroll target and loader indicator */}
                        {!showBookmarks && (
                          <div className="pt-6 pb-12 flex flex-col items-center justify-center space-y-4" id="infinite-scroll-status-container">
                            {loadingMore && (
                              <div className="flex items-center space-x-2 bg-indigo-50/60 border border-indigo-100/50 rounded-full px-4 py-2 shadow-sm animate-pulse" id="loading-more-spinner">
                                <Sparkles className="w-4 h-4 text-indigo-500 animate-spin" />
                                <span className="text-xs font-semibold text-indigo-700">
                                  {loadingStatus || (resolvedLang === "ja" ? "さらにリポジトリを読み込み中 & AIで分析中..." : "Loading & analyzing more repositories...")}
                                </span>
                              </div>
                            )}
                            
                            {hasMore && (
                              <div ref={observerRef} className="h-4 w-full" id="infinite-scroll-trigger" />
                            )}

                            {!hasMore && displayedRepos.length > 0 && (
                              <p className="text-slate-400 text-xs text-center mt-2 font-medium" id="no-more-results-indicator">
                                ✨ {resolvedLang === "ja" ? "すべての検索結果を表示しました。" : "You have reached the end of the search results."}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

          </div>
        )}
      </main>

      {/* 4. Global AI Engine Settings Dialog */}
      {showMagazine && (
        <MagazineView
          topic={magazineTopic}
          repositories={magazineRepos}
          onClose={() => setShowMagazine(false)}
          lang={resolvedLang}
          geminiApiKey={geminiApiKey}
          activeEndpoint={getActiveEndpoint()}
          selectedModel={selectedModel}
          personaPrompt={activePersona.prompt}
          audiencePrompt={activeAudience.prompt}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        customEndpoints={customEndpoints}
        onUpdateCustomEndpoints={(endpoints) => {
          setCustomEndpoints(endpoints);
          localStorage.setItem("oss_custom_endpoints_v1", JSON.stringify(endpoints));
        }}
        selectedEndpointId={selectedEndpointId}
        onSelectEndpointId={(id) => {
          setSelectedEndpointId(id);
          localStorage.setItem("oss_selected_endpoint_id_v1", id);
          // Auto refresh models when endpoint changes
          setTimeout(() => fetchModelsList(), 0);
        }}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={geminiApiKey}
        onSaveApiKey={handleSaveApiKey}
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
        availableModels={availableModels}
        loading={modelsLoading}
        error={modelsError}
        bypassCache={bypassCache}
        onToggleBypassCache={(val) => {
          setBypassCache(val);
          localStorage.setItem("oss_bypass_cache_v1", String(val));
        }}
        onRefreshModels={(key) => fetchModelsList(key)}
        lang={resolvedLang}
        selectedPersonaId={selectedPersonaId}
        onSelectPersonaId={handleSelectPersonaId}
        customPersonas={customPersonas}
        onUpdateCustomPersonas={handleUpdateCustomPersonas}
        selectedAudienceId={selectedAudienceId}
        onSelectAudienceId={handleSelectAudienceId}
        customAudiences={customAudiences}
        onUpdateCustomAudiences={handleUpdateCustomAudiences}
        searchSources={searchSources}
        onSearchSourcesChange={setSearchSources}
        trendingTimeframe={trendingTimeframe}
        onTrendingTimeframeChange={setTrendingTimeframe}
      />

      {/* Global Minimal Footer */}
      <footer className="py-6 border-t border-slate-200 bg-white shrink-0 text-center flex flex-col items-center gap-2" id="global-footer">
        <p className="text-[11px] text-slate-400 font-mono">
          oss-search-lab &copy; 2026 &bull; Powered by Gemini 3.5 &bull; Real-time GitHub Integration
        </p>
        <a
          href="https://forms.gle/NmUusbUxy4FbWn3L8"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-indigo-500 hover:text-indigo-600 hover:underline font-semibold flex items-center gap-1"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{resolvedLang === "ja" ? "フィードバックを送る" : "Send Feedback"}</span>
        </a>
      </footer>

      {/* Global Mobile Menu Drawer Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 flex justify-end"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div 
            className="w-72 max-w-[85vw] h-full bg-white shadow-2xl p-6 flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <span className="text-sm font-black tracking-tight select-none">
                  <span className="text-indigo-600">oss-search</span>
                  <span className="text-slate-400 font-medium">-</span>
                  <span className="text-slate-600">lab</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Navigation List */}
              <div className="space-y-2">
                {/* Showcase */}
                <button
                  type="button"
                  onClick={() => {
                    setMode("showcase");
                    setShowSavedReports(false);
                    setShowBookmarks(false);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition ${
                    mode === "showcase"
                      ? "bg-indigo-50 text-indigo-700"
                      : "hover:bg-slate-50 text-slate-600"
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Globe className="w-4 h-4 text-slate-400" />
                    <span>{resolvedLang === "ja" ? "みんなのレポート" : "Showcase"}</span>
                  </div>
                </button>

                {/* My Library */}
                <button
                  type="button"
                  onClick={() => {
                    setMode("results");
                    setShowSavedReports(true);
                    setShowBookmarks(false);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition ${
                    showSavedReports
                      ? "bg-indigo-50 text-indigo-700"
                      : "hover:bg-slate-50 text-slate-600"
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span>{resolvedLang === "ja" ? "マイライブラリ" : "My Library"}</span>
                  </div>
                  {savedReports.length > 0 && (
                    <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                      {savedReports.length}
                    </span>
                  )}
                </button>

                {/* Bookmarks */}
                <button
                  type="button"
                  onClick={() => {
                    setMode("results");
                    setShowBookmarks(true);
                    setShowSavedReports(false);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition ${
                    showBookmarks
                      ? "bg-indigo-50 text-indigo-700"
                      : "hover:bg-slate-50 text-slate-600"
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    <span>{t.bookmarks}</span>
                  </div>
                  {bookmarks.length > 0 && (
                    <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                      {bookmarks.length}
                    </span>
                  )}
                </button>

                {/* AI Magazine */}
                <button
                  type="button"
                  onClick={() => {
                    handleOpenMagazine();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2.5 px-4 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span>AI Magazine</span>
                </button>

                {/* Settings */}
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2.5 px-4 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>{t.settings}</span>
                </button>

                {/* Feedback */}
                <a
                  href="https://forms.gle/NmUusbUxy4FbWn3L8"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full flex items-center space-x-2.5 px-4 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <span>{resolvedLang === "ja" ? "フィードバック" : "Feedback"}</span>
                </a>
              </div>
            </div>

            {/* Drawer Footer with Language Selector */}
            <div className="border-t border-slate-100 pt-4">
              <span className="text-[10px] text-slate-400 font-bold block mb-2 uppercase tracking-wider">
                {resolvedLang === "ja" ? "言語設定" : "Language Settings"}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {SUPPORTED_LANGUAGES.map((langOption) => (
                  <button
                    key={langOption.code}
                    type="button"
                    onClick={() => {
                      setLang(langOption.code);
                    }}
                    className={`px-3 py-2 rounded-xl text-[10px] font-bold transition text-center ${
                      lang === langOption.code
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                    }`}
                  >
                    {langOption.label.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
