-- Optional maximum number of weekend blocks per month requested by an employee.
ALTER TABLE employee_preferences
  ADD COLUMN IF NOT EXISTS max_weekends_per_month INT DEFAULT NULL;
