-- ============================================================
-- 010_user_settings_column_schema.sql
-- 
-- Migrates user_settings from key/value store to column-based schema
-- that matches backend/db/userSettings.js expectations.
--
-- Also adds user_shiftplan_preferences table for shiftplan UI settings.
-- ============================================================

-- Drop old key/value user_settings table (no data to preserve)
DROP TABLE IF EXISTS user_settings;

-- Recreate as column-based schema
CREATE TABLE IF NOT EXISTS user_settings (
  user_id               INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language              TEXT NOT NULL DEFAULT 'de',
  theme                 TEXT NOT NULL DEFAULT 'dark',
  notify_email          BOOLEAN NOT NULL DEFAULT true,
  notify_browser        BOOLEAN NOT NULL DEFAULT false,
  notify_shift_reminder BOOLEAN NOT NULL DEFAULT true,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id)
);

-- Trigger: update updated_at on change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_user_settings_updated_at'
  ) THEN
    CREATE TRIGGER trg_user_settings_updated_at
      BEFORE UPDATE ON user_settings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Shiftplan preferences (referenced in userSettings.js)
CREATE TABLE IF NOT EXISTS user_shiftplan_preferences (
  user_id     INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_user_shiftplan_prefs_updated_at'
  ) THEN
    CREATE TRIGGER trg_user_shiftplan_prefs_updated_at
      BEFORE UPDATE ON user_shiftplan_preferences
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
