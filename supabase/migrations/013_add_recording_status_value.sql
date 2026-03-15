-- Add 'recording' value to recordings_status_check constraint
-- The status column is text with a CHECK constraint, not an enum
ALTER TABLE recordings DROP CONSTRAINT IF EXISTS recordings_status_check;

ALTER TABLE recordings ADD CONSTRAINT recordings_status_check
  CHECK (status = ANY (ARRAY['recording', 'uploading', 'uploaded', 'processing', 'transcribing', 'analyzing', 'ready', 'error']));
