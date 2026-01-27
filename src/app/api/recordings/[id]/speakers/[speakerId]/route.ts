import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// PATCH - Update speaker name
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; speakerId: string }> }
) {
  try {
    const { id: recordingId, speakerId } = await params;
    const body = await request.json();
    const { name } = body as { name: string };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Missing name" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify speaker belongs to this recording
    const { data: speaker, error: fetchError } = await supabase
      .from("speakers")
      .select("id")
      .eq("id", speakerId)
      .eq("recording_id", recordingId)
      .single();

    if (fetchError || !speaker) {
      console.error("[API /speakers PATCH] Error fetching speaker:", fetchError);
      return NextResponse.json(
        { error: "Speaker not found" },
        { status: 404 }
      );
    }

    // Update speaker name
    const { error: updateError } = await supabase
      .from("speakers")
      .update({ name: name.trim() })
      .eq("id", speakerId);

    if (updateError) {
      console.error("[API /speakers PATCH] Error updating speaker:", updateError);
      return NextResponse.json(
        { error: "Failed to update speaker" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, name: name.trim() });
  } catch (error) {
    console.error("[API /speakers PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update speaker" },
      { status: 500 }
    );
  }
}
