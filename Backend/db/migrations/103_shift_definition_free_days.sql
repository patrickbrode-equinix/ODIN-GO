-- Optional per-shift number of free days after a finished block.
-- NULL = use the global rules (no behaviour change for existing installs).
ALTER TABLE shift_definitions
  ADD COLUMN IF NOT EXISTS free_days_after SMALLINT NULL;
