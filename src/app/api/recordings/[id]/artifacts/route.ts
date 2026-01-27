import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { ArtifactType } from "@/types/database";

// PATCH - Update artifact content
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recordingId } = await params;
    const body = await request.json();
    const { type, content } = body as { type: ArtifactType; content: string };

    if (!type || !content) {
      return NextResponse.json(
        { error: "Missing type or content" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check if artifact exists
    const { data: existingArtifact, error: fetchError } = await supabase
      .from("artifacts")
      .select("id")
      .eq("recording_id", recordingId)
      .eq("type", type)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("[API /artifacts PATCH] Error fetching artifact:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch artifact" },
        { status: 500 }
      );
    }

    if (existingArtifact) {
      // Update existing artifact
      const { error: updateError } = await supabase
        .from("artifacts")
        .update({ content })
        .eq("id", existingArtifact.id);

      if (updateError) {
        console.error("[API /artifacts PATCH] Error updating artifact:", updateError);
        return NextResponse.json(
          { error: "Failed to update artifact" },
          { status: 500 }
        );
      }
    } else {
      // Create new artifact
      const { error: insertError } = await supabase
        .from("artifacts")
        .insert({
          recording_id: recordingId,
          type,
          content,
          metadata: { edited: true },
        });

      if (insertError) {
        console.error("[API /artifacts PATCH] Error creating artifact:", insertError);
        return NextResponse.json(
          { error: "Failed to create artifact" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /artifacts PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update artifact" },
      { status: 500 }
    );
  }
}
