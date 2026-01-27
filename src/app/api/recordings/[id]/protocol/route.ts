import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { Transcript, Artifact, Speaker } from "@/types/database";

// ============================================
// Types
// ============================================

interface ProtocolOutput {
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

// ============================================
// Prompt
// ============================================

const PROTOCOL_PROMPT = `Ты — секретарь совещания. Создай официальный протокол на основе транскрипта.

Твой ответ должен быть валидным JSON со следующей структурой:
{
  "title": "Название совещания (определи по содержанию)",
  "date": "Дата совещания (если упоминается) или 'Не указано'",
  "participants": ["Участник 1", "Участник 2", ...],
  "agenda": ["Пункт повестки 1", "Пункт повестки 2", ...],
  "discussion": [
    {
      "topic": "Название темы",
      "summary": "Краткое содержание обсуждения",
      "decisions": ["Решение 1", "Решение 2"]
    }
  ],
  "conclusions": ["Итог 1", "Итог 2", ...],
  "next_steps": ["Следующий шаг 1", "Следующий шаг 2", ...]
}

Требования:
- Используй деловой стиль
- Формулируй решения чётко и конкретно
- Указывай ответственных, если они упоминаются
- Группируй обсуждение по логическим темам
- Если это не совещание, а другой тип записи — адаптируй формат

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

function prepareTranscriptForAnalysis(transcript: Transcript, speakers?: Speaker[]): string {
  if (transcript.segments && transcript.segments.length > 0) {
    // Build speaker name mapping
    const speakerNameMap = new Map<string, string>();
    if (speakers) {
      for (const speaker of speakers) {
        const key = `Speaker ${speaker.speaker_index}`;
        // Use custom name or Russian label for consistency
        speakerNameMap.set(key, speaker.name || `Спикер ${speaker.speaker_index}`);
      }
    }

    const formattedSegments = transcript.segments.map((segment) => {
      const speakerName = speakerNameMap.get(segment.speaker) || segment.speaker;
      const mins = Math.floor(segment.start / 60);
      const secs = Math.floor(segment.start % 60);
      const timestamp = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      return `[${timestamp}] ${speakerName}: ${segment.text}`;
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
    console.error("[Protocol] Failed to parse JSON response");
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
      { error: "Recording must be in 'ready' status" },
      { status: 400 }
    );
  }

  // 2. Check if Gemini API key is configured
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "AI service not configured" },
      { status: 503 }
    );
  }

  // 3. Fetch transcript
  const adminClient = createAdminClient();
  const { data: transcriptData, error: transcriptError } = await adminClient
    .from("transcripts")
    .select("*")
    .eq("recording_id", recordingId)
    .single();

  if (transcriptError || !transcriptData) {
    return NextResponse.json(
      { error: "Transcript not found" },
      { status: 404 }
    );
  }

  const transcript = transcriptData as Transcript;

  // 4. Fetch speakers for name mapping
  const { data: speakersData } = await adminClient
    .from("speakers")
    .select("*")
    .eq("recording_id", recordingId);

  const speakers = (speakersData || []) as Speaker[];

  try {
    // 5. Generate protocol
    console.log(`[Protocol] Generating protocol for recording ${recordingId}`);

    const genAI = getGeminiClient();
    const fullText = prepareTranscriptForAnalysis(transcript, speakers);

    if (!fullText || fullText.length < 50) {
      return NextResponse.json(
        { error: "Transcript too short for protocol generation" },
        { status: 400 }
      );
    }

    const responseText = await generateContent(genAI, PROTOCOL_PROMPT + fullText);
    const protocol = parseJsonResponse<ProtocolOutput>(responseText);

    if (!protocol) {
      return NextResponse.json(
        { error: "Failed to generate protocol" },
        { status: 500 }
      );
    }

    // 6. Save protocol as artifact
    // First, delete existing protocol artifact
    await adminClient
      .from("artifacts")
      .delete()
      .eq("recording_id", recordingId)
      .eq("type", "protocol");

    // Insert new protocol artifact
    const { error: insertError } = await adminClient
      .from("artifacts")
      .insert({
        recording_id: recordingId,
        type: "protocol",
        content: JSON.stringify(protocol),
        metadata: { generated_at: new Date().toISOString() },
      });

    if (insertError) {
      console.error("[Protocol] Failed to save protocol:", insertError);
      return NextResponse.json(
        { error: "Failed to save protocol" },
        { status: 500 }
      );
    }

    console.log(`[Protocol] Protocol saved for recording ${recordingId}`);

    return NextResponse.json({
      success: true,
      protocol,
    });
  } catch (error) {
    console.error("[Protocol] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate protocol",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve existing protocol
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recordingId } = await params;

  // 1. Verify user has access to recording via RLS
  const supabase = await createClient();
  const { data: accessCheck, error: accessError } = await supabase
    .from("recordings")
    .select("id")
    .eq("id", recordingId)
    .single();

  if (accessError || !accessCheck) {
    return NextResponse.json(
      { error: "Recording not found or access denied" },
      { status: 404 }
    );
  }

  // 2. Fetch protocol artifact
  const adminClient = createAdminClient();
  const { data: artifact, error: artifactError } = await adminClient
    .from("artifacts")
    .select("*")
    .eq("recording_id", recordingId)
    .eq("type", "protocol")
    .single();

  if (artifactError || !artifact) {
    return NextResponse.json(
      { error: "Protocol not found. Generate it first." },
      { status: 404 }
    );
  }

  const artifactData = artifact as Artifact;

  try {
    const protocol = JSON.parse(artifactData.content);
    return NextResponse.json({
      success: true,
      protocol,
      generated_at: artifactData.metadata?.generated_at,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse protocol" },
      { status: 500 }
    );
  }
}
