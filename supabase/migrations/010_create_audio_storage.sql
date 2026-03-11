-- ============================================
-- Migration: 010_create_audio_storage
-- Create Supabase Storage bucket for audio files
-- Rename gcs_uri to storage_path in recordings
-- ============================================

-- 1. Create audio-files bucket (private, 500MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-files',
  'audio-files',
  false,
  524288000, -- 500MB
  ARRAY['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'video/webm']
);

-- 2. RLS policies for storage.objects — allow all operations for MVP (no auth)
CREATE POLICY "Allow public SELECT on audio-files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audio-files');

CREATE POLICY "Allow public INSERT on audio-files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audio-files');

CREATE POLICY "Allow public UPDATE on audio-files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'audio-files');

CREATE POLICY "Allow public DELETE on audio-files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'audio-files');

-- 3. Rename gcs_uri column to storage_path
ALTER TABLE recordings RENAME COLUMN gcs_uri TO storage_path;
