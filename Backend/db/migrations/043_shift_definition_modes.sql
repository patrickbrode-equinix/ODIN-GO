-- Configurable time/recovery modes per shift definition.
ALTER TABLE shift_definitions
  ADD COLUMN IF NOT EXISTS modes JSONB NOT NULL DEFAULT '[]'::jsonb;
