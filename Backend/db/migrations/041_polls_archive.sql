-- ============================================================
-- 041_polls_archive.sql
-- Persistent archive state for polls / Umfragen
-- ============================================================

ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_polls_archived ON polls(archived, created_at DESC);
