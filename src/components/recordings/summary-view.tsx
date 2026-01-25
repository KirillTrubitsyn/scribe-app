"use client";

import { useMemo } from "react";
import {
  FileText,
  CheckCircle2,
  ListTodo,
  Sparkles,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/types/database";

interface SummaryViewProps {
  artifacts: Artifact[];
}

// Types for parsed artifact content
interface ActionItem {
  task: string;
  assignee?: string;
  deadline?: string;
  priority?: "high" | "medium" | "low";
}

interface Decision {
  text: string;
  context?: string;
}

interface ParsedSummary {
  summary: string;
  keyPoints?: string[];
  decisions?: Decision[];
  actionItems?: ActionItem[];
  topics?: string[];
}

export function SummaryView({ artifacts }: SummaryViewProps) {
  // Find the summary artifact
  const summaryArtifact = artifacts.find((a) => a.type === "summary");
  const actionItemsArtifact = artifacts.find((a) => a.type === "action_items");

  // Parse summary content (handles both plain text and JSON)
  const parsedSummary = useMemo((): ParsedSummary | null => {
    if (!summaryArtifact) return null;

    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(summaryArtifact.content);
      return parsed as ParsedSummary;
    } catch {
      // If not JSON, treat as plain text summary
      return {
        summary: summaryArtifact.content,
      };
    }
  }, [summaryArtifact]);

  // Parse action items
  const actionItems = useMemo((): ActionItem[] => {
    if (!actionItemsArtifact) return [];

    try {
      const parsed = JSON.parse(actionItemsArtifact.content);
      return Array.isArray(parsed)
        ? parsed
        : parsed.items || parsed.actionItems || [];
    } catch {
      // Try to parse from plain text (one task per line)
      return actionItemsArtifact.content
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => ({
          task: line.replace(/^[-*•]\s*/, "").trim(),
        }));
    }
  }, [actionItemsArtifact]);

  if (!summaryArtifact && !actionItemsArtifact) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Sparkles className="w-12 h-12 mb-4 opacity-50" />
        <p>AI-анализ пока недоступен</p>
        <p className="text-sm mt-1">
          Он появится после завершения обработки записи
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Section */}
      {parsedSummary && (
        <SummarySection
          title="Краткое содержание"
          icon={<FileText className="w-5 h-5" />}
        >
          <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
            {parsedSummary.summary}
          </p>

          {/* Key Points */}
          {parsedSummary.keyPoints && parsedSummary.keyPoints.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium text-slate-400">
                Ключевые моменты
              </h4>
              <ul className="space-y-1">
                {parsedSummary.keyPoints.map((point, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-slate-300"
                  >
                    <span className="text-orange-500 mt-1">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Topics */}
          {parsedSummary.topics && parsedSummary.topics.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-slate-400 mb-2">Темы</h4>
              <div className="flex flex-wrap gap-2">
                {parsedSummary.topics.map((topic, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-slate-700/50 rounded text-sm text-slate-300"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </SummarySection>
      )}

      {/* Decisions Section */}
      {parsedSummary?.decisions && parsedSummary.decisions.length > 0 && (
        <SummarySection
          title="Принятые решения"
          icon={<CheckCircle2 className="w-5 h-5" />}
        >
          <ul className="space-y-3">
            {parsedSummary.decisions.map((decision, index) => (
              <li
                key={index}
                className="flex items-start gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-slate-200">
                    {typeof decision === "string" ? decision : decision.text}
                  </p>
                  {typeof decision !== "string" && decision.context && (
                    <p className="text-sm text-slate-400 mt-1">
                      {decision.context}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SummarySection>
      )}

      {/* Action Items Section */}
      {actionItems.length > 0 && (
        <SummarySection
          title="Задачи"
          icon={<ListTodo className="w-5 h-5" />}
        >
          <ul className="space-y-3">
            {actionItems.map((item, index) => (
              <li
                key={index}
                className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-5 h-5 rounded border-2 mt-0.5 shrink-0",
                      item.priority === "high"
                        ? "border-red-500"
                        : item.priority === "medium"
                          ? "border-amber-500"
                          : "border-slate-500"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200">{item.task}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                      {item.assignee && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <User className="w-4 h-4" />
                          {item.assignee}
                        </span>
                      )}
                      {item.deadline && (
                        <span className="text-slate-500">
                          Срок: {item.deadline}
                        </span>
                      )}
                      {item.priority && (
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-xs",
                            item.priority === "high" &&
                              "bg-red-500/20 text-red-400",
                            item.priority === "medium" &&
                              "bg-amber-500/20 text-amber-400",
                            item.priority === "low" &&
                              "bg-slate-500/20 text-slate-400"
                          )}
                        >
                          {item.priority === "high"
                            ? "Высокий"
                            : item.priority === "medium"
                              ? "Средний"
                              : "Низкий"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SummarySection>
      )}
    </div>
  );
}

interface SummarySectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function SummarySection({ title, icon, children }: SummarySectionProps) {
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
