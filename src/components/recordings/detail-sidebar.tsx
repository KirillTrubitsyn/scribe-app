"use client";

import {
  Loader2,
  Sparkles,
} from "lucide-react";
import type { Recording, Artifact } from "@/types/database";

interface DetailSidebarProps {
  recording: Recording;
  artifacts: Artifact[];
  onAIAnalysis?: () => void;
  isAnalyzing?: boolean;
}

export function DetailSidebar({
  recording,
  artifacts,
  onAIAnalysis,
  isAnalyzing = false,
}: DetailSidebarProps) {
  const hasSummary = artifacts.some((a) => a.type === "summary");

  // Only render if there's content to show
  if (!onAIAnalysis || hasSummary || recording.status !== "ready") {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-xl p-4 border border-orange-500/20">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-orange-500" />
        <span className="text-sm font-medium text-white">AI-анализ</span>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Краткое содержание, решения и задачи
      </p>
      <button
        onClick={onAIAnalysis}
        disabled={isAnalyzing}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-500/20"
      >
        {isAnalyzing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {isAnalyzing ? "Анализируем..." : "Запустить"}
      </button>
    </div>
  );
}
