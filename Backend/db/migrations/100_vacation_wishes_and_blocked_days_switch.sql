-- Self-service vacation wishes: entries created by employees themselves are
-- marked with source = 'self' so they can edit/delete only their own entries.
-- Entries created by administrators keep source NULL (read-only for employees).
ALTER TABLE absences ADD COLUMN IF NOT EXISTS source TEXT;

-- Admin switch: should the generator honour the "days I do not want to work"
-- selections? Existing installations that already released employees through
-- the old employee pool keep their behaviour (switch on); everybody else starts
-- with the switch off, like the preferred-colleagues switch.
INSERT INTO app_settings (key, value, updated_by, updated_at)
SELECT 'shiftplan.blocked_days_enabled',
       CASE
         WHEN COALESCE(
                (SELECT value::text FROM app_settings
                  WHERE key = 'shiftplan.blocked_weekday_employee_pool' LIMIT 1),
                '[]') NOT IN ('', '[]', 'null')
         THEN 'true'
         ELSE 'false'
       END,
       'migration-100',
       NOW()
ON CONFLICT (key) DO NOTHING;
