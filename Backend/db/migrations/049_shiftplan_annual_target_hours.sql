-- 049: Add annual target hours to shift planning configuration

ALTER TABLE shift_planning_config
  ADD COLUMN IF NOT EXISTS annual_target_hours NUMERIC(7,2) NOT NULL DEFAULT 2088;

UPDATE shift_planning_config
SET annual_target_hours = COALESCE(NULLIF(annual_target_hours, 0), monthly_target_hours * 12, 2088)
WHERE annual_target_hours IS NULL OR annual_target_hours = 0;