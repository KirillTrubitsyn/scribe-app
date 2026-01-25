import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { RecordingStatus } from "@/types/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface RecordingData {
  id: string;
  status: RecordingStatus;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: recordingId } = await params;

    if (!recordingId) {
      return NextResponse.json(
        { error: "Recording ID is required" },
        { status: 400 }
      );
    }

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // Verify recording exists and is in 'uploading' state
    const { data: recording, error: fetchError } = await supabase
      .from("recordings")
      .select("id, status")
      .eq("id", recordingId)
      .single<RecordingData>();

    if (fetchError || !recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    if (recording.status !== "uploading") {
      return NextResponse.json(
        { error: "Recording is not in uploading state" },
        { status: 400 }
      );
    }

    // Update status to 'uploaded'
    const { error: updateError } = await supabase
      .from("recordings")
      .update({ status: "uploaded" as RecordingStatus })
      .eq("id", recordingId);

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update recording status" },
        { status: 500 }
      );
    }

    // TODO: Send webhook to Railway to start processing
    // This would trigger the transcription pipeline
    // await fetch(process.env.RAILWAY_WEBHOOK_URL, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ recordingId }),
    // });

    return NextResponse.json({
      success: true,
      recordingId,
      message: "Upload completed. Processing will start shortly.",
    });
  } catch (error) {
    console.error("Upload complete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
