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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);
  const onChunkRef = useRef(options?.onChunk);

  // Keep onChunk ref up to date
  useEffect(() => {
    onChunkRef.current = options?.onChunk;
  }, [options?.onChunk]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

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
      chunksRef.current = [];
      pausedDurationRef.current = 0;
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
          // Notify listener of new chunk
          onChunkRef.current?.(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setState("stopped");

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
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
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
    }
  }, [startTimer, stopTimer]);

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
    if (mediaRecorderRef.current && (state === "recording" || state === "paused")) {
      mediaRecorderRef.current.stop();
    }
  }, [state, stopTimer]);

  const reset = useCallback(() => {
    stopTimer();
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
    setDuration(0);
    setAudioBlob(null);
    setStream(null);
    setError(null);
    setState("idle");
  }, [stopTimer]);

  return {
    state,
    error,
    duration,
    audioBlob,
    stream,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
