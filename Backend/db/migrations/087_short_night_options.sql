ALTER TABLE shift_rotation_rules
  ADD COLUMN IF NOT EXISTS short_night_free_days_after SMALLINT NOT NULL DEFAULT 2;

INSERT INTO shift_definitions (
  code, name, short_name, shift_type, start_time, end_time,
  start_day_offset, end_day_offset, duration_hours, series_days,
  min_staff, max_staff, color_hex, is_active, sort_order, applicable_days
)
VALUES (
  'NK', 'Kurze Nachtschicht', 'NK', 'night', '21:45', '06:45',
  0, 1, 9.0, 3,
  1, 3, '#2563eb', FALSE, 999, '[0,1,2,3,4,5,6]'::jsonb
)
ON CONFLICT (code) DO NOTHING;
