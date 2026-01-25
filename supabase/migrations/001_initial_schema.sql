-- ============================================
-- SGC Scribe Database Schema
-- Migration: 001_initial_schema
-- ============================================

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE organization_role AS ENUM ('owner', 'admin', 'member');

CREATE TYPE recording_status AS ENUM (
  'uploading',
  'uploaded',
  'processing',
  'transcribing',
  'analyzing',
  'ready',
  'error'
);

CREATE TYPE artifact_type AS ENUM (
  'summary',
  'protocol',
  'action_items',
  'analytics'
);

CREATE TYPE job_type AS ENUM ('transcription', 'analysis');

CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed');

-- ============================================
-- TABLES
-- ============================================

-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Organization Members (junction table)
CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role organization_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX idx_organization_members_organization_id ON organization_members(organization_id);

-- Recordings
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  gcs_uri TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  duration_seconds INTEGER,
  status recording_status NOT NULL DEFAULT 'uploading',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recordings_organization_id ON recordings(organization_id);
CREATE INDEX idx_recordings_user_id ON recordings(user_id);
CREATE INDEX idx_recordings_status ON recordings(status);
CREATE INDEX idx_recordings_created_at ON recordings(created_at DESC);
CREATE INDEX idx_recordings_org_status ON recordings(organization_id, status);

-- Transcripts
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL UNIQUE REFERENCES recordings(id) ON DELETE CASCADE,
  full_text TEXT NOT NULL,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  word_count INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'ru',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transcripts_recording_id ON transcripts(recording_id);

-- Artifacts
CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  type artifact_type NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifacts_recording_id ON artifacts(recording_id);
CREATE INDEX idx_artifacts_type ON artifacts(type);
CREATE INDEX idx_artifacts_recording_type ON artifacts(recording_id, type);

-- Speakers
CREATE TABLE speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  speaker_index INTEGER NOT NULL,
  name TEXT,
  role TEXT,
  UNIQUE(recording_id, speaker_index)
);

CREATE INDEX idx_speakers_recording_id ON speakers(recording_id);

-- Processing Jobs
CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  job_type job_type NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  google_operation_name TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processing_jobs_recording_id ON processing_jobs(recording_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_job_type ON processing_jobs(job_type);
CREATE INDEX idx_processing_jobs_google_operation ON processing_jobs(google_operation_name) WHERE google_operation_name IS NOT NULL;

-- ============================================
-- TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for recordings table
CREATE TRIGGER trigger_recordings_updated_at
  BEFORE UPDATE ON recordings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Helper function to check organization membership
CREATE OR REPLACE FUNCTION is_organization_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check admin/owner role
CREATE OR REPLACE FUNCTION is_organization_admin(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS POLICIES: organizations
-- ============================================

CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (is_organization_member(id));

CREATE POLICY "Admins can update their organizations"
  ON organizations FOR UPDATE
  USING (is_organization_admin(id));

-- ============================================
-- RLS POLICIES: organization_members
-- ============================================

CREATE POLICY "Users can view members of their organizations"
  ON organization_members FOR SELECT
  USING (is_organization_member(organization_id));

CREATE POLICY "Admins can manage members"
  ON organization_members FOR ALL
  USING (is_organization_admin(organization_id));

-- ============================================
-- RLS POLICIES: recordings
-- ============================================

CREATE POLICY "Users can view recordings in their organizations"
  ON recordings FOR SELECT
  USING (is_organization_member(organization_id));

CREATE POLICY "Users can create recordings in their organizations"
  ON recordings FOR INSERT
  WITH CHECK (
    is_organization_member(organization_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their own recordings"
  ON recordings FOR UPDATE
  USING (
    is_organization_member(organization_id)
    AND (user_id = auth.uid() OR is_organization_admin(organization_id))
  );

CREATE POLICY "Users can delete their own recordings"
  ON recordings FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_organization_admin(organization_id)
  );

-- ============================================
-- RLS POLICIES: transcripts
-- ============================================

CREATE POLICY "Users can view transcripts of their organization recordings"
  ON transcripts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = transcripts.recording_id
      AND is_organization_member(r.organization_id)
    )
  );

CREATE POLICY "System can manage transcripts"
  ON transcripts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = transcripts.recording_id
      AND is_organization_member(r.organization_id)
    )
  );

-- ============================================
-- RLS POLICIES: artifacts
-- ============================================

CREATE POLICY "Users can view artifacts of their organization recordings"
  ON artifacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = artifacts.recording_id
      AND is_organization_member(r.organization_id)
    )
  );

CREATE POLICY "System can manage artifacts"
  ON artifacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = artifacts.recording_id
      AND is_organization_member(r.organization_id)
    )
  );

-- ============================================
-- RLS POLICIES: speakers
-- ============================================

CREATE POLICY "Users can view speakers of their organization recordings"
  ON speakers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = speakers.recording_id
      AND is_organization_member(r.organization_id)
    )
  );

CREATE POLICY "Users can manage speakers of their organization recordings"
  ON speakers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = speakers.recording_id
      AND is_organization_member(r.organization_id)
    )
  );

-- ============================================
-- RLS POLICIES: processing_jobs
-- ============================================

CREATE POLICY "Users can view jobs of their organization recordings"
  ON processing_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = processing_jobs.recording_id
      AND is_organization_member(r.organization_id)
    )
  );

CREATE POLICY "System can manage processing jobs"
  ON processing_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = processing_jobs.recording_id
      AND is_organization_member(r.organization_id)
    )
  );

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE organizations IS 'Organizations/workspaces for multi-tenant access';
COMMENT ON TABLE organization_members IS 'Junction table for organization membership with roles';
COMMENT ON TABLE recordings IS 'Audio/video recordings uploaded for transcription';
COMMENT ON TABLE transcripts IS 'Transcription results with speaker diarization segments';
COMMENT ON TABLE artifacts IS 'Generated artifacts: summaries, protocols, action items';
COMMENT ON TABLE speakers IS 'Speaker identification and naming for recordings';
COMMENT ON TABLE processing_jobs IS 'Background processing job tracking';

COMMENT ON COLUMN recordings.gcs_uri IS 'Google Cloud Storage URI in format gs://bucket/path';
COMMENT ON COLUMN transcripts.segments IS 'JSONB array of {speaker, start, end, text, confidence, words}';
COMMENT ON COLUMN processing_jobs.google_operation_name IS 'Google Cloud operation name for async job polling';
