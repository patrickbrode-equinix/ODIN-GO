ALTER TABLE shift_rotation_rules
  ADD COLUMN IF NOT EXISTS late_before_night_required BOOLEAN NOT NULL DEFAULT FALSE;
