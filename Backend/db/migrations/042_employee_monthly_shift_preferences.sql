-- ============================================================
-- 042_employee_monthly_shift_preferences.sql
-- Optional month-specific shift wishes per employee
-- ============================================================

ALTER TABLE employee_preferences
  ADD COLUMN IF NOT EXISTS monthly_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
