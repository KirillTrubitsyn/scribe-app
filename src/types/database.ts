// ============================================
// Enum Types
// ============================================

export type OrganizationRole = 'owner' | 'admin' | 'member'

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

// ============================================
// Table Row Types
// ============================================

export type Organization = {
  id: string
  name: string
  slug: string
  created_at: string
}

export type OrganizationMember = {
  organization_id: string
  user_id: string
  role: OrganizationRole
  created_at: string
}

export type Recording = {
  id: string
  organization_id: string
  user_id: string
  title: string
  gcs_uri: string
  file_name: string
  file_size: number
  duration_seconds: number | null
  status: RecordingStatus
  error_message: string | null
  created_at: string
  updated_at: string
}

export type TranscriptSegment = {
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

export type Transcript = {
  id: string
  recording_id: string
  full_text: string
  segments: TranscriptSegment[]
  word_count: number
  language: string
  created_at: string
}

export type Artifact = {
  id: string
  recording_id: string
  type: ArtifactType
  content: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export type Speaker = {
  id: string
  recording_id: string
  speaker_index: number
  name: string | null
  role: string | null
}

export type ProcessingJob = {
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
// Insert Types (for creating new records)
// ============================================

export type OrganizationInsert = Omit<Organization, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type OrganizationMemberInsert = Omit<OrganizationMember, 'created_at'> & {
  created_at?: string
}

export type RecordingInsert = Omit<Recording, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type TranscriptInsert = Omit<Transcript, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type ArtifactInsert = Omit<Artifact, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type SpeakerInsert = Omit<Speaker, 'id'> & {
  id?: string
}

export type ProcessingJobInsert = Omit<ProcessingJob, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

// ============================================
// Update Types (for updating existing records)
// ============================================

export type OrganizationUpdate = Partial<Omit<Organization, 'id' | 'created_at'>>

export type OrganizationMemberUpdate = Partial<Omit<OrganizationMember, 'organization_id' | 'user_id' | 'created_at'>>

export type RecordingUpdate = Partial<Omit<Recording, 'id' | 'created_at' | 'updated_at'>>

export type TranscriptUpdate = Partial<Omit<Transcript, 'id' | 'recording_id' | 'created_at'>>

export type ArtifactUpdate = Partial<Omit<Artifact, 'id' | 'recording_id' | 'created_at'>>

export type SpeakerUpdate = Partial<Omit<Speaker, 'id' | 'recording_id'>>

export type ProcessingJobUpdate = Partial<Omit<ProcessingJob, 'id' | 'recording_id' | 'created_at'>>

// ============================================
// Database Schema Type (for Supabase client)
// ============================================

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization
        Insert: OrganizationInsert
        Update: OrganizationUpdate
        Relationships: []
      }
      organization_members: {
        Row: OrganizationMember
        Insert: OrganizationMemberInsert
        Update: OrganizationMemberUpdate
        Relationships: []
      }
      recordings: {
        Row: Recording
        Insert: RecordingInsert
        Update: RecordingUpdate
        Relationships: []
      }
      transcripts: {
        Row: Transcript
        Insert: TranscriptInsert
        Update: TranscriptUpdate
        Relationships: []
      }
      artifacts: {
        Row: Artifact
        Insert: ArtifactInsert
        Update: ArtifactUpdate
        Relationships: []
      }
      speakers: {
        Row: Speaker
        Insert: SpeakerInsert
        Update: SpeakerUpdate
        Relationships: []
      }
      processing_jobs: {
        Row: ProcessingJob
        Insert: ProcessingJobInsert
        Update: ProcessingJobUpdate
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      organization_role: OrganizationRole
      recording_status: RecordingStatus
      artifact_type: ArtifactType
      job_type: JobType
      job_status: JobStatus
    }
    CompositeTypes: Record<string, never>
  }
}

// ============================================
// Helper Types
// ============================================

// Recording with related data
export type RecordingWithTranscript = Recording & {
  transcript: Transcript | null
}

export type RecordingWithArtifacts = Recording & {
  artifacts: Artifact[]
}

export type RecordingWithSpeakers = Recording & {
  speakers: Speaker[]
}

export type RecordingFull = Recording & {
  transcript: Transcript | null
  artifacts: Artifact[]
  speakers: Speaker[]
}

// Organization with members
export type OrganizationWithMembers = Organization & {
  members: OrganizationMember[]
}
