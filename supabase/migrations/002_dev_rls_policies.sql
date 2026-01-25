-- ============================================
-- SGC Scribe Development RLS Policies
-- Migration: 002_dev_rls_policies
-- ============================================
-- ВНИМАНИЕ: Эти политики только для разработки!
-- В продакшене нужно использовать реальную аутентификацию
-- ============================================

-- Удаляем существующие production политики для recordings
DROP POLICY IF EXISTS "Users can view recordings in their organizations" ON recordings;
DROP POLICY IF EXISTS "Users can create recordings in their organizations" ON recordings;
DROP POLICY IF EXISTS "Users can update their own recordings" ON recordings;
DROP POLICY IF EXISTS "Users can delete their own recordings" ON recordings;

-- Удаляем существующие production политики для связанных таблиц
DROP POLICY IF EXISTS "Users can view transcripts of their organization recordings" ON transcripts;
DROP POLICY IF EXISTS "System can manage transcripts" ON transcripts;
DROP POLICY IF EXISTS "Users can view artifacts of their organization recordings" ON artifacts;
DROP POLICY IF EXISTS "System can manage artifacts" ON artifacts;
DROP POLICY IF EXISTS "Users can view speakers of their organization recordings" ON speakers;
DROP POLICY IF EXISTS "Users can manage speakers of their organization recordings" ON speakers;
DROP POLICY IF EXISTS "Users can view jobs of their organization recordings" ON processing_jobs;
DROP POLICY IF EXISTS "System can manage processing jobs" ON processing_jobs;

-- ============================================
-- Development политики для тестовой организации
-- ============================================

-- Organizations: разрешаем просмотр тестовой организации
CREATE POLICY "dev_organizations_select" ON organizations
  FOR SELECT USING (id = '00000000-0000-0000-0000-000000000001');

-- Recordings: полный доступ к записям тестовой организации
CREATE POLICY "dev_recordings_select" ON recordings
  FOR SELECT USING (organization_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY "dev_recordings_insert" ON recordings
  FOR INSERT WITH CHECK (organization_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY "dev_recordings_update" ON recordings
  FOR UPDATE USING (organization_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY "dev_recordings_delete" ON recordings
  FOR DELETE USING (organization_id = '00000000-0000-0000-0000-000000000001');

-- Transcripts: полный доступ (связаны с recordings через FK)
CREATE POLICY "dev_transcripts_all" ON transcripts
  FOR ALL USING (true);

-- Artifacts: полный доступ
CREATE POLICY "dev_artifacts_all" ON artifacts
  FOR ALL USING (true);

-- Speakers: полный доступ
CREATE POLICY "dev_speakers_all" ON speakers
  FOR ALL USING (true);

-- Processing Jobs: полный доступ
CREATE POLICY "dev_processing_jobs_all" ON processing_jobs
  FOR ALL USING (true);

-- ============================================
-- Комментарии
-- ============================================

COMMENT ON POLICY "dev_organizations_select" ON organizations IS 'DEV ONLY: Allow select on test organization';
COMMENT ON POLICY "dev_recordings_select" ON recordings IS 'DEV ONLY: Allow select on test organization recordings';
COMMENT ON POLICY "dev_recordings_insert" ON recordings IS 'DEV ONLY: Allow insert into test organization';
COMMENT ON POLICY "dev_recordings_update" ON recordings IS 'DEV ONLY: Allow update on test organization recordings';
COMMENT ON POLICY "dev_recordings_delete" ON recordings IS 'DEV ONLY: Allow delete on test organization recordings';
