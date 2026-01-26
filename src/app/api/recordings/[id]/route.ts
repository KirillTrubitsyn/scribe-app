import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateDownloadSignedUrl, deleteFile } from "@/lib/google/storage";
import type { Recording, Transcript, Artifact, Speaker } from "@/types/database";

type RecordingWithRelations = Recording & {
  transcripts: Transcript[];
  artifacts: Artifact[];
  speakers: Speaker[];
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Use admin client to bypass RLS (development mode)
    const supabase = createAdminClient();

    // Query recording first
    const { data: recordingData, error: recordingError } = await supabase
      .from("recordings")
      .select("*")
      .eq("id", id)
      .single();

    if (recordingError || !recordingData) {
      console.error("[API /recordings/:id] Error fetching recording:", recordingError);
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    // Fetch related data with separate queries for reliability
    // This avoids potential issues with PostgREST FK detection
    const [transcriptsResult, artifactsResult, speakersResult] = await Promise.all([
      supabase.from("transcripts").select("*").eq("recording_id", id),
      supabase.from("artifacts").select("*").eq("recording_id", id),
      supabase.from("speakers").select("*").eq("recording_id", id),
    ]);

    const recording: RecordingWithRelations = {
      ...(recordingData as Recording),
      transcripts: (transcriptsResult.data ?? []) as Transcript[],
      artifacts: (artifactsResult.data ?? []) as Artifact[],
      speakers: (speakersResult.data ?? []) as Speaker[],
    };

    // Debug logging
    console.log("[API /recordings/:id] Recording ID:", recording.id);
    console.log("[API /recordings/:id] Recording status:", recording.status);
    console.log("[API /recordings/:id] Transcripts count:", recording.transcripts.length);

    if (recording.transcripts[0]) {
      const t = recording.transcripts[0];
      console.log("[API /recordings/:id] Transcript ID:", t.id);
      console.log("[API /recordings/:id] Transcript full_text length:", t.full_text?.length ?? 0);
      console.log("[API /recordings/:id] Transcript segments:", Array.isArray(t.segments) ? `array(${t.segments.length})` : typeof t.segments);
    }

    // Generate audio URL if file exists and not still uploading
    let audioUrl: string | null = null;
    if (recording.gcs_uri && recording.status !== "uploading") {
      try {
        audioUrl = await generateDownloadSignedUrl(recording.gcs_uri);
      } catch (e) {
        console.error("Failed to generate audio URL:", e);
      }
    }

    return NextResponse.json({
      ...recording,
      audioUrl,
    });
  } catch (error) {
    console.error("Error fetching recording:", error);
    return NextResponse.json(
      { error: "Failed to fetch recording" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adminClient = createAdminClient();

    // Get the recording to find the GCS URI
    const { data: recording, error: fetchError } = await adminClient
      .from("recordings")
      .select("id, gcs_uri")
      .eq("id", id)
      .single();

    if (fetchError || !recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    // Delete file from GCS if it exists
    if (recording.gcs_uri) {
      try {
        await deleteFile(recording.gcs_uri);
      } catch (e) {
        console.error("Failed to delete file from GCS:", e);
        // Continue with database deletion even if GCS deletion fails
      }
    }

    // Delete related records first (due to foreign keys)
    await adminClient.from("transcripts").delete().eq("recording_id", id);
    await adminClient.from("artifacts").delete().eq("recording_id", id);
    await adminClient.from("speakers").delete().eq("recording_id", id);
    await adminClient.from("processing_jobs").delete().eq("recording_id", id);

    // Delete the recording
    const { error: deleteError } = await adminClient
      .from("recordings")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Database delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete recording" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting recording:", error);
    return NextResponse.json(
      { error: "Failed to delete recording" },
      { status: 500 }
    );
  }
}
