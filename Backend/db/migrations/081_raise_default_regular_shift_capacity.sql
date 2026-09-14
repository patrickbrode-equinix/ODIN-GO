-- 081: The former seed maximum of five regular-shift employees cannot
-- provide contractual monthly hours for the normal ODIN team size. Raise only
-- legacy defaults. Values other than the former default of five stay intact.
UPDATE shift_definitions
SET max_staff = 8,
    updated_at = NOW()
WHERE UPPER(code) IN ('E1', 'E2', 'L1', 'L2')
  AND max_staff = 5;
