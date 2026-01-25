"use client";

import { useRouter } from "next/navigation";
import { cn, formatDate, formatDuration } from "@/lib/utils";
import { FileAudio, MoreHorizontal, Trash2, Download, Edit, Loader2 } from "lucide-react";
import { StatusBadge } from "./status-badge";
import type { Recording, RecordingStatus } from "@/types/database";
import { useState, useRef, useEffect } from "react";

export type RecordingWithRelations = Recording & {
  transcripts?: { word_count: number }[] | null;
  speakers?: { count: number }[] | null;
};

interface RecordingsTableProps {
  recordings: RecordingWithRelations[];
  className?: string;
}

function ActionMenu({ recordingId, onDeleted }: { recordingId: string; onDeleted: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setIsDownloading(true);

    try {
      const response = await fetch(`/api/recordings/${recordingId}/download`);
      if (!response.ok) {
        throw new Error("Failed to get download URL");
      }

      const { url, fileName } = await response.json();

      // Create a temporary link and trigger download
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Не удалось скачать запись");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);

    if (!confirm("Вы уверены, что хотите удалить эту запись?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/recordings/${recordingId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete recording");
      }

      onDeleted();
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Не удалось удалить запись");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "p-2 rounded-lg transition-colors",
          "text-slate-400 hover:text-white hover:bg-slate-700/50"
        )}
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-10 w-48 py-1 rounded-lg bg-slate-800 border border-slate-700 shadow-xl">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              // TODO: Implement rename
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white"
          >
            <Edit className="w-4 h-4" />
            Переименовать
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white disabled:opacity-50"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isDownloading ? "Загрузка..." : "Скачать"}
          </button>
          <hr className="my-1 border-slate-700" />
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {isDeleting ? "Удаление..." : "Удалить"}
          </button>
        </div>
      )}
    </div>
  );
}

function getSpeakersCount(speakers: { count: number }[] | null | undefined): number {
  if (!speakers || speakers.length === 0) return 0;
  return speakers[0]?.count ?? 0;
}

export function RecordingsTable({ recordings, className }: RecordingsTableProps) {
  const router = useRouter();

  const handleRowClick = (recordingId: string) => {
    router.push(`/recordings/${recordingId}`);
  };

  const handleRecordingDeleted = () => {
    router.refresh();
  };

  if (recordings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
          <FileAudio className="w-8 h-8 text-slate-500" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">Нет записей</h3>
        <p className="text-slate-400 text-sm">
          Загрузите аудиофайл, чтобы начать работу
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-slate-700/50", className)}>
      <table className="w-full">
        <thead className="overflow-hidden rounded-t-xl">
          <tr className="bg-slate-800/50 border-b border-slate-700/50">
            <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">
              Название
            </th>
            <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">
              Дата
            </th>
            <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">
              Длительность
            </th>
            <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">
              Спикеры
            </th>
            <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">
              Статус
            </th>
            <th className="w-12 px-6 py-4"></th>
          </tr>
        </thead>
        <tbody>
          {recordings.map((recording) => (
            <tr
              key={recording.id}
              onClick={() => handleRowClick(recording.id)}
              className={cn(
                "border-b border-slate-700/30 last:border-0",
                "hover:bg-slate-800/50 transition-colors cursor-pointer",
                "group"
              )}
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
                    <FileAudio className="w-5 h-5 text-orange-400" />
                  </div>
                  <span className="font-medium text-white group-hover:text-orange-400 transition-colors truncate max-w-[300px]">
                    {recording.title}
                  </span>
                </div>
              </td>
              <td className="px-6 py-4 text-slate-400 text-sm">
                {formatDate(recording.created_at)}
              </td>
              <td className="px-6 py-4 text-slate-400 text-sm">
                {recording.duration_seconds
                  ? formatDuration(recording.duration_seconds)
                  : "—"}
              </td>
              <td className="px-6 py-4 text-slate-400 text-sm">
                {getSpeakersCount(recording.speakers) || "—"}
              </td>
              <td className="px-6 py-4">
                <StatusBadge status={recording.status} />
              </td>
              <td className="px-6 py-4">
                <ActionMenu recordingId={recording.id} onDeleted={handleRecordingDeleted} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
