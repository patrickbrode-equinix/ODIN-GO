-- 083: Make the Feedback workflow usable on installations that predate
-- individual feedback migrations.

CREATE TABLE IF NOT EXISTS feedback_entries (
  id SERIAL PRIMARY KEY,
  type VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  sender_name VARCHAR(120),
  sender_email VARCHAR(255),
  screenshot_name VARCHAR(255),
  screenshot_data BYTEA,
  screenshot_mime VARCHAR(64),
  email_sent BOOLEAN DEFAULT FALSE,
  email_error TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  admin_comment TEXT,
  status_updated_by VARCHAR(120),
  status_updated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  archived_by VARCHAR(120),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feedback_entries
  ADD COLUMN IF NOT EXISTS screenshot_data BYTEA,
  ADD COLUMN IF NOT EXISTS screenshot_mime VARCHAR(64),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS admin_comment TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_by VARCHAR(120),
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_feedback_entries_archived_at
  ON feedback_entries(archived_at);
