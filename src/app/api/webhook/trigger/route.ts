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
  // 1. Authenticate user
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse request body
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

  // 3. Get recording details with admin client to bypass RLS
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

  // 4. Verify user has access to this recording's organization
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", recording.organization_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "Access denied to this recording" },
      { status: 403 }
    );
  }

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
    console.error("RAILWAY_WEBHOOK_URL not configured");
    return NextResponse.json(
      { error: "Processing service not configured" },
      { status: 503 }
    );
  }

  if (!railwaySecret) {
    console.error("RAILWAY_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Processing service not configured" },
      { status: 503 }
    );
  }

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
        `Railway worker request failed: ${response.status} - ${errorText}`
      );

      // Revert recording status on failure
      await adminClient
        .from("recordings")
        .update({
          status: "error",
          error_message: `Failed to start processing: ${response.status}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", recording_id);

      return NextResponse.json(
        { error: "Failed to start processing" },
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
