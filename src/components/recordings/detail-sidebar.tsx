"use client";

import {
  Download,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { Recording, Transcript, Artifact } from "@/types/database";

interface DetailSidebarProps {
  recording: Recording;
  transcript: Transcript | null;
  artifacts: Artifact[];
  onDownloadAudio: () => void;
  onAIAnalysis?: () => void;
  isAnalyzing?: boolean;
}

export function DetailSidebar({
  recording,
  transcript,
  artifacts,
  onDownloadAudio,
  onAIAnalysis,
  isAnalyzing = false,
}: DetailSidebarProps) {
  const hasSummary = artifacts.some((a) => a.type === "summary");

  return (
    <div className="space-y-4">
      {/* Compact Audio Export Button */}
      <button
        onClick={onDownloadAudio}
        disabled={recording.status === "uploading"}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="w-4 h-4" />
        <span>Скачать аудио</span>
      </button>

      {/* AI Analysis Section */}
      {onAIAnalysis && !hasSummary && recording.status === "ready" && (
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
      )}
    </div>
  );
}
