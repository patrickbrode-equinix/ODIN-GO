-- ============================================================
-- 006_wellbeing.sql
-- Wellbeing metrics, shift rules, violations.
-- ============================================================

CREATE TABLE IF NOT EXISTS wellbeing_config (
  id                  SERIAL PRIMARY KEY,
  scope               TEXT UNIQUE NOT NULL DEFAULT 'global',
  night_threshold     INT NOT NULL DEFAULT 4,
  weekend_threshold   INT NOT NULL DEFAULT 2,
  streak_threshold    INT NOT NULL DEFAULT 7,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS wellbeing_metrics (
  id             SERIAL PRIMARY KEY,
  employee_name  VARCHAR(120) NOT NULL,
  year           INT NOT NULL,
  month          INT NOT NULL,
  night_count    INT NOT NULL DEFAULT 0,
  weekend_count  INT NOT NULL DEFAULT 0,
  early_count    INT NOT NULL DEFAULT 0,
  late_count     INT NOT NULL DEFAULT 0,
  max_streak     INT NOT NULL DEFAULT 0,
  score          INT NOT NULL DEFAULT 0,
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_name, year, month)
);

CREATE INDEX IF NOT EXISTS idx_wellbeing_emp  ON wellbeing_metrics(employee_name);
CREATE INDEX IF NOT EXISTS idx_wellbeing_date ON wellbeing_metrics(year, month);

CREATE TABLE IF NOT EXISTS shift_rules_config (
  id                  SERIAL PRIMARY KEY,
  scope               TEXT UNIQUE NOT NULL DEFAULT 'global',
  min_rest_hours      INT NOT NULL DEFAULT 11,
  hard_change_pairs   JSONB NOT NULL DEFAULT '[["L","E"],["N","E"]]'::jsonb,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS shift_violations (
  id              SERIAL PRIMARY KEY,
  employee_name   VARCHAR(120) NOT NULL,
  date            DATE NOT NULL,
  violation_type  VARCHAR(32) NOT NULL,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_name, date, violation_type)
);

CREATE INDEX IF NOT EXISTS idx_violations_emp  ON shift_violations(employee_name);
CREATE INDEX IF NOT EXISTS idx_violations_date ON shift_violations(date);
