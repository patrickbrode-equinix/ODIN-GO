ALTER TABLE shift_rotation_rules
  ADD COLUMN IF NOT EXISTS free_days_after_night INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS free_days_after_weekend INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS night_next_workday SMALLINT NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS night_next_shift_code VARCHAR(20);

ALTER TABLE shift_rotation_rules
  DROP CONSTRAINT IF EXISTS shift_rotation_rules_night_next_workday_check;

ALTER TABLE shift_rotation_rules
  ADD CONSTRAINT shift_rotation_rules_night_next_workday_check
  CHECK (night_next_workday BETWEEN 0 AND 6);

UPDATE shift_rotation_rules
SET free_days_after_weekend = 2
WHERE id = 1 AND free_days_after_weekend = 1;

INSERT INTO app_settings (key, value)
VALUES
  ('shiftplan.dbs_weekdays', '[1,2,3,4,5,6,0]'),
  ('shiftplan.dbs_free_days_after_block', '2')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();
