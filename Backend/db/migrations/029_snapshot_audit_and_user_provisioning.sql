ALTER TABLE crawler_runs
  ADD COLUMN IF NOT EXISTS details_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE queue_items
  ADD COLUMN IF NOT EXISTS snapshot_removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snapshot_removed_run_id INT REFERENCES crawler_runs(id) ON DELETE SET NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provisioned_from_shiftplan BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provisioned_employee_name TEXT;

CREATE INDEX IF NOT EXISTS idx_queue_items_snapshot_removed_run ON queue_items(snapshot_removed_run_id);
CREATE INDEX IF NOT EXISTS idx_users_provisioned_shiftplan ON users(provisioned_from_shiftplan);