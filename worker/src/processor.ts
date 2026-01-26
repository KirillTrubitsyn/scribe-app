import { v4 as uuidv4 } from 'uuid'
import { transcribeAudio } from './transcription.js'
import { analyzeTranscript } from './analysis.js'
import {
  sendProcessingStarted,
  sendTranscriptionCompleted,
  sendAnalysisCompleted,
  sendProcessingFailed,
} from './webhook.js'

// ============================================
// Types
// ============================================

export interface ProcessingRequest {
  recording_id: string
  gcs_uri: string
  organization_id: string
  callback_url?: string
  file_name: string
  file_size: number
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
  const { recording_id, gcs_uri } = request
  const jobId = uuidv4()

  console.log(`[Processor] Starting processing for recording ${recording_id}`)
  console.log(`[Processor] GCS URI: ${gcs_uri}`)
  console.log(`[Processor] Job ID: ${jobId}`)

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

    // 2. Run transcription (Chirp 3 Batch)
    console.log('[Processor] Step 2: Starting transcription')
    const transcriptionResult = await transcribeAudio(gcs_uri)

    console.log(`[Processor] Transcription completed: ${transcriptionResult.transcript.word_count} words`)

    // Validate that transcription produced actual content
    if (transcriptionResult.transcript.word_count === 0 || !transcriptionResult.transcript.full_text) {
      throw new Error('Транскрипция не дала результатов. Аудио может быть пустым, слишком коротким или не содержать распознаваемой речи.')
    }

    // 3. Send webhook: transcription_completed
    console.log('[Processor] Step 3: Sending transcription_completed webhook')
    await sendTranscriptionCompleted(
      recording_id,
      jobId,
      transcriptionResult.transcript,
      transcriptionResult.speakers,
      transcriptionResult.durationSeconds
    )

    // Update status
    activeJobs.set(recording_id, {
      ...activeJobs.get(recording_id)!,
      status: 'analyzing',
    })

    // 4. Run AI analysis (Gemini)
    console.log('[Processor] Step 4: Starting AI analysis')
    const analysisResult = await analyzeTranscript(transcriptionResult.transcript)

    console.log(`[Processor] Analysis completed: ${analysisResult.artifacts.length} artifacts generated`)

    // 5. Send webhook: analysis_completed
    console.log('[Processor] Step 5: Sending analysis_completed webhook')
    await sendAnalysisCompleted(recording_id, jobId, analysisResult.artifacts)

    // Mark as completed
    activeJobs.set(recording_id, {
      ...activeJobs.get(recording_id)!,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })

    console.log(`[Processor] Successfully completed processing for recording ${recording_id}`)
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
    typeof request.gcs_uri === 'string' &&
    typeof request.organization_id === 'string' &&
    typeof request.file_name === 'string' &&
    typeof request.file_size === 'number'
  )
}
