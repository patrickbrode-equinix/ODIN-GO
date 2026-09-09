-- Workload preference is no longer part of employee shift preferences.
-- Keep the legacy column neutral for compatibility with existing installations.

UPDATE employee_preferences
SET workload_preference = 'normal', updated_at = NOW()
WHERE workload_preference IS DISTINCT FROM 'normal';
