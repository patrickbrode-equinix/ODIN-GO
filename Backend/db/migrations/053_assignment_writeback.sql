/* ================================================ */
/* 053 – Assignment Writeback Layer                 */
/* Safe, auditable Jarvis ticket assignment writeback */
/* ================================================ */

/* ================================================ */
/* A. JARVIS EMPLOYEE MAPPING FIELDS                */
/* Adds Jarvis-specific identity fields to users.   */
/* ================================================ */

ALTER TABLE users ADD COLUMN IF NOT EXISTS jarvis_display_name        VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS jarvis_display_name_aliases JSONB     NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS jarvis_initials            VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS jarvis_owner_code          VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS queue_eligibility          JSONB     NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_sick                    BOOLEAN   NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assignment_eligible         BOOLEAN   NOT NULL DEFAULT true;

-- Unique constraint: two employees must not share the same Jarvis owner code.
-- Partial index: only enforced when non-null (gracefully handles unmapped users).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_jarvis_owner_code_unique
  ON users (jarvis_owner_code)
  WHERE jarvis_owner_code IS NOT NULL;

/* ================================================ */
/* B. ASSIGNMENT_ACTIONS                            */
/* One row per writeback decision created by the    */
/* ODIN assignment engine.                          */
/* ================================================ */

CREATE TABLE IF NOT EXISTS assignment_actions (
  id                                  SERIAL         PRIMARY KEY,
  ticket_id                           VARCHAR(120),
  activity_number                     VARCHAR(60)    NOT NULL,
  sales_order_number                  VARCHAR(60),
  queue_type                          VARCHAR(60),
  sub_type                            VARCHAR(120),
  system_name                         VARCHAR(120),
  current_jarvis_owner_code           VARCHAR(40),
  expected_previous_owner_code        VARCHAR(40),
  selected_employee_id                INT,
  selected_employee_name              VARCHAR(120),
  selected_employee_email             VARCHAR(120),
  selected_employee_jarvis_display_name VARCHAR(120),
  selected_employee_jarvis_owner_code VARCHAR(40),
  selected_employee_jarvis_initials   VARCHAR(10),
  action_type                         VARCHAR(20)    NOT NULL
    CHECK (action_type IN ('assign','unassign','reassign','no_op')),
  execution_mode                      VARCHAR(20)    NOT NULL
    CHECK (execution_mode IN ('shadow_only','manual_confirm','assisted_auto','full_auto')),
  decision_source                     VARCHAR(120),
  decision_trace_json                 JSONB,
  validation_status                   VARCHAR(30)    NOT NULL DEFAULT 'pending',
  validation_errors_json              JSONB,
  execution_status                    VARCHAR(40)    NOT NULL DEFAULT 'pending'
    CHECK (execution_status IN (
      'pending','shadow_validated','validation_failed',
      'waiting_for_manual_confirmation','approved_for_execution','executing',
      'already_correctly_assigned','assigned_successfully',
      'unassign_required','unassigning','unassigned_successfully',
      'reassign_required','reassigning','reassigned_successfully',
      'blocked_existing_owner','blocked_human_owner_conflict',
      'manual_review_required','failed_verification','failed','skipped','cancelled'
    )),
  external_write_status               VARCHAR(40),
  previous_external_assignee          VARCHAR(120),
  new_external_assignee               VARCHAR(120),
  hard_reassign_reason                VARCHAR(255),
  created_at                          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  validated_at                        TIMESTAMPTZ,
  approved_at                         TIMESTAMPTZ,
  approved_by                         VARCHAR(120),
  executed_at                         TIMESTAMPTZ,
  failed_at                           TIMESTAMPTZ,
  failure_reason                      TEXT,
  retry_count                         INT            NOT NULL DEFAULT 0,
  last_error                          TEXT,
  created_by_logic_run_id             INT,
  -- Optimistic concurrency lock: incremented on every status transition.
  lock_version                        INT            NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_aa_activity_number    ON assignment_actions (activity_number);
CREATE INDEX IF NOT EXISTS idx_aa_execution_status   ON assignment_actions (execution_status);
CREATE INDEX IF NOT EXISTS idx_aa_action_type        ON assignment_actions (action_type);
CREATE INDEX IF NOT EXISTS idx_aa_created_at         ON assignment_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aa_selected_employee  ON assignment_actions (selected_employee_id);

/* ================================================ */
/* C. ASSIGNMENT_AUDIT_LOGS                         */
/* Immutable audit trail for every writeback step.  */
/* ================================================ */

CREATE TABLE IF NOT EXISTS assignment_audit_logs (
  id                    SERIAL       PRIMARY KEY,
  assignment_action_id  INT          REFERENCES assignment_actions(id) ON DELETE CASCADE,
  ticket_id             VARCHAR(120),
  activity_number       VARCHAR(60),
  event_type            VARCHAR(80)  NOT NULL,
  message               TEXT,
  before_state_json     JSONB,
  after_state_json      JSONB,
  validation_json       JSONB,
  screenshot_path       VARCHAR(512),
  diagnostic_html_path  VARCHAR(512),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aal_action_id    ON assignment_audit_logs (assignment_action_id);
CREATE INDEX IF NOT EXISTS idx_aal_activity     ON assignment_audit_logs (activity_number);
CREATE INDEX IF NOT EXISTS idx_aal_event_type   ON assignment_audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_aal_created_at   ON assignment_audit_logs (created_at DESC);

/* ================================================ */
/* D. WRITEBACK SETTINGS (assignment_settings)      */
/* Feature flags for the writeback layer.           */
/* Default: completely off / shadow-only / safe.    */
/* ================================================ */

INSERT INTO assignment_settings (key, value, description) VALUES
  ('writeback.enabled',                          'false',       'Master switch: enables assignment writeback to Jarvis'),
  ('writeback.mode',                             'shadow_only', 'Execution mode: shadow_only | manual_confirm | assisted_auto | full_auto'),
  ('writeback.killSwitch',                       'false',       'Emergency kill switch: immediately stops all writeback execution'),
  ('writeback.allowOverwriteExistingAssignee',   'false',       'Allow overwriting an existing Jarvis assignee'),
  ('writeback.allowAutoUnassign',                'false',       'Allow automatic unassignment (requires hard reason)'),
  ('writeback.allowAutoReassign',                'false',       'Allow automatic reassignment (requires hard reason)'),
  ('writeback.maxExecutionRetries',              '2',           'Maximum number of writeback execution retries per action'),
  ('writeback.requireFreshCrawlerData',          'true',        'Block writeback if crawler snapshot is stale'),
  ('writeback.maxSnapshotAgeMinutes',            '5',           'Maximum crawler snapshot age in minutes before writeback is blocked'),
  ('writeback.queueEnabled.smartHands',          'false',       'Enable writeback for Smart Hands queue'),
  ('writeback.queueEnabled.crossConnect',        'false',       'Enable writeback for Cross Connect queue'),
  ('writeback.queueEnabled.trouble',             'false',       'Enable writeback for Trouble Ticket queue'),
  ('writeback.queueEnabled.deinstall',           'false',       'Enable writeback for Deinstall queue'),
  ('writeback.allowOtherTeamsAssignment',        'false',       'Allow assigning to Other Teams tab in Jarvis dialog'),
  ('writeback.requireManualApprovalForUnassign', 'true',        'Require human approval before unassigning a Jarvis ticket'),
  ('writeback.requireManualApprovalForReassign', 'true',        'Require human approval before reassigning a Jarvis ticket')
ON CONFLICT (key) DO NOTHING;
