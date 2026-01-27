"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText, Sparkles, Users, MessageSquare, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

import { DetailHeader } from "@/components/recordings/detail-header";
import { AudioPlayer, AudioPlayerPlaceholder } from "@/components/recordings/audio-player";
import { TranscriptView } from "@/components/recordings/transcript-view";
import { SummaryView } from "@/components/recordings/summary-view";
import { SpeakersView } from "@/components/recordings/speakers-view";
import { AIChat } from "@/components/recordings/ai-chat";
import { ProtocolView } from "@/components/recordings/protocol-view";
import { DetailSidebar } from "@/components/recordings/detail-sidebar";
import { ProcessingStatus } from "@/components/recordings/processing-status";
import { ChatHistory } from "@/components/recordings/chat-history";
import { ErrorBoundary } from "@/components/error-boundary";
import { createChatSession } from "@/lib/chat-storage";

import type { Recording, Transcript, Artifact, Speaker } from "@/types/database";

type RecordingWithData = Recording & {
  audioUrl: string | null;
  transcripts: Transcript[];
  artifacts: Artifact[];
  speakers: Speaker[];
};

type TabValue = "transcript" | "summary" | "protocol" | "chat" | "speakers";

const TABS: { value: TabValue; label: string; icon: React.ReactNode }[] = [
  { value: "transcript", label: "Транскрипт", icon: <FileText className="w-4 h-4" /> },
  { value: "summary", label: "Резюме", icon: <Sparkles className="w-4 h-4" /> },
  { value: "protocol", label: "Протокол", icon: <ClipboardList className="w-4 h-4" /> },
  { value: "chat", label: "Чат с ИИ", icon: <MessageSquare className="w-4 h-4" /> },
  { value: "speakers", label: "Участники", icon: <Users className="w-4 h-4" /> },
];

export default function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();

  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingWithData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [activeTab, setActiveTab] = useState<TabValue>("transcript");
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);

  // Chat state
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatHistoryRefresh, setChatHistoryRefresh] = useState(0);

  // Resolve params
  useEffect(() => {
    params.then(({ id }) => setRecordingId(id));
  }, [params]);

  // Fetch recording data
  useEffect(() => {
    if (!recordingId) return;

    async function fetchRecording() {
      try {
        const response = await fetch(`/api/recordings/${recordingId}`);
        if (!response.ok) {
          throw new Error("Recording not found");
        }
        const data = await response.json();
        // Normalize data to ensure arrays are never null
        setRecording({
          ...data,
          transcripts: data.transcripts || [],
          artifacts: data.artifacts || [],
          speakers: data.speakers || [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load recording");
      } finally {
        setLoading(false);
      }
    }

    fetchRecording();
  }, [recordingId]);

  // Poll for updates when processing
  useEffect(() => {
    if (!recording || recording.status === "ready" || recording.status === "error") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/recordings/${recordingId}`);
        if (response.ok) {
          const data = await response.json();
          // Normalize data to ensure arrays are never null
          setRecording({
            ...data,
            transcripts: data.transcripts || [],
            artifacts: data.artifacts || [],
            speakers: data.speakers || [],
          });
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [recording, recordingId]);

  const handleSegmentClick = useCallback((startTime: number) => {
    setSeekTo(startTime);
    // Reset seekTo after a short delay to allow re-clicking same segment
    setTimeout(() => setSeekTo(null), 100);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleDownloadAudio = async () => {
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
    } catch {
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
    } catch {
      alert("Не удалось удалить запись");
      setIsDeleting(false);
    }
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAIAnalysis = async () => {
    if (!recordingId || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/recordings/${recordingId}/analyze`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start analysis");
      }

      // Refresh recording data to show new artifacts
      const refreshResponse = await fetch(`/api/recordings/${recordingId}`);
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        setRecording({
          ...data,
          transcripts: data.transcripts || [],
          artifacts: data.artifacts || [],
          speakers: data.speakers || [],
        });
        // Switch to summary tab to show results
        setActiveTab("summary");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось запустить AI-анализ");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRetryProcessing = async () => {
    if (!recordingId) return;

    try {
      const response = await fetch("/api/webhook/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recording_id: recordingId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to retry processing");
      }

      // Refresh recording data to show new status
      const refreshResponse = await fetch(`/api/recordings/${recordingId}`);
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        // Normalize data to ensure arrays are never null
        setRecording({
          ...data,
          transcripts: data.transcripts || [],
          artifacts: data.artifacts || [],
          speakers: data.speakers || [],
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось запустить обработку");
    }
  };

  const handleSpeakerUpdate = async (speakerId: string, name: string) => {
    if (!recordingId) return;

    try {
      const response = await fetch(`/api/recordings/${recordingId}/speakers/${speakerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update speaker");
      }

      // Refresh recording data to update speaker names everywhere
      await refreshRecording();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось обновить имя спикера");
      throw err; // Re-throw to let the SpeakerCard handle UI state
    }
  };

  const refreshRecording = useCallback(async () => {
    if (!recordingId) return;

    try {
      const response = await fetch(`/api/recordings/${recordingId}`);
      if (response.ok) {
        const data = await response.json();
        setRecording({
          ...data,
          transcripts: data.transcripts || [],
          artifacts: data.artifacts || [],
          speakers: data.speakers || [],
        });
      }
    } catch {
      // Ignore refresh errors
    }
  }, [recordingId]);

  // Chat handlers
  const handleChatChange = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
  }, []);

  const handleChatUpdate = useCallback(() => {
    setChatHistoryRefresh((prev) => prev + 1);
  }, []);

  const handleNewChat = useCallback(() => {
    if (!recordingId) return;
    const newSession = createChatSession(recordingId);
    setCurrentChatId(newSession.id);
    setChatHistoryRefresh((prev) => prev + 1);
  }, [recordingId]);

  const handleSelectChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    setActiveTab("chat");
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Error state
  if (error || !recording) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-4">{error || "Запись не найдена"}</p>
        <button
          onClick={() => router.push("/recordings")}
          className="text-slate-400 hover:text-white transition-colors"
        >
          Вернуться к списку записей
        </button>
      </div>
    );
  }

  // Processing state - show progress page
  if (recording.status !== "ready" && recording.status !== "error") {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <DetailHeader recording={recording} speakers={recording.speakers ?? []} />
        <div className="mt-8">
          <ProcessingStatus status={recording.status} />
        </div>
      </div>
    );
  }

  // Error state from processing
  if (recording.status === "error") {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <DetailHeader recording={recording} speakers={recording.speakers ?? []} />
        <div className="mt-8">
          <ProcessingStatus
            status={recording.status}
            errorMessage={recording.error_message}
            onRetry={handleRetryProcessing}
          />
        </div>
      </div>
    );
  }

  const transcript = recording.transcripts?.[0] ?? null;

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <DetailHeader recording={recording} speakers={recording.speakers ?? []} />

        {/* Main content with sidebar */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Left column - Player, Tabs, Content */}
          <div className="flex flex-col gap-6 min-w-0 h-[calc(100vh-48px)]">
            {/* Audio Player */}
            {recording.audioUrl ? (
              <AudioPlayer
                audioUrl={recording.audioUrl}
                onTimeUpdate={handleTimeUpdate}
                seekTo={seekTo}
              />
            ) : (
              <AudioPlayerPlaceholder message="Аудиофайл недоступен" />
            )}

            {/* Tabs */}
            <div className="border-b border-slate-700/50 shrink-0">
              <div className="flex gap-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                      activeTab === tab.value
                        ? "text-orange-500 border-orange-500"
                        : "text-slate-400 border-transparent hover:text-white hover:border-slate-600"
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 min-h-0">
              <ErrorBoundary>
                {activeTab === "transcript" && (
                  <TranscriptView
                    transcript={transcript}
                    speakers={recording.speakers ?? []}
                    currentTime={currentTime}
                    onSegmentClick={handleSegmentClick}
                    recordingId={recording.id}
                    onUpdate={refreshRecording}
                  />
                )}

                {activeTab === "summary" && (
                  <SummaryView
                    artifacts={recording.artifacts ?? []}
                    recordingId={recording.id}
                    onUpdate={refreshRecording}
                  />
                )}

                {activeTab === "protocol" && (
                  <ProtocolView
                    recordingId={recording.id}
                    artifacts={recording.artifacts ?? []}
                    hasTranscript={!!transcript}
                    onUpdate={refreshRecording}
                  />
                )}

                {activeTab === "chat" && (
                  <AIChat
                    recordingId={recording.id}
                    hasTranscript={!!transcript}
                    currentChatId={currentChatId}
                    onChatChange={handleChatChange}
                    onChatUpdate={handleChatUpdate}
                  />
                )}

                {activeTab === "speakers" && (
                  <SpeakersView
                    speakers={recording.speakers ?? []}
                    transcript={transcript}
                    recordingId={recording.id}
                    onSpeakerUpdate={handleSpeakerUpdate}
                  />
                )}
              </ErrorBoundary>
            </div>
          </div>

          {/* Right column - Sidebar */}
          <aside className="lg:sticky lg:top-8 lg:self-start space-y-6">
            <DetailSidebar
              recording={recording}
              transcript={transcript}
              artifacts={recording.artifacts ?? []}
              onDownloadAudio={handleDownloadAudio}
              onAIAnalysis={handleAIAnalysis}
              isAnalyzing={isAnalyzing}
            />
            {/* Chat History */}
            {transcript && (
              <ChatHistory
                recordingId={recording.id}
                currentChatId={currentChatId}
                onSelectChat={handleSelectChat}
                onNewChat={handleNewChat}
                refreshTrigger={chatHistoryRefresh}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
