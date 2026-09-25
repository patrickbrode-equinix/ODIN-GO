-- Employees can name up to four preferred colleagues (users.id values).
-- The generator only uses them while shiftplan.preferred_colleagues_enabled is true.
ALTER TABLE employee_preferences
  ADD COLUMN IF NOT EXISTS preferred_colleagues JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO app_settings (key, value, updated_by, updated_at)
VALUES ('shiftplan.preferred_colleagues_enabled', 'false', 'migration-097', NOW())
ON CONFLICT (key) DO NOTHING;
