"use client";

import { useMemo, useState } from "react";
import {
  MessageSquare,
  List,
  AlignJustify,
  Pencil,
  X,
  Check,
  Download,
  Loader2,
  Save,
  Share2,
  Copy,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { Transcript, TranscriptSegment, Speaker } from "@/types/database";

type ViewMode = "segments" | "fulltext" | "edit";

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
  recordingId?: string;
  onUpdate?: () => void;
}

export function TranscriptView({
  transcript,
  speakers,
  currentTime = 0,
  onSegmentClick,
  recordingId,
  onUpdate,
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

  const [viewMode, setViewMode] = useState<ViewMode>("segments");
  const [editedText, setEditedText] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "shared">("idle");

  // Generate full text for sharing/editing
  const fullTextForEdit = useMemo(() => {
    if (!transcript) return "";
    if (transcript.full_text) return transcript.full_text;
    return transcript.segments
      .map((s) => `[${getSpeakerName(s.speaker)}]: ${s.text}`)
      .join("\n\n");
  }, [transcript, speakerMap]);

  const handleStartEdit = () => {
    setEditedText(fullTextForEdit);
    setViewMode("edit");
  };

  const handleCancelEdit = () => {
    setEditedText("");
    setViewMode("segments");
  };

  const handleSave = async () => {
    if (!recordingId || !editedText.trim()) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/recordings/${recordingId}/transcript`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editedText }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save");
      }

      setViewMode("segments");
      onUpdate?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportDocx = async (useEdited: boolean = false) => {
    if (!recordingId) return;

    setIsExporting(true);
    try {
      let response: Response;

      if (useEdited && editedText) {
        // POST with edited content
        response = await fetch(`/api/recordings/${recordingId}/export/docx`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "transcript", content: editedText }),
        });
      } else {
        // GET original transcript
        response = await fetch(
          `/api/recordings/${recordingId}/export/docx?type=transcript`
        );
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to export");
      }

      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "transcript.docx";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?([^;\n]+)/i);
        if (match) {
          filename = decodeURIComponent(match[1].replace(/["']/g, ""));
        }
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось экспортировать");
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    const textToShare = fullTextForEdit;

    // Try native share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Транскрипт",
          text: textToShare,
        });
        setShareStatus("shared");
        setTimeout(() => setShareStatus("idle"), 2000);
        return;
      } catch (err) {
        // User cancelled or share failed, fall back to clipboard
        if ((err as Error).name === "AbortError") return;
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(textToShare);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    } catch {
      alert("Не удалось скопировать текст");
    }
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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 shrink-0 mb-4">
        {/* View mode toggle */}
        <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg">
          <button
            onClick={() => setViewMode("segments")}
            className={cn(
              "flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              viewMode === "segments"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white"
            )}
            title="Показать сегменты по спикерам"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">Сегменты</span>
          </button>
          <button
            onClick={() => setViewMode("fulltext")}
            className={cn(
              "flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              viewMode === "fulltext"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white"
            )}
            title="Показать сплошной текст"
          >
            <AlignJustify className="w-4 h-4" />
            <span className="hidden sm:inline">Текст</span>
          </button>
          <button
            onClick={handleStartEdit}
            className={cn(
              "flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              viewMode === "edit"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white"
            )}
            title="Редактировать транскрипт"
          >
            <Pencil className="w-4 h-4" />
            <span className="hidden sm:inline">Редактировать</span>
          </button>
        </div>

        {/* Action buttons */}
        {viewMode !== "edit" && (
          <div className="flex items-center gap-2 ml-auto">
            {/* Share button */}
            <button
              onClick={handleShare}
              className={cn(
                "flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                shareStatus !== "idle"
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-700 hover:bg-slate-600 text-white"
              )}
              title="Поделиться"
            >
              {shareStatus === "copied" ? (
                <>
                  <Check className="w-4 h-4" />
                  <span className="hidden sm:inline">Скопировано</span>
                </>
              ) : shareStatus === "shared" ? (
                <>
                  <Check className="w-4 h-4" />
                  <span className="hidden sm:inline">Отправлено</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Поделиться</span>
                </>
              )}
            </button>

            {/* Export button */}
            {recordingId && (
              <button
                onClick={() => handleExportDocx(false)}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Экспорт DOCX</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content based on view mode */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {viewMode === "edit" ? (
          <div className="space-y-4 h-full flex flex-col">
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full flex-1 p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-200 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              placeholder="Редактируйте транскрипт..."
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Сохранить
              </button>
              <button
                onClick={() => handleExportDocx(true)}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Экспорт DOCX
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                <X className="w-4 h-4" />
                Отмена
              </button>
            </div>
          </div>
        ) : viewMode === "segments" ? (
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
        ) : (
          <FullTextView
            transcript={transcript}
            speakers={speakers}
            currentTime={currentTime}
            onSegmentClick={onSegmentClick}
          />
        )}
      </div>
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

// Full text view for continuous reading with speaker breaks
interface FullTextViewProps {
  transcript: Transcript;
  speakers: Speaker[];
  currentTime?: number;
  onSegmentClick?: (startTime: number) => void;
}

function FullTextView({ transcript, speakers, currentTime = 0, onSegmentClick }: FullTextViewProps) {
  // Create speaker name map
  const speakerMap = useMemo(() => {
    const map = new Map<string, { name: string; colorIndex: number }>();
    speakers.forEach((s, index) => {
      const key = `Speaker ${s.speaker_index}`;
      map.set(key, { name: s.name || key, colorIndex: index % SPEAKER_COLORS.length });
    });
    return map;
  }, [speakers]);

  const getSpeakerName = (speaker: string): string => {
    return speakerMap.get(speaker)?.name || speaker;
  };

  const getColorIndex = (speaker: string): number => {
    return speakerMap.get(speaker)?.colorIndex ?? 0;
  };

  // Find current segment for highlighting
  const currentSegmentIndex = transcript.segments.findIndex(
    s => currentTime >= s.start && currentTime < s.end
  );

  // Check if there's only one speaker
  const uniqueSpeakers = useMemo(() => {
    return new Set(transcript.segments.map(s => s.speaker));
  }, [transcript.segments]);

  const hasSingleSpeaker = uniqueSpeakers.size <= 1;

  // Group segments into paragraphs with logical breaks
  const paragraphs = useMemo(() => {
    const result: Array<{
      speaker: string;
      segments: Array<{ text: string; start: number; index: number }>;
    }> = [];

    let currentParagraph: typeof result[0] | null = null;
    let wordCount = 0;
    let segmentCount = 0;
    const WORDS_PER_PARAGRAPH = 50; // Break every ~50 words
    const MAX_SEGMENTS_PER_PARAGRAPH = 5; // Or every 5 segments

    transcript.segments.forEach((segment, index) => {
      const isNewSpeaker = !currentParagraph || currentParagraph.speaker !== segment.speaker;

      // Count words in this segment
      const wordsInSegment = segment.text.split(/\s+/).length;

      // Check if we should start a new paragraph
      const shouldBreak = isNewSpeaker ||
        (hasSingleSpeaker && (wordCount >= WORDS_PER_PARAGRAPH || segmentCount >= MAX_SEGMENTS_PER_PARAGRAPH));

      if (shouldBreak) {
        currentParagraph = { speaker: segment.speaker, segments: [] };
        result.push(currentParagraph);
        wordCount = 0;
        segmentCount = 0;
      }

      currentParagraph!.segments.push({
        text: segment.text,
        start: segment.start,
        index
      });
      wordCount += wordsInSegment;
      segmentCount += 1;
    });

    return result;
  }, [transcript.segments, hasSingleSpeaker]);

  // Split text into paragraphs by word count
  const splitTextIntoParagraphs = (text: string, wordsPerParagraph: number = 50): string[] => {
    const words = text.split(/\s+/);
    const paragraphs: string[] = [];

    for (let i = 0; i < words.length; i += wordsPerParagraph) {
      paragraphs.push(words.slice(i, i + wordsPerParagraph).join(' '));
    }

    return paragraphs;
  };

  // If we have full_text, show it with line breaks preserved
  if (transcript.full_text) {
    // First try to split by natural paragraph breaks
    let textParagraphs = transcript.full_text
      .split(/\n\n+/)
      .filter(p => p.trim());

    // If only one paragraph and it's long, split by word count
    if (textParagraphs.length === 1 && textParagraphs[0].split(/\s+/).length > 60) {
      textParagraphs = splitTextIntoParagraphs(textParagraphs[0], 50);
    }

    return (
      <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/30">
        <div className="text-slate-200 leading-relaxed text-base space-y-4">
          {textParagraphs.map((paragraph, idx) => (
            <p key={idx}>
              {paragraph.trim()}
            </p>
          ))}
        </div>
      </div>
    );
  }

  // For single speaker - clean continuous text with paragraph breaks
  if (hasSingleSpeaker) {
    return (
      <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/30 space-y-4">
        {paragraphs.map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex} className="text-slate-200 leading-relaxed text-base">
            {paragraph.segments.map((seg, segIdx) => (
              <span
                key={seg.index}
                onClick={() => onSegmentClick?.(seg.start)}
                className={cn(
                  "cursor-pointer transition-colors hover:text-orange-400",
                  currentSegmentIndex === seg.index && "bg-orange-500/20 text-orange-300 rounded px-1"
                )}
                title={formatDuration(seg.start)}
              >
                {seg.text}
                {segIdx < paragraph.segments.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        ))}
      </div>
    );
  }

  // Multiple speakers - show with speaker labels and color coding
  return (
    <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/30 space-y-5">
      {paragraphs.map((paragraph, paragraphIndex) => {
        const colorIndex = getColorIndex(paragraph.speaker);
        const color = SPEAKER_COLORS[colorIndex];

        return (
          <div key={paragraphIndex} className={cn(
            "pl-4 border-l-2",
            color.border
          )}>
            {/* Speaker label */}
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("w-2 h-2 rounded-full", color.dot)} />
              <span className={cn("text-sm font-medium", color.text)}>
                {getSpeakerName(paragraph.speaker)}
              </span>
              <span className="text-xs text-slate-500">
                {formatDuration(paragraph.segments[0].start)}
              </span>
            </div>
            {/* Speaker's text */}
            <p className="text-slate-200 leading-relaxed text-base">
              {paragraph.segments.map((seg, segIdx) => (
                <span
                  key={seg.index}
                  onClick={() => onSegmentClick?.(seg.start)}
                  className={cn(
                    "cursor-pointer transition-colors hover:text-orange-400",
                    currentSegmentIndex === seg.index && "bg-orange-500/20 text-orange-300 rounded px-1"
                  )}
                  title={formatDuration(seg.start)}
                >
                  {seg.text}
                  {segIdx < paragraph.segments.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
          </div>
        );
      })}
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
