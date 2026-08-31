ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS participants TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS jarvis_notification_preferences (
  user_id INT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
