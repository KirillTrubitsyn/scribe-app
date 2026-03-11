"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface CommittedSegment {
  text: string;
  timestamp: number;
}

interface UseRealtimeTranscriptionReturn {
  partialText: string;
  committedSegments: CommittedSegment[];
  fullText: string;
  isConnected: boolean;
  error: string | null;
  connect: (stream: MediaStream) => Promise<void>;
  disconnect: () => void;
  reset: () => void;
}

// Convert Float32 PCM samples to Int16 and then to base64
function float32ToBase64(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useRealtimeTranscription(): UseRealtimeTranscriptionReturn {
  const [partialText, setPartialText] = useState("");
  const [committedSegments, setCommittedSegments] = useState<CommittedSegment[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const connect = useCallback(async (stream: MediaStream) => {
    try {
      setError(null);

      // 1. Get a single-use token from our server
      const tokenResponse = await fetch("/api/stt/token", { method: "POST" });
      if (!tokenResponse.ok) {
        throw new Error("Не удалось получить токен для транскрибации");
      }
      const { token } = await tokenResponse.json();

      // 2. Connect WebSocket to ElevenLabs
      const wsUrl = new URL("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
      wsUrl.searchParams.set("model_id", "scribe_v2_realtime");
      wsUrl.searchParams.set("language_code", "rus");
      wsUrl.searchParams.set("token", token);
      wsUrl.searchParams.set("commit_strategy", "vad");
      wsUrl.searchParams.set("vad_silence_threshold_secs", "1.5");
      wsUrl.searchParams.set("include_timestamps", "true");

      const ws = new WebSocket(wsUrl.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log("[RealtimeSTT] WebSocket connected");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.message_type) {
            case "partial_transcript":
              setPartialText(msg.text || "");
              break;

            case "committed_transcript":
            case "committed_transcript_with_timestamps":
              if (msg.text && msg.text.trim()) {
                setCommittedSegments((prev) => [
                  ...prev,
                  { text: msg.text.trim(), timestamp: Date.now() },
                ]);
              }
              setPartialText("");
              break;

            case "session_started":
              console.log("[RealtimeSTT] Session started:", msg.session_id);
              break;

            case "error":
              console.error("[RealtimeSTT] Server error:", msg);
              setError(msg.message || "Ошибка транскрибации");
              break;
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        setError("Ошибка подключения к сервису транскрибации");
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        console.log("[RealtimeSTT] WebSocket closed:", event.code, event.reason);
        setIsConnected(false);
      };

      // 3. Set up AudioContext for PCM extraction at 16kHz
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Use ScriptProcessorNode (deprecated but widely supported)
      // Buffer size 4096 = ~256ms at 16kHz
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const pcmData = event.inputBuffer.getChannelData(0);
        const base64Audio = float32ToBase64(pcmData);

        ws.send(
          JSON.stringify({
            message_type: "input_audio_chunk",
            audio_base_64: base64Audio,
          })
        );
      };

      source.connect(processor);
      // Connect to destination to keep the processor alive (required in some browsers)
      processor.connect(audioContext.destination);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка подключения";
      setError(message);
      cleanup();
    }
  }, [cleanup]);

  const disconnect = useCallback(() => {
    // Send end-of-stream before closing
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ message_type: "flush" }));
      // Give a moment for final results before closing
      setTimeout(() => {
        cleanup();
      }, 500);
    } else {
      cleanup();
    }
  }, [cleanup]);

  const reset = useCallback(() => {
    cleanup();
    setPartialText("");
    setCommittedSegments([]);
    setError(null);
  }, [cleanup]);

  const fullText = committedSegments.map((s) => s.text).join(" ") +
    (partialText ? (committedSegments.length > 0 ? " " : "") + partialText : "");

  return {
    partialText,
    committedSegments,
    fullText,
    isConnected,
    error,
    connect,
    disconnect,
    reset,
  };
}
