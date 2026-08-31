-- 060: Power Automate webhook settings for Teams channel notifications

INSERT INTO teams_settings (key, value, updated_by, updated_at)
VALUES
  ('teams.powerAutomateWebhookUrl', '', 'system', NOW()),
  ('teams.powerAutomateWebhookStatus', 'inactive', 'system', NOW()),
  ('teams.powerAutomateWebhookLastTestAt', '', 'system', NOW()),
  ('teams.powerAutomateWebhookLastError', '', 'system', NOW()),
  ('teams.webhookUrl', '', 'system', NOW()),
  ('teams.webhookEnabled', 'true', 'system', NOW()),
  ('teams.notificationsEnabled', 'false', 'system', NOW()),
  ('teams.sendOnlyForLiveAssignments', 'true', 'system', NOW()),
  ('teams.assignmentNotificationsEnabled', 'false', 'system', NOW()),
  ('teams.assignmentNotificationsLiveOnly', 'true', 'system', NOW())
ON CONFLICT (key) DO NOTHING;
