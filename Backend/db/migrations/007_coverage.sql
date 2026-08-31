-- ============================================================
-- 007_coverage.sql
-- Coverage rules, violations, staffing rules/results,
-- employee skills.
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_skills (
  employee_name  VARCHAR(120) PRIMARY KEY,
  can_sh         BOOLEAN NOT NULL DEFAULT false,
  can_tt         BOOLEAN NOT NULL DEFAULT false,
  can_cc         BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coverage_rules (
  shift_type  VARCHAR(16) PRIMARY KEY,
  min_sh      INT NOT NULL DEFAULT 0,
  min_tt      INT NOT NULL DEFAULT 0,
  min_cc      INT NOT NULL DEFAULT 0
);

-- Seed default coverage rules
INSERT INTO coverage_rules (shift_type, min_sh, min_tt, min_cc)
VALUES
  ('E', 1, 1, 1),
  ('L', 1, 1, 0),
  ('N', 1, 0, 0)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS coverage_violations (
  date        DATE NOT NULL,
  shift_type  VARCHAR(10) NOT NULL,
  missing     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, shift_type)
);

CREATE TABLE IF NOT EXISTS staffing_rules (
  shift_type  VARCHAR(10) PRIMARY KEY,
  min_count   INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS staffing_results (
  date        DATE NOT NULL,
  shift_type  VARCHAR(10) NOT NULL,
  actual      INT NOT NULL DEFAULT 0,
  min         INT NOT NULL DEFAULT 0,
  status      VARCHAR(10) NOT NULL DEFAULT 'OK',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, shift_type)
);
