-- ============================================
-- Migration: 002_allow_anonymous_uploads
-- Description: Allow anonymous uploads for development
-- ============================================

-- Make user_id nullable to support anonymous uploads
ALTER TABLE recordings ALTER COLUMN user_id DROP NOT NULL;

-- Create a default organization for anonymous/development uploads
INSERT INTO organizations (id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Development',
  'dev'
) ON CONFLICT (id) DO NOTHING;

-- Update RLS policy to allow anonymous inserts with the dev organization
DROP POLICY IF EXISTS "Users can create recordings in their organizations" ON recordings;

CREATE POLICY "Users can create recordings in their organizations"
  ON recordings FOR INSERT
  WITH CHECK (
    -- Allow authenticated users to create in their organizations
    (auth.uid() IS NOT NULL AND is_organization_member(organization_id) AND user_id = auth.uid())
    OR
    -- Allow anonymous uploads to dev organization (user_id will be NULL)
    (organization_id = '00000000-0000-0000-0000-000000000000' AND user_id IS NULL)
  );

-- Also update SELECT policy to allow viewing dev organization recordings
DROP POLICY IF EXISTS "Users can view recordings in their organizations" ON recordings;

CREATE POLICY "Users can view recordings in their organizations"
  ON recordings FOR SELECT
  USING (
    is_organization_member(organization_id)
    OR
    organization_id = '00000000-0000-0000-0000-000000000000'
  );

-- Update policy for anonymous users to update their recordings (by recording id only)
DROP POLICY IF EXISTS "Users can update their own recordings" ON recordings;

CREATE POLICY "Users can update their own recordings"
  ON recordings FOR UPDATE
  USING (
    (is_organization_member(organization_id) AND (user_id = auth.uid() OR is_organization_admin(organization_id)))
    OR
    (organization_id = '00000000-0000-0000-0000-000000000000')
  );
