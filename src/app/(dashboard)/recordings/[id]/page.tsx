"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Pause, Download, Trash2, Loader2, Volume2 } from "lucide-react";
import { cn, formatDate, formatDuration } from "@/lib/utils";
import { StatusBadge } from "@/components/recordings/status-badge";
import type { Recording } from "@/types/database";

type RecordingWithAudio = Recording & {
  audioUrl: string | null;
  transcripts: unknown[];
  artifacts: unknown[];
  speakers: unknown[];
};

export default function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingWithAudio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    params.then(({ id }) => setRecordingId(id));
  }, [params]);

  useEffect(() => {
    if (!recordingId) return;

    async function fetchRecording() {
      try {
        const response = await fetch(`/api/recordings/${recordingId}`);
        if (!response.ok) {
          throw new Error("Recording not found");
        }
        const data = await response.json();
        setRecording(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load recording");
      } finally {
        setLoading(false);
      }
    }

    fetchRecording();
  }, [recordingId]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleDownload = async () => {
    if (!recordingId) return;

    try {
      const response = await fetch(`/api/recordings/${recordingId}/download`);
      if (!response.ok) throw new Error("Failed to get download URL");

      const { url, fileName } = await response.json();
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert("Не удалось скачать запись");
    }
  };

  const handleDelete = async () => {
    if (!recordingId || !confirm("Вы уверены, что хотите удалить эту запись?")) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/recordings/${recordingId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");

      router.push("/recordings");
    } catch (err) {
      alert("Не удалось удалить запись");
      setIsDeleting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="p-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          Назад
        </button>
        <div className="text-center py-16">
          <p className="text-red-400">{error || "Запись не найдена"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-400 hover:text-white mb-8"
      >
        <ArrowLeft className="w-5 h-5" />
        Назад к записям
      </button>

      {/* Recording Info */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">{recording.title}</h1>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span>{formatDate(recording.created_at)}</span>
              {recording.duration_seconds && (
                <span>{formatDuration(recording.duration_seconds)}</span>
              )}
              <StatusBadge status={recording.status} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Скачать"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-2 rounded-lg bg-slate-800 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              title="Удалить"
            >
              {isDeleting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Audio Player */}
      {recording.audioUrl ? (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
          <audio
            ref={audioRef}
            src={recording.audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
          />

          <div className="flex items-center gap-4">
            <button
              onClick={togglePlayPause}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
                "bg-orange-500 hover:bg-orange-400 text-white"
              )}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6 ml-1" />
              )}
            </button>

            <div className="flex-1">
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-sm text-slate-400 mt-2">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <Volume2 className="w-5 h-5 text-slate-400" />
          </div>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 text-center">
          <p className="text-slate-400">
            {recording.status === "uploading"
              ? "Файл загружается..."
              : "Аудиофайл недоступен"}
          </p>
        </div>
      )}

      {/* File Info */}
      <div className="mt-8 bg-slate-800/30 rounded-xl p-6 border border-slate-700/30">
        <h2 className="text-lg font-medium text-white mb-4">Информация о файле</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-400">Название файла</dt>
            <dd className="text-white mt-1">{recording.file_name}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Размер</dt>
            <dd className="text-white mt-1">
              {(recording.file_size / 1024 / 1024).toFixed(2)} МБ
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
