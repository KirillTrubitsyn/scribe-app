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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/types/database";

interface ProtocolViewProps {
  recordingId: string;
  artifacts: Artifact[];
  hasTranscript: boolean;
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

export function ProtocolView({ recordingId, artifacts, hasTranscript }: ProtocolViewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<ProtocolData | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadProtocol = () => {
    if (!protocol) return;

    // Generate markdown
    let markdown = `# ${protocol.title}\n\n`;
    markdown += `**Дата:** ${protocol.date}\n\n`;

    if (protocol.participants.length > 0) {
      markdown += `## Участники\n`;
      protocol.participants.forEach((p) => {
        markdown += `- ${p}\n`;
      });
      markdown += "\n";
    }

    if (protocol.agenda.length > 0) {
      markdown += `## Повестка дня\n`;
      protocol.agenda.forEach((item, i) => {
        markdown += `${i + 1}. ${item}\n`;
      });
      markdown += "\n";
    }

    if (protocol.discussion.length > 0) {
      markdown += `## Обсуждение\n\n`;
      protocol.discussion.forEach((item) => {
        markdown += `### ${item.topic}\n`;
        markdown += `${item.summary}\n\n`;
        if (item.decisions.length > 0) {
          markdown += `**Решения:**\n`;
          item.decisions.forEach((d) => {
            markdown += `- ${d}\n`;
          });
          markdown += "\n";
        }
      });
    }

    if (protocol.conclusions.length > 0) {
      markdown += `## Итоги\n`;
      protocol.conclusions.forEach((c) => {
        markdown += `- ${c}\n`;
      });
      markdown += "\n";
    }

    if (protocol.next_steps.length > 0) {
      markdown += `## Дальнейшие шаги\n`;
      protocol.next_steps.forEach((step) => {
        markdown += `- ${step}\n`;
      });
    }

    // Download
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

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{protocol.title}</h2>
          <div className="flex items-center gap-2 mt-1 text-slate-400 text-sm">
            <Calendar className="w-4 h-4" />
            <span>{protocol.date}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={generateProtocol}
            disabled={isGenerating}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Перегенерировать"
          >
            <RefreshCw className={cn("w-5 h-5", isGenerating && "animate-spin")} />
          </button>
          <button
            onClick={downloadProtocol}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Скачать"
          >
            <Download className="w-5 h-5" />
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
                {participant}
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
                <span>{item}</span>
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
                <h4 className="font-medium text-white mb-2">{item.topic}</h4>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {item.summary}
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
                          <span>{decision}</span>
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
                <span className="text-slate-200">{conclusion}</span>
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
                <span className="text-slate-200">{step}</span>
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
