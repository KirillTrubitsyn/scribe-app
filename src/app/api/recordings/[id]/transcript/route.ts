import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// PATCH - Update transcript content
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recordingId } = await params;
    const body = await request.json();
    const { content } = body as { content: string };

    if (!content) {
      return NextResponse.json(
        { error: "Missing content" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Find the transcript for this recording
    const { data: transcript, error: fetchError } = await supabase
      .from("transcripts")
      .select("id")
      .eq("recording_id", recordingId)
      .single();

    if (fetchError || !transcript) {
      console.error("[API /transcript PATCH] Error fetching transcript:", fetchError);
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 }
      );
    }

    // Update transcript full_text
    const { error: updateError } = await supabase
      .from("transcripts")
      .update({
        full_text: content,
        word_count: content.split(/\s+/).filter(Boolean).length,
      })
      .eq("id", transcript.id);

    if (updateError) {
      console.error("[API /transcript PATCH] Error updating transcript:", updateError);
      return NextResponse.json(
        { error: "Failed to update transcript" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /transcript PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update transcript" },
      { status: 500 }
    );
  }
}
