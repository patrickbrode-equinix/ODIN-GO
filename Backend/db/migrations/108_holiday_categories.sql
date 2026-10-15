-- Holiday staffing is set per category instead of per single holiday:
--   holiday_national       = public holidays that apply in Germany only
--   holiday_international  = public holidays that are holidays in other countries as well
-- The former single "holiday" limits are copied into both categories.
ALTER TABLE staffing_day_limits DROP CONSTRAINT IF EXISTS staffing_day_limits_day_context_check;
ALTER TABLE staffing_day_limits ADD CONSTRAINT staffing_day_limits_day_context_check
  CHECK (day_context IN ('saturday', 'sunday', 'holiday', 'holiday_national', 'holiday_international'));

INSERT INTO staffing_day_limits (day_context, shift_type, min_count, max_count)
SELECT 'holiday_national', shift_type, min_count, max_count FROM staffing_day_limits WHERE day_context = 'holiday'
ON CONFLICT (day_context, shift_type) DO NOTHING;

INSERT INTO staffing_day_limits (day_context, shift_type, min_count, max_count)
SELECT 'holiday_international', shift_type, min_count, max_count FROM staffing_day_limits WHERE day_context = 'holiday'
ON CONFLICT (day_context, shift_type) DO NOTHING;

DELETE FROM staffing_day_limits WHERE day_context = 'holiday';

-- The per-holiday maximum values are replaced by the category limits above.
DELETE FROM app_settings WHERE key = 'shiftplan.holiday_staffing_limits';
