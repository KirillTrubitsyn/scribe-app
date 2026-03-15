-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Transcript chunks with embeddings for semantic search
CREATE TABLE IF NOT EXISTS transcript_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_time DOUBLE PRECISION,
  end_time DOUBLE PRECISION,
  speaker TEXT,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(recording_id, chunk_index)
);

-- Index for vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_embedding
  ON transcript_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for filtering by recording
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_recording
  ON transcript_chunks(recording_id);

-- RPC function for similarity search across all recordings
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10,
  filter_recording_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  recording_id UUID,
  chunk_index INTEGER,
  text TEXT,
  start_time DOUBLE PRECISION,
  end_time DOUBLE PRECISION,
  speaker TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tc.id,
    tc.recording_id,
    tc.chunk_index,
    tc.text,
    tc.start_time,
    tc.end_time,
    tc.speaker,
    1 - (tc.embedding <=> query_embedding) AS similarity
  FROM transcript_chunks tc
  WHERE
    tc.embedding IS NOT NULL
    AND 1 - (tc.embedding <=> query_embedding) > match_threshold
    AND (filter_recording_id IS NULL OR tc.recording_id = filter_recording_id)
  ORDER BY tc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- RLS policies
ALTER TABLE transcript_chunks ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users in the dev organization
CREATE POLICY "Users can view transcript chunks for accessible recordings"
  ON transcript_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings r
      WHERE r.id = transcript_chunks.recording_id
      AND r.organization_id = '00000000-0000-0000-0000-000000000000'
    )
  );

-- Allow service role full access (for worker)
CREATE POLICY "Service role can manage transcript chunks"
  ON transcript_chunks FOR ALL
  USING (true)
  WITH CHECK (true);
