"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { X, Upload, FileAudio, CheckCircle, AlertCircle } from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type UploadState = "idle" | "uploading" | "success" | "error";

const ACCEPTED_FORMATS = ["audio/mpeg", "audio/wav", "audio/x-m4a", "audio/mp4", "audio/x-wav"];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

export function UploadModal({ isOpen, onClose }: UploadModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setUploadState("idle");
    setUploadProgress(0);
    setErrorMessage(null);
  }, []);

  const handleClose = useCallback(() => {
    if (uploadState !== "uploading") {
      resetState();
      onClose();
    }
  }, [uploadState, resetState, onClose]);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_FORMATS.includes(file.type)) {
      return "Неподдерживаемый формат файла. Используйте MP3, WAV или M4A.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "Файл слишком большой. Максимальный размер — 500 МБ.";
    }
    return null;
  };

  const handleFile = useCallback((selectedFile: File) => {
    const error = validateFile(selectedFile);
    if (error) {
      setErrorMessage(error);
      setUploadState("error");
      return;
    }
    setFile(selectedFile);
    setErrorMessage(null);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file) return;

    setUploadState("uploading");
    setUploadProgress(0);

    try {
      // Simulate upload progress (replace with actual upload logic)
      const simulateProgress = () => {
        return new Promise<void>((resolve) => {
          let progress = 0;
          const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress >= 100) {
              progress = 100;
              clearInterval(interval);
              resolve();
            }
            setUploadProgress(Math.min(progress, 100));
          }, 200);
        });
      };

      await simulateProgress();

      // TODO: Replace with actual API call
      // const formData = new FormData();
      // formData.append("file", file);
      // const response = await fetch("/api/upload", { method: "POST", body: formData });

      setUploadState("success");

      // Close modal after success
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch {
      setUploadState("error");
      setErrorMessage("Произошла ошибка при загрузке. Попробуйте ещё раз.");
    }
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
            disabled={uploadState === "uploading"}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {uploadState === "success" ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-white font-medium text-lg mb-2">Файл загружен!</h3>
              <p className="text-slate-400">Начинаем обработку...</p>
            </div>
          ) : uploadState === "uploading" ? (
            <div className="py-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center">
                  <FileAudio className="w-6 h-6 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{file?.name}</p>
                  <p className="text-slate-400 text-sm">Загрузка...</p>
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
          ) : (
            <>
              {/* Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                  dragActive
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/50",
                  uploadState === "error" && "border-red-500/50"
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".mp3,.wav,.m4a,audio/*"
                  onChange={handleInputChange}
                  className="hidden"
                />

                {file ? (
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center">
                      <FileAudio className="w-6 h-6 text-orange-400" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-white font-medium truncate">{file.name}</p>
                      <p className="text-slate-400 text-sm">
                        {(file.size / (1024 * 1024)).toFixed(1)} МБ
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-7 h-7 text-slate-400" />
                    </div>
                    <p className="text-white font-medium mb-1">
                      Перетащите файл сюда
                    </p>
                    <p className="text-slate-400 text-sm">
                      или нажмите для выбора
                    </p>
                    <p className="text-slate-500 text-xs mt-3">
                      MP3, WAV, M4A до 500 МБ
                    </p>
                  </>
                )}
              </div>

              {/* Error Message */}
              {uploadState === "error" && errorMessage && (
                <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-red-400 text-sm">{errorMessage}</p>
                </div>
              )}

              {/* Upload Button */}
              <button
                onClick={handleUpload}
                disabled={!file || uploadState === "error"}
                className={cn(
                  "w-full mt-6 py-3 rounded-xl font-medium transition-all",
                  file && uploadState !== "error"
                    ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                )}
              >
                Загрузить и обработать
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
