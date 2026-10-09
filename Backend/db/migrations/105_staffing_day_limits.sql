-- Global min/max staffing for Saturday, Sunday and public holidays (early/late).
-- Weekday (Mon-Fri) early/late and night stay in staffing_rules. Per-shift
-- min_staff/max_staff of shift_definitions are no longer used for early/late/night.
CREATE TABLE IF NOT EXISTS staffing_day_limits (
  day_context TEXT NOT NULL CHECK (day_context IN ('saturday', 'sunday', 'holiday')),
  shift_type  TEXT NOT NULL CHECK (shift_type IN ('early', 'late')),
  min_count   INT  NOT NULL DEFAULT 0 CHECK (min_count >= 0),
  max_count   INT  NULL CHECK (max_count IS NULL OR max_count >= 0),
  PRIMARY KEY (day_context, shift_type)
);

INSERT INTO staffing_day_limits (day_context, shift_type, min_count, max_count) VALUES
  ('saturday', 'early', 4, 6),
  ('saturday', 'late', 1, 3),
  ('sunday', 'early', 4, 6),
  ('sunday', 'late', 1, 3),
  ('holiday', 'early', 4, 6),
  ('holiday', 'late', 1, 3)
ON CONFLICT (day_context, shift_type) DO NOTHING;
