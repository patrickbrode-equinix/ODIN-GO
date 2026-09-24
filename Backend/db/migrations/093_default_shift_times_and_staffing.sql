-- Operational default shift times and cumulative staffing per shift type.
-- Values mirror Backend/lib/shiftDefaults.js and can be changed or restored in the settings.
ALTER TABLE staffing_rules ADD COLUMN IF NOT EXISTS max_count INT NULL;

UPDATE shift_definitions AS definition
SET start_time = defaults.start_time::time,
    end_time = defaults.end_time::time,
    start_day_offset = defaults.start_day_offset,
    end_day_offset = defaults.end_day_offset,
    duration_hours = defaults.duration_hours,
    min_staff = defaults.min_staff,
    max_staff = defaults.max_staff,
    updated_at = NOW()
FROM (VALUES
  ('E1', '06:30', '15:30', 0, 0, 9.0, 1, 99),
  ('E2', '07:00', '16:00', 0, 0, 9.0, 1, 99),
  ('L1', '13:00', '22:00', 0, 0, 9.0, 1, 8),
  ('L2', '15:00', '00:00', 0, 1, 9.0, 1, 8),
  ('N',  '21:15', '06:45', 0, 1, 9.5, 4, 5)
) AS defaults(code, start_time, end_time, start_day_offset, end_day_offset, duration_hours, min_staff, max_staff)
WHERE UPPER(definition.code) = defaults.code;

INSERT INTO staffing_rules (shift_type, min_count, max_count)
VALUES ('early', 6, NULL), ('late', 4, 8), ('night', 4, 5)
ON CONFLICT (shift_type) DO UPDATE
SET min_count = EXCLUDED.min_count,
    max_count = EXCLUDED.max_count;
