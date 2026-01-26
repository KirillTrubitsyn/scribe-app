-- Migration: 005_fix_related_tables_rls.sql
-- Description: Fix RLS policies for transcripts, artifacts, and speakers
--              to allow access for dev organization recordings (anonymous uploads)
-- This matches the recordings policy updated in 002_allow_anonymous_uploads.sql

-- ============================================
-- FIX RLS POLICIES: transcripts
-- ============================================

DROP POLICY IF EXISTS "Users can view transcripts of their organization recordings" ON transcripts;

CREATE POLICY "Users can view transcripts of their organization recordings"
  ON transcripts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = transcripts.recording_id
      AND (
        is_organization_member(r.organization_id)
        OR r.organization_id = '00000000-0000-0000-0000-000000000000'
      )
    )
  );

DROP POLICY IF EXISTS "System can manage transcripts" ON transcripts;

CREATE POLICY "System can manage transcripts"
  ON transcripts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = transcripts.recording_id
      AND (
        is_organization_member(r.organization_id)
        OR r.organization_id = '00000000-0000-0000-0000-000000000000'
      )
    )
  );

-- ============================================
-- FIX RLS POLICIES: artifacts
-- ============================================

DROP POLICY IF EXISTS "Users can view artifacts of their organization recordings" ON artifacts;

CREATE POLICY "Users can view artifacts of their organization recordings"
  ON artifacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = artifacts.recording_id
      AND (
        is_organization_member(r.organization_id)
        OR r.organization_id = '00000000-0000-0000-0000-000000000000'
      )
    )
  );

DROP POLICY IF EXISTS "System can manage artifacts" ON artifacts;

CREATE POLICY "System can manage artifacts"
  ON artifacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = artifacts.recording_id
      AND (
        is_organization_member(r.organization_id)
        OR r.organization_id = '00000000-0000-0000-0000-000000000000'
      )
    )
  );

-- ============================================
-- FIX RLS POLICIES: speakers
-- ============================================

DROP POLICY IF EXISTS "Users can view speakers of their organization recordings" ON speakers;

CREATE POLICY "Users can view speakers of their organization recordings"
  ON speakers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = speakers.recording_id
      AND (
        is_organization_member(r.organization_id)
        OR r.organization_id = '00000000-0000-0000-0000-000000000000'
      )
    )
  );

DROP POLICY IF EXISTS "Users can manage speakers of their organization recordings" ON speakers;

CREATE POLICY "Users can manage speakers of their organization recordings"
  ON speakers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = speakers.recording_id
      AND (
        is_organization_member(r.organization_id)
        OR r.organization_id = '00000000-0000-0000-0000-000000000000'
      )
    )
  );

-- ============================================
-- FIX RLS POLICIES: processing_jobs
-- ============================================

DROP POLICY IF EXISTS "Users can view jobs of their organization recordings" ON processing_jobs;

CREATE POLICY "Users can view jobs of their organization recordings"
  ON processing_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = processing_jobs.recording_id
      AND (
        is_organization_member(r.organization_id)
        OR r.organization_id = '00000000-0000-0000-0000-000000000000'
      )
    )
  );

DROP POLICY IF EXISTS "System can manage processing jobs" ON processing_jobs;

CREATE POLICY "System can manage processing jobs"
  ON processing_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = processing_jobs.recording_id
      AND (
        is_organization_member(r.organization_id)
        OR r.organization_id = '00000000-0000-0000-0000-000000000000'
      )
    )
  );
