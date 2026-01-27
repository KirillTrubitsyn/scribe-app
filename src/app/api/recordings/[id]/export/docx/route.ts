import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateRecordingDocx, generateDocxFilename } from "@/lib/docx/generator";
import type { Recording, Transcript, Artifact, Speaker } from "@/types/database";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // Fetch recording
    const { data: recordingData, error: recordingError } = await supabase
      .from("recordings")
      .select("*")
      .eq("id", id)
      .single();

    if (recordingError || !recordingData) {
      console.error("[DOCX Export] Recording not found:", recordingError);
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    const recording = recordingData as Recording;

    // Fetch related data
    const [transcriptsResult, artifactsResult, speakersResult] = await Promise.all([
      supabase.from("transcripts").select("*").eq("recording_id", id),
      supabase.from("artifacts").select("*").eq("recording_id", id),
      supabase.from("speakers").select("*").eq("recording_id", id).order("speaker_index"),
    ]);

    const transcript = (transcriptsResult.data?.[0] ?? null) as Transcript | null;
    const artifacts = (artifactsResult.data ?? []) as Artifact[];
    const speakers = (speakersResult.data ?? []) as Speaker[];

    // Check if transcript exists
    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript not ready yet" },
        { status: 400 }
      );
    }

    // Generate DOCX
    console.log("[DOCX Export] Generating document for recording:", id);
    const buffer = await generateRecordingDocx(recording, transcript, artifacts, speakers);

    // Generate filename
    const filename = generateDocxFilename(recording);

    // Return as downloadable file
    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[DOCX Export] Error generating document:", error);
    return NextResponse.json(
      { error: "Failed to generate document" },
      { status: 500 }
    );
  }
}
