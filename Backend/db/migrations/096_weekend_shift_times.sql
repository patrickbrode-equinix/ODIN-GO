-- Weekend series use the same times as their weekday counterparts:
-- E1SA/E1WE 06:30-15:30 like E1, L1WE 13:00-22:00 like L1 (8h paid after the 1h break).
-- Values mirror Backend/lib/shiftDefaults.js.
UPDATE shift_definitions AS definition
SET start_time = defaults.start_time::time,
    end_time = defaults.end_time::time,
    start_day_offset = 0,
    end_day_offset = 0,
    duration_hours = defaults.duration_hours,
    updated_at = NOW()
FROM (VALUES
  ('E1SA', '06:30', '15:30', 8.0),
  ('E1WE', '06:30', '15:30', 8.0),
  ('L1WE', '13:00', '22:00', 8.0)
) AS defaults(code, start_time, end_time, duration_hours)
WHERE UPPER(definition.code) = defaults.code;
