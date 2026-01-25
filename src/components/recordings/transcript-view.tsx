"use client";

import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { Transcript, TranscriptSegment, Speaker } from "@/types/database";

// Speaker color palette
const SPEAKER_COLORS = [
  { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", dot: "bg-blue-500" },
  { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-500" },
  { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", dot: "bg-purple-500" },
  { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", dot: "bg-amber-500" },
  { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400", dot: "bg-rose-500" },
  { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400", dot: "bg-cyan-500" },
  { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400", dot: "bg-indigo-500" },
  { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", dot: "bg-orange-500" },
];

interface TranscriptViewProps {
  transcript: Transcript | null;
  speakers: Speaker[];
  currentTime?: number;
  onSegmentClick?: (startTime: number) => void;
}

export function TranscriptView({
  transcript,
  speakers,
  currentTime = 0,
  onSegmentClick,
}: TranscriptViewProps) {
  // Create speaker name map
  const speakerMap = useMemo(() => {
    const map = new Map<string, { name: string; colorIndex: number }>();
    speakers.forEach((s, index) => {
      const key = `Speaker ${s.speaker_index}`;
      map.set(key, {
        name: s.name || key,
        colorIndex: index % SPEAKER_COLORS.length,
      });
    });
    return map;
  }, [speakers]);

  // Get unique speakers from segments for color assignment
  const segmentSpeakers = useMemo(() => {
    if (!transcript?.segments) return new Set<string>();
    return new Set(transcript.segments.map((s) => s.speaker));
  }, [transcript]);

  // Assign colors to speakers not in speakerMap
  const getColorIndex = (speaker: string): number => {
    const mapped = speakerMap.get(speaker);
    if (mapped) return mapped.colorIndex;

    const speakersList = Array.from(segmentSpeakers);
    const index = speakersList.indexOf(speaker);
    return index >= 0 ? index % SPEAKER_COLORS.length : 0;
  };

  const getSpeakerName = (speaker: string): string => {
    return speakerMap.get(speaker)?.name || speaker;
  };

  if (!transcript || !transcript.segments || transcript.segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
        <p>Транскрипт пока недоступен</p>
        <p className="text-sm mt-1">
          Он появится после завершения обработки записи
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transcript.segments.map((segment, index) => (
        <TranscriptSegmentItem
          key={index}
          segment={segment}
          speakerName={getSpeakerName(segment.speaker)}
          color={SPEAKER_COLORS[getColorIndex(segment.speaker)]}
          isActive={currentTime >= segment.start && currentTime < segment.end}
          onClick={() => onSegmentClick?.(segment.start)}
        />
      ))}
    </div>
  );
}

interface TranscriptSegmentItemProps {
  segment: TranscriptSegment;
  speakerName: string;
  color: (typeof SPEAKER_COLORS)[0];
  isActive: boolean;
  onClick: () => void;
}

function TranscriptSegmentItem({
  segment,
  speakerName,
  color,
  isActive,
  onClick,
}: TranscriptSegmentItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "p-4 rounded-lg border cursor-pointer transition-all",
        color.bg,
        color.border,
        isActive && "ring-2 ring-orange-500/50 border-orange-500/50",
        "hover:brightness-110"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        {/* Speaker indicator */}
        <div className={cn("w-2 h-2 rounded-full", color.dot)} />
        <span className={cn("text-sm font-medium", color.text)}>
          {speakerName}
        </span>
        <span className="text-xs text-slate-500 ml-auto">
          {formatDuration(segment.start)}
        </span>
      </div>
      <p className="text-slate-200 leading-relaxed">{segment.text}</p>
    </div>
  );
}

// Compact version for sidebar or preview
export function TranscriptPreview({
  transcript,
  maxSegments = 3,
}: {
  transcript: Transcript | null;
  maxSegments?: number;
}) {
  if (!transcript || !transcript.segments?.length) {
    return (
      <p className="text-slate-500 text-sm">Транскрипт недоступен</p>
    );
  }

  const segments = transcript.segments.slice(0, maxSegments);

  return (
    <div className="space-y-2">
      {segments.map((segment, index) => (
        <div key={index} className="text-sm">
          <span className="text-slate-400">{segment.speaker}: </span>
          <span className="text-slate-300 line-clamp-2">{segment.text}</span>
        </div>
      ))}
      {transcript.segments.length > maxSegments && (
        <p className="text-xs text-slate-500">
          ... и еще {transcript.segments.length - maxSegments} сегментов
        </p>
      )}
    </div>
  );
}
