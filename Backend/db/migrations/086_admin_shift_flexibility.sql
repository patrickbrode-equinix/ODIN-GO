-- 086: Flexible per-weekday shift windows, global short-night test mode,
-- admin-only employee flags, and individual DBS working patterns.

ALTER TABLE shift_rotation_rules
  ADD COLUMN IF NOT EXISTS short_night_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS shift_definition_day_overrides (
  id BIGSERIAL PRIMARY KEY,
  shift_definition_id INTEGER NOT NULL REFERENCES shift_definitions(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  start_day_offset SMALLINT NOT NULL DEFAULT 0 CHECK (start_day_offset BETWEEN 0 AND 1),
  end_day_offset SMALLINT NOT NULL DEFAULT 0 CHECK (end_day_offset BETWEEN 0 AND 1),
  duration_hours NUMERIC(5,2) NOT NULL CHECK (duration_hours > 0 AND duration_hours <= 24),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shift_definition_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_shift_definition_day_overrides_definition
  ON shift_definition_day_overrides (shift_definition_id, weekday);

ALTER TABLE shift_special_pools
  ADD COLUMN IF NOT EXISTS working_weekdays JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  ADD COLUMN IF NOT EXISTS free_days_after_block SMALLINT NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS employee_admin_flags (
  id BIGSERIAL PRIMARY KEY,
  employee_name VARCHAR(160) NOT NULL UNIQUE,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(160) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_admin_flags_active
  ON employee_admin_flags (is_active, employee_name);
