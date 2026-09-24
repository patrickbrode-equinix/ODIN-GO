-- Weekday scope for plan exclusions / fixed-shift rules. NULL means the whole week.
ALTER TABLE shiftplan_exclusions ADD COLUMN IF NOT EXISTS weekdays JSONB NULL;
