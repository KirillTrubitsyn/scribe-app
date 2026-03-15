"use client";

import { useState, useCallback, useRef } from "react";

interface UseChunkedUploadReturn {
  recordingId: string | null;
  uploadedChunks: number;
  totalSize: number;
  error: string | null;
  isFinalized: boolean;
  init: (title?: string, mimeType?: string) => Promise<string | null>;
  addChunk: (chunk: Blob) => void;
  finalize: () => Promise<boolean>;
  reset: () => void;
}

const UPLOAD_INTERVAL_MS = 30_000; // Upload every 30 seconds to avoid large single uploads on finalize

export function useChunkedUpload(): UseChunkedUploadReturn {
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isFinalized, setIsFinalized] = useState(false);

  const pendingChunksRef = useRef<Blob[]>([]);
  const chunkIndexRef = useRef(0);
  const recordingIdRef = useRef<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const uploadingRef = useRef(false);
  const errorRef = useRef<string | null>(null);

  const uploadPendingChunks = useCallback(async (finalize = false) => {
    // If another upload is in progress, wait for it to complete when finalizing
    if (uploadingRef.current) {
      if (finalize) {
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (!uploadingRef.current) {
              clearInterval(check);
              resolve();
            }
          }, 100);
        });
      } else {
        return;
      }
    }
    if (pendingChunksRef.current.length === 0 && !finalize) return;
    if (!recordingIdRef.current) return;

    uploadingRef.current = true;

    try {
      // Combine all pending chunks into one blob for this upload
      const chunks = pendingChunksRef.current.splice(0);
      if (chunks.length === 0 && !finalize) {
        uploadingRef.current = false;
        return;
      }

      const blob = new Blob(chunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", blob, `chunk-${chunkIndexRef.current}.webm`);
      formData.append("recordingId", recordingIdRef.current);
      formData.append("chunkIndex", String(chunkIndexRef.current));
      if (finalize) {
        formData.append("finalize", "true");
      }

      // Retry with exponential backoff (handles iOS Safari "Load failed" errors)
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
            console.warn(`[ChunkedUpload] Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
            await new Promise((r) => setTimeout(r, delay));
          }

          const response = await fetch("/api/upload/chunk", {
            method: "POST",
            body: attempt > 0
              ? (() => {
                  // Recreate FormData on retry to avoid iOS Safari stale body issues
                  const fd = new FormData();
                  fd.append("audio", blob, `chunk-${chunkIndexRef.current}.webm`);
                  fd.append("recordingId", recordingIdRef.current!);
                  fd.append("chunkIndex", String(chunkIndexRef.current));
                  if (finalize) fd.append("finalize", "true");
                  return fd;
                })()
              : formData,
          });

          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || `Upload failed: ${response.status}`);
          }

          const result = await response.json();
          setUploadedChunks((prev) => prev + 1);
          setTotalSize((prev) => prev + (result.size || blob.size));
          chunkIndexRef.current++;

          if (finalize) {
            setIsFinalized(true);
          }

          lastError = null;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error("Ошибка загрузки");
          if (attempt === maxRetries) break;
        }
      }

      if (lastError) {
        throw lastError;
      }
    } catch (err) {
      // Put chunks back so they can be retried on next attempt
      const message = err instanceof Error ? err.message : "Ошибка загрузки чанка";
      // Provide a user-friendly message for browser-level fetch errors
      const userMessage = message === "Load failed" || message === "Failed to fetch"
        ? "Ошибка сети при загрузке аудио. Проверьте подключение к интернету."
        : message;
      errorRef.current = userMessage;
      setError(userMessage);
      console.error("[ChunkedUpload] Error:", err);
    } finally {
      uploadingRef.current = false;
    }
  }, []);

  const startPeriodicUpload = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      uploadPendingChunks();
    }, UPLOAD_INTERVAL_MS);
  }, [uploadPendingChunks]);

  const stopPeriodicUpload = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const init = useCallback(async (title?: string, mimeType?: string): Promise<string | null> => {
    try {
      setError(null);
      errorRef.current = null;
      setUploadedChunks(0);
      setTotalSize(0);
      setIsFinalized(false);
      pendingChunksRef.current = [];
      chunkIndexRef.current = 0;

      const response = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, mimeType }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to init recording");
      }

      const { recordingId: id } = await response.json();
      setRecordingId(id);
      recordingIdRef.current = id;

      // Start periodic uploads
      startPeriodicUpload();

      return id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка инициализации записи";
      setError(message);
      return null;
    }
  }, [startPeriodicUpload]);

  const addChunk = useCallback((chunk: Blob) => {
    pendingChunksRef.current.push(chunk);
  }, []);

  const finalize = useCallback(async (): Promise<boolean> => {
    stopPeriodicUpload();

    // Upload any remaining chunks with finalize flag, retry on network failure
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      errorRef.current = null;
      await uploadPendingChunks(true);
      if (!errorRef.current) break;
      if (attempt < maxRetries - 1) {
        console.warn(`[ChunkedUpload] Finalize attempt ${attempt + 1} failed, retrying...`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    return !errorRef.current;
  }, [stopPeriodicUpload, uploadPendingChunks]);

  const reset = useCallback(() => {
    stopPeriodicUpload();
    pendingChunksRef.current = [];
    chunkIndexRef.current = 0;
    recordingIdRef.current = null;
    uploadingRef.current = false;
    setRecordingId(null);
    setUploadedChunks(0);
    setTotalSize(0);
    setError(null);
    errorRef.current = null;
    setIsFinalized(false);
  }, [stopPeriodicUpload]);

  return {
    recordingId,
    uploadedChunks,
    totalSize,
    error,
    isFinalized,
    init,
    addChunk,
    finalize,
    reset,
  };
}
