-- db/schema.sql
-- Canonical schema for the Beebo Memory MCP

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY,
  text TEXT NOT NULL,
  text_norm TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'note',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ts TIMESTAMPTZ NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS memories_text_norm_key ON memories(text_norm);
