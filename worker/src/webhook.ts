import type { TranscriptSegment, ArtifactType } from './supabase.js'

// ============================================
// Types
// ============================================

export type WebhookEvent =
  | 'processing_started'
  | 'transcription_completed'
  | 'analysis_completed'
  | 'processing_failed'

export interface TranscriptData {
  full_text: string
  segments: TranscriptSegment[]
  word_count: number
  language: string
}

export interface ArtifactData {
  type: ArtifactType
  content: string
  metadata?: Record<string, unknown>
}

export interface SpeakerData {
  speaker_index: number
  name?: string
  role?: string
}

export interface WebhookPayload {
  event: WebhookEvent
  recording_id: string
  job_id: string
  data?: {
    transcript?: TranscriptData
    artifacts?: ArtifactData[]
    speakers?: SpeakerData[]
    error_message?: string
    duration_seconds?: number
  }
  timestamp: string
}

// ============================================
// Configuration
// ============================================

function getConfig() {
  const callbackUrl = process.env.VERCEL_CALLBACK_URL
  const webhookSecret = process.env.RAILWAY_WEBHOOK_SECRET

  if (!callbackUrl) {
    throw new Error('Missing VERCEL_CALLBACK_URL environment variable')
  }

  if (!webhookSecret) {
    throw new Error('Missing RAILWAY_WEBHOOK_SECRET environment variable')
  }

  return { callbackUrl, webhookSecret }
}

// ============================================
// Webhook Sender
// ============================================

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function sendWebhook(payload: WebhookPayload): Promise<void> {
  const { callbackUrl, webhookSecret } = getConfig()

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Webhook] Sending ${payload.event} to ${callbackUrl} (attempt ${attempt}/${MAX_RETRIES})`)

      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${webhookSecret}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Webhook failed with status ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      console.log(`[Webhook] Successfully sent ${payload.event}`, result)
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.error(`[Webhook] Attempt ${attempt} failed:`, lastError.message)

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt
        console.log(`[Webhook] Retrying in ${delay}ms...`)
        await sleep(delay)
      }
    }
  }

  console.error(`[Webhook] Failed to send ${payload.event} after ${MAX_RETRIES} attempts`)
  throw lastError
}

// ============================================
// Helper Functions
// ============================================

export async function sendProcessingStarted(
  recordingId: string,
  jobId: string
): Promise<void> {
  await sendWebhook({
    event: 'processing_started',
    recording_id: recordingId,
    job_id: jobId,
    timestamp: new Date().toISOString(),
  })
}

export async function sendTranscriptionCompleted(
  recordingId: string,
  jobId: string,
  transcript: TranscriptData,
  speakers: SpeakerData[],
  durationSeconds?: number
): Promise<void> {
  await sendWebhook({
    event: 'transcription_completed',
    recording_id: recordingId,
    job_id: jobId,
    data: {
      transcript,
      speakers,
      duration_seconds: durationSeconds,
    },
    timestamp: new Date().toISOString(),
  })
}

export async function sendAnalysisCompleted(
  recordingId: string,
  jobId: string,
  artifacts: ArtifactData[]
): Promise<void> {
  await sendWebhook({
    event: 'analysis_completed',
    recording_id: recordingId,
    job_id: jobId,
    data: {
      artifacts,
    },
    timestamp: new Date().toISOString(),
  })
}

export async function sendProcessingFailed(
  recordingId: string,
  jobId: string,
  errorMessage: string
): Promise<void> {
  await sendWebhook({
    event: 'processing_failed',
    recording_id: recordingId,
    job_id: jobId,
    data: {
      error_message: errorMessage,
    },
    timestamp: new Date().toISOString(),
  })
}
