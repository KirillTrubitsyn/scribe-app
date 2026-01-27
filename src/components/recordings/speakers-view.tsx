"use client";

import { useState } from "react";
import { User, Pencil, Check, X, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Speaker, Transcript } from "@/types/database";

// Same color palette as transcript
const SPEAKER_COLORS = [
  { bg: "bg-blue-500/20", border: "border-blue-500/30", dot: "bg-blue-500" },
  { bg: "bg-emerald-500/20", border: "border-emerald-500/30", dot: "bg-emerald-500" },
  { bg: "bg-purple-500/20", border: "border-purple-500/30", dot: "bg-purple-500" },
  { bg: "bg-amber-500/20", border: "border-amber-500/30", dot: "bg-amber-500" },
  { bg: "bg-rose-500/20", border: "border-rose-500/30", dot: "bg-rose-500" },
  { bg: "bg-cyan-500/20", border: "border-cyan-500/30", dot: "bg-cyan-500" },
  { bg: "bg-indigo-500/20", border: "border-indigo-500/30", dot: "bg-indigo-500" },
  { bg: "bg-orange-500/20", border: "border-orange-500/30", dot: "bg-orange-500" },
];

interface SpeakersViewProps {
  speakers: Speaker[];
  transcript: Transcript | null;
  recordingId: string;
  onSpeakerUpdate?: (speakerId: string, name: string) => Promise<void>;
}

export function SpeakersView({
  speakers,
  transcript,
  recordingId,
  onSpeakerUpdate,
}: SpeakersViewProps) {
  // Calculate speaking stats from transcript
  const speakerStats = getSpeakerStats(speakers, transcript);

  if (speakers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Users className="w-12 h-12 mb-4 opacity-50" />
        <p>Участники пока не определены</p>
        <p className="text-sm mt-1">
          Они появятся после завершения обработки записи
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 mb-4">
        Вы можете изменить имена участников для лучшей читаемости транскрипта
      </p>

      <div className="grid gap-4">
        {speakers.map((speaker, index) => (
          <SpeakerCard
            key={speaker.id}
            speaker={speaker}
            color={SPEAKER_COLORS[index % SPEAKER_COLORS.length]}
            stats={speakerStats.get(`Speaker ${speaker.speaker_index}`)}
            onUpdate={onSpeakerUpdate}
          />
        ))}
      </div>
    </div>
  );
}

interface SpeakerCardProps {
  speaker: Speaker;
  color: (typeof SPEAKER_COLORS)[0];
  stats?: {
    segments: number;
    words: number;
    durationSeconds: number;
    percentage: number;
  };
  onUpdate?: (speakerId: string, name: string) => Promise<void>;
}

function SpeakerCard({ speaker, color, stats, onUpdate }: SpeakerCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(speaker.name || "");
  const [isSaving, setIsSaving] = useState(false);

  const displayName = speaker.name || `Спикер ${speaker.speaker_index}`;

  const handleSave = async () => {
    if (!onUpdate || !name.trim()) return;

    setIsSaving(true);
    try {
      await onUpdate(speaker.id, name.trim());
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update speaker name:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setName(speaker.name || "");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <div
      className={cn(
        "p-4 rounded-xl border transition-colors",
        color.bg,
        color.border
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Avatar */}
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
              color.dot
            )}
          >
            <User className="w-6 h-6 text-white" />
          </div>

          {/* Name */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Спикер ${speaker.speaker_index}`}
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  autoFocus
                  disabled={isSaving}
                />
                <button
                  onClick={handleSave}
                  disabled={isSaving || !name.trim()}
                  className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-lg font-medium text-white truncate">
                  {displayName}
                </span>
                {onUpdate && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
                    title="Редактировать имя"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {speaker.role && (
              <p className="text-sm text-slate-400 mt-0.5">{speaker.role}</p>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mt-4 pt-4 border-t border-slate-700/30">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-semibold text-white">
                {stats.segments}
              </p>
              <p className="text-xs text-slate-400">реплик</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{stats.words}</p>
              <p className="text-xs text-slate-400">слов</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">
                {stats.percentage}%
              </p>
              <p className="text-xs text-slate-400">времени</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-2 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", color.dot)}
              style={{ width: `${stats.percentage}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function getSpeakerStats(speakers: Speaker[], transcript: Transcript | null) {
  const stats = new Map<
    string,
    {
      segments: number;
      words: number;
      durationSeconds: number;
      percentage: number;
    }
  >();

  if (!transcript?.segments) return stats;

  const totalDuration = transcript.segments.reduce(
    (acc, seg) => acc + (seg.end - seg.start),
    0
  );

  // Initialize stats for all speakers
  speakers.forEach((s) => {
    stats.set(`Speaker ${s.speaker_index}`, {
      segments: 0,
      words: 0,
      durationSeconds: 0,
      percentage: 0,
    });
  });

  // Calculate stats from segments
  transcript.segments.forEach((segment) => {
    const key = segment.speaker;
    const current = stats.get(key) || {
      segments: 0,
      words: 0,
      durationSeconds: 0,
      percentage: 0,
    };

    current.segments++;
    current.words += segment.text.split(/\s+/).filter(Boolean).length;
    current.durationSeconds += segment.end - segment.start;

    stats.set(key, current);
  });

  // Calculate percentages
  stats.forEach((value, key) => {
    value.percentage =
      totalDuration > 0
        ? Math.round((value.durationSeconds / totalDuration) * 100)
        : 0;
  });

  return stats;
}
