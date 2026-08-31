-- ============================================================
-- 002_queue.sql
-- Queue tracking: queue_items, expired_tickets,
-- crawler_runs, crawler_run_deltas.
-- ============================================================

CREATE TABLE IF NOT EXISTS queue_items (
  id                     SERIAL PRIMARY KEY,
  external_id            TEXT NOT NULL,
  group_key              TEXT NOT NULL,
  queue_type             TEXT,
  so_number              TEXT,
  status                 TEXT,
  owner                  TEXT,
  severity               TEXT,
  commit_date            TIMESTAMPTZ,
  revised_commit_date    TIMESTAMPTZ,
  dispatch_date          TIMESTAMPTZ,
  sched_start            TIMESTAMPTZ,
  remaining_time_text    TEXT,
  remaining_hours        NUMERIC,
  subtype                TEXT,
  system_name            TEXT,
  account_name           TEXT,
  customer_trouble_type  TEXT,
  raw_json               JSONB,
  active                 BOOLEAN NOT NULL DEFAULT true,
  missing_count          INT NOT NULL DEFAULT 0,
  closed_at              TIMESTAMPTZ,
  inactive_reason        TEXT,
  is_final_closed        BOOLEAN NOT NULL DEFAULT false,
  first_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at           TIMESTAMPTZ,
  jarvis_seen_at         TIMESTAMPTZ,
  excel_seen_at          TIMESTAMPTZ,
  is_tfm                 BOOLEAN NOT NULL DEFAULT false,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT queue_items_queue_type_external_id_key UNIQUE (queue_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_group          ON queue_items(group_key);
CREATE INDEX IF NOT EXISTS idx_queue_commit         ON queue_items(commit_date);
CREATE INDEX IF NOT EXISTS idx_queue_revised        ON queue_items(revised_commit_date);
CREATE INDEX IF NOT EXISTS idx_queue_active_group   ON queue_items(active, group_key);
CREATE INDEX IF NOT EXISTS idx_queue_owner          ON queue_items(owner);
CREATE INDEX IF NOT EXISTS idx_queue_active_final   ON queue_items(active, is_final_closed);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_queue_items_updated_at') THEN
    CREATE TRIGGER trg_queue_items_updated_at
    BEFORE UPDATE ON queue_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- EXPIRED TICKETS ARCHIVE
CREATE TABLE IF NOT EXISTS expired_tickets (
  id                      SERIAL PRIMARY KEY,
  queue_type              TEXT NOT NULL,
  external_id             TEXT NOT NULL,
  group_name              TEXT,
  owner                   TEXT,
  status                  TEXT,
  commit_date             TIMESTAMPTZ,
  revised_commit_date     TIMESTAMPTZ,
  remaining_time_text     TEXT,
  first_seen_at           TIMESTAMPTZ,
  last_seen_at            TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_json                JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expired_tickets_queue_type_external_id_key UNIQUE (queue_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_expired_resolved ON expired_tickets(resolved_at);
CREATE INDEX IF NOT EXISTS idx_expired_group    ON expired_tickets(group_name);

-- CRAWLER RUN LOG
CREATE TABLE IF NOT EXISTS crawler_runs (
  id                   SERIAL PRIMARY KEY,
  snapshot_at          TIMESTAMPTZ NOT NULL,
  complete_types_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_active         INT NOT NULL DEFAULT 0,
  new_count            INT NOT NULL DEFAULT 0,
  gone_count           INT NOT NULL DEFAULT 0,
  success              BOOLEAN NOT NULL DEFAULT true,
  error_message        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crawler_run_deltas (
  id           SERIAL PRIMARY KEY,
  run_id       INT NOT NULL REFERENCES crawler_runs(id) ON DELETE CASCADE,
  delta_type   TEXT NOT NULL CHECK (delta_type IN ('NEW','GONE')),
  queue_type   TEXT,
  external_id  TEXT,
  group_name   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawler_deltas_run ON crawler_run_deltas(run_id);
