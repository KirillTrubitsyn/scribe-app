-- Add 'recording' value to recording_status enum
-- This status is used when a recording is actively being captured
ALTER TYPE recording_status ADD VALUE IF NOT EXISTS 'recording' BEFORE 'uploading';
