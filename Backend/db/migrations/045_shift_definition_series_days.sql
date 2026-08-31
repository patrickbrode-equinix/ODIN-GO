-- 045: Per-shift block length for draft planning

ALTER TABLE shift_definitions
  ADD COLUMN IF NOT EXISTS series_days SMALLINT NOT NULL DEFAULT 1;

UPDATE shift_definitions
SET series_days = 5
WHERE code IN ('E1', 'E2', 'L1', 'L2');

UPDATE shift_definitions
SET series_days = 7
WHERE code = 'N';

ALTER TABLE shiftplan_exclusions
  ADD COLUMN IF NOT EXISTS fixed_shift_type VARCHAR(20);