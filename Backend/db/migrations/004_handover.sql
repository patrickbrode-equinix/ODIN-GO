-- ============================================================
-- 004_handover.sql
-- Handover records and file attachments.
-- ============================================================

CREATE TABLE IF NOT EXISTS handover (
  id              SERIAL PRIMARY KEY,
  ticketnumber    TEXT,
  customername    TEXT,
  priority        TEXT,
  area            TEXT,
  description     TEXT,
  commitdate      TEXT,
  committime      TEXT,
  status          TEXT,
  createdby       TEXT,
  takenby         TEXT,
  type            TEXT NOT NULL DEFAULT 'Workload',
  ticket_type     TEXT,
  activity        TEXT,
  system_name     TEXT,
  remaining_time  TEXT,
  start_datetime  TIMESTAMPTZ,
  target_team     TEXT,
  assignee_name   TEXT,
  due_datetime    TIMESTAMPTZ,
  recurrence      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handover_ticket  ON handover(ticketnumber);
CREATE INDEX IF NOT EXISTS idx_handover_created ON handover(created_at);
CREATE INDEX IF NOT EXISTS idx_handover_type    ON handover(type);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_handover_updated_at') THEN
    CREATE TRIGGER trg_handover_updated_at
    BEFORE UPDATE ON handover
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS handover_files (
  id           SERIAL PRIMARY KEY,
  handover_id  INT NOT NULL REFERENCES handover(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TICKET HANDOVERS (from Tickets context menu)
CREATE TABLE IF NOT EXISTS ticket_handovers (
  id          SERIAL PRIMARY KEY,
  ticket_id   TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('Workload','Terminiert','Other Teams')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT,
  status      TEXT NOT NULL DEFAULT 'open'
);
