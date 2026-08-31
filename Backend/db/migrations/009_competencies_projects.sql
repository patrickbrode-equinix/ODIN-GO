-- ============================================================
-- 009_competencies_projects.sql
-- Employee competencies, projects module, shiftplan upload log
-- ============================================================

-- EMPLOYEE COMPETENCIES
CREATE TABLE IF NOT EXISTS employee_competencies (
  id              SERIAL PRIMARY KEY,
  employee_name   VARCHAR(200) NOT NULL,
  capability      VARCHAR(200) NOT NULL,
  level           SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3),
  notes           TEXT,
  created_by      VARCHAR(120),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_name, capability)
);

CREATE INDEX IF NOT EXISTS idx_competencies_employee ON employee_competencies(employee_name);

-- EMPLOYEE CUSTOMER ACCESS
CREATE TABLE IF NOT EXISTS employee_customer_access (
  id              SERIAL PRIMARY KEY,
  employee_name   VARCHAR(200) NOT NULL,
  customer_name   VARCHAR(200) NOT NULL,
  approved        BOOLEAN NOT NULL DEFAULT true,
  approved_by     VARCHAR(120),
  valid_until     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_name, customer_name)
);

CREATE INDEX IF NOT EXISTS idx_customer_access_employee ON employee_customer_access(employee_name);

-- PROJECTS
CREATE TABLE IF NOT EXISTS projects (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(300) NOT NULL,
  creator         VARCHAR(200) NOT NULL,
  responsible     VARCHAR(200),
  expected_done   DATE,
  progress        SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  description     TEXT,
  status          VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SHIFTPLAN UPLOAD LOG (track last upload time)
CREATE TABLE IF NOT EXISTS shiftplan_upload_log (
  id              SERIAL PRIMARY KEY,
  uploaded_by     VARCHAR(200),
  months_affected TEXT[],
  employees_count INT DEFAULT 0,
  changes_count   INT DEFAULT 0,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TEAMS LOG
CREATE TABLE IF NOT EXISTS teams_message_log (
  id              SERIAL PRIMARY KEY,
  message_type    VARCHAR(64) NOT NULL,
  recipient       VARCHAR(300),
  channel         VARCHAR(300),
  content         TEXT NOT NULL,
  status          VARCHAR(32) NOT NULL DEFAULT 'sent',
  error_msg       TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_log_sent_at ON teams_message_log(sent_at);

-- GLOBAL SETTINGS (thresholds etc.)
CREATE TABLE IF NOT EXISTS app_settings (
  key             VARCHAR(100) PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_by      VARCHAR(120),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default settings
INSERT INTO app_settings (key, value) VALUES
  ('shift_warning_threshold', '1'),
  ('understaffing_threshold', '2'),
  ('wellbeing_threshold', '60'),
  ('log_retention_days', '90')
ON CONFLICT (key) DO NOTHING;
