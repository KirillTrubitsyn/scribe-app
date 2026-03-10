-- ============================================
-- Migration: 011_cleanup_google_references
-- Rename google_operation_name to operation_name
-- ============================================

ALTER TABLE processing_jobs RENAME COLUMN google_operation_name TO operation_name;

DROP INDEX IF EXISTS idx_processing_jobs_google_operation;
CREATE INDEX idx_processing_jobs_operation ON processing_jobs(operation_name) WHERE operation_name IS NOT NULL;
