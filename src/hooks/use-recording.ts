"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export type RecordingState = "idle" | "requesting" | "recording" | "paused" | "stopped" | "error";

interface UseRecordingOptions {
  onChunk?: (chunk: Blob) => void;
}

interface UseRecordingReturn {
  state: RecordingState;
  error: string | null;
  duration: number;
  audioBlob: Blob | null;
  stream: MediaStream | null;
  wasInterrupted: boolean;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

export function useRecording(options?: UseRecordingOptions): UseRecordingReturn {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [wasInterrupted, setWasInterrupted] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);
  const onChunkRef = useRef(options?.onChunk);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastChunkTimeRef = useRef<number>(0);
  const stateRef = useRef<RecordingState>("idle");

  // Keep refs up to date
  useEffect(() => {
    onChunkRef.current = options?.onChunk;
  }, [options?.onChunk]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Wake Lock: request and release helpers
  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
      }
    } catch {
      // Wake Lock not available or denied — non-critical
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  // Re-acquire wake lock when page becomes visible again (browsers release it on hide)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && stateRef.current === "recording") {
        // Re-acquire wake lock
        requestWakeLock();

        // Check if MediaRecorder is still alive
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state === "inactive") {
          // Browser killed the recorder while in background/sleep
          setWasInterrupted(true);
          console.warn("[Recording] MediaRecorder was stopped by the browser during sleep/background");
        }

        // Check for timer gap — if more than 3s passed since last expected tick,
        // the browser was likely suspended
        const now = Date.now();
        if (lastChunkTimeRef.current > 0) {
          const gap = now - lastChunkTimeRef.current;
          if (gap > 5000) {
            // More than 5 seconds since last chunk — likely suspended
            console.warn(`[Recording] Detected ${Math.round(gap / 1000)}s gap — browser was likely suspended`);
            setWasInterrupted(true);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestWakeLock]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now() - pausedDurationRef.current * 1000;
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setDuration(elapsed);
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    try {
      setState("requesting");
      setError(null);
      setAudioBlob(null);
      setWasInterrupted(false);
      chunksRef.current = [];
      pausedDurationRef.current = 0;
      lastChunkTimeRef.current = 0;
      setDuration(0);

      // Request microphone access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);

      // Request wake lock to prevent screen from sleeping
      await requestWakeLock();

      // Determine the best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/wav";

      const mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          lastChunkTimeRef.current = Date.now();
          // Notify listener of new chunk
          onChunkRef.current?.(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setState("stopped");
        releaseWakeLock();

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setStream(null);
        }
      };

      mediaRecorder.onerror = () => {
        setError("Ошибка при записи аудио");
        setState("error");
        stopTimer();
        releaseWakeLock();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
      lastChunkTimeRef.current = Date.now();
      setState("recording");
      startTimer();
    } catch (err) {
      let errorMessage = "Не удалось получить доступ к микрофону";

      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          errorMessage = "Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.";
        } else if (err.name === "NotFoundError") {
          errorMessage = "Микрофон не найден. Подключите микрофон и попробуйте снова.";
        } else if (err.name === "NotReadableError") {
          errorMessage = "Микрофон занят другим приложением.";
        }
      }

      setError(errorMessage);
      setState("error");
      releaseWakeLock();
    }
  }, [startTimer, stopTimer, requestWakeLock, releaseWakeLock]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.pause();
      pausedDurationRef.current = duration;
      stopTimer();
      setState("paused");
    }
  }, [state, duration, stopTimer]);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current && state === "paused") {
      mediaRecorderRef.current.resume();
      startTimer();
      setState("recording");
    }
  }, [state, startTimer]);

  const stop = useCallback(() => {
    stopTimer();
    releaseWakeLock();
    if (mediaRecorderRef.current && (state === "recording" || state === "paused")) {
      mediaRecorderRef.current.stop();
    }
  }, [state, stopTimer, releaseWakeLock]);

  const reset = useCallback(() => {
    stopTimer();
    releaseWakeLock();
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    pausedDurationRef.current = 0;
    lastChunkTimeRef.current = 0;
    setDuration(0);
    setAudioBlob(null);
    setStream(null);
    setError(null);
    setWasInterrupted(false);
    setState("idle");
  }, [stopTimer, releaseWakeLock]);

  return {
    state,
    error,
    duration,
    audioBlob,
    stream,
    wasInterrupted,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
