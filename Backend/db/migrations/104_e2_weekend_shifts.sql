-- Weekend early-shift family 2: E2SA (Mon-Sat, 6 days) and E2WE (Mon-Sun, 7 days),
-- 07:00-16:00 like E2 (8h paid after the 1h break). Values mirror Backend/lib/shiftDefaults.js.
-- Existing codes E1SA/E1WE/L1WE are NOT renamed; only their default display names are refreshed.
INSERT INTO shift_definitions (
  code, name, short_name, shift_type, start_time, end_time,
  start_day_offset, end_day_offset, duration_hours, series_days,
  min_staff, max_staff, color_hex, is_active, sort_order, applicable_days
)
VALUES
  ('E2SA', 'Frühschicht 2 mit Wochenende (Samstag)', 'E2 SA', 'early', '07:00', '16:00',
   0, 0, 8.0, 6, 1, 3, '#38bdf8', TRUE, 9, '[1,2,3,4,5,6]'::jsonb),
  ('E2WE', 'Frühschicht 2 mit Wochenende (Sa/So)', 'E2 SA/SO', 'early', '07:00', '16:00',
   0, 0, 8.0, 7, 1, 3, '#0ea5e9', TRUE, 10, '[1,2,3,4,5,6,0]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Refresh display names only where they still carry the old default text
-- (administrator renames are preserved).
UPDATE shift_definitions
SET name = 'Frühschicht SA/SO', updated_at = NOW()
WHERE UPPER(code) = 'E1WE' AND name = 'Frühschicht mit Wochenende (Samstag und Sonntag)';

UPDATE shift_definitions
SET short_name = 'E1 SA/SO', updated_at = NOW()
WHERE UPPER(code) = 'E1WE' AND short_name = 'E1 WE';

UPDATE shift_definitions
SET name = 'Spätschicht SA/SO', updated_at = NOW()
WHERE UPPER(code) = 'L1WE' AND name = 'Spätschicht mit Wochenende (Samstag und Sonntag)';

UPDATE shift_definitions
SET short_name = 'L1 SA/SO', updated_at = NOW()
WHERE UPPER(code) = 'L1WE' AND short_name = 'L1 WE';

UPDATE shift_definitions
SET name = 'Frühschicht SA', updated_at = NOW()
WHERE UPPER(code) = 'E1SA' AND name = 'Frühschicht mit Wochenende (Samstag)';

UPDATE shift_definitions
SET short_name = 'E1 SA', updated_at = NOW()
WHERE UPPER(code) = 'E1SA' AND short_name = 'E1 Sa';
