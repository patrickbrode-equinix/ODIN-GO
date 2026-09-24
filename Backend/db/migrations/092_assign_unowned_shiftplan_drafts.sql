-- Drafts created before ownership tracking whose creator could not be matched
-- (e.g. created_by = 'system') would otherwise be invisible to everyone.
-- Assign them to the root administrator, who created them via the admin session.
UPDATE shiftplan_drafts
SET created_by_user_id = (
  SELECT id FROM users WHERE is_root = TRUE ORDER BY id ASC LIMIT 1
)
WHERE created_by_user_id IS NULL
  AND EXISTS (SELECT 1 FROM users WHERE is_root = TRUE);
