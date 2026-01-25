-- ============================================
-- Migration: 003_add_missing_file_name_column
-- Description: Add file_name column if missing (fix for incomplete initial migration)
-- ============================================

-- Add file_name column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recordings' AND column_name = 'file_name'
  ) THEN
    ALTER TABLE recordings ADD COLUMN file_name TEXT;
    -- Set default for existing rows
    UPDATE recordings SET file_name = 'unknown' WHERE file_name IS NULL;
    -- Make it NOT NULL after setting defaults
    ALTER TABLE recordings ALTER COLUMN file_name SET NOT NULL;
  END IF;
END $$;

-- Add file_size column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recordings' AND column_name = 'file_size'
  ) THEN
    ALTER TABLE recordings ADD COLUMN file_size BIGINT;
    -- Set default for existing rows
    UPDATE recordings SET file_size = 0 WHERE file_size IS NULL;
    -- Make it NOT NULL after setting defaults
    ALTER TABLE recordings ALTER COLUMN file_size SET NOT NULL;
  END IF;
END $$;
