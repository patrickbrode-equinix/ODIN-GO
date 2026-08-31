/* ------------------------------------------------ */
/* 025 – ODIN Enhancements                          */
/* Assignment Employee Exclusions + Shiftplan Drafts */
/* ------------------------------------------------ */

/* ================================================ */
/* A. ASSIGNMENT EMPLOYEE EXCLUSIONS                */
/* ================================================ */

CREATE TABLE IF NOT EXISTS assignment_employee_exclusions (
  id              SERIAL PRIMARY KEY,
  employee_name   VARCHAR(120)  NOT NULL,
  reason          VARCHAR(60)   NOT NULL DEFAULT 'admin_override',
  reason_text     VARCHAR(255),
  valid_from      DATE,
  valid_to        DATE,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by      VARCHAR(120)  NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deactivated_by  VARCHAR(120),
  deactivated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_aee_employee ON assignment_employee_exclusions (employee_name);
CREATE INDEX IF NOT EXISTS idx_aee_active   ON assignment_employee_exclusions (is_active);

/* ================================================ */
/* B. SHIFTPLAN DRAFTS                              */
/* ================================================ */

CREATE TABLE IF NOT EXISTS shiftplan_drafts (
  id              SERIAL PRIMARY KEY,
  month           VARCHAR(7)    NOT NULL,                    -- 'YYYY-MM'
  version         INT           NOT NULL DEFAULT 1,
  status          VARCHAR(20)   NOT NULL DEFAULT 'draft',    -- draft | in_review | approved | activated | failed
  shifts_json     JSONB         NOT NULL DEFAULT '[]'::jsonb,
  explanations    JSONB         NOT NULL DEFAULT '{}'::jsonb,
  conflicts       JSONB         NOT NULL DEFAULT '[]'::jsonb,
  fairness        JSONB         NOT NULL DEFAULT '{}'::jsonb,
  config_snapshot JSONB         NOT NULL DEFAULT '{}'::jsonb, -- rules used for this run
  note            TEXT,
  created_by      VARCHAR(120)  NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  approved_by     VARCHAR(120),
  approved_at     TIMESTAMPTZ,
  activated_by    VARCHAR(120),
  activated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sd_month  ON shiftplan_drafts (month);
CREATE INDEX IF NOT EXISTS idx_sd_status ON shiftplan_drafts (status);

/* ================================================ */
/* C. RBAC: add shiftplan_control page key          */
/* ================================================ */

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT key, policy FROM groups
  LOOP
    IF r.policy IS NOT NULL AND r.policy ? 'pages' THEN
      UPDATE groups
      SET policy = jsonb_set(
        policy,
        '{pages,shiftplan_control}',
        '"write"'::jsonb
      )
      WHERE key = r.key
        AND NOT (policy->'pages' ? 'shiftplan_control');
    END IF;
  END LOOP;
END $$;
