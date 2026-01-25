import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { RecordingStatus, Recording } from "@/types/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface RailwayWorkerPayload {
  recording_id: string;
  gcs_uri: string;
  organization_id: string;
  callback_url: string;
  file_name: string;
  file_size: number;
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
      .select("*")
      .eq("id", recordingId)
      .single<Recording>();

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

    // Automatically trigger processing
    const processingStarted = await triggerProcessing(supabase, recording);

    return NextResponse.json({
      success: true,
      recordingId,
      message: processingStarted
        ? "Upload completed. Processing started."
        : "Upload completed. Processing will start shortly.",
      processing_started: processingStarted,
    });
  } catch (error) {
    console.error("Upload complete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function triggerProcessing(
  supabase: ReturnType<typeof createAdminClient>,
  recording: Recording
): Promise<boolean> {
  const railwayWorkerUrl = process.env.RAILWAY_WEBHOOK_URL;
  const railwaySecret = process.env.RAILWAY_WEBHOOK_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!railwayWorkerUrl || !railwaySecret) {
    console.warn(
      "[Upload] Railway worker not configured, skipping auto-trigger"
    );
    // Set error status so user knows processing cannot start
    await supabase
      .from("recordings")
      .update({
        status: "error" as RecordingStatus,
        error_message: "Сервер обработки не настроен. Обратитесь к администратору.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);
    return false;
  }

  try {
    // Update status to processing
    await supabase
      .from("recordings")
      .update({
        status: "processing" as RecordingStatus,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);

    // Prepare payload for Railway worker
    const payload: RailwayWorkerPayload = {
      recording_id: recording.id,
      gcs_uri: recording.gcs_uri,
      organization_id: recording.organization_id,
      callback_url: `${appUrl}/api/webhook`,
      file_name: recording.file_name,
      file_size: recording.file_size,
    };

    // Send request to Railway worker
    const response = await fetch(railwayWorkerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${railwaySecret}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Upload] Railway worker request failed: ${response.status} - ${errorText}`
      );

      // Set error status so user can see and retry
      await supabase
        .from("recordings")
        .update({
          status: "error" as RecordingStatus,
          error_message: "Не удалось запустить обработку. Попробуйте снова.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", recording.id);

      return false;
    }

    console.log(
      `[Upload] Successfully triggered processing for recording ${recording.id}`
    );

    // Create initial processing job record
    await supabase.from("processing_jobs").insert({
      recording_id: recording.id,
      job_type: "transcription",
      status: "pending",
      started_at: null,
      completed_at: null,
      error_message: null,
      google_operation_name: null,
    });

    return true;
  } catch (error) {
    console.error("[Upload] Failed to trigger processing:", error);

    // Set error status so user can see and retry
    await supabase
      .from("recordings")
      .update({
        status: "error" as RecordingStatus,
        error_message: "Произошла ошибка при запуске обработки. Попробуйте снова.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);

    return false;
  }
}
