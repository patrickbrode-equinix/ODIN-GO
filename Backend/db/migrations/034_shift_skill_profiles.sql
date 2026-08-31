ALTER TABLE employee_skills
  ADD COLUMN IF NOT EXISTS rated_skills JSONB NOT NULL DEFAULT '{}'::jsonb;