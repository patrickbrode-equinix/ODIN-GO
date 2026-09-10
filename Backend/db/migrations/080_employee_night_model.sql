-- Per-employee night planning model. Existing planning used seven-day night
-- blocks, therefore SEVEN_DAY is the backwards-compatible default.
ALTER TABLE employee_preferences
  ADD COLUMN IF NOT EXISTS night_model VARCHAR(16) NOT NULL DEFAULT 'SEVEN_DAY';

UPDATE employee_preferences
SET night_model = 'SEVEN_DAY'
WHERE night_model IS NULL OR night_model NOT IN ('SEVEN_DAY', 'SHORT');

ALTER TABLE employee_preferences
  DROP CONSTRAINT IF EXISTS employee_preferences_night_model_check;

ALTER TABLE employee_preferences
  ADD CONSTRAINT employee_preferences_night_model_check
  CHECK (night_model IN ('SEVEN_DAY', 'SHORT'));
