ALTER TABLE shiftplan_drafts
  ADD COLUMN IF NOT EXISTS created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL;

UPDATE shiftplan_drafts AS draft
SET created_by_user_id = users.id
FROM users
WHERE draft.created_by_user_id IS NULL
  AND (
    LOWER(BTRIM(draft.created_by)) = LOWER(BTRIM(COALESCE(users.email, '')))
    OR LOWER(BTRIM(draft.created_by)) = LOWER(BTRIM(COALESCE(users.login_name, '')))
  );

CREATE INDEX IF NOT EXISTS idx_shiftplan_drafts_created_by_user
  ON shiftplan_drafts (created_by_user_id, created_at DESC);
