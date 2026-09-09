-- Feedback workflow: comments, ownership and archive state.
ALTER TABLE feedback_entries
  ADD COLUMN IF NOT EXISTS admin_comment TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_by VARCHAR(120),
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_feedback_entries_archived_at
  ON feedback_entries(archived_at);
