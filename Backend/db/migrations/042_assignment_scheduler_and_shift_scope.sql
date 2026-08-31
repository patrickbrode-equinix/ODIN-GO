-- =============================================
-- MIGRATION 042: Assignment scheduler + shift scope
-- Seeds defaults for automatic scheduler behavior
-- and strict current-shift assignment.
-- =============================================

INSERT INTO assignment_settings (key, value, description)
VALUES
  ('assignment.currentShiftOnly', 'true', 'Restrict assignments to the currently active shift instance only')
ON CONFLICT (key) DO NOTHING;