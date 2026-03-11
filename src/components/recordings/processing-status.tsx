"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { XCircle, RefreshCw, ArrowLeft } from "lucide-react";
import { TranscriptionSpinner } from "@/components/ui/audio-spinner";
import type { RecordingStatus } from "@/types/database";

interface ProcessingStatusProps {
  status: RecordingStatus;
  errorMessage?: string | null;
  onRetry?: () => void;
}

const STATUS_LABELS: Record<RecordingStatus, { label: string; description: string }> = {
  recording: { label: "Идёт запись", description: "Аудио записывается и транскрибируется в реальном времени" },
  uploading: { label: "Загрузка файла", description: "Файл загружается на сервер" },
  uploaded: { label: "Файл загружен", description: "Подготовка к обработке" },
  processing: { label: "Обработка аудио", description: "Подготовка аудио для транскрибации" },
  transcribing: { label: "Транскрибация", description: "Распознавание речи и создание транскрипта" },
  analyzing: { label: "AI-анализ", description: "Создание резюме и выделение ключевых моментов" },
  ready: { label: "Готово", description: "Запись полностью обработана" },
  error: { label: "Ошибка", description: "Произошла ошибка при обработке" },
};

export function ProcessingStatus({
  status,
  errorMessage,
  onRetry,
}: ProcessingStatusProps) {
  const [dots, setDots] = useState("");

  // Animate dots for processing states
  useEffect(() => {
    if (status === "ready" || status === "error") return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);

    return () => clearInterval(interval);
  }, [status]);

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">
          Ошибка обработки
        </h2>

        <p className="text-slate-400 text-center max-w-md mb-6">
          {errorMessage || "Произошла ошибка при обработке записи"}
        </p>

        <div className="flex items-center gap-4">
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-400 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Повторить
            </button>
          )}

          <Link
            href="/recordings"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            К списку записей
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Animated audio transcription spinner */}
      <div className="mb-8">
        <TranscriptionSpinner />
      </div>

      {/* Current status */}
      <h2 className="text-2xl font-bold text-white mb-2">
        {STATUS_LABELS[status]?.label || "Обработка"}
        {dots}
      </h2>

      <p className="text-slate-400 text-center max-w-md">
        {STATUS_LABELS[status]?.description}
      </p>
    </div>
  );
}
