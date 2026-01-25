"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  audioUrl: string;
  onTimeUpdate?: (currentTime: number) => void;
  seekTo?: number | null;
}

export function AudioPlayer({
  audioUrl,
  onTimeUpdate,
  seekTo,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Handle external seek requests (e.g., from transcript clicks)
  useEffect(() => {
    if (seekTo !== null && seekTo !== undefined && audioRef.current) {
      audioRef.current.currentTime = seekTo;
      setCurrentTime(seekTo);
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  }, [seekTo, isPlaying]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const skip = (seconds: number) => {
    if (!audioRef.current) return;
    const newTime = Math.max(
      0,
      Math.min(duration, audioRef.current.currentTime + seconds)
    );
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && !isDragging) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleProgressDrag = useCallback(
    (e: MouseEvent) => {
      if (!progressRef.current || !audioRef.current || !isDragging) return;

      const rect = progressRef.current.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const newTime = percent * duration;

      setCurrentTime(newTime);
    },
    [isDragging, duration]
  );

  const handleDragEnd = useCallback(() => {
    if (!audioRef.current || !isDragging) return;

    audioRef.current.currentTime = currentTime;
    setIsDragging(false);
  }, [isDragging, currentTime]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleProgressDrag);
      window.addEventListener("mouseup", handleDragEnd);
      return () => {
        window.removeEventListener("mousemove", handleProgressDrag);
        window.removeEventListener("mouseup", handleDragEnd);
      };
    }
  }, [isDragging, handleProgressDrag, handleDragEnd]);

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />

      <div className="flex items-center gap-3">
        {/* Skip Back */}
        <button
          onClick={() => skip(-10)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          title="Назад 10 сек"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlayPause}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
            "bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/20"
          )}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
        </button>

        {/* Skip Forward */}
        <button
          onClick={() => skip(10)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          title="Вперед 10 сек"
        >
          <SkipForward className="w-5 h-5" />
        </button>

        {/* Progress Bar */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm text-slate-400 w-12 text-right tabular-nums">
            {formatTime(currentTime)}
          </span>

          <div
            ref={progressRef}
            className="flex-1 h-2 bg-slate-700 rounded-full cursor-pointer group relative"
            onClick={handleProgressClick}
            onMouseDown={() => setIsDragging(true)}
          >
            {/* Progress fill */}
            <div
              className="absolute inset-y-0 left-0 bg-orange-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            {/* Thumb */}
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md",
                "opacity-0 group-hover:opacity-100 transition-opacity",
                isDragging && "opacity-100"
              )}
              style={{ left: `calc(${progress}% - 8px)` }}
            />
          </div>

          <span className="text-sm text-slate-400 w-12 tabular-nums">
            {formatTime(duration)}
          </span>
        </div>

        {/* Volume */}
        <button
          onClick={toggleMute}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          title={isMuted ? "Включить звук" : "Выключить звук"}
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5" />
          ) : (
            <Volume2 className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}

// Placeholder for when audio is not available
export function AudioPlayerPlaceholder({
  message,
}: {
  message: string;
}) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-center">
      <p className="text-slate-400 py-4">{message}</p>
    </div>
  );
}
