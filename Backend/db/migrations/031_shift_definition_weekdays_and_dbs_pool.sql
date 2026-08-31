-- ============================================================
-- 031_shift_definition_weekdays_and_dbs_pool.sql
-- Add weekday applicability for shift definitions and a fixed
-- employee pool with monthly limits for DBS/special shifts.
-- ============================================================

ALTER TABLE shift_definitions
  ADD COLUMN IF NOT EXISTS applicable_days JSONB NOT NULL DEFAULT '[1,2,3,4,5,6,0]'::jsonb;

UPDATE shift_definitions
SET applicable_days = '[1,2,3,4,5]'::jsonb
WHERE code IN ('E1', 'E2', 'L1', 'L2');

UPDATE shift_definitions
SET applicable_days = '[1,2,3,4,5,6,0]'::jsonb
WHERE code IN ('N', 'DBS', 'FS', 'ABW', 'S');

INSERT INTO shift_definitions (
  code, name, short_name, shift_type, start_time, end_time,
  duration_hours, min_staff, max_staff, color_hex, sort_order, applicable_days
)
VALUES
  ('E1SA', 'Frühschicht mit Wochenende (Samstag)', 'E1 Sa', 'early', '06:00', '14:00', 8.0, 1, 3, '#2563eb', 6, '[6]'::jsonb),
  ('E1WE', 'Frühschicht mit Wochenende (Samstag und Sonntag)', 'E1 WE', 'early', '06:00', '14:00', 8.0, 1, 3, '#1d4ed8', 7, '[6,0]'::jsonb),
  ('L1WE', 'Spätschicht mit Wochenende (Samstag und Sonntag)', 'L1 WE', 'late', '14:00', '22:00', 8.0, 1, 3, '#d97706', 8, '[6,0]'::jsonb),
  ('DBS', 'DBS', 'DBS', 'special', '08:00', '16:00', 8.0, 1, 1, '#c026d3', 2, '[1,2,3,4,5,6,0]'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  shift_type = EXCLUDED.shift_type,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  duration_hours = EXCLUDED.duration_hours,
  min_staff = EXCLUDED.min_staff,
  max_staff = EXCLUDED.max_staff,
  color_hex = EXCLUDED.color_hex,
  applicable_days = EXCLUDED.applicable_days,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS shift_special_pools (
  id                        SERIAL PRIMARY KEY,
  shift_code                VARCHAR(10)   NOT NULL REFERENCES shift_definitions(code) ON DELETE CASCADE,
  employee_name             VARCHAR(120)  NOT NULL,
  monthly_max_assignments   INT           NOT NULL DEFAULT 4,
  sort_order                INT           NOT NULL DEFAULT 0,
  is_active                 BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (shift_code, employee_name)
);

CREATE INDEX IF NOT EXISTS idx_shift_special_pools_shift_code ON shift_special_pools(shift_code);
CREATE INDEX IF NOT EXISTS idx_shift_special_pools_active ON shift_special_pools(is_active);