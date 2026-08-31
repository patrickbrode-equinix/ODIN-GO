/* ================================================ */
/* 017 – ODIN Assignment Engine (Phase 1)           */
/* Tables: runs, decisions, overrides, rotation,    */
/*         settings                                 */
/* Columns: users.auto_assignable, etc.             */
/* ================================================ */

-- Add assignment-relevant columns to users (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_assignable BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS on_break BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS absent BOOLEAN NOT NULL DEFAULT false;

-- 1. assignment_runs – one row per engine execution
CREATE TABLE IF NOT EXISTS assignment_runs (
  id              SERIAL PRIMARY KEY,
  mode            VARCHAR(20) NOT NULL DEFAULT 'shadow',   -- shadow | live | dry-run
  status          VARCHAR(20) NOT NULL DEFAULT 'running',  -- running | completed | failed | cancelled
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  total_tickets   INT NOT NULL DEFAULT 0,
  relevant        INT NOT NULL DEFAULT 0,
  assigned        INT NOT NULL DEFAULT 0,
  manual_review   INT NOT NULL DEFAULT 0,
  no_candidate    INT NOT NULL DEFAULT 0,
  not_relevant    INT NOT NULL DEFAULT 0,
  blocked         INT NOT NULL DEFAULT 0,
  errors          INT NOT NULL DEFAULT 0,
  triggered_by    VARCHAR(120),                            -- user email or 'system'
  summary         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_runs_started ON assignment_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_runs_mode    ON assignment_runs(mode);

-- 2. assignment_ticket_decisions – one row per ticket per run
CREATE TABLE IF NOT EXISTS assignment_ticket_decisions (
  id                  SERIAL PRIMARY KEY,
  run_id              INT NOT NULL REFERENCES assignment_runs(id) ON DELETE CASCADE,
  ticket_id           VARCHAR(120) NOT NULL,
  external_id         VARCHAR(255),
  ticket_type         VARCHAR(40),
  ticket_status       VARCHAR(40),
  ticket_priority     VARCHAR(20),
  ticket_site         VARCHAR(120),
  result              VARCHAR(30) NOT NULL,                -- assigned | manual_review | no_candidate | not_relevant | blocked | error
  assigned_worker_id  INT,
  assigned_worker_name VARCHAR(120),
  selection_reason    TEXT,
  short_reason        TEXT,
  rule_path           JSONB,                               -- ordered list of rules checked
  initial_candidates  JSONB,                               -- [{id,name}]
  excluded_candidates JSONB,                               -- [{id,name,reason}]
  remaining_candidates JSONB,                              -- [{id,name}]
  normalization_warnings JSONB,
  normalized_ticket   JSONB,                               -- full NormalizedTicket snapshot
  raw_ticket          JSONB,                               -- original raw data
  error_message       TEXT,
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atd_run_id      ON assignment_ticket_decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_atd_ticket_id   ON assignment_ticket_decisions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_atd_result      ON assignment_ticket_decisions(result);
CREATE INDEX IF NOT EXISTS idx_atd_decided_at  ON assignment_ticket_decisions(decided_at DESC);

-- 3. assignment_overrides – manual interventions
CREATE TABLE IF NOT EXISTS assignment_overrides (
  id              SERIAL PRIMARY KEY,
  ticket_id       VARCHAR(120) NOT NULL,
  override_type   VARCHAR(40) NOT NULL,                    -- force_assign | force_block | force_manual
  target_worker_id INT,
  reason          TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      VARCHAR(120),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at  TIMESTAMPTZ,
  deactivated_by  VARCHAR(120)
);

CREATE INDEX IF NOT EXISTS idx_ao_ticket_id ON assignment_overrides(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ao_active    ON assignment_overrides(active);

-- 4. assignment_rotation_state – round-robin / tie-break state
CREATE TABLE IF NOT EXISTS assignment_rotation_state (
  id              SERIAL PRIMARY KEY,
  site            VARCHAR(120) NOT NULL DEFAULT '_global',
  last_assigned_worker_id INT,
  last_assigned_at TIMESTAMPTZ,
  counter         INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ars_site ON assignment_rotation_state(site);

-- 5. assignment_settings – engine configuration key/value
CREATE TABLE IF NOT EXISTS assignment_settings (
  key             VARCHAR(120) PRIMARY KEY,
  value           TEXT NOT NULL,
  description     TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      VARCHAR(120)
);

-- Seed default settings (Phase 1)
INSERT INTO assignment_settings (key, value, description) VALUES
  ('assignment.mode',                      'shadow',     'Engine mode: shadow | live | dry-run'),
  ('assignment.siteStrictness',            'true',       'Enforce site matching for worker selection'),
  ('assignment.responsibilityStrictness',  'false',      'Enforce responsibility area matching'),
  ('assignment.enableRotationTieBreaker',  'true',       'Use round-robin rotation for tie-breaking'),
  ('assignment.fallbackTieBreaker',        'stable-id',  'Fallback tie-breaker: stable-id | random'),
  ('assignment.planningWindowHours',       '72',         'Planning window in hours from now'),
  ('assignment.maxTicketsPerRun',          '500',        'Maximum tickets processed per engine run'),
  ('assignment.stopOnCriticalError',       'false',      'Stop run on first critical error'),
  ('assignment.supportedTicketTypes',      'TroubleTicket,SmartHands,CrossConnect,Other', 'Comma-separated supported ticket types')
ON CONFLICT (key) DO NOTHING;

-- Add odin_logic page key to existing group policies (grants "view" by default)
UPDATE groups
SET policy = policy || '{"odin_logic":"view"}'::jsonb
WHERE NOT (policy ? 'odin_logic');
