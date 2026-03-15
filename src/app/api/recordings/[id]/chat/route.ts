import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { GoogleGenAI, type Content } from "@google/genai";
import { generateQueryEmbedding } from "@/lib/embeddings";
import type { Transcript } from "@/types/database";

// ============================================
// Types
// ============================================

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  message: string;
  history?: ChatMessage[];
}

// ============================================
// System Prompt
// ============================================

const SYSTEM_PROMPT = `Ты — интеллектуальный ассистент для анализа транскриптов аудиозаписей.

Твоя задача — отвечать на вопросы пользователя, основываясь ТОЛЬКО на содержании транскрипта.

Правила:
1. Отвечай на русском языке
2. Если информация есть в транскрипте — цитируй или перефразируй её
3. Если информации нет в транскрипте — честно скажи об этом
4. Будь кратким и точным
5. Можешь анализировать, обобщать, находить закономерности
6. Если просят найти конкретную информацию — укажи, в какой части записи она находится (по времени, если доступно)

Возможные типы запросов:
- Вопросы о содержании ("О чём говорили?", "Кто упоминался?")
- Поиск информации ("Когда обсуждали бюджет?", "Что сказал Иван?")
- Анализ ("Какие были основные темы?", "Какие решения приняли?")
- Суммаризация ("Кратко перескажи", "Главные выводы")

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

function prepareTranscriptContext(transcript: Transcript): string {
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

// ============================================
// Route Handler
// ============================================

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recordingId } = await params;

  // 1. Parse request body
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { message, history = [] } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 }
    );
  }

  // 2. Verify user has access to recording via RLS
  const supabase = await createClient();
  const { data: accessCheck, error: accessError } = await supabase
    .from("recordings")
    .select("id, status, title")
    .eq("id", recordingId)
    .single();

  if (accessError || !accessCheck) {
    return NextResponse.json(
      { error: "Recording not found or access denied" },
      { status: 404 }
    );
  }

  // 3. Check if Gemini API key is configured
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "AI chat service not configured" },
      { status: 503 }
    );
  }

  // 4. Fetch transcript
  const adminClient = createAdminClient();
  const { data: transcriptData, error: transcriptError } = await adminClient
    .from("transcripts")
    .select("*")
    .eq("recording_id", recordingId)
    .single();

  if (transcriptError || !transcriptData) {
    return NextResponse.json(
      { error: "Transcript not found. Please wait for processing to complete." },
      { status: 404 }
    );
  }

  const transcript = transcriptData as Transcript;

  try {
    // 5. Try RAG: find relevant chunks via embeddings
    const genAI = getGeminiClient();
    let transcriptContext: string;
    let ragUsed = false;

    try {
      const queryEmbedding = await generateQueryEmbedding(message.trim());
      const { data: relevantChunks } = await adminClient.rpc("match_chunks", {
        query_embedding: `[${queryEmbedding.join(",")}]`,
        match_threshold: 0.35,
        match_count: 8,
        filter_recording_id: recordingId,
      });

      if (relevantChunks && relevantChunks.length > 0) {
        // Use RAG: only pass relevant chunks as context
        transcriptContext = relevantChunks
          .map((chunk: { start_time: number | null; speaker: string | null; text: string; similarity: number }) => {
            const timeStr = chunk.start_time != null
              ? `[${Math.floor(chunk.start_time / 60).toString().padStart(2, "0")}:${Math.floor(chunk.start_time % 60).toString().padStart(2, "0")}]`
              : "";
            const speakerStr = chunk.speaker && chunk.speaker !== "multiple" ? `${chunk.speaker}: ` : "";
            return `${timeStr} ${speakerStr}${chunk.text}`;
          })
          .join("\n\n");
        ragUsed = true;
      } else {
        // No relevant chunks found — fallback to full transcript
        transcriptContext = prepareTranscriptContext(transcript);
      }
    } catch {
      // Embeddings not available — fallback to full transcript
      transcriptContext = prepareTranscriptContext(transcript);
    }

    // Build conversation context
    const contextPrompt = `${SYSTEM_PROMPT}

=== ${ragUsed ? "РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ" : "ТРАНСКРИПТ"} ЗАПИСИ: "${accessCheck.title}" ===

${transcriptContext}

=== КОНЕЦ ${ragUsed ? "ФРАГМЕНТОВ" : "ТРАНСКРИПТА"} ===

`;

    // Build chat history as contents array
    const contents: Content[] = [
      {
        role: "user",
        parts: [{ text: contextPrompt }],
      },
      {
        role: "model",
        parts: [{ text: "Понял. Я готов отвечать на вопросы по этому транскрипту. Что вас интересует?" }],
      },
    ];

    // Add previous messages
    for (const msg of history) {
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      });
    }

    // Add current message
    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    // Send to Gemini
    const result = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 4096,
      },
    });

    const response = result.text || "";

    return NextResponse.json({
      success: true,
      message: response,
    });
  } catch (error) {
    console.error("[Chat] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to process chat message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
