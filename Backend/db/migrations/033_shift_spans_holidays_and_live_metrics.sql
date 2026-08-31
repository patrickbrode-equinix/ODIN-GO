-- ============================================================
-- 033_shift_spans_holidays_and_live_metrics.sql
-- Adds shift span offsets, holiday preferences and live metric fields.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE shift_definitions
  ADD COLUMN IF NOT EXISTS start_day_offset SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS end_day_offset SMALLINT NOT NULL DEFAULT 0;

UPDATE shift_definitions
SET end_day_offset = 1
WHERE UPPER(code) = 'N';

ALTER TABLE employee_preferences
  ADD COLUMN IF NOT EXISTS preferred_holidays JSONB NOT NULL DEFAULT '[]'::jsonb;