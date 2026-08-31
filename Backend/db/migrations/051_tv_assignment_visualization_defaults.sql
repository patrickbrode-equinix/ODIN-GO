-- Seed TV-only assignment visualization defaults.

INSERT INTO app_settings (key, value, updated_by, updated_at)
VALUES
  ('tv.assignment_visualization_mode', 'enterprise', 'migration', NOW()),
  ('tv.assignment_animation_speed', 'normal', 'migration', NOW()),
  ('tv.assignment_celebration_intensity', 'medium', 'migration', NOW()),
  ('tv.assignment_sound_enabled', 'false', 'migration', NOW()),
  ('tv.assignment_auto_fallback', 'true', 'migration', NOW()),
  ('tv.assignment_confetti_enabled', 'true', 'migration', NOW()),
  ('tv.assignment_applause_enabled', 'true', 'migration', NOW()),
  ('tv.assignment_suspense_pause_enabled', 'true', 'migration', NOW()),
  ('tv.assignment_display_reasoning', 'true', 'migration', NOW())
ON CONFLICT (key) DO NOTHING;