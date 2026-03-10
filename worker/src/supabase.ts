import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ============================================
// Types (mirrored from main app)
// ============================================

export type RecordingStatus =
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'transcribing'
  | 'analyzing'
  | 'ready'
  | 'error'

export type ArtifactType = 'summary' | 'protocol' | 'action_items' | 'analytics'

export type JobType = 'transcription' | 'analysis'

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Recording {
  id: string
  organization_id: string
  user_id: string | null
  title: string
  storage_path: string
  file_name: string
  file_size: number
  duration_seconds: number | null
  status: RecordingStatus
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface TranscriptSegment {
  speaker: string
  start: number
  end: number
  text: string
  confidence: number
  words?: Array<{
    word: string
    start: number
    end: number
    confidence: number
  }>
}

export interface Transcript {
  id: string
  recording_id: string
  full_text: string
  segments: TranscriptSegment[]
  word_count: number
  language: string
  created_at: string
}

export interface Artifact {
  id: string
  recording_id: string
  type: ArtifactType
  content: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface Speaker {
  id: string
  recording_id: string
  speaker_index: number
  name: string | null
  role: string | null
}

export interface ProcessingJob {
  id: string
  recording_id: string
  job_type: JobType
  status: JobStatus
  google_operation_name: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_at: string
}

// ============================================
// Supabase Client
// ============================================

let supabaseClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return supabaseClient
}

// ============================================
// Database Operations
// ============================================

export async function getRecording(recordingId: string): Promise<Recording | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('id', recordingId)
    .single()

  if (error) {
    console.error('Failed to get recording:', error)
    return null
  }

  return data as Recording
}

export async function updateRecordingStatus(
  recordingId: string,
  status: RecordingStatus,
  errorMessage?: string
): Promise<void> {
  const supabase = getSupabaseClient()

  const updateData: Partial<Recording> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (errorMessage !== undefined) {
    updateData.error_message = errorMessage
  } else if (status !== 'error') {
    updateData.error_message = null
  }

  const { error } = await supabase
    .from('recordings')
    .update(updateData)
    .eq('id', recordingId)

  if (error) {
    console.error('Failed to update recording status:', error)
    throw error
  }
}

export async function updateRecordingDuration(
  recordingId: string,
  durationSeconds: number
): Promise<void> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('recordings')
    .update({
      duration_seconds: durationSeconds,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordingId)

  if (error) {
    console.error('Failed to update recording duration:', error)
    throw error
  }
}

export async function createProcessingJob(
  recordingId: string,
  jobType: JobType
): Promise<ProcessingJob> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('processing_jobs')
    .insert({
      recording_id: recordingId,
      job_type: jobType,
      status: 'pending' as JobStatus,
      started_at: null,
      completed_at: null,
      error_message: null,
      google_operation_name: null,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create processing job:', error)
    throw error
  }

  return data as ProcessingJob
}

export async function updateProcessingJob(
  jobId: string,
  updates: Partial<Omit<ProcessingJob, 'id' | 'recording_id' | 'created_at'>>
): Promise<void> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('processing_jobs')
    .update(updates)
    .eq('id', jobId)

  if (error) {
    console.error('Failed to update processing job:', error)
    throw error
  }
}
