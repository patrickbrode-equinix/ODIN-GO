ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'import';

CREATE TABLE IF NOT EXISTS manual_shiftplan_employees (
  id SERIAL PRIMARY KEY,
  month VARCHAR(16) NOT NULL,
  employee_name VARCHAR(120) NOT NULL,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(month, employee_name)
);

CREATE INDEX IF NOT EXISTS idx_manual_shiftplan_employees_month
  ON manual_shiftplan_employees(month);

CREATE INDEX IF NOT EXISTS idx_manual_shiftplan_employees_name
  ON manual_shiftplan_employees(employee_name);