CREATE TABLE IF NOT EXISTS shiftplan_draft_feedback (
  id BIGSERIAL PRIMARY KEY,
  draft_id INTEGER NOT NULL REFERENCES shiftplan_drafts(id) ON DELETE CASCADE,
  employee_name VARCHAR(160) NOT NULL,
  day SMALLINT CHECK (day BETWEEN 1 AND 31),
  suggestion TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'declined', 'resolved')),
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_name VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by VARCHAR(160),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shiftplan_draft_feedback_draft
  ON shiftplan_draft_feedback (draft_id, created_at DESC);
