-- =============================================
-- MIGRATION 032: TV assignment slide + rule defaults backfill
-- Ensures existing ODIN installations receive the
-- new assignment-slide config and the extended
-- runtime-rule defaults for CC mix and ticket caps.
-- =============================================

INSERT INTO tv_slide_config (slide_id, label, enabled, duration_ms, sort_order, only_if_data, updated_by)
VALUES ('assignment', 'ODIN Assignment Logic', true, 20000, 7, true, 'migration-032')
ON CONFLICT (slide_id) DO UPDATE
SET label = EXCLUDED.label,
    enabled = true,
    duration_ms = EXCLUDED.duration_ms,
    sort_order = EXCLUDED.sort_order,
    only_if_data = true,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

INSERT INTO assignment_rules (rule_key, category, label, description, config_json, sort_order, updated_by)
VALUES (
  'cross_connect_only',
  'role',
  'CrossConnect-Only Rolle',
  'CC-Rolle erhält primär CC-Tickets, mit optional konfigurierbaren Mischregeln für Trouble Tickets.',
  '{
    "allow": ["CrossConnect"],
    "allow_mixed_types": [],
    "allow_tt_when_insufficient_resources": true,
    "min_remaining_hours_for_tt": 24,
    "allow_same_system_only": false,
    "same_priority_only": false
  }'::jsonb,
  5,
  'migration-032'
)
ON CONFLICT (rule_key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    config_json = EXCLUDED.config_json || COALESCE(assignment_rules.config_json, '{}'::jsonb),
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

INSERT INTO assignment_rules (rule_key, category, label, description, config_json, sort_order, updated_by)
VALUES (
  'max_tickets_per_worker',
  'load',
  'Max Tickets pro Worker',
  'Globale und feingranulare Ticket-Limits pro Worker, Rolle und Tickettyp.',
  '{
    "max": 0,
    "note": "0 = kein Limit",
    "per_type": {},
    "per_role": {},
    "per_role_type": {}
  }'::jsonb,
  10,
  'migration-032'
)
ON CONFLICT (rule_key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    config_json = EXCLUDED.config_json || COALESCE(assignment_rules.config_json, '{}'::jsonb),
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();
