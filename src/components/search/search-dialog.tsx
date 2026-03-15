"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, FileText, Clock } from "lucide-react";

interface SearchResult {
  id: string;
  recording_id: string;
  chunk_index: number;
  text: string;
  start_time: number | null;
  end_time: number | null;
  speaker: string | null;
  similarity: number;
  recording_title: string;
  recording_date: string | null;
}

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function highlightMatch(text: string, query: string): string {
  if (!query || query.length < 3) return text;
  // Truncate text for display
  const truncated = text.length > 300 ? text.slice(0, 300) + "..." : text;
  return truncated;
}

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
      setHasSearched(false);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const search = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, limit: 15 }),
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
      }
    } catch {
      // Ignore search errors
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 500);
  };

  const handleResultClick = (result: SearchResult) => {
    onClose();
    router.push(`/recordings/${result.recording_id}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl mx-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Поиск по записям..."
            className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-lg"
          />
          {isSearching && <Loader2 className="w-5 h-5 text-orange-400 animate-spin shrink-0" />}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length > 0 ? (
            <div className="py-2">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleResultClick(result)}
                  className="w-full text-left px-5 py-3 hover:bg-slate-800/70 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-orange-400 shrink-0" />
                    <span className="text-sm font-medium text-orange-400 truncate">
                      {result.recording_title}
                    </span>
                    {result.start_time != null && (
                      <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatTime(result.start_time)}
                      </span>
                    )}
                    <span className="text-xs text-slate-600 ml-auto shrink-0">
                      {Math.round(result.similarity * 100)}%
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 line-clamp-2 leading-relaxed">
                    {highlightMatch(result.text, query)}
                  </p>
                  {result.speaker && result.speaker !== "multiple" && (
                    <span className="inline-block mt-1 text-xs text-slate-500">
                      {result.speaker}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : hasSearched && !isSearching ? (
            <div className="py-12 text-center text-slate-500">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>Ничего не найдено</p>
              <p className="text-sm mt-1">Попробуйте другой запрос</p>
            </div>
          ) : !hasSearched ? (
            <div className="py-12 text-center text-slate-500">
              <p className="text-sm">Введите запрос для семантического поиска по записям</p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-600">
          <span>Семантический поиск по транскриптам</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">ESC</kbd>
        </div>
      </div>
    </div>
  );
}
