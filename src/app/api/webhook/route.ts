import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  RecordingStatus,
  TranscriptSegment,
  ArtifactType,
  TranscriptInsert,
  ArtifactInsert,
  SpeakerInsert,
} from "@/types/database";

// ============================================
// Webhook Payload Types
// ============================================

type WebhookEvent =
  | "processing_started"
  | "transcription_completed"
  | "analysis_completed"
  | "processing_failed";

interface TranscriptData {
  full_text: string;
  segments: TranscriptSegment[];
  word_count: number;
  language: string;
}

interface ArtifactData {
  type: ArtifactType;
  content: string;
  metadata?: Record<string, unknown>;
}

interface SpeakerData {
  speaker_index: number;
  name?: string;
  role?: string;
}

interface WebhookPayload {
  event: WebhookEvent;
  recording_id: string;
  job_id: string;
  data?: {
    transcript?: TranscriptData;
    artifacts?: ArtifactData[];
    speakers?: SpeakerData[];
    error_message?: string;
    duration_seconds?: number;
  };
  timestamp: string;
}

// ============================================
// Validation
// ============================================

function isValidWebhookPayload(body: unknown): body is WebhookPayload {
  if (!body || typeof body !== "object") return false;

  const payload = body as Record<string, unknown>;

  const validEvents: WebhookEvent[] = [
    "processing_started",
    "transcription_completed",
    "analysis_completed",
    "processing_failed",
  ];

  return (
    typeof payload.event === "string" &&
    validEvents.includes(payload.event as WebhookEvent) &&
    typeof payload.recording_id === "string" &&
    typeof payload.job_id === "string" &&
    typeof payload.timestamp === "string"
  );
}

// ============================================
// Status Mapping
// ============================================

const eventToStatus: Record<WebhookEvent, RecordingStatus> = {
  processing_started: "processing",
  transcription_completed: "analyzing",
  analysis_completed: "ready",
  processing_failed: "error",
};

// ============================================
// Webhook Handler
// ============================================

export async function POST(request: Request) {
  // 1. Verify webhook secret from Authorization header
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.RAILWAY_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error("RAILWAY_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  // Support both "Bearer <token>" and direct token
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  // Also check legacy x-webhook-secret header for backwards compatibility
  const legacySecret = request.headers.get("x-webhook-secret");

  if (token !== expectedSecret && legacySecret !== expectedSecret) {
    console.error("Webhook authentication failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate payload
  let payload: WebhookPayload;
  try {
    const body = await request.json();

    if (!isValidWebhookPayload(body)) {
      return NextResponse.json(
        { error: "Invalid payload format" },
        { status: 400 }
      );
    }

    payload = body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { event, recording_id, job_id, data, timestamp } = payload;

  console.log(
    `[Webhook] Received ${event} for recording ${recording_id} (job: ${job_id}) at ${timestamp}`
  );

  // 3. Use admin client to bypass RLS
  const supabase = createAdminClient();

  // 4. Verify recording exists
  const { data: recording, error: recordingError } = await supabase
    .from("recordings")
    .select("id, status, organization_id")
    .eq("id", recording_id)
    .single();

  if (recordingError || !recording) {
    console.error(`Recording not found: ${recording_id}`);
    return NextResponse.json(
      { error: "Recording not found" },
      { status: 404 }
    );
  }

  // 5. Handle event-specific logic
  try {
    switch (event) {
      case "processing_started":
        await handleProcessingStarted(supabase, recording_id, job_id);
        break;

      case "transcription_completed":
        await handleTranscriptionCompleted(
          supabase,
          recording_id,
          job_id,
          data
        );
        break;

      case "analysis_completed":
        await handleAnalysisCompleted(supabase, recording_id, job_id, data);
        break;

      case "processing_failed":
        await handleProcessingFailed(
          supabase,
          recording_id,
          job_id,
          data?.error_message
        );
        break;
    }

    // 6. Update recording status
    const newStatus = eventToStatus[event];
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // Clear error message on successful events
    if (event !== "processing_failed") {
      updateData.error_message = null;
    }

    // Update duration if provided
    if (data?.duration_seconds !== undefined) {
      updateData.duration_seconds = data.duration_seconds;
    }

    const { error: updateError } = await supabase
      .from("recordings")
      .update(updateData)
      .eq("id", recording_id);

    if (updateError) {
      console.error("Failed to update recording status:", updateError);
      return NextResponse.json(
        { error: "Failed to update recording status" },
        { status: 500 }
      );
    }

    console.log(
      `[Webhook] Successfully processed ${event} for recording ${recording_id}`
    );

    return NextResponse.json({
      success: true,
      event,
      recording_id,
      new_status: newStatus,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error);
    console.error(
      `[Webhook] Error processing ${event} for recording ${recording_id}:`,
      errorMessage
    );
    return NextResponse.json(
      { error: "Internal server error", details: errorMessage },
      { status: 500 }
    );
  }
}

// ============================================
// Event Handlers
// ============================================

async function handleProcessingStarted(
  supabase: ReturnType<typeof createAdminClient>,
  recordingId: string,
  jobId: string
) {
  // Clean up any existing processing jobs for this recording (handles retries)
  // This ensures a fresh start when re-processing a failed recording
  const { error: deleteError } = await supabase
    .from("processing_jobs")
    .delete()
    .eq("recording_id", recordingId);

  if (deleteError) {
    console.error(
      `[Webhook] Warning: Failed to clean up existing jobs for ${recordingId}:`,
      deleteError
    );
    // Continue anyway - the insert might still succeed
  }

  // Create processing job record
  const { error } = await supabase.from("processing_jobs").insert({
    id: jobId,
    recording_id: recordingId,
    job_type: "transcription",
    status: "running",
    started_at: new Date().toISOString(),
    completed_at: null,
    error_message: null,
    google_operation_name: null,
  });

  if (error) {
    console.error(
      `[Webhook] Failed to create processing job for ${recordingId}:`,
      JSON.stringify(error)
    );
    throw new Error(
      `Failed to create processing job: ${error.message || error.code || "Unknown error"}`
    );
  }

  console.log(
    `[Webhook] Created transcription job ${jobId} for recording ${recordingId}`
  );
}

async function handleTranscriptionCompleted(
  supabase: ReturnType<typeof createAdminClient>,
  recordingId: string,
  jobId: string,
  data?: WebhookPayload["data"]
) {
  // Mark transcription job as completed
  await supabase
    .from("processing_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // Save transcript if provided
  if (data?.transcript) {
    const transcriptInsert: TranscriptInsert = {
      recording_id: recordingId,
      full_text: data.transcript.full_text,
      segments: data.transcript.segments,
      word_count: data.transcript.word_count,
      language: data.transcript.language,
    };

    // Delete existing transcript (if re-processing)
    await supabase.from("transcripts").delete().eq("recording_id", recordingId);

    const { error } = await supabase
      .from("transcripts")
      .insert(transcriptInsert);

    if (error) {
      console.error("Failed to save transcript:", error);
      throw error;
    }

    console.log(
      `[Webhook] Saved transcript for ${recordingId} (${data.transcript.word_count} words)`
    );
  }

  // Save speakers if provided
  if (data?.speakers && data.speakers.length > 0) {
    // Delete existing speakers
    await supabase.from("speakers").delete().eq("recording_id", recordingId);

    const speakersInsert: SpeakerInsert[] = data.speakers.map((speaker) => ({
      recording_id: recordingId,
      speaker_index: speaker.speaker_index,
      name: speaker.name || null,
      role: speaker.role || null,
    }));

    const { error } = await supabase.from("speakers").insert(speakersInsert);

    if (error) {
      console.error("Failed to save speakers:", error);
      throw error;
    }

    console.log(
      `[Webhook] Saved ${data.speakers.length} speakers for ${recordingId}`
    );
  }

  // Create analysis job
  const { error: analysisJobError } = await supabase
    .from("processing_jobs")
    .insert({
      recording_id: recordingId,
      job_type: "analysis",
      status: "running",
      started_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
      google_operation_name: null,
    });

  if (analysisJobError) {
    console.error(
      `[Webhook] Failed to create analysis job for ${recordingId}:`,
      JSON.stringify(analysisJobError)
    );
    // Don't throw - transcription completed successfully, analysis job creation is secondary
  } else {
    console.log(`[Webhook] Created analysis job for recording ${recordingId}`);
  }
}

async function handleAnalysisCompleted(
  supabase: ReturnType<typeof createAdminClient>,
  recordingId: string,
  jobId: string,
  data?: WebhookPayload["data"]
) {
  // Mark analysis job as completed
  await supabase
    .from("processing_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("recording_id", recordingId)
    .eq("job_type", "analysis");

  // Save artifacts if provided
  if (data?.artifacts && data.artifacts.length > 0) {
    // Delete existing artifacts (if re-processing)
    await supabase.from("artifacts").delete().eq("recording_id", recordingId);

    const artifactsInsert: ArtifactInsert[] = data.artifacts.map((artifact) => ({
      recording_id: recordingId,
      type: artifact.type,
      content: artifact.content,
      metadata: artifact.metadata || null,
    }));

    const { error } = await supabase.from("artifacts").insert(artifactsInsert);

    if (error) {
      console.error("Failed to save artifacts:", error);
      throw error;
    }

    console.log(
      `[Webhook] Saved ${data.artifacts.length} artifacts for ${recordingId}`
    );
  }
}

async function handleProcessingFailed(
  supabase: ReturnType<typeof createAdminClient>,
  recordingId: string,
  jobId: string,
  errorMessage?: string
) {
  // Update recording with error message
  await supabase
    .from("recordings")
    .update({
      status: "error",
      error_message: errorMessage || "Processing failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordingId);

  // Mark all pending/running jobs as failed
  await supabase
    .from("processing_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("recording_id", recordingId)
    .in("status", ["pending", "running"]);

  console.error(
    `[Webhook] Processing failed for ${recordingId}: ${errorMessage}`
  );
}
