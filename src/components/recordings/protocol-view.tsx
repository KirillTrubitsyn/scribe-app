"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FileText,
  Users,
  ListOrdered,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  Calendar,
  Loader2,
  RefreshCw,
  Download,
  Pencil,
  X,
  Save,
  Share2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/types/database";

// Clean markdown artifacts from text
function cleanText(text: string): string {
  return text
    // Remove bold/italic markers
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove code markers
    .replace(/`([^`]+)`/g, '$1')
    // Clean up extra whitespace
    .trim();
}

interface ProtocolViewProps {
  recordingId: string;
  artifacts: Artifact[];
  hasTranscript: boolean;
  onUpdate?: () => void;
}

interface ProtocolData {
  title: string;
  date: string;
  participants: string[];
  agenda: string[];
  discussion: Array<{
    topic: string;
    summary: string;
    decisions: string[];
  }>;
  conclusions: string[];
  next_steps: string[];
}

export function ProtocolView({ recordingId, artifacts, hasTranscript, onUpdate }: ProtocolViewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<ProtocolData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "shared">("idle");

  // Parse protocol from artifacts
  const existingProtocol = useMemo(() => {
    const protocolArtifact = artifacts.find((a) => a.type === "protocol");
    if (!protocolArtifact) return null;

    try {
      return JSON.parse(protocolArtifact.content) as ProtocolData;
    } catch {
      return null;
    }
  }, [artifacts]);

  useEffect(() => {
    if (existingProtocol) {
      setProtocol(existingProtocol);
    }
  }, [existingProtocol]);

  const generateProtocol = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/recordings/${recordingId}/protocol`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate protocol");
      }

      const data = await response.json();
      setProtocol(data.protocol);
      // Refresh parent to persist the new protocol
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate text for editing
  const generateEditText = (): string => {
    if (!protocol) return "";

    let text = `# ${protocol.title}\n`;
    text += `Дата: ${protocol.date}\n\n`;

    if (protocol.participants.length > 0) {
      text += `# Участники\n`;
      protocol.participants.forEach((p) => {
        text += `• ${p}\n`;
      });
      text += "\n";
    }

    if (protocol.agenda.length > 0) {
      text += `# Повестка дня\n`;
      protocol.agenda.forEach((item, i) => {
        text += `${i + 1}. ${item}\n`;
      });
      text += "\n";
    }

    if (protocol.discussion.length > 0) {
      text += `# Обсуждение\n\n`;
      protocol.discussion.forEach((item) => {
        text += `## ${item.topic}\n`;
        text += `${item.summary}\n`;
        if (item.decisions.length > 0) {
          text += `Решения:\n`;
          item.decisions.forEach((d) => {
            text += `• ${d}\n`;
          });
        }
        text += "\n";
      });
    }

    if (protocol.conclusions.length > 0) {
      text += `# Итоги\n`;
      protocol.conclusions.forEach((c) => {
        text += `• ${c}\n`;
      });
      text += "\n";
    }

    if (protocol.next_steps.length > 0) {
      text += `# Дальнейшие шаги\n`;
      protocol.next_steps.forEach((step) => {
        text += `• ${step}\n`;
      });
    }

    return text;
  };

  const handleShare = async () => {
    const textToShare = generateEditText();
    if (!textToShare) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Протокол",
          text: textToShare,
        });
        setShareStatus("shared");
        setTimeout(() => setShareStatus("idle"), 2000);
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(textToShare);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    } catch {
      alert("Не удалось скопировать текст");
    }
  };

  const handleStartEdit = () => {
    setEditedContent(generateEditText());
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedContent("");
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!editedContent.trim()) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/recordings/${recordingId}/artifacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "protocol", content: editedContent }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save");
      }

      setIsEditing(false);
      onUpdate?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportDocx = async (useEdited: boolean = false) => {
    setIsExporting(true);
    try {
      let response: Response;

      if (useEdited && editedContent) {
        response = await fetch(`/api/recordings/${recordingId}/export/docx`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "protocol", content: editedContent }),
        });
      } else {
        response = await fetch(
          `/api/recordings/${recordingId}/export/docx?type=protocol`
        );
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to export");
      }

      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "protocol.docx";
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

  const downloadProtocolMd = () => {
    if (!protocol) return;

    const markdown = generateEditText();
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `protocol-${protocol.title.replace(/\s+/g, "-").toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!hasTranscript) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FileText className="w-12 h-12 mb-4 opacity-50" />
        <p>Протокол недоступен</p>
        <p className="text-sm mt-1">
          Дождитесь завершения транскрипции записи
        </p>
      </div>
    );
  }

  if (!protocol && !isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <FileText className="w-12 h-12 mb-4 text-slate-500" />
        <p className="text-slate-300 mb-4">Протокол ещё не сгенерирован</p>
        <button
          onClick={generateProtocol}
          className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
        >
          <FileText className="w-5 h-5" />
          Сгенерировать протокол
        </button>
        {error && (
          <p className="text-red-400 mt-4 text-sm">{error}</p>
        )}
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-12 h-12 mb-4 text-orange-500 animate-spin" />
        <p className="text-slate-300">Генерирую протокол...</p>
        <p className="text-slate-500 text-sm mt-1">Это может занять некоторое время</p>
      </div>
    );
  }

  if (!protocol) return null;

  if (isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Редактирование протокола</h2>
        </div>
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="w-full h-[500px] p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-200 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          placeholder="Редактируйте протокол..."
        />
        <div className="flex items-center gap-2">
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
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{protocol.title}</h2>
          <div className="flex items-center gap-2 mt-1 text-slate-400 text-sm">
            <Calendar className="w-4 h-4" />
            <span>{protocol.date}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleShare}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              shareStatus !== "idle"
                ? "bg-emerald-500 text-white"
                : "bg-slate-700 hover:bg-slate-600 text-white"
            )}
          >
            {shareStatus !== "idle" ? (
              <>
                <Check className="w-4 h-4" />
                {shareStatus === "copied" ? "Скопировано" : "Отправлено"}
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                Поделиться
              </>
            )}
          </button>
          <button
            onClick={handleStartEdit}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Редактировать
          </button>
          <button
            onClick={generateProtocol}
            disabled={isGenerating}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Перегенерировать"
          >
            <RefreshCw className={cn("w-5 h-5", isGenerating && "animate-spin")} />
          </button>
          <button
            onClick={() => handleExportDocx(false)}
            disabled={isExporting}
            className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            title="Экспорт DOCX"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Экспорт DOCX
          </button>
        </div>
      </div>

      {/* Participants */}
      {protocol.participants.length > 0 && (
        <ProtocolSection
          title="Участники"
          icon={<Users className="w-5 h-5" />}
        >
          <div className="flex flex-wrap gap-2">
            {protocol.participants.map((participant, index) => (
              <span
                key={index}
                className="px-3 py-1.5 bg-slate-700/50 rounded-full text-sm text-slate-300"
              >
                {cleanText(participant)}
              </span>
            ))}
          </div>
        </ProtocolSection>
      )}

      {/* Agenda */}
      {protocol.agenda.length > 0 && (
        <ProtocolSection
          title="Повестка дня"
          icon={<ListOrdered className="w-5 h-5" />}
        >
          <ol className="space-y-2">
            {protocol.agenda.map((item, index) => (
              <li
                key={index}
                className="flex items-start gap-3 text-slate-300"
              >
                <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm font-medium shrink-0">
                  {index + 1}
                </span>
                <span>{cleanText(item)}</span>
              </li>
            ))}
          </ol>
        </ProtocolSection>
      )}

      {/* Discussion */}
      {protocol.discussion.length > 0 && (
        <ProtocolSection
          title="Ход обсуждения"
          icon={<MessageSquare className="w-5 h-5" />}
        >
          <div className="space-y-4">
            {protocol.discussion.map((item, index) => (
              <div
                key={index}
                className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/30"
              >
                <h4 className="font-medium text-white mb-2">{cleanText(item.topic)}</h4>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {cleanText(item.summary)}
                </p>
                {item.decisions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <p className="text-sm font-medium text-emerald-400 mb-2">
                      Решения:
                    </p>
                    <ul className="space-y-1">
                      {item.decisions.map((decision, dIndex) => (
                        <li
                          key={dIndex}
                          className="flex items-start gap-2 text-sm text-slate-300"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                          <span>{cleanText(decision)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ProtocolSection>
      )}

      {/* Conclusions */}
      {protocol.conclusions.length > 0 && (
        <ProtocolSection
          title="Итоги"
          icon={<CheckCircle2 className="w-5 h-5" />}
        >
          <ul className="space-y-2">
            {protocol.conclusions.map((conclusion, index) => (
              <li
                key={index}
                className="flex items-start gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                <span className="text-slate-200">{cleanText(conclusion)}</span>
              </li>
            ))}
          </ul>
        </ProtocolSection>
      )}

      {/* Next Steps */}
      {protocol.next_steps.length > 0 && (
        <ProtocolSection
          title="Дальнейшие шаги"
          icon={<ArrowRight className="w-5 h-5" />}
        >
          <ul className="space-y-2">
            {protocol.next_steps.map((step, index) => (
              <li
                key={index}
                className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg"
              >
                <ArrowRight className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                <span className="text-slate-200">{cleanText(step)}</span>
              </li>
            ))}
          </ul>
        </ProtocolSection>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

interface ProtocolSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function ProtocolSection({ title, icon, children }: ProtocolSectionProps) {
  return (
    <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-orange-500">{icon}</span>
        <h3 className="text-lg font-medium text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}
