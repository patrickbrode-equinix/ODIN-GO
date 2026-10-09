-- Per-employee DBS times: each pool member can have own start/end times.
-- NULL = use the times of the DBS shift definition. duration_hours is the paid
-- time (presence minus break) calculated from the times when saving.
ALTER TABLE shift_special_pools
  ADD COLUMN IF NOT EXISTS start_time TIME NULL,
  ADD COLUMN IF NOT EXISTS end_time TIME NULL,
  ADD COLUMN IF NOT EXISTS duration_hours NUMERIC(4,2) NULL;
