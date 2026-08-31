ALTER TABLE jarvis_notifications
  ADD COLUMN IF NOT EXISTS notification_kind VARCHAR(20) NOT NULL DEFAULT 'notification';

ALTER TABLE jarvis_notifications
  DROP CONSTRAINT IF EXISTS jarvis_notifications_notification_kind_check;

ALTER TABLE jarvis_notifications
  ADD CONSTRAINT jarvis_notifications_notification_kind_check
  CHECK (notification_kind IN ('notification', 'instruction'));

ALTER TABLE jarvis_notifications
  ADD COLUMN IF NOT EXISTS created_by_user_id INT;

CREATE INDEX IF NOT EXISTS idx_jarvis_notifications_creator
  ON jarvis_notifications(created_by_user_id, created_at DESC);
