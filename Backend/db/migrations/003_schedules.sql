-- ============================================================
-- 003_schedules.sql
-- Shift-plan: shifts (monthly schedule), year_plan_2027.
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
  id             SERIAL PRIMARY KEY,
  month          VARCHAR(16) NOT NULL,
  employee_name  VARCHAR(120) NOT NULL,
  day            INT NOT NULL CHECK (day >= 1 AND day <= 31),
  shift_code     VARCHAR(16) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(month, employee_name, day)
);

CREATE INDEX IF NOT EXISTS idx_shifts_month    ON shifts(month);
CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts(employee_name);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_shifts_updated_at') THEN
    CREATE TRIGGER trg_shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- YEAR PLAN
CREATE TABLE IF NOT EXISTS year_plan_2027 (
  id             SERIAL PRIMARY KEY,
  employee_name  VARCHAR(120) NOT NULL,
  date           DATE NOT NULL,
  shift_code     VARCHAR(16) NOT NULL,
  week_number    INT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_name, date)
);

CREATE INDEX IF NOT EXISTS idx_yp27_emp  ON year_plan_2027(employee_name);
CREATE INDEX IF NOT EXISTS idx_yp27_date ON year_plan_2027(date);
