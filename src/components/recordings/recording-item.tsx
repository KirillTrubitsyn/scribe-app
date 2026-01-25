import Link from "next/link";
import { cn, formatDate, formatDuration } from "@/lib/utils";
import { FileAudio, Loader2 } from "lucide-react";
import type { Recording } from "@/types/database";

interface RecordingItemProps {
  recording: Recording;
  className?: string;
}

type StatusConfig = {
  label: string;
  className: string;
};

const statusMap: Record<string, StatusConfig> = {
  ready: {
    label: "Готово",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  processing: {
    label: "Обработка",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  transcribing: {
    label: "Транскрипция",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  analyzing: {
    label: "Анализ",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  uploading: {
    label: "Загрузка",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  uploaded: {
    label: "Загружено",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  error: {
    label: "Ошибка",
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusMap[status] || statusMap.processing;
  const isLoading = ["processing", "transcribing", "analyzing", "uploading"].includes(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        config.className
      )}
    >
      {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
      {config.label}
    </span>
  );
}

export function RecordingItem({ recording, className }: RecordingItemProps) {
  return (
    <Link
      href={`/recordings/${recording.id}`}
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl",
        "bg-slate-800/30 hover:bg-slate-800/60 transition-colors",
        "border border-transparent hover:border-slate-700/50",
        "group",
        className
      )}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
        <FileAudio className="w-5 h-5 text-orange-400" />
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-white font-medium truncate group-hover:text-orange-400 transition-colors">
          {recording.title}
        </h4>
        <p className="text-slate-400 text-sm">
          {formatDate(recording.created_at)}
          {recording.duration_seconds && (
            <span className="ml-2 text-slate-500">
              {formatDuration(recording.duration_seconds)}
            </span>
          )}
        </p>
      </div>

      <StatusBadge status={recording.status} />
    </Link>
  );
}
