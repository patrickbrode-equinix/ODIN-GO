CREATE TABLE IF NOT EXISTS shift_handovers (
  id                  BIGSERIAL PRIMARY KEY,
  handover_at         TIMESTAMPTZ NOT NULL,
  handover_direction  TEXT NOT NULL CHECK (handover_direction IN ('early_to_late', 'late_to_night', 'night_to_early')),
  category            TEXT NOT NULL CHECK (category IN ('general_information', 'incidents', 'cross_connect', 'trouble_ticket', 'smart_hand')),
  ticket_number       TEXT,
  customer_name       TEXT,
  notes               TEXT NOT NULL,
  created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_name     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_handovers_handover_at
  ON shift_handovers (handover_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_shift_handovers_category
  ON shift_handovers (category, handover_at DESC);
