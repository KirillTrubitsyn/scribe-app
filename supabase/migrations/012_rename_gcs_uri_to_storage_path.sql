-- ============================================
-- Migration: 012_rename_gcs_uri_to_storage_path
-- Rename gcs_uri column to storage_path in recordings table
-- to match the application code after moving from GCS to Supabase Storage
-- ============================================

ALTER TABLE recordings RENAME COLUMN gcs_uri TO storage_path;
