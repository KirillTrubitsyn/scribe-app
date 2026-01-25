"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Upload,
  Wand2,
  FileText,
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecordingStatus } from "@/types/database";

interface ProcessingStatusProps {
  status: RecordingStatus;
  errorMessage?: string | null;
  onRetry?: () => void;
}

const PROCESSING_STEPS = [
  {
    status: "uploading" as const,
    label: "Загрузка файла",
    icon: Upload,
    description: "Файл загружается на сервер",
  },
  {
    status: "uploaded" as const,
    label: "Файл загружен",
    icon: CheckCircle2,
    description: "Подготовка к обработке",
  },
  {
    status: "processing" as const,
    label: "Обработка аудио",
    icon: Wand2,
    description: "Подготовка аудио для транскрибации",
  },
  {
    status: "transcribing" as const,
    label: "Транскрибация",
    icon: FileText,
    description: "Распознавание речи и создание транскрипта",
  },
  {
    status: "analyzing" as const,
    label: "AI-анализ",
    icon: Sparkles,
    description: "Создание резюме и выделение ключевых моментов",
  },
  {
    status: "ready" as const,
    label: "Готово",
    icon: CheckCircle2,
    description: "Запись полностью обработана",
  },
];

const STATUS_ORDER: Record<RecordingStatus, number> = {
  uploading: 0,
  uploaded: 1,
  processing: 2,
  transcribing: 3,
  analyzing: 4,
  ready: 5,
  error: -1,
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

  const currentStepIndex = STATUS_ORDER[status];

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
      {/* Main spinner */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
        </div>
        <div className="absolute inset-0 rounded-full border-2 border-orange-500/20 animate-pulse" />
      </div>

      {/* Current status */}
      <h2 className="text-2xl font-bold text-white mb-2">
        {PROCESSING_STEPS.find((s) => s.status === status)?.label || "Обработка"}
        {dots}
      </h2>

      <p className="text-slate-400 text-center max-w-md mb-8">
        {PROCESSING_STEPS.find((s) => s.status === status)?.description}
      </p>

      {/* Progress steps */}
      <div className="w-full max-w-md">
        <div className="space-y-3">
          {PROCESSING_STEPS.filter((s) => s.status !== "ready").map(
            (step, index) => {
              const isCompleted = currentStepIndex > index;
              const isCurrent = STATUS_ORDER[status] === index;
              const StepIcon = step.icon;

              return (
                <div
                  key={step.status}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg transition-colors",
                    isCompleted && "bg-emerald-500/10",
                    isCurrent && "bg-orange-500/10",
                    !isCompleted && !isCurrent && "bg-slate-800/30"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      isCompleted && "bg-emerald-500/20",
                      isCurrent && "bg-orange-500/20",
                      !isCompleted && !isCurrent && "bg-slate-700/50"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                    ) : (
                      <StepIcon className="w-4 h-4 text-slate-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isCompleted && "text-emerald-400",
                        isCurrent && "text-orange-400",
                        !isCompleted && !isCurrent && "text-slate-500"
                      )}
                    >
                      {step.label}
                    </p>
                  </div>

                  {isCompleted && (
                    <span className="text-xs text-emerald-500">Готово</span>
                  )}
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* Back link */}
      <Link
        href="/recordings"
        className="mt-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Вернуться к списку записей
      </Link>
    </div>
  );
}
