ALTER TABLE jarvis_notifications
  DROP CONSTRAINT IF EXISTS jarvis_notifications_recurrence_check;

ALTER TABLE jarvis_notifications
  ADD CONSTRAINT jarvis_notifications_recurrence_check
  CHECK (recurrence IN ('once', 'daily', 'weekly', 'monthly'));

CREATE TABLE IF NOT EXISTS jarvis_notification_recipients (
  notification_id INT NOT NULL REFERENCES jarvis_notifications(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_jarvis_notification_recipients_user
  ON jarvis_notification_recipients(user_id, notification_id);
