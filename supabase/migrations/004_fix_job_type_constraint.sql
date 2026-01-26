-- ============================================
-- Migration: 004_fix_job_type_constraint
-- Description: Fix job_type constraint to accept 'transcription' and 'analysis' values
-- ============================================

-- Drop the existing check constraint if it exists
ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_job_type_check;

-- Ensure the job_type enum type exists with correct values
DO $$
BEGIN
  -- Check if job_type enum exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_type') THEN
    CREATE TYPE job_type AS ENUM ('transcription', 'analysis');
  ELSE
    -- Add values if they don't exist
    BEGIN
      ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'transcription';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    BEGIN
      ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'analysis';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- If the column is TEXT, convert it to the enum type
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'processing_jobs' AND column_name = 'job_type';

  IF col_type = 'text' OR col_type = 'character varying' THEN
    -- First update any invalid values
    UPDATE processing_jobs SET job_type = 'transcription'
    WHERE job_type NOT IN ('transcription', 'analysis');

    -- Convert column to enum type
    ALTER TABLE processing_jobs
      ALTER COLUMN job_type TYPE job_type USING job_type::job_type;
  END IF;
END $$;

-- Recreate the check constraint to ensure it allows our values
-- This is a safety measure in case the enum conversion didn't work
DO $$
BEGIN
  -- Only create if the column is still text type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'processing_jobs'
    AND column_name = 'job_type'
    AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE processing_jobs
      ADD CONSTRAINT processing_jobs_job_type_check
      CHECK (job_type IN ('transcription', 'analysis'));
  END IF;
END $$;
