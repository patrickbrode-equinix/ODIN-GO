-- 047: Per-employee monthly target hours for shift planning

CREATE TABLE IF NOT EXISTS shiftplan_employee_monthly_targets (
  id            SERIAL PRIMARY KEY,
  month         VARCHAR(7) NOT NULL,
  employee_name VARCHAR(120) NOT NULL,
  target_hours  NUMERIC(6,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, employee_name)
);

CREATE INDEX IF NOT EXISTS idx_shiftplan_employee_monthly_targets_month
  ON shiftplan_employee_monthly_targets(month);

CREATE INDEX IF NOT EXISTS idx_shiftplan_employee_monthly_targets_employee
  ON shiftplan_employee_monthly_targets(employee_name);