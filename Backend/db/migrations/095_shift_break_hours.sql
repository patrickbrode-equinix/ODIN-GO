-- Every shift longer than six hours contains an unpaid one-hour break.
-- Only rows whose paid hours still equal the full presence time are corrected,
-- so durations that were already maintained manually stay untouched.
WITH presence AS (
  SELECT id,
         (EXTRACT(EPOCH FROM end_time) - EXTRACT(EPOCH FROM start_time)) / 3600.0
           + (COALESCE(end_day_offset, 0) - COALESCE(start_day_offset, 0)) * 24 AS raw_hours
  FROM shift_definitions
)
UPDATE shift_definitions AS definition
SET duration_hours = definition.duration_hours - 1,
    updated_at = NOW()
FROM presence
WHERE presence.id = definition.id
  AND (CASE WHEN presence.raw_hours <= 0 THEN presence.raw_hours + 24 ELSE presence.raw_hours END) > 6
  AND definition.duration_hours = (CASE WHEN presence.raw_hours <= 0 THEN presence.raw_hours + 24 ELSE presence.raw_hours END);

WITH presence AS (
  SELECT id,
         (EXTRACT(EPOCH FROM end_time) - EXTRACT(EPOCH FROM start_time)) / 3600.0
           + (COALESCE(end_day_offset, 0) - COALESCE(start_day_offset, 0)) * 24 AS raw_hours
  FROM shift_definition_day_overrides
)
UPDATE shift_definition_day_overrides AS override
SET duration_hours = override.duration_hours - 1,
    updated_at = NOW()
FROM presence
WHERE presence.id = override.id
  AND (CASE WHEN presence.raw_hours <= 0 THEN presence.raw_hours + 24 ELSE presence.raw_hours END) > 6
  AND override.duration_hours = (CASE WHEN presence.raw_hours <= 0 THEN presence.raw_hours + 24 ELSE presence.raw_hours END);
