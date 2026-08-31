-- ============================================================
-- 008_misc.sql
-- Activity log, kiosk messages, dashboard info,
-- feature toggles, dashboard info entries.
-- ============================================================

-- ACTIVITY LOG
CREATE TABLE IF NOT EXISTS activity_log (
  id              SERIAL PRIMARY KEY,
  ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id   INT,
  actor_name      VARCHAR(120),
  action_type     VARCHAR(64) NOT NULL,
  module          VARCHAR(64) NOT NULL,
  entity_type     VARCHAR(64),
  entity_id       VARCHAR(64),
  correlation_id  VARCHAR(64),
  payload         JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_activity_ts     ON activity_log(ts);
CREATE INDEX IF NOT EXISTS idx_activity_module ON activity_log(module);

-- KIOSK MESSAGES
CREATE TABLE IF NOT EXISTS kiosk_messages (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT,
  severity    VARCHAR(16) NOT NULL DEFAULT 'INFO',
  active      BOOLEAN NOT NULL DEFAULT true,
  start_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at      TIMESTAMPTZ,
  recurrence  VARCHAR(32) DEFAULT 'ONCE_PER_SHIFT',
  created_by  VARCHAR(120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_kiosk_messages_updated_at') THEN
    CREATE TRIGGER trg_kiosk_messages_updated_at
    BEFORE UPDATE ON kiosk_messages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kiosk_message_acks (
  id                   SERIAL PRIMARY KEY,
  message_id           INT NOT NULL REFERENCES kiosk_messages(id) ON DELETE CASCADE,
  user_id_or_name      VARCHAR(120) NOT NULL,
  shift_code           VARCHAR(16) NOT NULL,
  acknowledged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id_or_name, shift_code)
);

-- DASHBOARD INFO (legacy single-row)
CREATE TABLE IF NOT EXISTS dashboard_info (
  id          SERIAL PRIMARY KEY,
  content     TEXT,
  is_visible  BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  VARCHAR(120)
);

-- FEATURE TOGGLES
CREATE TABLE IF NOT EXISTS feature_toggles (
  key         VARCHAR(64) PRIMARY KEY,
  is_enabled  BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  VARCHAR(120)
);

-- DASHBOARD INFO ENTRIES (multi-entry)
CREATE TABLE IF NOT EXISTS dashboard_info_entries (
  id          SERIAL PRIMARY KEY,
  content     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  delete_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_info_entries_delete_at ON dashboard_info_entries(delete_at);
CREATE INDEX IF NOT EXISTS idx_dashboard_info_entries_type      ON dashboard_info_entries(type);
