ALTER TABLE jarvis_notification_dismissals
  ADD COLUMN IF NOT EXISTS occurrence_key VARCHAR(32);

UPDATE jarvis_notification_dismissals d
   SET occurrence_key = CASE n.recurrence
     WHEN 'once' THEN 'once'
     WHEN 'daily' THEN 'daily:' || TO_CHAR(d.dismissed_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD')
     WHEN 'weekly' THEN 'weekly:' || TO_CHAR(d.dismissed_at AT TIME ZONE 'Europe/Berlin', 'IYYY-"W"IW')
     WHEN 'monthly' THEN 'monthly:' || TO_CHAR(d.dismissed_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM')
   END
  FROM jarvis_notifications n
 WHERE n.id = d.notification_id
   AND d.occurrence_key IS NULL;

ALTER TABLE jarvis_notification_dismissals
  ALTER COLUMN occurrence_key SET NOT NULL;

DELETE FROM jarvis_notification_dismissals older
 USING jarvis_notification_dismissals newer
 WHERE older.notification_id = newer.notification_id
   AND older.user_id = newer.user_id
   AND older.occurrence_key = newer.occurrence_key
   AND older.id < newer.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jarvis_notification_dismissals_occurrence
  ON jarvis_notification_dismissals(notification_id, user_id, occurrence_key);
