-- ============================================================
-- 037_dbs_config_and_overtime.sql
-- Add DBS global configuration and overtime limit settings
-- to the app_settings key-value store.
-- ============================================================

INSERT INTO app_settings (key, value) VALUES
  ('shiftplan.dbs_enabled',               'true'),
  ('shiftplan.dbs_rhythm_weeks',          '2'),
  ('shiftplan.dbs_reference_date',        ''),
  ('shiftplan.dbs_weekdays',              '[1,2,3,4,5]'),
  ('shiftplan.dbs_shift_code',            'DBS'),
  ('shiftplan.dbs_required_staff',        '1'),
  ('shiftplan.dbs_default_monthly_target','4'),
  ('shiftplan.max_overtime_hours',        '0'),
  ('shiftplan.overtime_mode',             'show')
ON CONFLICT (key) DO NOTHING;
