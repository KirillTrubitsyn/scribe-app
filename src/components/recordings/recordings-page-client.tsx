"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { RecordingsTable, type RecordingWithRelations } from "./recordings-table";
import { UploadModal } from "./upload-modal";

interface RecordingsPageClientProps {
  recordings: RecordingWithRelations[];
}

function calculateTotalDuration(recordings: RecordingWithRelations[]): number {
  return recordings.reduce((acc, r) => acc + (r.duration_seconds || 0), 0);
}

function formatTotalHours(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 1) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} мин.`;
  }
  return `${hours.toFixed(1)} ч.`;
}

export function RecordingsPageClient({ recordings }: RecordingsPageClientProps) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const totalCount = recordings.length;
  const totalDuration = calculateTotalDuration(recordings);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Записи</h1>
            <p className="text-slate-400 mt-1">
              Всего {totalCount} записей &bull; {formatTotalHours(totalDuration)}
            </p>
          </div>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all hover:scale-[1.02]"
          >
            <Plus className="w-5 h-5" />
            Загрузить
          </button>
        </div>

        {/* Table */}
        <RecordingsTable recordings={recordings} />
      </div>

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
    </>
  );
}
