-- ============================================================
-- 038_feedback_status.sql
-- Add status column to feedback_entries for workflow tracking
-- ============================================================

ALTER TABLE feedback_entries
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open';

CREATE INDEX IF NOT EXISTS idx_feedback_entries_status ON feedback_entries(status);
