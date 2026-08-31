/* ================================================ */
/* Migration 023 — Engine Status & Failure Reasons  */
/* ================================================ */

-- Add failure reason fields to assignment_runs
ALTER TABLE assignment_runs
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS failure_step TEXT,
  ADD COLUMN IF NOT EXISTS error_category TEXT;

-- Seed engine status settings (if not already present)
INSERT INTO assignment_settings (key, value, description)
VALUES
  ('assignment.enabled', 'false', 'Whether the automatic assignment engine is enabled'),
  ('assignment.lastStartedAt', '', 'Timestamp when the engine was last started'),
  ('assignment.lastStartedBy', '', 'User who last started the engine'),
  ('assignment.lastStoppedAt', '', 'Timestamp when the engine was last stopped'),
  ('assignment.lastStoppedBy', '', 'User who last stopped the engine')
ON CONFLICT (key) DO NOTHING;
