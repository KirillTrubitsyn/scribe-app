"use client";

import {
  Download,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
    <div className="space-y-6">
      {/* Export Section */}
      <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30">
        <h3 className="text-lg font-medium text-white mb-4">Экспорт</h3>

        <div className="space-y-2">
          <SidebarButton
            onClick={onDownloadAudio}
            icon={<Download className="w-4 h-4" />}
            disabled={recording.status === "uploading"}
          >
            Скачать аудио
          </SidebarButton>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          Экспорт в DOCX доступен в каждой вкладке (Транскрипт, Резюме, Протокол)
        </p>
      </div>

      {/* AI Analysis Section */}
      {onAIAnalysis && !hasSummary && recording.status === "ready" && (
        <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-xl p-5 border border-orange-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-medium text-white">AI-анализ</h3>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Получите краткое содержание, ключевые решения и список задач
          </p>
          <SidebarButton
            onClick={onAIAnalysis}
            icon={
              isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )
            }
            variant="primary"
            disabled={isAnalyzing}
          >
            {isAnalyzing ? "Анализируем..." : "Запустить анализ"}
          </SidebarButton>
        </div>
      )}

    </div>
  );
}

interface SidebarButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  title?: string;
}

function SidebarButton({
  onClick,
  icon,
  children,
  variant = "default",
  disabled = false,
  title,
}: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "default" &&
          "bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white",
        variant === "primary" &&
          "bg-orange-500 text-white hover:bg-orange-400 shadow-lg shadow-orange-500/20",
        variant === "danger" &&
          "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
      )}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
