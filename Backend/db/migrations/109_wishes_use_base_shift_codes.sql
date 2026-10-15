-- Employee wishes refer to the base shift (E1, E2, L1, N). Weekend variants (E1SA, E1WE, E2SA,
-- E2WE, L1WE) and the short night NK are no wish options; the generator maps them to the base shift.
-- Stored wishes that still contain such a code are converted.
CREATE OR REPLACE FUNCTION odin_base_shift_code(code text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE UPPER(code)
    WHEN 'E1SA' THEN 'E1' WHEN 'E1WE' THEN 'E1'
    WHEN 'E2SA' THEN 'E2' WHEN 'E2WE' THEN 'E2'
    WHEN 'L1WE' THEN 'L1' WHEN 'NK' THEN 'N' WHEN 'NS' THEN 'N'
    ELSE UPPER(code)
  END
$fn$;

UPDATE employee_preferences AS ep
SET
  preferred_shifts = COALESCE((
    SELECT jsonb_agg(DISTINCT to_jsonb(odin_base_shift_code(code)))
    FROM jsonb_array_elements_text(COALESCE(ep.preferred_shifts, '[]'::jsonb)) AS shift_values(code)
  ), '[]'::jsonb),
  unwanted_shifts = COALESCE((
    SELECT jsonb_agg(DISTINCT to_jsonb(odin_base_shift_code(code)))
    FROM jsonb_array_elements_text(COALESCE(ep.unwanted_shifts, '[]'::jsonb)) AS shift_values(code)
  ), '[]'::jsonb),
  monthly_preferences = COALESCE((
    SELECT jsonb_object_agg(month_key, jsonb_set(
      jsonb_set(month_value, '{preferred_shifts}', COALESCE((
        SELECT jsonb_agg(DISTINCT to_jsonb(odin_base_shift_code(code)))
        FROM jsonb_array_elements_text(COALESCE(month_value->'preferred_shifts', '[]'::jsonb)) AS preferred_values(code)
      ), '[]'::jsonb)),
      '{unwanted_shifts}', COALESCE((
        SELECT jsonb_agg(DISTINCT to_jsonb(odin_base_shift_code(code)))
        FROM jsonb_array_elements_text(COALESCE(month_value->'unwanted_shifts', '[]'::jsonb)) AS unwanted_values(code)
      ), '[]'::jsonb)
    ))
    FROM jsonb_each(COALESCE(ep.monthly_preferences, '{}'::jsonb)) AS months(month_key, month_value)
  ), '{}'::jsonb),
  updated_at = NOW()
WHERE ep.preferred_shifts::text ~* '(E1SA|E1WE|E2SA|E2WE|L1WE|NK|NS)'
   OR ep.unwanted_shifts::text ~* '(E1SA|E1WE|E2SA|E2WE|L1WE|NK|NS)'
   OR ep.monthly_preferences::text ~* '(E1SA|E1WE|E2SA|E2WE|L1WE|NK|NS)';
