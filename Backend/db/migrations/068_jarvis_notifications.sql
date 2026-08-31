CREATE TABLE IF NOT EXISTS jarvis_notifications (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  recurrence VARCHAR(16) NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once', 'daily', 'weekly')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at TIMESTAMPTZ,
  created_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jarvis_notification_dismissals (
  id SERIAL PRIMARY KEY,
  notification_id INT NOT NULL REFERENCES jarvis_notifications(id) ON DELETE CASCADE,
  user_id INT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jarvis_notifications_active ON jarvis_notifications(active, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_jarvis_notification_dismissals_lookup ON jarvis_notification_dismissals(notification_id, user_id, dismissed_at DESC);
