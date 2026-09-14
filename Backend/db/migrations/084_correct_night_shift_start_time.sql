-- Correct the legacy default night shift to the operational schedule.
-- Custom administrator changes are intentionally preserved.
UPDATE shift_definitions
SET start_time = '21:45',
    end_time = '06:45',
    end_day_offset = 1,
    duration_hours = 9.0,
    updated_at = NOW()
WHERE UPPER(code) = 'N'
  AND start_time IN ('21:15', '22:00')
  AND end_time IN ('06:00', '06:45');
