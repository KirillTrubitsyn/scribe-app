import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { TranscriptInsert } from "@/types/database";

/**
 * Save a preliminary realtime transcript (without diarization).
 * This will be replaced by the batch transcript with diarization later.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recordingId } = await params;
    const body = await request.json();
    const { text, segments } = body as {
      text: string;
      segments: Array<{ text: string; timestamp: number }>;
    };

    if (!text) {
      return NextResponse.json(
        { error: "Missing transcript text" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check if a transcript already exists for this recording
    const { data: existing } = await supabase
      .from("transcripts")
      .select("id")
      .eq("recording_id", recordingId)
      .single();

    if (existing) {
      // Don't overwrite an existing (possibly batch) transcript
      return NextResponse.json({ success: true, skipped: true });
    }

    // Convert realtime segments to transcript format
    const transcriptSegments = segments.map((s, i) => ({
      speaker: "Speaker 0",
      start: i * 2, // Approximate timing
      end: (i + 1) * 2,
      text: s.text,
      confidence: 0.8,
      words: [],
    }));

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    const { error: insertError } = await supabase
      .from("transcripts")
      .insert({
        recording_id: recordingId,
        full_text: text,
        segments: transcriptSegments,
        word_count: wordCount,
        language: "ru-RU",
      } as TranscriptInsert);

    if (insertError) {
      console.error("[Realtime Transcript] Insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save transcript" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Realtime Transcript] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
