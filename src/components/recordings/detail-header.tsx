"use client";

import Link from "next/link";
import { ChevronRight, Calendar, Clock, Users, FileAudio, Download } from "lucide-react";
import { formatDate, formatDuration } from "@/lib/utils";
import type { Recording, Speaker } from "@/types/database";

interface DetailHeaderProps {
  recording: Recording;
  speakers: Speaker[];
  onDownloadAudio?: () => void;
}

export function DetailHeader({ recording, speakers, onDownloadAudio }: DetailHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-slate-400">
        <Link
          href="/recordings"
          className="hover:text-white transition-colors"
        >
          Записи
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-white truncate max-w-[200px] sm:max-w-[300px]">
          {recording.title}
        </span>
      </nav>

      {/* Title + Download button */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white truncate">
            {recording.title}
          </h1>
        </div>
        {onDownloadAudio && (
          <button
            onClick={onDownloadAudio}
            disabled={recording.status === "uploading"}
            className="shrink-0 flex items-center justify-center gap-2 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Скачать аудио"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Скачать аудио</span>
          </button>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(recording.created_at)}</span>
        </div>

        {recording.duration_seconds && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            <span>{formatDuration(recording.duration_seconds)}</span>
          </div>
        )}

        {speakers.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            <span>
              {speakers.length} {getSpeakerLabel(speakers.length)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <FileAudio className="w-4 h-4" />
          <span>{recording.file_name}</span>
        </div>
      </div>
    </div>
  );
}

function getSpeakerLabel(count: number): string {
  if (count === 1) return "участник";
  if (count >= 2 && count <= 4) return "участника";
  return "участников";
}
