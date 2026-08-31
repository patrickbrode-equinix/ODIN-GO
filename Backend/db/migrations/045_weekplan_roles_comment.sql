-- 045: Add comment column to weekplan_roles for project/buddy notes
ALTER TABLE weekplan_roles ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT NULL;

COMMENT ON COLUMN weekplan_roles.comment IS 'Optional free-text note for roles like Projekt (project name) or Buddy (who they are buddying)';
