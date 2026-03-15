"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { X, Mic, Square, Pause, Play, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useRecording } from "@/hooks/use-recording";
import { useRealtimeTranscription } from "@/hooks/use-realtime-transcription";
import { useChunkedUpload } from "@/hooks/use-chunked-upload";

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
  const [isSaving, setIsSaving] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const {
    state: recordingState,
    error: recordingError,
    duration,
    stream,
    start,
    pause,
    resume,
    stop,
    reset: resetRecording,
  } = useRecording({
    onChunk: (chunk) => {
      chunkedUpload.addChunk(chunk);
    },
  });

  const transcription = useRealtimeTranscription();
  const chunkedUpload = useChunkedUpload();

  // Derived state
  const isRecording = recordingState === "recording";
  const isPaused = recordingState === "paused";
  const isStopped = recordingState === "stopped";
  const isRequesting = recordingState === "requesting";
  // Transcription errors should not block recording — only recording/upload errors are fatal
  const hasError = recordingState === "error" || !!chunkedUpload.error;
  const errorMessage = recordingError || chunkedUpload.error;
  const hasTranscriptionWarning = !!transcription.error && !hasError;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      resetRecording();
      transcription.reset();
      chunkedUpload.reset();
      setTitle("");
      setIsSaving(false);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start recording when modal opens
  useEffect(() => {
    if (isOpen && recordingState === "idle") {
      start();
    }
  }, [isOpen, recordingState, start]);

  // When stream is available, connect realtime transcription and init chunked upload
  useEffect(() => {
    if (stream && !transcription.isConnected && !transcription.error) {
      transcription.connect(stream);
      chunkedUpload.init().catch((err) => {
        console.error("[RecordingModal] Failed to init chunked upload:", err);
      });
    }
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcription.fullText]);

  // Disconnect transcription when recording stops
  useEffect(() => {
    if (isStopped && transcription.isConnected) {
      transcription.disconnect();
    }
  }, [isStopped]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (!isSaving) {
      onClose();
    }
  }, [isSaving, onClose]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      // If init hasn't completed yet (recordingId is null), try to init now
      let currentRecordingId = chunkedUpload.recordingId;
      if (!currentRecordingId) {
        currentRecordingId = await chunkedUpload.init();
        if (!currentRecordingId) {
          setIsSaving(false);
          return;
        }
      }

      // Update the recording title if user provided one
      const recordingTitle = title.trim() || `Запись ${new Date().toLocaleDateString("ru-RU")}`;

      // Update title in DB
      await fetch(`/api/recordings/${currentRecordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: recordingTitle }),
      });

      // Finalize the chunked upload (uploads remaining chunks + triggers batch processing)
      const success = await chunkedUpload.finalize();

      if (success && currentRecordingId) {
        // Save the realtime transcript as a preliminary version
        await fetch(`/api/recordings/${currentRecordingId}/transcript/realtime`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: transcription.fullText,
            segments: transcription.committedSegments,
          }),
        }).catch(() => {
          // Non-critical — batch transcript will replace this
        });

        setTimeout(() => {
          router.push(`/recordings/${currentRecordingId}`);
          onClose();
        }, 1000);
      } else {
        setIsSaving(false);
      }
    } catch {
      setIsSaving(false);
    }
  };

  const handleRetry = () => {
    resetRecording();
    transcription.reset();
    chunkedUpload.reset();
    setTitle("");
    setIsSaving(false);
    start();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-white">Запись аудио</h2>
            {transcription.isConnected && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Транскрибация
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col min-h-0 flex-1">
          {/* Success State */}
          {isSaving && chunkedUpload.isFinalized ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-white font-medium text-lg mb-2">Запись сохранена!</h3>
              <p className="text-slate-400">Перенаправляем на страницу записи...</p>
              <p className="text-slate-500 text-sm mt-2">Диаризация спикеров будет выполнена в фоне</p>
            </div>
          ) : hasError ? (
            /* Error State */
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-white font-medium text-lg mb-2">Ошибка</h3>
              <p className="text-slate-400 mb-6">{errorMessage}</p>
              <button
                onClick={handleRetry}
                className="px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 transition-all"
              >
                Попробовать снова
              </button>
            </div>
          ) : isStopped ? (
            /* Stopped — show transcript + title input */
            <div className="flex flex-col min-h-0">
              {/* Final transcript preview */}
              {transcription.fullText && (
                <div className="mb-4 max-h-48 overflow-y-auto rounded-lg bg-slate-800/50 border border-slate-700 p-4">
                  <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Предварительный транскрипт</p>
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {transcription.fullText}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
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
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Введите название..."
                  className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                  autoFocus
                />
              </div>

              {isSaving && !chunkedUpload.isFinalized && (
                <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Сохранение оставшихся данных...</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleRetry}
                  disabled={isSaving}
                  className="flex-1 py-3 rounded-xl font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Перезаписать
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-3 rounded-xl font-medium transition-all bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </div>
          ) : (
            /* Recording State — with realtime transcript */
            <div className="flex flex-col min-h-0">
              {/* Recording controls header */}
              <div className="shrink-0">
                <div className="flex items-center justify-between mb-4">
                  {/* Mic indicator + timer */}
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                        isRecording
                          ? "bg-red-500/20 animate-pulse"
                          : isPaused
                          ? "bg-amber-500/20"
                          : "bg-slate-800"
                      )}
                    >
                      <Mic
                        className={cn(
                          "w-6 h-6 transition-colors",
                          isRecording
                            ? "text-red-400"
                            : isPaused
                            ? "text-amber-400"
                            : "text-slate-400"
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-2xl font-mono text-white">{formatDuration(duration)}</p>
                      <p className="text-slate-400 text-xs">
                        {isRequesting
                          ? "Запрос доступа к микрофону..."
                          : isRecording
                          ? "Идет запись..."
                          : isPaused
                          ? "Запись на паузе"
                          : ""}
                      </p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex gap-2">
                    {isRecording && (
                      <>
                        <button
                          onClick={pause}
                          className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-colors"
                          title="Пауза"
                        >
                          <Pause className="w-5 h-5" />
                        </button>
                        <button
                          onClick={stop}
                          className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
                          title="Остановить"
                        >
                          <Square className="w-5 h-5" />
                        </button>
                      </>
                    )}
                    {isPaused && (
                      <>
                        <button
                          onClick={resume}
                          className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-colors"
                          title="Продолжить"
                        >
                          <Play className="w-5 h-5" />
                        </button>
                        <button
                          onClick={stop}
                          className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
                          title="Остановить"
                        >
                          <Square className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Realtime transcript area */}
              <div className="flex-1 min-h-[200px] max-h-[400px] overflow-y-auto rounded-lg bg-slate-800/50 border border-slate-700 p-4">
                {hasTranscriptionWarning ? (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                    <div className="text-center">
                      <p className="text-amber-400/70 mb-1">Транскрибация в реальном времени недоступна</p>
                      <p>Запись продолжается, транскрипт будет создан после сохранения</p>
                    </div>
                  </div>
                ) : transcription.fullText ? (
                  <div className="text-sm text-slate-300 leading-relaxed">
                    {/* Committed segments */}
                    {transcription.committedSegments.map((segment, i) => (
                      <span key={i}>{segment.text} </span>
                    ))}
                    {/* Partial text (still being recognized) */}
                    {transcription.partialText && (
                      <span className="text-slate-500 italic">{transcription.partialText}</span>
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                    {transcription.isConnected
                      ? "Начните говорить — текст появится здесь..."
                      : isRequesting
                      ? "Подключение к микрофону..."
                      : "Подключение к сервису транскрибации..."}
                  </div>
                )}
              </div>

              {/* Upload status */}
              {chunkedUpload.uploadedChunks > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  Загружено: {chunkedUpload.uploadedChunks} фрагментов ({(chunkedUpload.totalSize / 1024 / 1024).toFixed(1)} МБ)
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
