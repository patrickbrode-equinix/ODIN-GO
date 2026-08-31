-- ============================================================
-- 005_commit.sql
-- Commit dashboard: imports, subtypes, saved filters.
-- ============================================================

CREATE TABLE IF NOT EXISTS commit_imports (
  id          SERIAL PRIMARY KEY,
  row_count   INT NOT NULL DEFAULT 0,
  data        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commit_subtypes (
  key         TEXT PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'active',
  is_new      BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commit_saved_filters (
  id          SERIAL PRIMARY KEY,
  label       TEXT UNIQUE NOT NULL,
  rules_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_commit_saved_filters_updated_at') THEN
    CREATE TRIGGER trg_commit_saved_filters_updated_at
    BEFORE UPDATE ON commit_saved_filters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
