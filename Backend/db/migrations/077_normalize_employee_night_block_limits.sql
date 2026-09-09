-- An employee can realistically complete at most four weekly night blocks per month.
-- Legacy 0 values mean "unlimited" and are represented as NULL.

UPDATE employee_preferences
SET
  max_nights_per_month = CASE
    WHEN max_nights_per_month IS NULL OR max_nights_per_month <= 0 THEN NULL
    ELSE LEAST(max_nights_per_month, 4)
  END,
  updated_at = NOW()
WHERE max_nights_per_month IS NOT NULL;
