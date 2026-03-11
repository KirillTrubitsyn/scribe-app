import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { RecordingStatus } from "@/types/database";

interface StatusBadgeProps {
  status: RecordingStatus;
  className?: string;
}

type StatusConfig = {
  label: string;
  className: string;
};

const statusMap: Record<RecordingStatus, StatusConfig> = {
  recording: {
    label: "Запись",
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
  ready: {
    label: "Готово",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  processing: {
    label: "Обработка",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  transcribing: {
    label: "Обработка",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  analyzing: {
    label: "Обработка",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  uploading: {
    label: "Загрузка",
    className: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  },
  uploaded: {
    label: "Загрузка",
    className: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  },
  error: {
    label: "Ошибка",
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
};

const loadingStatuses: RecordingStatus[] = [
  "processing",
  "transcribing",
  "analyzing",
  "uploading",
];

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusMap[status] || statusMap.processing;
  const isLoading = loadingStatuses.includes(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
        config.className,
        className
      )}
    >
      {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
      {config.label}
    </span>
  );
}
