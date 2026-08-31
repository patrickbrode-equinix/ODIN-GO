-- ============================================================
-- 035: Shift Verification (Self-Check via Teams)
-- ============================================================
-- Tracks employee self-verification status per shift per day.
-- Employees are contacted via Teams after shift start and
-- confirm availability. Status influences ticket assignment.
-- ============================================================

-- Main verification records table
CREATE TABLE IF NOT EXISTS shift_verifications (
  id              SERIAL PRIMARY KEY,
  employee_name   VARCHAR(120)  NOT NULL,
  date            DATE          NOT NULL DEFAULT CURRENT_DATE,
  shift_code      VARCHAR(10)   NOT NULL,
  status          VARCHAR(30)   NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                      'pending',        -- Awaiting response
                      'verified',       -- Employee confirmed availability
                      'sick',           -- Employee reported sick
                      'wrong_shift',    -- Employee is on a different shift
                      'absent',         -- Marked absent (manual or automatic)
                      'no_response',    -- Timeout without response
                      'failed'          -- Delivery failure
                    )),
  message_sent_at   TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  response_raw      VARCHAR(80),
  delivery_error    TEXT,
  initiated_by      VARCHAR(60)   NOT NULL DEFAULT 'system',
  override_by       VARCHAR(120),
  override_reason   TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (employee_name, date, shift_code)
);

CREATE INDEX idx_sv_date_status ON shift_verifications (date, status);
CREATE INDEX idx_sv_employee    ON shift_verifications (employee_name);

-- Audit log for all verification interactions
CREATE TABLE IF NOT EXISTS shift_verification_audit (
  id                SERIAL PRIMARY KEY,
  verification_id   INTEGER REFERENCES shift_verifications(id) ON DELETE CASCADE,
  employee_name     VARCHAR(120)  NOT NULL,
  date              DATE          NOT NULL,
  shift_code        VARCHAR(10)   NOT NULL,
  event_type        VARCHAR(40)   NOT NULL,
  old_status        VARCHAR(30),
  new_status        VARCHAR(30),
  payload           JSONB,
  actor             VARCHAR(120)  NOT NULL DEFAULT 'system',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sva_verification ON shift_verification_audit (verification_id);
CREATE INDEX idx_sva_date         ON shift_verification_audit (date);

-- Configuration for the verification feature
-- Stored in the existing assignment_config key/value table
CREATE TABLE IF NOT EXISTS assignment_config (
  key         VARCHAR(64) PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  VARCHAR(120)
);

INSERT INTO assignment_config (key, value) VALUES
  ('engine_mode', '"shadow"'),
  ('stale_threshold_minutes', '10'),
  ('max_tickets_per_person_sh', '3'),
  ('similar_remaining_hours_threshold', '6'),
  ('enabled', 'false')
ON CONFLICT (key) DO NOTHING;

INSERT INTO assignment_config (key, value) VALUES
  ('verification.enabled',                '"false"'),
  ('verification.delayMinutes',           '5'),
  ('verification.timeoutMinutes',         '30'),
  ('verification.pendingBlocksAssignment','"true"'),
  ('verification.autoAbsentOnSick',       '"true"'),
  ('verification.autoAbsentOnNoResponse', '"false"')
ON CONFLICT (key) DO NOTHING;
