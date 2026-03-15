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

const UPLOAD_INTERVAL_MS = 30_000; // Upload every 30 seconds

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

      const response = await fetch("/api/upload/chunk", {
        method: "POST",
        body: formData,
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка загрузки чанка";
      errorRef.current = message;
      setError(message);
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

    // Upload any remaining chunks with finalize flag
    await uploadPendingChunks(true);

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
