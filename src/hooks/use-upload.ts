"use client";

import { useState, useCallback } from "react";

export type UploadState = "idle" | "uploading" | "success" | "error";

interface UploadProgress {
  state: UploadState;
  progress: number;
  error: string | null;
  recordingId: string | null;
}

interface UploadResponse {
  recordingId: string;
}

interface UseUploadReturn {
  state: UploadState;
  progress: number;
  error: string | null;
  recordingId: string | null;
  upload: (file: File, title: string) => Promise<string | null>;
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

  const upload = useCallback(async (file: File, title: string): Promise<string | null> => {
    setUploadState({
      state: "uploading",
      progress: 0,
      error: null,
      recordingId: null,
    });

    try {
      // Step 1: Upload file to our API (server proxies to Supabase Storage)
      const recordingId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            // Progress from 0% to 85% during upload to server
            const percent = (event.loaded / event.total) * 85;
            setUploadState((prev) => ({
              ...prev,
              progress: Math.round(percent),
            }));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response: UploadResponse = JSON.parse(xhr.responseText);
              resolve(response.recordingId);
            } catch {
              reject(new Error("Некорректный ответ сервера"));
            }
          } else {
            let message = `Ошибка загрузки: ${xhr.status}`;
            try {
              const err = JSON.parse(xhr.responseText);
              if (err.error) message = err.error;
            } catch {
              // use default message
            }
            reject(new Error(message));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Сетевая ошибка при загрузке"));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Загрузка отменена"));
        });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", title);

        xhr.open("POST", "/api/upload");
        xhr.send(formData);
      });

      setUploadState((prev) => ({
        ...prev,
        recordingId,
        progress: 90,
      }));

      // Step 2: Confirm upload and trigger processing
      const completeResponse = await fetch(`/api/upload/${recordingId}/complete`, {
        method: "POST",
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
