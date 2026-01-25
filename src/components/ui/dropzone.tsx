"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Upload, FileAudio, AlertCircle } from "lucide-react";

export interface DropzoneProps {
  onFileSelect: (file: File) => void;
  accept?: string[];
  maxSize?: number;
  disabled?: boolean;
  error?: string | null;
  className?: string;
}

const DEFAULT_ACCEPT = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
];

const DEFAULT_MAX_SIZE = 500 * 1024 * 1024; // 500 MB

const FORMAT_LABELS: Record<string, string> = {
  "audio/mpeg": "MP3",
  "audio/wav": "WAV",
  "audio/x-wav": "WAV",
  "audio/mp4": "M4A",
  "audio/x-m4a": "M4A",
  "audio/webm": "WEBM",
  "audio/ogg": "OGG",
};

export function Dropzone({
  onFileSelect,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_SIZE,
  disabled = false,
  error,
  className,
}: DropzoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!accept.includes(file.type)) {
        const formats = [...new Set(accept.map((t) => FORMAT_LABELS[t] || t))].join(", ");
        return `Неподдерживаемый формат. Используйте: ${formats}`;
      }
      if (file.size > maxSize) {
        const sizeMB = Math.round(maxSize / (1024 * 1024));
        return `Файл слишком большой. Максимум ${sizeMB} МБ`;
      }
      return null;
    },
    [accept, maxSize]
  );

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setValidationError(validationError);
        setSelectedFile(null);
        return;
      }
      setValidationError(null);
      setSelectedFile(file);
      onFileSelect(file);
    },
    [validateFile, onFileSelect]
  );

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      if (e.type === "dragenter" || e.type === "dragover") {
        setDragActive(true);
      } else if (e.type === "dragleave") {
        setDragActive(false);
      }
    },
    [disabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (disabled) return;

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [disabled, handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    },
    [handleFile]
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  const displayError = error || validationError;
  const acceptString = accept.map((t) => {
    if (t === "audio/mpeg") return ".mp3";
    if (t === "audio/wav" || t === "audio/x-wav") return ".wav";
    if (t === "audio/mp4" || t === "audio/x-m4a") return ".m4a";
    if (t === "audio/webm") return ".webm";
    if (t === "audio/ogg") return ".ogg";
    return t;
  }).join(",");

  return (
    <div className={className}>
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClick}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition-all",
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer",
          dragActive
            ? "border-orange-500 bg-orange-500/10"
            : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/50",
          displayError && "border-red-500/50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptString}
          onChange={handleInputChange}
          disabled={disabled}
          className="hidden"
        />

        {selectedFile ? (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
              <FileAudio className="w-6 h-6 text-orange-400" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-white font-medium truncate">{selectedFile.name}</p>
              <p className="text-slate-400 text-sm">
                {(selectedFile.size / (1024 * 1024)).toFixed(1)} МБ
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
              MP3, WAV, M4A, WEBM, OGG до 500 МБ
            </p>
          </>
        )}
      </div>

      {displayError && (
        <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{displayError}</p>
        </div>
      )}
    </div>
  );
}
