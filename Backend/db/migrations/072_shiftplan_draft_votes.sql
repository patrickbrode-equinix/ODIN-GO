ALTER TABLE shiftplan_draft_feedback
  ALTER COLUMN employee_name DROP NOT NULL;

CREATE TABLE IF NOT EXISTS shiftplan_draft_votes (
  draft_id INTEGER NOT NULL REFERENCES shiftplan_drafts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote VARCHAR(24) NOT NULL CHECK (vote IN ('approve', 'needs_changes')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (draft_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shiftplan_draft_votes_draft
  ON shiftplan_draft_votes (draft_id, vote);
