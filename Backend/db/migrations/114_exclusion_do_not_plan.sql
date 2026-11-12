-- Button "Nicht planen" on the exception list: the employee disappears from the whole shift plan.
ALTER TABLE shiftplan_exclusions ADD COLUMN IF NOT EXISTS do_not_plan BOOLEAN NOT NULL DEFAULT FALSE;
