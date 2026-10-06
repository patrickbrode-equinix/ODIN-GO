-- Migration 099: Drop tables and settings of removed legacy features.
--
-- ODIN GO now consists of the Jarvis Chrome extension and the web workspace
-- (shift plan, handovers, polls, ...). The following features were removed
-- from the code base and no longer have any readers/writers:
--   * ODIN auto-assignment engine, queue/crawler ingest, commit dashboards,
--     ticket/shift "handover" (old), ticket handovers
--   * Teams messaging and Teams-bot shift verification
--   * Chain of Command (CoC)
--   * TV display / kiosk messages
--
-- Deliberately KEPT (still used by the shift planner / generator):
--   assignment_employee_exclusions, ticket_preferences, employee_contacts,
--   dashboard_info*, shift_handovers, team_handovers, shift_change_log,
--   events_images, feature_toggles, app_settings, settings_audit.
--
-- Idempotent: every statement uses IF EXISTS and is safe on a fresh database
-- (migrations 001-098 run first) and on an existing production database.
-- CASCADE only removes foreign-key constraints / triggers / sequences that
-- belong to the dropped tables; no kept table is dropped.

-- 1. Auto-assignment engine -------------------------------------------------
DROP TABLE IF EXISTS
  assignment_audit_logs,
  assignment_actions,
  assignment_analytics_events,
  assignment_ticket_decisions,
  assignment_overrides,
  assignment_rotation_state,
  assignment_runs,
  assignment_settings,
  assignment_exclusion_list,
  assignment_config,
  assignment_rules_history,
  assignment_rules,
  subtype_exclusions,
  fairness_settings
CASCADE;

-- 2. Queue / crawler / commit / old handover --------------------------------
DROP TABLE IF EXISTS
  crawler_run_deltas,
  crawler_runs,
  expired_tickets,
  queue_items,
  snapshots,
  commit_imports,
  commit_subtypes,
  commit_saved_filters,
  handover_files,
  handover,
  ticket_handovers
CASCADE;

-- 3. Teams messaging + Teams-bot shift verification -------------------------
DROP TABLE IF EXISTS
  shift_verification_audit,
  shift_verifications,
  teams_routing_rules,
  teams_event_config,
  teams_templates,
  teams_settings,
  teams_message_log
CASCADE;

-- 4. Chain of Command -------------------------------------------------------
DROP TABLE IF EXISTS
  coc_case_attachments,
  coc_case_events,
  coc_cases,
  coc_command_chain
CASCADE;

-- 5. TV display / kiosk -----------------------------------------------------
DROP TABLE IF EXISTS
  kiosk_message_acks,
  kiosk_messages,
  tv_slide_config
CASCADE;

-- 6. Obsolete settings rows (conservative: clearly prefixed/keyed only) -----
DO $$
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    DELETE FROM app_settings
    WHERE key LIKE 'teams.%'
       OR key LIKE 'assignment.%'
       OR key LIKE 'writeback.%'
       OR key LIKE 'tv.%';
  END IF;

  IF to_regclass('public.feature_toggles') IS NOT NULL THEN
    DELETE FROM feature_toggles
    WHERE key IN ('teams_communication', 'auto_assignment', 'assignment_explanation');
  END IF;
END $$;
