/* 057 - Assignment writeback pilot employee rollout guard */

INSERT INTO assignment_settings (key, value, description)
VALUES
  ('writeback.pilot.enabled', 'false', 'When true, writeback execution is limited to one configured pilot employee'),
  ('writeback.pilot.employeeSelector', '', 'Pilot employee selector: ODIN user id, name, email, Jarvis display name, initials, or owner code')
ON CONFLICT (key) DO NOTHING;
