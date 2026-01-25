import Link from "next/link";
import { RecordingItem } from "./recording-item";
import type { Recording } from "@/types/database";
import { ArrowRight, FileAudio } from "lucide-react";

interface RecentListProps {
  recordings: Recording[];
}

export function RecentList({ recordings }: RecentListProps) {
  if (recordings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
          <FileAudio className="w-8 h-8 text-slate-500" />
        </div>
        <h3 className="text-white font-medium mb-2">Нет записей</h3>
        <p className="text-slate-400 text-sm">
          Загрузите аудиофайл, чтобы начать
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Недавние записи</h2>
        <Link
          href="/recordings"
          className="text-sm text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1"
        >
          Все записи
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="space-y-2">
        {recordings.map((recording) => (
          <RecordingItem key={recording.id} recording={recording} />
        ))}
      </div>
    </div>
  );
}
