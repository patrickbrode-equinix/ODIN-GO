-- Employees on the "do not plan" list can be ticked to be planned on bank holidays anyway.
ALTER TABLE shiftplan_exclusions ADD COLUMN IF NOT EXISTS plan_on_holidays BOOLEAN NOT NULL DEFAULT FALSE;
