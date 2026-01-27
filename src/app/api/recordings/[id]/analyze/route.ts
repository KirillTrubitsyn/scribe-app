import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { Transcript, ArtifactType } from "@/types/database";

// ============================================
// Types
// ============================================

interface ArtifactData {
  type: ArtifactType;
  content: string;
  metadata?: Record<string, unknown>;
}

interface SummaryOutput {
  summary: string;
  key_points: string[];
  main_topics: string[];
  participants_mentioned: string[];
}

interface ActionItemsOutput {
  action_items: Array<{
    task: string;
    assignee: string | null;
    deadline: string | null;
    priority: "high" | "medium" | "low";
    context: string;
  }>;
}

// ============================================
// Prompts (Russian)
// ============================================

const SUMMARY_PROMPT = `Ты — профессиональный ассистент для анализа аудиозаписей.

Проанализируй транскрипт и создай структурированное резюме.

Твой ответ должен быть валидным JSON со следующей структурой:
{
  "summary": "Подробное резюме содержания в 2-3 абзацах",
  "key_points": ["Ключевой момент 1", "Ключевой момент 2", ...],
  "main_topics": ["Основная тема 1", "Основная тема 2", ...],
  "participants_mentioned": ["Имя 1", "Имя 2", ...]
}

Сфокусируйся на:
- Главных темах
- Важных моментах
- Упомянутых именах или названиях

Если это песня или музыкальная запись, опиши её содержание, настроение и основные темы текста.

Пиши чётко, профессионально, по существу.

Транскрипт:
`;

const ACTION_ITEMS_PROMPT = `Ты — помощник по анализу содержания. Извлеки все задачи, поручения или важные действия из транскрипта.

Твой ответ должен быть валидным JSON со следующей структурой:
{
  "action_items": [
    {
      "task": "Описание задачи или действия",
      "assignee": "Имя ответственного или null",
      "deadline": "Срок выполнения или null",
      "priority": "high" | "medium" | "low",
      "context": "Контекст"
    }
  ]
}

Если это песня или творческий контент без явных задач, верни пустой массив action_items.

Ищи:
- Явные поручения
- Взятые обязательства
- Договорённости о действиях
- Упомянутые дедлайны

Транскрипт:
`;

// ============================================
// Helper Functions
// ============================================

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  return new GoogleGenAI({ apiKey });
}

async function generateContent(genAI: GoogleGenAI, prompt: string): Promise<string> {
  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      temperature: 0.3,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 8192,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
      },
    },
  });

  return response.text || "";
}

function prepareTranscriptForAnalysis(transcript: Transcript): string {
  if (transcript.segments && transcript.segments.length > 0) {
    const formattedSegments = transcript.segments.map((segment) => {
      const mins = Math.floor(segment.start / 60);
      const secs = Math.floor(segment.start % 60);
      const timestamp = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      return `[${timestamp}] ${segment.speaker}: ${segment.text}`;
    });
    return formattedSegments.join("\n\n");
  }

  return transcript.full_text;
}

function parseJsonResponse<T>(response: string): T | null {
  let jsonStr = response.trim();

  // Remove markdown code block if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object in the response
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    console.error("[Analysis] Failed to parse JSON response");
    return null;
  }
}

// ============================================
// Route Handler
// ============================================

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recordingId } = await params;

  // 1. Verify user has access to recording via RLS
  const supabase = await createClient();
  const { data: accessCheck, error: accessError } = await supabase
    .from("recordings")
    .select("id, status")
    .eq("id", recordingId)
    .single();

  if (accessError || !accessCheck) {
    return NextResponse.json(
      { error: "Recording not found or access denied" },
      { status: 404 }
    );
  }

  if (accessCheck.status !== "ready") {
    return NextResponse.json(
      { error: "Recording must be in 'ready' status for analysis" },
      { status: 400 }
    );
  }

  // 2. Use admin client for operations
  const adminClient = createAdminClient();

  // 3. Check if Gemini API key is configured
  if (!process.env.GEMINI_API_KEY) {
    console.error("[Analysis] GEMINI_API_KEY not configured");
    return NextResponse.json(
      { error: "AI analysis service not configured" },
      { status: 503 }
    );
  }

  // 4. Fetch existing transcript
  const { data: transcriptData, error: transcriptError } = await adminClient
    .from("transcripts")
    .select("*")
    .eq("recording_id", recordingId)
    .single();

  if (transcriptError || !transcriptData) {
    return NextResponse.json(
      { error: "Transcript not found for this recording" },
      { status: 404 }
    );
  }

  const transcript = transcriptData as Transcript;

  // 5. Update recording status to analyzing
  await adminClient
    .from("recordings")
    .update({
      status: "analyzing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordingId);

  try {
    // 6. Run AI analysis
    console.log(`[Analysis] Starting analysis for recording ${recordingId}`);

    const genAI = getGeminiClient();
    const fullText = prepareTranscriptForAnalysis(transcript);

    if (!fullText || fullText.length < 50) {
      console.log("[Analysis] Transcript too short for meaningful analysis");

      // Save minimal summary
      await adminClient.from("artifacts").delete().eq("recording_id", recordingId);
      await adminClient.from("artifacts").insert({
        recording_id: recordingId,
        type: "summary",
        content: JSON.stringify({
          summary: "Транскрипт слишком короткий для полноценного анализа.",
          key_points: [],
          main_topics: [],
          participants_mentioned: [],
        }),
        metadata: { generated_at: new Date().toISOString() },
      });

      await adminClient
        .from("recordings")
        .update({
          status: "ready",
          updated_at: new Date().toISOString(),
        })
        .eq("id", recordingId);

      return NextResponse.json({
        success: true,
        message: "Analysis completed (transcript too short)",
      });
    }

    // Run summary and action items analyses in parallel
    console.log("[Analysis] Running analyses in parallel...");

    const [summaryText, actionItemsText] = await Promise.all([
      generateContent(genAI, SUMMARY_PROMPT + fullText),
      generateContent(genAI, ACTION_ITEMS_PROMPT + fullText),
    ]);

    const artifacts: ArtifactData[] = [];

    // Parse summary
    const summary = parseJsonResponse<SummaryOutput>(summaryText);
    if (summary) {
      artifacts.push({
        type: "summary",
        content: JSON.stringify(summary),
        metadata: { generated_at: new Date().toISOString() },
      });
      console.log("[Analysis] Summary generated successfully");
    }

    // Parse action items
    const actionItems = parseJsonResponse<ActionItemsOutput>(actionItemsText);
    if (actionItems) {
      artifacts.push({
        type: "action_items",
        content: JSON.stringify(actionItems),
        metadata: {
          generated_at: new Date().toISOString(),
          count: actionItems.action_items.length,
        },
      });
      console.log(
        `[Analysis] Action items generated: ${actionItems.action_items.length} items`
      );
    }

    // 7. Save artifacts to database
    if (artifacts.length > 0) {
      // Delete existing artifacts
      await adminClient.from("artifacts").delete().eq("recording_id", recordingId);

      // Insert new artifacts
      const artifactsInsert = artifacts.map((a) => ({
        recording_id: recordingId,
        type: a.type,
        content: a.content,
        metadata: a.metadata || null,
      }));

      const { error: insertError } = await adminClient
        .from("artifacts")
        .insert(artifactsInsert);

      if (insertError) {
        console.error("[Analysis] Failed to save artifacts:", insertError);
        throw new Error("Failed to save analysis results");
      }

      console.log(
        `[Analysis] Saved ${artifacts.length} artifacts for recording ${recordingId}`
      );
    }

    // 8. Update recording status back to ready
    await adminClient
      .from("recordings")
      .update({
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordingId);

    console.log(`[Analysis] Analysis completed for recording ${recordingId}`);

    return NextResponse.json({
      success: true,
      message: "Analysis completed successfully",
      artifacts_count: artifacts.length,
    });
  } catch (error) {
    console.error("[Analysis] Error during analysis:", error);

    // Revert status to ready on error
    await adminClient
      .from("recordings")
      .update({
        status: "ready",
        error_message:
          error instanceof Error ? error.message : "Analysis failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordingId);

    return NextResponse.json(
      { error: "Analysis failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
