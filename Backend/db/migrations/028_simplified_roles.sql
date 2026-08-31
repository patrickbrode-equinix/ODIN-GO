ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET is_admin = TRUE
WHERE is_root = TRUE;

UPDATE users u
SET is_admin = TRUE
FROM groups g
WHERE g.key = u.user_group
  AND (
    COALESCE(g.policy->>'user_management', 'none') IN ('view', 'write')
    OR COALESCE(g.policy->>'admin_settings', 'none') IN ('view', 'write')
    OR COALESCE(g.policy->>'teams_center', 'none') IN ('view', 'write')
    OR COALESCE(g.policy->>'shiftplan_control', 'none') IN ('view', 'write')
    OR COALESCE(g.policy->>'ticket_audit', 'none') IN ('view', 'write')
  );

UPDATE users
SET is_admin = TRUE
WHERE (
    COALESCE(access_override->>'user_management', 'none') IN ('view', 'write')
    OR COALESCE(access_override->>'admin_settings', 'none') IN ('view', 'write')
    OR COALESCE(access_override->>'teams_center', 'none') IN ('view', 'write')
    OR COALESCE(access_override->>'shiftplan_control', 'none') IN ('view', 'write')
    OR COALESCE(access_override->>'ticket_audit', 'none') IN ('view', 'write')
  );