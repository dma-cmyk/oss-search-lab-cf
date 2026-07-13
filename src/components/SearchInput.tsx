import React, { useState, useEffect, useRef } from "react";
import { Search, X, Clock, HelpCircle } from "lucide-react";
import { SearchHistoryItem } from "../types";
import { getUITranslations } from "../lib/translations";

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  onSearch: (query: string) => void;
  placeholder?: string;
  history: SearchHistoryItem[];
  onClearHistory: () => void;
  onRemoveHistoryItem: (query: string) => void;
  suggestions?: string[];
  size?: "large" | "normal";
  lang?: string;
}

export default function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder,
  history,
  onClearHistory,
  onRemoveHistoryItem,
  suggestions = [
    "react",
    "nextjs",
    "typescript",
    "machine learning",
    "tailwindcss",
    "database",
    "state management",
    "docker",
  ],
  size = "normal",
  lang = "en",
}: SearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const t = getUITranslations(lang);
  const resolvedPlaceholder = placeholder || (size === "large" ? t.placeholderSearchLarge : t.placeholderSearch);

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value);
      setIsOpen(false);
    }
  };

  const handleSuggestionClick = (query: string) => {
    onChange(query);
    onSearch(query);
    setIsOpen(false);
  };

  const hasHistory = history && history.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto" id="search-input-container">
      <form onSubmit={handleSubmit} className="relative z-25">
        <div
          className={`flex items-center w-full bg-white border border-slate-200 hover:border-slate-300 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100/70 transition-all overflow-hidden shadow-sm hover:shadow-md ${
            value.split("\n").length > 1 ? "rounded-2xl" : "rounded-full"
          } ${
            size === "large" ? "py-3 px-6" : "py-2 px-4"
          }`}
          id="search-bar-frame"
        >
          <Search className="text-slate-400 w-5 h-5 mr-3 shrink-0 align-self-start mt-1" />
          <textarea
            className="w-full bg-transparent text-slate-800 text-sm sm:text-base placeholder:text-[11px] sm:placeholder:text-sm md:placeholder:text-base placeholder-slate-400 focus:outline-none py-1 resize-none min-h-[24px] max-h-[120px] overflow-y-auto"
            placeholder={resolvedPlaceholder}
            value={value}
            rows={Math.min(4, value.split("\n").length || 1)}
            onChange={(e) => {
              onChange(e.target.value);
              setIsOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (value.trim()) {
                  onSearch(value);
                  setIsOpen(false);
                }
              }
            }}
            onFocus={() => setIsOpen(true)}
            id="search-text-field"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setIsOpen(true);
              }}
              className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 mr-1 shrink-0 transition self-center"
              id="clear-search-btn"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            className={`font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition active:scale-95 shrink-0 self-center ${
              size === "large" ? "px-6 py-2 text-sm" : "px-4 py-1.5 text-xs"
            }`}
            id="search-trigger-btn"
          >
            {t.searchBtn}
          </button>
        </div>
      </form>

      {/* Autocomplete / History Dropdown */}
      {isOpen && (value.trim() || hasHistory) && (
        <div
          className="absolute left-0 right-0 mt-2 bg-white border border-slate-150 rounded-2xl shadow-xl z-20 overflow-hidden py-2"
          id="search-dropdown-menu"
        >
          {/* Active typed suggestions or general recommendations */}
          {!value.trim() && hasHistory && (
            <div id="search-history-section">
              <div className="flex items-center justify-between px-4 py-1 text-xs font-semibold text-slate-400 tracking-wider uppercase">
                <span className="flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1" /> {t.history}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearHistory();
                  }}
                  className="hover:text-indigo-600 transition cursor-pointer"
                  id="clear-all-history-btn"
                >
                  {t.clearAll}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto mt-1">
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-4 py-2 hover:bg-slate-50 cursor-pointer transition text-slate-700 text-sm"
                    onClick={() => handleSuggestionClick(item.query)}
                    id={`history-item-${idx}`}
                  >
                    <span className="flex items-center truncate">
                      <Clock className="w-4 h-4 mr-3 text-slate-400 shrink-0" />
                      <span className="truncate">{item.query}</span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveHistoryItem(item.query);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:bg-slate-150 hover:text-red-500 transition"
                      id={`remove-history-item-btn-${idx}`}
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 my-2"></div>
            </div>
          )}

          {/* Core Suggestions */}
          <div>
            <div className="flex items-center px-4 py-1 text-xs font-semibold text-slate-400 tracking-wider uppercase">
              <span className="flex items-center">
                <HelpCircle className="w-3.5 h-3.5 mr-1" /> Recommended Keywords
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 px-3 mt-1">
              {suggestions
                .filter((s) => s.toLowerCase().includes(value.toLowerCase()))
                .slice(0, 8)
                .map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSuggestionClick(sug)}
                    className="flex items-center px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 rounded-xl transition text-left w-full"
                    id={`suggestion-pill-${idx}`}
                  >
                    <Search className="w-3.5 h-3.5 mr-2.5 text-slate-400 shrink-0" />
                    <span className="truncate">{sug}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
