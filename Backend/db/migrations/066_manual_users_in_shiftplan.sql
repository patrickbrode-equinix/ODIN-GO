ALTER TABLE users
  ADD COLUMN IF NOT EXISTS shiftplan_manual BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_shiftplan_manual
  ON users(shiftplan_manual)
  WHERE shiftplan_manual = TRUE;
