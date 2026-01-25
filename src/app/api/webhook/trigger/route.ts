import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Recording } from "@/types/database";

// ============================================
// Types
// ============================================

interface TriggerRequestBody {
  recording_id: string;
}

interface RailwayWorkerPayload {
  recording_id: string;
  gcs_uri: string;
  organization_id: string;
  callback_url: string;
  file_name: string;
  file_size: number;
}

// ============================================
// Trigger Handler
// ============================================

export async function POST(request: Request) {
  // 1. Parse request body
  let body: TriggerRequestBody;
  try {
    body = await request.json();

    if (!body.recording_id || typeof body.recording_id !== "string") {
      return NextResponse.json(
        { error: "recording_id is required" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { recording_id } = body;

  // 2. Use user's Supabase client with RLS to verify access
  // If user can fetch the recording, they have access (RLS enforces org membership)
  const supabase = await createClient();
  const { data: accessCheck, error: accessError } = await supabase
    .from("recordings")
    .select("id")
    .eq("id", recording_id)
    .single();

  if (accessError || !accessCheck) {
    return NextResponse.json(
      { error: "Recording not found or access denied" },
      { status: 404 }
    );
  }

  // 3. Get full recording details with admin client for operations
  const adminClient = createAdminClient();

  const { data, error: recordingError } = await adminClient
    .from("recordings")
    .select("*")
    .eq("id", recording_id)
    .single();

  if (recordingError || !data) {
    return NextResponse.json(
      { error: "Recording not found" },
      { status: 404 }
    );
  }

  const recording = data as Recording;

  // 5. Validate recording status
  if (recording.status !== "uploaded" && recording.status !== "error") {
    return NextResponse.json(
      {
        error: `Cannot trigger processing for recording with status: ${recording.status}`,
      },
      { status: 400 }
    );
  }

  // 6. Check Railway worker URL is configured
  const railwayWorkerUrl = process.env.RAILWAY_WEBHOOK_URL;
  const railwaySecret = process.env.RAILWAY_WEBHOOK_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!railwayWorkerUrl) {
    console.error("[Trigger] RAILWAY_WEBHOOK_URL not configured");
    return NextResponse.json(
      { error: "Processing service not configured" },
      { status: 503 }
    );
  }

  if (!railwaySecret) {
    console.error("[Trigger] RAILWAY_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Processing service not configured" },
      { status: 503 }
    );
  }

  console.log(`[Trigger] Using worker URL: ${railwayWorkerUrl}`);

  // 7. Update recording status to processing
  const { error: updateError } = await adminClient
    .from("recordings")
    .update({
      status: "processing",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recording_id);

  if (updateError) {
    console.error("Failed to update recording status:", updateError);
    return NextResponse.json(
      { error: "Failed to update recording status" },
      { status: 500 }
    );
  }

  // 8. Send request to Railway worker
  const workerPayload: RailwayWorkerPayload = {
    recording_id: recording.id,
    gcs_uri: recording.gcs_uri,
    organization_id: recording.organization_id,
    callback_url: `${appUrl}/api/webhook`,
    file_name: recording.file_name,
    file_size: recording.file_size,
  };

  try {
    const response = await fetch(railwayWorkerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${railwaySecret}`,
      },
      body: JSON.stringify(workerPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Trigger] Railway worker request failed: ${response.status} - ${errorText}`
      );
      console.error(`[Trigger] Worker URL used: ${railwayWorkerUrl}`);

      // Determine user-friendly error message based on status
      let userMessage = "Не удалось запустить обработку. Попробуйте снова.";
      if (response.status === 401) {
        console.error("[Trigger] Authentication failed - check RAILWAY_WEBHOOK_SECRET matches on Vercel and Railway");
        userMessage = "Ошибка аутентификации сервиса обработки. Обратитесь к администратору.";
      } else if (response.status === 404) {
        console.error("[Trigger] Worker endpoint not found - check RAILWAY_WEBHOOK_URL includes /process");
        userMessage = "Сервис обработки недоступен. Обратитесь к администратору.";
      }

      // Revert recording status on failure
      await adminClient
        .from("recordings")
        .update({
          status: "error",
          error_message: userMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", recording_id);

      return NextResponse.json(
        { error: "Failed to start processing", details: `Worker returned ${response.status}` },
        { status: 502 }
      );
    }

    const workerResponse = await response.json();

    console.log(
      `[Trigger] Successfully triggered processing for recording ${recording_id}`,
      workerResponse
    );

    // 9. Create initial processing job record
    await adminClient.from("processing_jobs").insert({
      recording_id: recording_id,
      job_type: "transcription",
      status: "pending",
      started_at: null,
      completed_at: null,
      error_message: null,
      google_operation_name: null,
    });

    return NextResponse.json({
      success: true,
      recording_id,
      message: "Processing triggered successfully",
      worker_response: workerResponse,
    });
  } catch (error) {
    console.error("Failed to contact Railway worker:", error);

    // Revert recording status on failure
    await adminClient
      .from("recordings")
      .update({
        status: "error",
        error_message: "Failed to contact processing service",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording_id);

    return NextResponse.json(
      { error: "Processing service unavailable" },
      { status: 503 }
    );
  }
}
