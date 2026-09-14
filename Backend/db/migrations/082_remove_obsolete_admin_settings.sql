-- 082: Remove configuration switches that are no longer implemented.
-- DBS is intentionally a one-person rotating weekly duty.

DELETE FROM app_settings
WHERE key IN (
  'shiftplan.issue_auto_refresh',
  'shiftplan.illness_auto_swap_enabled',
  'shiftplan.illness_min_source_buffer',
  'shiftplan.illness_min_rest_hours',
  'shiftplan.illness_require_skill_match',
  'shiftplan.illness_protect_worklife_balance',
  'shiftplan.skills_enabled',
  'shiftplan.dbs_rhythm_weeks',
  'shiftplan.dbs_reference_date',
  'shiftplan.dbs_default_monthly_target'
);

INSERT INTO app_settings (key, value)
VALUES ('shiftplan.dbs_required_staff', '1')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
