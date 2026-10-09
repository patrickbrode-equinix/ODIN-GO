-- Planning outside the DBS block: for every DBS pool member the admin can restrict which
-- shifts he/she works when not on DBS and how many days per month that may be.
-- NULL / empty = no restriction (the member is planned like every other employee).
ALTER TABLE shift_special_pools
  ADD COLUMN IF NOT EXISTS other_shift_codes JSONB NULL,
  ADD COLUMN IF NOT EXISTS other_days_per_month SMALLINT NULL;
