"use client";

import { useState, useCallback } from "react";

export type UploadState = "idle" | "uploading" | "success" | "error";
export type TranscriptionModel = "gemini" | "chirp";

interface UploadProgress {
  state: UploadState;
  progress: number;
  error: string | null;
  recordingId: string | null;
}

interface InitUploadResponse {
  recordingId: string;
  uploadUrl: string;
}

interface UseUploadReturn {
  state: UploadState;
  progress: number;
  error: string | null;
  recordingId: string | null;
  upload: (file: File, title: string, model: TranscriptionModel) => Promise<string | null>;
  reset: () => void;
}

export function useUpload(): UseUploadReturn {
  const [uploadState, setUploadState] = useState<UploadProgress>({
    state: "idle",
    progress: 0,
    error: null,
    recordingId: null,
  });

  const reset = useCallback(() => {
    setUploadState({
      state: "idle",
      progress: 0,
      error: null,
      recordingId: null,
    });
  }, []);

  const upload = useCallback(async (file: File, title: string, model: TranscriptionModel): Promise<string | null> => {
    setUploadState({
      state: "uploading",
      progress: 0,
      error: null,
      recordingId: null,
    });

    try {
      // Step 1: Initialize upload - create recording and get signed URL
      const initResponse = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
          title,
        }),
      });

      if (!initResponse.ok) {
        const error = await initResponse.json();
        throw new Error(error.error || "Не удалось инициализировать загрузку");
      }

      const { recordingId, uploadUrl }: InitUploadResponse = await initResponse.json();

      setUploadState((prev) => ({
        ...prev,
        recordingId,
        progress: 5,
      }));

      // Step 2: Upload file directly to GCS using signed URL with XMLHttpRequest for progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            // Progress from 5% to 90% during upload
            const percent = 5 + (event.loaded / event.total) * 85;
            setUploadState((prev) => ({
              ...prev,
              progress: Math.round(percent),
            }));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Ошибка загрузки: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Сетевая ошибка при загрузке"));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Загрузка отменена"));
        });

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      setUploadState((prev) => ({
        ...prev,
        progress: 95,
      }));

      // Step 3: Confirm upload completion with transcription model
      const completeResponse = await fetch(`/api/upload/${recordingId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcription_model: model,
        }),
      });

      if (!completeResponse.ok) {
        const error = await completeResponse.json();
        throw new Error(error.error || "Не удалось подтвердить загрузку");
      }

      setUploadState({
        state: "success",
        progress: 100,
        error: null,
        recordingId,
      });

      return recordingId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Произошла ошибка при загрузке";
      setUploadState((prev) => ({
        ...prev,
        state: "error",
        error: errorMessage,
      }));
      return null;
    }
  }, []);

  return {
    state: uploadState.state,
    progress: uploadState.progress,
    error: uploadState.error,
    recordingId: uploadState.recordingId,
    upload,
    reset,
  };
}
