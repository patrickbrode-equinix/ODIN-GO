-- Legacy half shifts are no longer valid employee preferences.
-- Remove them from yearly and month-specific preference records.

UPDATE employee_preferences AS ep
SET
  preferred_shifts = COALESCE((
    SELECT jsonb_agg(to_jsonb(code))
    FROM jsonb_array_elements_text(COALESCE(ep.preferred_shifts, '[]'::jsonb)) AS shift_values(code)
    WHERE UPPER(code) NOT IN ('HE1', 'HE2', 'HL1', 'HL2')
  ), '[]'::jsonb),
  unwanted_shifts = COALESCE((
    SELECT jsonb_agg(to_jsonb(code))
    FROM jsonb_array_elements_text(COALESCE(ep.unwanted_shifts, '[]'::jsonb)) AS shift_values(code)
    WHERE UPPER(code) NOT IN ('HE1', 'HE2', 'HL1', 'HL2')
  ), '[]'::jsonb),
  monthly_preferences = COALESCE((
    SELECT jsonb_object_agg(month_key, jsonb_set(
      jsonb_set(month_value, '{preferred_shifts}', COALESCE((
        SELECT jsonb_agg(to_jsonb(code))
        FROM jsonb_array_elements_text(COALESCE(month_value->'preferred_shifts', '[]'::jsonb)) AS preferred_values(code)
        WHERE UPPER(code) NOT IN ('HE1', 'HE2', 'HL1', 'HL2')
      ), '[]'::jsonb)),
      '{unwanted_shifts}', COALESCE((
        SELECT jsonb_agg(to_jsonb(code))
        FROM jsonb_array_elements_text(COALESCE(month_value->'unwanted_shifts', '[]'::jsonb)) AS unwanted_values(code)
        WHERE UPPER(code) NOT IN ('HE1', 'HE2', 'HL1', 'HL2')
      ), '[]'::jsonb)
    ))
    FROM jsonb_each(COALESCE(ep.monthly_preferences, '{}'::jsonb)) AS months(month_key, month_value)
  ), '{}'::jsonb),
  updated_at = NOW();
