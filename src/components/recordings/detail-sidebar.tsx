"use client";

import { useState } from "react";
import {
  Download,
  FileText,
  Trash2,
  Loader2,
  FileAudio,
  Clock,
  HardDrive,
  Calendar,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { cn, formatDate, formatDuration, formatFileSize } from "@/lib/utils";
import type { Recording, Transcript, Artifact } from "@/types/database";

interface DetailSidebarProps {
  recording: Recording;
  transcript: Transcript | null;
  artifacts: Artifact[];
  onDownloadAudio: () => void;
  onDelete: () => void;
  onAIAnalysis?: () => void;
  isDeleting?: boolean;
  isAnalyzing?: boolean;
}

export function DetailSidebar({
  recording,
  transcript,
  artifacts,
  onDownloadAudio,
  onDelete,
  onAIAnalysis,
  isDeleting = false,
  isAnalyzing = false,
}: DetailSidebarProps) {
  const hasSummary = artifacts.some((a) => a.type === "summary");

  return (
    <div className="space-y-6">
      {/* File Info Card */}
      <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30">
        <h3 className="text-lg font-medium text-white mb-4">
          Информация о файле
        </h3>

        <dl className="space-y-3">
          <InfoItem
            icon={<FileAudio className="w-4 h-4" />}
            label="Файл"
            value={recording.file_name}
            truncate
          />
          <InfoItem
            icon={<HardDrive className="w-4 h-4" />}
            label="Размер"
            value={formatFileSize(recording.file_size)}
          />
          {recording.duration_seconds && (
            <InfoItem
              icon={<Clock className="w-4 h-4" />}
              label="Длительность"
              value={formatDuration(recording.duration_seconds)}
            />
          )}
          <InfoItem
            icon={<Calendar className="w-4 h-4" />}
            label="Дата загрузки"
            value={formatDate(recording.created_at)}
          />
          {transcript && (
            <InfoItem
              icon={<FileText className="w-4 h-4" />}
              label="Слов в транскрипте"
              value={transcript.word_count.toLocaleString("ru-RU")}
            />
          )}
        </dl>
      </div>

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

      {/* Danger Zone */}
      <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30">
        <h3 className="text-lg font-medium text-white mb-4">Опасная зона</h3>

        <SidebarButton
          onClick={onDelete}
          icon={
            isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )
          }
          variant="danger"
          disabled={isDeleting}
        >
          {isDeleting ? "Удаление..." : "Удалить запись"}
        </SidebarButton>

        <p className="text-xs text-slate-500 mt-2">
          Это действие нельзя отменить. Будут удалены запись, транскрипт и все
          связанные данные.
        </p>
      </div>
    </div>
  );
}

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  truncate?: boolean;
}

function InfoItem({ icon, label, value, truncate }: InfoItemProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-slate-500 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd
          className={cn("text-sm text-slate-300 mt-0.5", truncate && "truncate")}
          title={truncate ? String(value) : undefined}
        >
          {value}
        </dd>
      </div>
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
