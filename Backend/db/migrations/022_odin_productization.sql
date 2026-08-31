-- =============================================
-- MIGRATION 022: ODIN Produktisierung
-- Teams Communication Center, TV Config,
-- Assignment Rules, Feedback Fallback, Audit
-- =============================================

-- 1. Feedback-Fallback-Speicher
CREATE TABLE IF NOT EXISTS feedback_entries (
  id              SERIAL PRIMARY KEY,
  type            VARCHAR(32) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT NOT NULL,
  sender_name     VARCHAR(120),
  sender_email    VARCHAR(255),
  screenshot_name VARCHAR(255),
  email_sent      BOOLEAN DEFAULT FALSE,
  email_error     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Teams Event Config
CREATE TABLE IF NOT EXISTS teams_event_config (
  id              SERIAL PRIMARY KEY,
  event_key       VARCHAR(64) UNIQUE NOT NULL,
  label           VARCHAR(128) NOT NULL,
  enabled         BOOLEAN DEFAULT TRUE,
  priority        INT DEFAULT 5,
  send_mode       VARCHAR(16) DEFAULT 'immediate',
  respect_quiet_hours BOOLEAN DEFAULT TRUE,
  cooldown_minutes INT DEFAULT 0,
  deduplicate     BOOLEAN DEFAULT TRUE,
  escalation      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Teams Routing Rules
CREATE TABLE IF NOT EXISTS teams_routing_rules (
  id              SERIAL PRIMARY KEY,
  event_key       VARCHAR(64) NOT NULL REFERENCES teams_event_config(event_key) ON DELETE CASCADE,
  target_type     VARCHAR(32) NOT NULL,
  target_value    VARCHAR(128) NOT NULL,
  enabled         BOOLEAN DEFAULT TRUE,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Teams Message Templates
CREATE TABLE IF NOT EXISTS teams_templates (
  id              SERIAL PRIMARY KEY,
  template_key    VARCHAR(64) UNIQUE NOT NULL,
  title           VARCHAR(255) NOT NULL,
  body_text       TEXT NOT NULL,
  compact_body    TEXT,
  include_deep_link       BOOLEAN DEFAULT TRUE,
  include_ticket_details  BOOLEAN DEFAULT TRUE,
  include_remaining_time  BOOLEAN DEFAULT FALSE,
  include_priority_badge  BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Teams Settings
CREATE TABLE IF NOT EXISTS teams_settings (
  key             VARCHAR(64) PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_by      VARCHAR(120),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Assignment Logic Rules (konfigurierbar)
CREATE TABLE IF NOT EXISTS assignment_rules (
  id              SERIAL PRIMARY KEY,
  rule_key        VARCHAR(64) UNIQUE NOT NULL,
  category        VARCHAR(32) NOT NULL,
  label           VARCHAR(128) NOT NULL,
  description     TEXT,
  config_json     JSONB NOT NULL DEFAULT '{}',
  enabled         BOOLEAN DEFAULT TRUE,
  sort_order      INT DEFAULT 0,
  version         INT DEFAULT 1,
  updated_by      VARCHAR(120),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Assignment Rules History
CREATE TABLE IF NOT EXISTS assignment_rules_history (
  id              SERIAL PRIMARY KEY,
  rule_id         INT NOT NULL REFERENCES assignment_rules(id) ON DELETE CASCADE,
  rule_key        VARCHAR(64) NOT NULL,
  config_json     JSONB NOT NULL,
  version         INT NOT NULL,
  changed_by      VARCHAR(120),
  change_note     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TV Slide Config
CREATE TABLE IF NOT EXISTS tv_slide_config (
  id              SERIAL PRIMARY KEY,
  slide_id        VARCHAR(32) UNIQUE NOT NULL,
  label           VARCHAR(128) NOT NULL,
  enabled         BOOLEAN DEFAULT TRUE,
  duration_ms     INT NOT NULL DEFAULT 10000,
  sort_order      INT DEFAULT 0,
  only_if_data    BOOLEAN DEFAULT FALSE,
  updated_by      VARCHAR(120),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Settings Audit Log
CREATE TABLE IF NOT EXISTS settings_audit (
  id              SERIAL PRIMARY KEY,
  domain          VARCHAR(64) NOT NULL,
  setting_key     VARCHAR(128) NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  changed_by      VARCHAR(120) NOT NULL,
  change_note     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settings_audit_domain ON settings_audit(domain);
CREATE INDEX IF NOT EXISTS idx_settings_audit_ts ON settings_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_settings_audit_key ON settings_audit(setting_key);

-- =============================================
-- SEED DATA
-- =============================================

-- TV Slide Config
INSERT INTO tv_slide_config (slide_id, label, enabled, duration_ms, sort_order, only_if_data) VALUES
  ('shifts',     'Schichten Heute',              true, 10000, 1, false),
  ('info',       'Informationen & Anweisungen',  true, 10000, 2, true),
  ('72h',        'Nächste 72 Stunden',           true, 20000, 3, false),
  ('handover',   'Handover',                     true, 20000, 4, true),
  ('projects',   'Projekte',                     true, 10000, 5, true),
  ('events',     'Events',                       true, 10000, 6, true),
  ('assignment', 'ODIN Assignment Logic',        true, 20000, 7, false)
ON CONFLICT (slide_id) DO NOTHING;

-- Teams Event Config
INSERT INTO teams_event_config (event_key, label, enabled, priority, send_mode) VALUES
  ('ticket_assigned',     'Ticket automatisch zugewiesen',    true,  1, 'immediate'),
  ('tt_high',             'Trouble Ticket High erkannt',      true,  1, 'immediate'),
  ('tt_medium',           'Trouble Ticket Medium erkannt',    true,  2, 'immediate'),
  ('commit_risk',         'Commit bald fällig',               true,  2, 'immediate'),
  ('commit_overdue',      'Commit überschritten',             true,  1, 'immediate'),
  ('crawler_stale',       'Keine aktuellen Crawler-Daten',    true,  1, 'immediate'),
  ('understaffing',       'Unterbesetzung in Schicht',        true,  1, 'immediate'),
  ('role_problem',        'Rollenproblem in Schicht',         false, 3, 'immediate'),
  ('handover_reminder',   'Handover Reminder',                false, 3, 'immediate'),
  ('dispatcher_reminder', 'Dispatcher Reminder',              false, 3, 'immediate'),
  ('daily_summary',       'Daily Summary',                    false, 5, 'digest'),
  ('shift_summary',       'Shift Summary',                    false, 5, 'digest'),
  ('large_order',         'Large Order Hinweis',              false, 2, 'immediate'),
  ('system_alarm',        'Systemkritischer Alarm',           true,  1, 'immediate')
ON CONFLICT (event_key) DO NOTHING;

-- Teams Templates
INSERT INTO teams_templates (template_key, title, body_text) VALUES
  ('ticket_assigned',   'Ticket zugewiesen: {{ticketId}}',         'Hallo {{employeeName}}, Ihnen wurde das Ticket **{{ticketId}}** ({{activity}}) auf System **{{systemName}}** zugewiesen. Restzeit: {{restTime}}.'),
  ('tt_high_alert',     'TT High Alert: {{ticketId}}',            'Trouble Ticket mit hoher Priorität: **{{ticketId}}** auf **{{systemName}}**. Typ: {{ticketType}}, Priorität: {{priority}}.'),
  ('tt_medium_alert',   'TT Medium: {{ticketId}}',                'Trouble Ticket Medium: **{{ticketId}}** auf **{{systemName}}**. Restzeit: {{restTime}}.'),
  ('commit_risk',       'Commit Risk: {{ticketId}}',              'Commit für **{{ticketId}}** droht in {{restTime}} auszulaufen. System: **{{systemName}}**.'),
  ('commit_overdue',    'Commit überschritten: {{ticketId}}',     'Commit für **{{ticketId}}** ist überschritten! System: **{{systemName}}**.'),
  ('understaffing',     'Unterbesetzung: {{shift}}',               'Schicht **{{shift}}** ist unterbesetzt. {{reason}}.'),
  ('crawler_stale',     'Crawler-Daten veraltet',                  'Die Crawler-Daten sind seit mehr als {{threshold}} Minuten nicht aktualisiert worden.'),
  ('daily_summary',     'ODIN Daily Summary',                      'Tagesübersicht: {{totalTickets}} aktive Tickets, {{assignedCount}} zugewiesen, {{openCount}} offen.'),
  ('large_order',       'Large Order: {{systemName}}',             'Large Order erkannt auf **{{systemName}}**. Account: {{accountName}}.'),
  ('system_alarm',      'Systemalarm',                             '{{reason}}')
ON CONFLICT (template_key) DO NOTHING;

-- Teams Settings
INSERT INTO teams_settings (key, value, updated_by) VALUES
  ('quiet_hours_start', '22:00', 'migration'),
  ('quiet_hours_end', '07:00', 'migration'),
  ('quiet_hours_critical_only', 'true', 'migration'),
  ('daily_max_messages', '200', 'migration'),
  ('digest_interval_minutes', '60', 'migration'),
  ('cooldown_default_minutes', '5', 'migration'),
  ('escalation_delay_minutes', '15', 'migration'),
  ('fallback_recipient', 'dispatcher', 'migration'),
  ('deduplicate_window_minutes', '30', 'migration')
ON CONFLICT (key) DO NOTHING;

-- Assignment Rules
INSERT INTO assignment_rules (rule_key, category, label, description, config_json, sort_order) VALUES
  ('priority_tiers', 'priority', 'Priority-Reihenfolge', 'Reihenfolge der Ticket-Prioritäten',
   '{"tiers": [{"tier": 1, "label": "TT High/Critical", "types": ["TroubleTicket"], "priorities": ["high","critical"]},
               {"tier": 2, "label": "TT Medium", "types": ["TroubleTicket"], "priorities": ["medium"]},
               {"tier": 3, "label": "KPI Queues (SH/CC)", "types": ["SmartHands","CrossConnect"], "sort_by": "remaining_time"},
               {"tier": 4, "label": "Scheduled", "types": ["Scheduled"]},
               {"tier": 5, "label": "TT Low", "types": ["TroubleTicket"], "priorities": ["low"]},
               {"tier": 6, "label": "Other", "types": ["Other"]}]}', 1),
  ('excluded_roles', 'role', 'Ausgeschlossene Rollen', 'Rollen die nie automatisch Tickets erhalten',
   '{"roles": ["large_order", "project", "leads"]}', 2),
  ('dispatcher_rule', 'role', 'Dispatcher-Verhalten', 'Dispatcher erhalten nur OtherTeams Handovers',
   '{"only_other_teams_handovers": true}', 3),
  ('deutsche_boerse', 'role', 'Deutsche Börse Einschränkung', 'DB-Mitarbeiter Ticketbeschränkungen',
   '{"allow_tt": true, "allow_cc_if_remaining_gt_24h": true, "deny": ["SmartHands","Scheduled","Other"]}', 4),
  ('cross_connect_only', 'role', 'CrossConnect-Only Rolle', 'CC-Rolle erhält nur CC-Tickets',
   '{"allow": ["CrossConnect"]}', 5),
  ('max_sh_per_system', 'load', 'Max SH pro System', 'Maximale SmartHands-Tickets pro Worker pro System',
   '{"max": 3}', 6),
  ('similar_time_threshold', 'load', 'Ähnliche Restzeit Schwelle', 'CC System-Grouping nur wenn Restzeiten ähnlich',
   '{"threshold_hours": 6}', 7),
  ('load_balancing', 'load', 'Lastverteilung', 'Worker mit wenigsten Tickets bevorzugt',
   '{"mode": "least_workload"}', 8),
  ('expedite_priority', 'priority', 'Expedite bevorzugen', 'Expedite-Tickets vor normalen gleicher Priorität',
   '{"enabled": false}', 9),
  ('max_tickets_per_worker', 'load', 'Max Tickets pro Worker', 'Maximale Gesamtanzahl Tickets pro Worker',
   '{"max": 0, "note": "0 = kein Limit"}', 10)
ON CONFLICT (rule_key) DO NOTHING;

-- Feedback Settings
INSERT INTO app_settings (key, value, updated_by) VALUES
  ('feedback.enabled', 'true', 'migration'),
  ('feedback.recipients', 'patrick.brode@eu.equinix.com,marco.dessi@eu.equinix.com', 'migration'),
  ('feedback.cc', '', 'migration'),
  ('feedback.subject_prefix', '[ODIN Feedback]', 'migration'),
  ('feedback.allow_attachments', 'true', 'migration'),
  ('feedback.allow_screenshots', 'true', 'migration'),
  ('feedback.max_size_mb', '10', 'migration'),
  ('feedback.save_to_db_on_failure', 'true', 'migration')
ON CONFLICT (key) DO NOTHING;

-- TV Global Settings
INSERT INTO app_settings (key, value, updated_by) VALUES
  ('tv.default_duration_ms', '10000', 'migration'),
  ('tv.font_scale', '1.0', 'migration'),
  ('tv.compact_cards', 'false', 'migration'),
  ('tv.auto_scroll', 'true', 'migration'),
  ('tv.animations', 'normal', 'migration'),
  ('tv.commit_window_hours', '72', 'migration'),
  ('tv.show_stale_tickets', 'false', 'migration'),
  ('tv.crawler_stale_threshold_minutes', '10', 'migration')
ON CONFLICT (key) DO NOTHING;

-- Global Thresholds
INSERT INTO app_settings (key, value, updated_by) VALUES
  ('threshold.crawler_stale_minutes', '10', 'migration'),
  ('threshold.commit_risk_hours', '4', 'migration'),
  ('threshold.escalation_minutes', '30', 'migration'),
  ('threshold.understaffing_missing', '2', 'migration')
ON CONFLICT (key) DO NOTHING;

-- Feature Toggles
INSERT INTO feature_toggles (key, is_enabled) VALUES
  ('teams_communication', true),
  ('auto_assignment', false),
  ('assignment_explanation', true),
  ('experimental_features', false)
ON CONFLICT (key) DO NOTHING;

-- RBAC: Add new page keys to all group policies
DO $$
DECLARE
  r RECORD;
  p JSONB;
BEGIN
  FOR r IN SELECT key, policy FROM groups LOOP
    p := COALESCE(r.policy, '{}'::jsonb);
    IF NOT (p ? 'teams_center') THEN
      p := p || '{"teams_center": "none"}'::jsonb;
    END IF;
    IF NOT (p ? 'admin_settings') THEN
      p := p || '{"admin_settings": "none"}'::jsonb;
    END IF;
    UPDATE groups SET policy = p WHERE key = r.key;
  END LOOP;
END $$;
