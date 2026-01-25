import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
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
    const supabase = await createClient();

    // Get the recording with related data
    const { data, error } = await supabase
      .from("recordings")
      .select(`
        *,
        transcripts(*),
        artifacts(*),
        speakers(*)
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    const recording = data as unknown as RecordingWithRelations;

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
