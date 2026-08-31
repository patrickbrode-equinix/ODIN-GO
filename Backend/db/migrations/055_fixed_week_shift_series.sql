-- Fixed weekly series semantics for weekend-covering shift models.

UPDATE shift_definitions
SET series_days = 6,
    applicable_days = '[1,2,3,4,5,6]'::jsonb,
    updated_at = NOW()
WHERE UPPER(code) = 'E1SA';

UPDATE shift_definitions
SET series_days = 7,
    applicable_days = '[1,2,3,4,5,6,0]'::jsonb,
    updated_at = NOW()
WHERE UPPER(code) IN ('E1WE', 'L1WE');

ALTER TABLE shift_rotation_rules
  ADD COLUMN IF NOT EXISTS stability_priority INT NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS max_shift_type_changes_per_month INT NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS min_free_weekends_per_month INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS min_recovery_days_after_shift_change INT NOT NULL DEFAULT 1;
