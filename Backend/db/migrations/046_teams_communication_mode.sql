-- 046: Add communication mode and webhook settings for Teams
-- Supports: bot-based (future), webhook/power-automate (current), disabled
INSERT INTO teams_settings (key, value, updated_by, updated_at)
VALUES
  ('teams.communicationMode', 'webhook', 'system', NOW()),
  ('teams.webhookUrl', '', 'system', NOW()),
  ('teams.webhookEnabled', 'true', 'system', NOW()),
  ('teams.botEnabled', 'false', 'system', NOW()),
  ('teams.botStatusNote', 'Azure Admin Consent pending – bot deactivated', 'system', NOW())
ON CONFLICT (key) DO NOTHING;
