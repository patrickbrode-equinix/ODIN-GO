ALTER TABLE shift_rotation_rules
  ADD COLUMN IF NOT EXISTS night_planning_mode VARCHAR(24) NOT NULL DEFAULT 'MIXED';

UPDATE shift_rotation_rules
SET night_planning_mode = CASE
  WHEN short_night_mode_enabled = TRUE THEN 'SHORT_ONLY'
  ELSE 'MIXED'
END;

ALTER TABLE shift_rotation_rules
  DROP CONSTRAINT IF EXISTS shift_rotation_rules_night_planning_mode_check;

ALTER TABLE shift_rotation_rules
  ADD CONSTRAINT shift_rotation_rules_night_planning_mode_check
  CHECK (night_planning_mode IN ('SEVEN_DAY_ONLY', 'SHORT_ONLY', 'MIXED'));
