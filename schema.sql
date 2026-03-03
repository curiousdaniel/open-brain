-- Enable pgvector (run once in Vercel Postgres SQL tab or psql)
CREATE EXTENSION IF NOT EXISTS vector;

-- Thoughts table: raw text, embedding, metadata
CREATE TABLE thoughts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small default
  people TEXT[] DEFAULT '{}',
  topics TEXT[] DEFAULT '{}',
  type TEXT,               -- e.g. "idea", "meeting_note", "task", "reflection"
  action_items TEXT[] DEFAULT '{}',
  source_channel TEXT,
  source_user TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast semantic search
CREATE INDEX ON thoughts USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for recent listing
CREATE INDEX ON thoughts (created_at DESC);
