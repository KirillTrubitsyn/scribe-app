"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { X, FileAudio, CheckCircle } from "lucide-react";
import { Dropzone } from "@/components/ui/dropzone";
import { useUpload, TranscriptionModel } from "@/hooks/use-upload";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UploadModal({ isOpen, onClose }: UploadModalProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [model, setModel] = useState<TranscriptionModel | null>(null);
  const { state, progress, error, recordingId, upload, reset } = useUpload();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setTitle("");
      setModel(null);
      reset();
    }
  }, [isOpen, reset]);

  // Set default title from file name
  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    // Set title to file name without extension
    const defaultTitle = selectedFile.name.replace(/\.[^/.]+$/, "");
    setTitle(defaultTitle);
  }, []);

  const handleClose = useCallback(() => {
    if (state !== "uploading") {
      onClose();
    }
  }, [state, onClose]);

  const handleUpload = async () => {
    if (!file || !model) return;

    const result = await upload(file, title || file.name.replace(/\.[^/.]+$/, ""), model);

    if (result) {
      // Redirect to recording page after short delay
      setTimeout(() => {
        router.push(`/recordings/${result}`);
        onClose();
      }, 1500);
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
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
      <div className="relative w-full max-w-lg mx-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h2 className="text-xl font-semibold text-white">Загрузить аудио</h2>
          <button
            onClick={handleClose}
            disabled={state === "uploading"}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {state === "success" ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-white font-medium text-lg mb-2">Файл загружен!</h3>
              <p className="text-slate-400">Перенаправляем на страницу записи...</p>
            </div>
          ) : state === "uploading" ? (
            <div className="py-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center">
                  <FileAudio className="w-6 h-6 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{title || file?.name}</p>
                  <p className="text-slate-400 text-sm">Загрузка...</p>
                </div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-center text-slate-400 text-sm mt-3">
                {Math.round(progress)}%
              </p>
            </div>
          ) : (
            <>
              {/* Drop Zone */}
              <Dropzone
                onFileSelect={handleFileSelect}
                error={error}
                disabled={false}
              />

              {/* Title Input */}
              {file && (
                <div className="mt-4">
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
                  />
                </div>
              )}

              {/* Model Switcher */}
              {file && (
                <div className="mt-4">
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
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleClose}
                  disabled={false}
                  className="flex-1 py-3 rounded-xl font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!file || !model}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-medium transition-all",
                    file && model
                      ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
                      : "bg-slate-800 text-slate-500 cursor-not-allowed"
                  )}
                >
                  Загрузить
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
