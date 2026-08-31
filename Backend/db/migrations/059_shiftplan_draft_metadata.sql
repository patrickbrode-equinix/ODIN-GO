-- 059: Draft metadata for renaming and review notes

ALTER TABLE shiftplan_drafts
  ADD COLUMN IF NOT EXISTS title TEXT;

CREATE INDEX IF NOT EXISTS idx_shiftplan_drafts_title
  ON shiftplan_drafts (title);
