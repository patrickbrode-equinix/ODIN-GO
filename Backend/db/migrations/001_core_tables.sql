-- ============================================================
-- 001_core_tables.sql
-- Core infrastructure: updated_at trigger function, groups,
-- users, user_settings tables.
-- ============================================================

-- Trigger function: set updated_at on UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- GROUPS
CREATE TABLE IF NOT EXISTS groups (
  key        VARCHAR(64) PRIMARY KEY,
  label      VARCHAR(120) NOT NULL,
  policy     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_groups_updated_at') THEN
    CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Seed default groups if empty
INSERT INTO groups (key, label, policy)
VALUES
  ('c-ops', 'C-OPS Team', '{"dashboard":"view","shiftplan":"view","handover":"view","tickets":"view","commit_dashboard":"none","dispatcher_console":"none","tv_dashboard":"view","settings":"view","user_management":"none"}'::jsonb),
  ('f-ops', 'F-OPS Team', '{"dashboard":"view","shiftplan":"view","handover":"view","tickets":"view","commit_dashboard":"none","dispatcher_console":"none","tv_dashboard":"view","settings":"view","user_management":"none"}'::jsonb),
  ('other', 'Other Team', '{"dashboard":"view","shiftplan":"view","handover":"view","tickets":"view","commit_dashboard":"none","dispatcher_console":"none","tv_dashboard":"view","settings":"view","user_management":"none"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  first_name      VARCHAR(80),
  last_name       VARCHAR(80),
  employee_id     TEXT,
  entra_object_id TEXT,
  upn             TEXT,
  username        VARCHAR(80),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  approved        BOOLEAN NOT NULL DEFAULT false,
  is_root         BOOLEAN NOT NULL DEFAULT false,
  user_group      VARCHAR(64) NOT NULL DEFAULT 'c-ops',
  department      VARCHAR(64) NOT NULL DEFAULT 'c-ops',
  ibx             VARCHAR(64) NOT NULL DEFAULT 'FR2',
  access_override JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
    CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- USER SETTINGS
CREATE TABLE IF NOT EXISTS user_settings (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);
