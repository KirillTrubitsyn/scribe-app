import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDownloadSignedUrl } from "@/lib/google/storage";
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
