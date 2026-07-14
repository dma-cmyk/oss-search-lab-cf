import React, { useState } from "react";
import { Search, Globe, ChevronDown, BookOpen, Settings, Sparkles, Github, Gitlab, Menu, X, MessageSquare } from "lucide-react";
import { SUPPORTED_LANGUAGES, LanguageOption } from "../types";
import { getUITranslations } from "../lib/translations";

interface SearchHeaderProps {
  query: string;
  onSearch: (q: string, overrideMode?: "ai" | "plain") => void;
  selectedLang: string;
  onLangChange: (lang: string) => void;
  onGoHome: () => void;
  bookmarkedCount: number;
  onShowBookmarks: () => void;
  showBookmarks: boolean;
  onOpenSettings: () => void;
  onOpenMagazine: () => void;
  searchMode: "ai" | "plain";
  onSearchModeChange: (mode: "ai" | "plain") => void;
  savedReportsCount: number;
  onShowSavedReports: () => void;
  showSavedReports: boolean;
  onShowShowcase: () => void;
  showShowcase: boolean;
  onOpenMobileMenu: () => void;
}

export default function SearchHeader({
  query,
  onSearch,
  selectedLang,
  onLangChange,
  onGoHome,
  bookmarkedCount,
  onShowBookmarks,
  showBookmarks,
  onOpenSettings,
  onOpenMagazine,
  searchMode,
  onSearchModeChange,
  savedReportsCount,
  onShowSavedReports,
  showSavedReports,
  onShowShowcase,
  showShowcase,
  onOpenMobileMenu,
}: SearchHeaderProps) {
  const [inputVal, setInputVal] = useState(query);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  const t = getUITranslations(selectedLang);

  const activeLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === selectedLang) || SUPPORTED_LANGUAGES[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      onSearch(inputVal);
    }
  };

  return (
    <header
      className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 sm:px-6 py-3"
      id="search-header-container"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Top Row: Logo (always visible) and Actions on mobile */}
        <div className="flex items-center justify-between w-full md:w-auto">
          {/* Micro Logo */}
          <div
            onClick={onGoHome}
            className="flex items-center space-x-2 cursor-pointer select-none group shrink-0"
            id="header-logo-group"
          >
            <div className="p-1.5 bg-indigo-600 rounded-lg group-hover:bg-indigo-700 transition">
              <Search className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-black tracking-tight select-none flex items-center">
              <span className="text-indigo-600">oss-search</span>
              <span className="text-slate-400 font-medium">-</span>
              <span className="text-slate-600">lab</span>
            </span>
          </div>

          {/* Action buttons (only visible here on mobile) */}
          <div className="flex sm:hidden items-center shrink-0" id="header-mobile-actions">
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 transition cursor-pointer"
              id="header-mobile-menu-btn"
              title="Menu"
            >
              <Menu className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Middle/Bottom section: Input search on mobile (full width), desktop (middle) */}
        <div className="flex-1 w-full md:max-w-2xl flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
          <form onSubmit={handleSubmit} className="w-full sm:flex-1" id="header-search-form">
            <div className={`flex items-center bg-slate-50 border border-slate-200 hover:border-slate-300 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition px-3 sm:px-4 py-1.5 shadow-inner ${
              inputVal.split("\n").length > 1 ? "rounded-xl" : "rounded-full"
            }`}>
              <textarea
                className="w-full bg-transparent text-slate-700 text-xs sm:text-sm placeholder:text-[10px] sm:placeholder:text-xs md:placeholder:text-sm focus:outline-none resize-none min-h-[20px] max-h-[80px] overflow-y-auto"
                value={inputVal}
                rows={Math.min(3, inputVal.split("\n").length || 1)}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (inputVal.trim()) {
                      onSearch(inputVal);
                    }
                  }
                }}
                placeholder={t.placeholderSearch}
                id="header-search-input"
              />
              <button type="submit" className="text-slate-400 hover:text-indigo-600 p-0.5 ml-2 transition self-center shrink-0">
                <Search className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Segmented Mode Switcher */}
          <div className="flex bg-slate-100 p-0.5 rounded-full border border-slate-200/60 shrink-0 self-center sm:self-auto" id="header-search-mode-switcher">
            <button
              type="button"
              onClick={() => {
                onSearchModeChange("ai");
                if (inputVal.trim() && searchMode !== "ai") {
                  onSearch(inputVal, "ai");
                }
              }}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-1.5 text-xs font-bold rounded-full transition flex items-center space-x-1 ${
                searchMode === "ai"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              title={t.aiSearchDesc}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="text-[10px] sm:text-[11px]">AI</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSearchModeChange("plain");
                if (inputVal.trim() && searchMode !== "plain") {
                  onSearch(inputVal, "plain");
                }
              }}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-1.5 text-xs font-bold rounded-full transition flex items-center space-x-1 ${
                searchMode === "plain"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              title={t.plainSearchDesc}
            >
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[10px] sm:text-[11px]">{selectedLang === "ja" ? "通常" : "Plain"}</span>
            </button>
          </div>
        </div>

        {/* Right Side Actions on Desktop (hidden on mobile) */}
        <div className="hidden sm:flex items-center space-x-3 shrink-0" id="header-desktop-actions">

          {/* Showcase Toggle button */}
          <button
            type="button"
            onClick={onShowShowcase}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              showShowcase
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            id="header-showcase-toggle-btn"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{selectedLang === "ja" ? "みんなのレポート" : "Showcase"}</span>
          </button>

          {/* Bookmarks Toggle button */}
          <button
            type="button"
            onClick={onShowBookmarks}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              showBookmarks
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            id="header-bookmarks-toggle-btn"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t.bookmarks}</span>
            {bookmarkedCount > 0 && (
              <span
                className={`flex items-center justify-center rounded-full text-[10px] w-4 h-4 font-mono font-bold ${
                  showBookmarks ? "bg-white text-indigo-700" : "bg-indigo-600 text-white"
                }`}
              >
                {bookmarkedCount}
              </span>
            )}
          </button>

          {/* Saved Reports Library Button */}
          <button
            type="button"
            onClick={onShowSavedReports}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              showSavedReports
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            id="header-saved-reports-toggle-btn"
          >
            <Sparkles className={`w-3.5 h-3.5 ${showSavedReports ? "text-white" : "text-indigo-500"}`} />
            <span>{selectedLang === "ja" ? "マイライブラリ" : "My Library"}</span>
            {savedReportsCount > 0 && (
              <span
                className={`flex items-center justify-center rounded-full text-[10px] w-4 h-4 font-mono font-bold ${
                  showSavedReports ? "bg-white text-indigo-700" : "bg-indigo-600 text-white"
                }`}
              >
                {savedReportsCount}
              </span>
            )}
          </button>

          {/* Language Switcher Dropdown */}
          <div className="relative" id="header-lang-switcher">
            <button
              type="button"
              onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-600 shadow-sm transition cursor-pointer"
              id="header-lang-btn"
            >
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>{activeLang.label.split(" ")[0]}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isLangDropdownOpen && (
              <div
                className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-150 rounded-xl shadow-lg z-50 py-1.5 overflow-hidden"
                id="header-lang-dropdown"
              >
                {SUPPORTED_LANGUAGES.map((langOption) => (
                  <button
                    key={langOption.code}
                    type="button"
                    onClick={() => {
                      onLangChange(langOption.code);
                      setIsLangDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-xs transition flex items-center justify-between ${
                      selectedLang === langOption.code
                        ? "bg-indigo-50 font-bold text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                    id={`header-lang-option-${langOption.code}`}
                  >
                    <span>{langOption.label}</span>
                    {selectedLang === langOption.code && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Feedback Button */}
          <a
            href="https://forms.gle/NmUusbUxy4FbWn3L8"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 shadow-sm transition cursor-pointer"
            id="header-feedback-btn"
          >
            <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
            <span>{selectedLang === "ja" ? "フィードバック" : "Feedback"}</span>
          </a>

          {/* Settings button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 shadow-sm transition cursor-pointer"
            id="header-settings-btn"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>{t.settings}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
