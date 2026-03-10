import { v4 as uuidv4 } from 'uuid'
import { transcribeAudio, TranscriptionModel } from './transcription.js'
import {
  sendProcessingStarted,
  sendTranscriptionCompleted,
  sendProcessingFailed,
} from './webhook.js'

// ============================================
// Types
// ============================================

export interface ProcessingRequest {
  recording_id: string
  storage_path: string
  organization_id: string
  callback_url?: string
  file_name: string
  file_size: number
  transcription_model?: TranscriptionModel
}

export interface ProcessingStatus {
  recording_id: string
  status: 'processing' | 'transcribing' | 'analyzing' | 'completed' | 'failed'
  started_at: string
  completed_at?: string
  error?: string
}

// ============================================
// In-Memory Job Tracking
// ============================================

const activeJobs = new Map<string, ProcessingStatus>()

export function getJobStatus(recordingId: string): ProcessingStatus | undefined {
  return activeJobs.get(recordingId)
}

export function getAllActiveJobs(): ProcessingStatus[] {
  return Array.from(activeJobs.values())
}

// ============================================
// Main Processing Logic
// ============================================

export async function processRecording(request: ProcessingRequest): Promise<void> {
  const { recording_id, storage_path, transcription_model } = request
  const jobId = uuidv4()

  // Validate that transcription_model is provided
  if (!transcription_model || (transcription_model !== 'gemini' && transcription_model !== 'chirp')) {
    throw new Error('transcription_model is required and must be either "gemini" or "chirp"')
  }

  console.log(`[Processor] ========================================`)
  console.log(`[Processor] Starting processing for recording ${recording_id}`)
  console.log(`[Processor] Storage path: ${storage_path}`)
  console.log(`[Processor] Job ID: ${jobId}`)
  console.log(`[Processor] Transcription model: ${transcription_model}`)
  console.log(`[Processor] Model will be: ${transcription_model === 'chirp' ? 'CHIRP 3 Batch (Google Speech-to-Text V2)' : 'GEMINI 3 Flash'}`)
  console.log(`[Processor] ========================================`)

  // Track job status
  activeJobs.set(recording_id, {
    recording_id,
    status: 'processing',
    started_at: new Date().toISOString(),
  })

  try {
    // 1. Send webhook: processing_started
    console.log('[Processor] Step 1: Sending processing_started webhook')
    await sendProcessingStarted(recording_id, jobId)

    // Update status
    activeJobs.set(recording_id, {
      ...activeJobs.get(recording_id)!,
      status: 'transcribing',
    })

    // 2. Run transcription
    console.log(`[Processor] Step 2: Starting transcription with ${transcription_model}`)
    const transcriptionResult = await transcribeAudio(storage_path, transcription_model)

    console.log(`[Processor] Transcription completed: ${transcriptionResult.transcript.word_count} words`)

    // Validate that transcription produced actual content
    if (transcriptionResult.transcript.word_count === 0 || !transcriptionResult.transcript.full_text) {
      throw new Error('Транскрипция не дала результатов. Аудио может быть пустым, слишком коротким или не содержать распознаваемой речи.')
    }

    // 3. Send webhook: transcription_completed (this is the final step)
    console.log('[Processor] Step 3: Sending transcription_completed webhook')
    await sendTranscriptionCompleted(
      recording_id,
      jobId,
      transcriptionResult.transcript,
      transcriptionResult.speakers,
      transcriptionResult.durationSeconds
    )

    // Mark as completed (transcription done, user can now manually trigger analysis)
    activeJobs.set(recording_id, {
      ...activeJobs.get(recording_id)!,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })

    console.log(`[Processor] Transcription completed for recording ${recording_id}. User can now manually trigger AI analysis.`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error(`[Processor] Processing failed for recording ${recording_id}:`, errorMessage)

    // Update status
    activeJobs.set(recording_id, {
      ...activeJobs.get(recording_id)!,
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    })

    // Send webhook: processing_failed
    try {
      await sendProcessingFailed(recording_id, jobId, errorMessage)
    } catch (webhookError) {
      console.error('[Processor] Failed to send failure webhook:', webhookError)
    }

    throw error
  } finally {
    // Clean up job after some time (keep for status queries)
    setTimeout(() => {
      activeJobs.delete(recording_id)
    }, 5 * 60 * 1000) // 5 minutes
  }
}

// ============================================
// Validation
// ============================================

export function isValidProcessingRequest(body: unknown): body is ProcessingRequest {
  if (!body || typeof body !== 'object') {
    return false
  }

  const request = body as Record<string, unknown>

  return (
    typeof request.recording_id === 'string' &&
    typeof request.storage_path === 'string' &&
    typeof request.organization_id === 'string' &&
    typeof request.file_name === 'string' &&
    typeof request.file_size === 'number'
  )
}
