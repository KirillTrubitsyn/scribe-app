"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { X, Mic, Square, Pause, Play, CheckCircle, AlertCircle } from "lucide-react";
import { useRecording } from "@/hooks/use-recording";
import { useUpload, TranscriptionModel } from "@/hooks/use-upload";

interface RecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function RecordingModal({ isOpen, onClose }: RecordingModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [model, setModel] = useState<TranscriptionModel | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    state: recordingState,
    error: recordingError,
    duration,
    audioBlob,
    start,
    pause,
    resume,
    stop,
    reset: resetRecording,
  } = useRecording();

  const {
    state: uploadState,
    progress: uploadProgress,
    error: uploadError,
    recordingId,
    upload,
    reset: resetUpload,
  } = useUpload();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      resetRecording();
      resetUpload();
      setTitle("");
      setShowTitleInput(false);
      setModel(null);
      setIsSubmitting(false);
    }
  }, [isOpen, resetRecording, resetUpload]);

  // Auto-start recording when modal opens
  useEffect(() => {
    if (isOpen && recordingState === "idle") {
      start();
    }
  }, [isOpen, recordingState, start]);

  // Show title input when recording is stopped
  useEffect(() => {
    if (recordingState === "stopped" && audioBlob) {
      setShowTitleInput(true);
    }
  }, [recordingState, audioBlob]);

  const handleClose = useCallback(() => {
    if (uploadState !== "uploading") {
      onClose();
    }
  }, [uploadState, onClose]);

  const handleUpload = async () => {
    if (!audioBlob || !model || isSubmitting) return;

    setIsSubmitting(true);

    // Create a File from the Blob
    // Normalize content type - API expects base type without codecs
    const contentType = audioBlob.type.split(";")[0] || "audio/webm";
    const extension = contentType === "audio/mp4" ? "m4a" : "webm";
    const fileName = `recording-${Date.now()}.${extension}`;
    const file = new File([audioBlob], fileName, { type: contentType });

    const recordingTitle = title.trim() || `Запись ${new Date().toLocaleDateString("ru-RU")}`;
    const result = await upload(file, recordingTitle, model);

    if (result) {
      setTimeout(() => {
        router.push(`/recordings/${result}`);
        onClose();
      }, 1500);
    } else {
      setIsSubmitting(false);
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  if (!isOpen) return null;

  const isRecording = recordingState === "recording";
  const isPaused = recordingState === "paused";
  const isStopped = recordingState === "stopped";
  const isRequesting = recordingState === "requesting";
  const hasError = recordingState === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h2 className="text-xl font-semibold text-white">Запись аудио</h2>
          <button
            onClick={handleClose}
            disabled={uploadState === "uploading"}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Success State */}
          {uploadState === "success" ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-white font-medium text-lg mb-2">Запись сохранена!</h3>
              <p className="text-slate-400">Перенаправляем на страницу записи...</p>
            </div>
          ) : uploadState === "uploading" ? (
            /* Uploading State */
            <div className="py-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center">
                  <Mic className="w-6 h-6 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{title || "Новая запись"}</p>
                  <p className="text-slate-400 text-sm">Сохранение...</p>
                </div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-center text-slate-400 text-sm mt-3">
                {Math.round(uploadProgress)}%
              </p>
            </div>
          ) : hasError ? (
            /* Error State */
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-white font-medium text-lg mb-2">Ошибка</h3>
              <p className="text-slate-400 mb-6">{recordingError || uploadError}</p>
              <button
                onClick={() => {
                  resetRecording();
                  start();
                }}
                className="px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 transition-all"
              >
                Попробовать снова
              </button>
            </div>
          ) : showTitleInput && audioBlob ? (
            /* Title Input State */
            <div className="py-4">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center">
                  <Mic className="w-6 h-6 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium">Запись завершена</p>
                  <p className="text-slate-400 text-sm">{formatDuration(duration)}</p>
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="recording-title" className="block text-sm font-medium text-slate-300 mb-2">
                  Название записи
                </label>
                <input
                  id="recording-title"
                  type="text"
                  value={title}
                  onChange={handleTitleChange}
                  placeholder="Введите название..."
                  className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                  autoFocus
                />
              </div>

              {/* Model Switcher */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Модель транскрипции <span className="text-orange-400">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModel("gemini")}
                    className={cn(
                      "flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all",
                      model === "gemini"
                        ? "bg-orange-500/20 text-orange-400 border border-orange-500/50"
                        : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"
                    )}
                  >
                    Gemini 3 Flash
                  </button>
                  <button
                    type="button"
                    onClick={() => setModel("chirp")}
                    className={cn(
                      "flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all",
                      model === "chirp"
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                        : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"
                    )}
                  >
                    Chirp 3 Batch
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    resetRecording();
                    setShowTitleInput(false);
                    start();
                  }}
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Перезаписать
                </button>
                <button
                  onClick={handleUpload}
                  disabled={isSubmitting || !model}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-medium transition-all disabled:cursor-not-allowed",
                    model
                      ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 disabled:opacity-50"
                      : "bg-slate-800 text-slate-500"
                  )}
                >
                  {isSubmitting ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </div>
          ) : (
            /* Recording State */
            <div className="py-8">
              {/* Microphone Visualization */}
              <div className="flex justify-center mb-8">
                <div
                  className={cn(
                    "w-24 h-24 rounded-full flex items-center justify-center transition-all",
                    isRecording
                      ? "bg-red-500/20 animate-pulse"
                      : isPaused
                      ? "bg-amber-500/20"
                      : isRequesting
                      ? "bg-slate-800"
                      : "bg-slate-800"
                  )}
                >
                  <Mic
                    className={cn(
                      "w-10 h-10 transition-colors",
                      isRecording
                        ? "text-red-400"
                        : isPaused
                        ? "text-amber-400"
                        : "text-slate-400"
                    )}
                  />
                </div>
              </div>

              {/* Duration */}
              <div className="text-center mb-8">
                <p className="text-4xl font-mono text-white">{formatDuration(duration)}</p>
                <p className="text-slate-400 text-sm mt-2">
                  {isRequesting
                    ? "Запрос доступа к микрофону..."
                    : isRecording
                    ? "Идет запись..."
                    : isPaused
                    ? "Запись на паузе"
                    : ""}
                </p>
              </div>

              {/* Controls */}
              <div className="flex justify-center gap-4">
                {isRecording && (
                  <>
                    <button
                      onClick={pause}
                      className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-colors"
                      title="Пауза"
                    >
                      <Pause className="w-6 h-6" />
                    </button>
                    <button
                      onClick={stop}
                      className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
                      title="Остановить"
                    >
                      <Square className="w-6 h-6" />
                    </button>
                  </>
                )}
                {isPaused && (
                  <>
                    <button
                      onClick={resume}
                      className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-colors"
                      title="Продолжить"
                    >
                      <Play className="w-6 h-6" />
                    </button>
                    <button
                      onClick={stop}
                      className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
                      title="Остановить"
                    >
                      <Square className="w-6 h-6" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
