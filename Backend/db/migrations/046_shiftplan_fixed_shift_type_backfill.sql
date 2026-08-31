-- 046: Backfill fixed_shift_type for databases where 045 was already recorded

ALTER TABLE shiftplan_exclusions
  ADD COLUMN IF NOT EXISTS fixed_shift_type VARCHAR(20);