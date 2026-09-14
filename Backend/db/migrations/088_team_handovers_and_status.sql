ALTER TABLE shift_handovers
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'open';

ALTER TABLE shift_handovers
  DROP CONSTRAINT IF EXISTS shift_handovers_status_check;

ALTER TABLE shift_handovers
  ADD CONSTRAINT shift_handovers_status_check CHECK (status IN ('open', 'closed'));

CREATE TABLE IF NOT EXISTS team_handovers (
  id BIGSERIAL PRIMARY KEY,
  team VARCHAR(16) NOT NULL CHECK (team IN ('frost', 'tfm', 'other')),
  ticket_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  notes TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_handovers_team_status_created
  ON team_handovers (team, status, created_at DESC);
