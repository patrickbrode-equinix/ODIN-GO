-- 044: Add half-shift definitions + new assignment engine settings
-- Half shifts: HE1 (06:30-10:30), HE2 (07:00-11:00), HL1 (13:00-17:30), HL2 (15:00-19:30)

INSERT INTO shift_definitions (code, name, short_name, shift_type, start_time, end_time, start_day_offset, end_day_offset, duration_hours, min_staff, max_staff, color_hex, sort_order, applicable_days)
VALUES
  ('HE1', 'Halbe Frühschicht (E1)', 'HE1', 'early', '06:30', '10:30', 0, 0, 4.0, 0, 5, '#fb923c', 15, '[1,2,3,4,5]'::jsonb),
  ('HE2', 'Halbe Frühschicht (E2)', 'HE2', 'early', '07:00', '11:00', 0, 0, 4.0, 0, 5, '#fb923c', 16, '[1,2,3,4,5]'::jsonb),
  ('HL1', 'Halbe Spätschicht (L1)', 'HL1', 'late',  '13:00', '17:30', 0, 0, 4.5, 0, 5, '#facc15', 25, '[1,2,3,4,5]'::jsonb),
  ('HL2', 'Halbe Spätschicht (L2)', 'HL2', 'late',  '15:00', '19:30', 0, 0, 4.5, 0, 5, '#facc15', 26, '[1,2,3,4,5]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- New assignment settings with sensible defaults
INSERT INTO assignment_config (key, value, updated_by, updated_at)
VALUES
  ('assignment.cutoffMinutesBeforeShiftEnd', '45', 'system', NOW()),
  ('assignment.maxSameSystemSmartHands', '3', 'system', NOW()),
  ('assignment.maxSameSystemCrossConnect', '2', 'system', NOW())
ON CONFLICT (key) DO NOTHING;
