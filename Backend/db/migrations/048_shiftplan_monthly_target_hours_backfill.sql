-- 048: Backfill global monthly target hours on older shift_planning_config tables

ALTER TABLE shift_planning_config
  ADD COLUMN IF NOT EXISTS monthly_target_hours NUMERIC(6,2) NOT NULL DEFAULT 174;