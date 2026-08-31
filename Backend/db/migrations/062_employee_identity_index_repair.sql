-- Repair-safe identity indexes for installations that already attempted 061.
-- This keeps the stack installable even when legacy data contains duplicate
-- UPN or Entra values. Conflicts are audited and the duplicate machine key is
-- nulled; display names and email/contact data are preserved.

ALTER TABLE employee_contacts
  ADD COLUMN IF NOT EXISTS employee_id TEXT,
  ADD COLUMN IF NOT EXISTS entra_object_id TEXT,
  ADD COLUMN IF NOT EXISTS upn TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id TEXT,
  ADD COLUMN IF NOT EXISTS entra_object_id TEXT,
  ADD COLUMN IF NOT EXISTS upn TEXT;

CREATE TABLE IF NOT EXISTS employee_identity_conflict_report (
  id BIGSERIAL PRIMARY KEY,
  source_table TEXT NOT NULL,
  identity_field TEXT NOT NULL,
  identity_value TEXT NOT NULL,
  row_ids TEXT[] NOT NULL,
  display_names TEXT[] NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO employee_identity_conflict_report (
  source_table,
  identity_field,
  identity_value,
  row_ids,
  display_names
)
SELECT
  source_table,
  identity_field,
  identity_value,
  row_ids,
  display_names
FROM (
  SELECT
    'employee_contacts' AS source_table,
    'upn' AS identity_field,
    LOWER(TRIM(upn)) AS identity_value,
    ARRAY_AGG(id::TEXT ORDER BY id) AS row_ids,
    ARRAY_AGG(employee_name ORDER BY id) AS display_names
  FROM employee_contacts
  WHERE upn IS NOT NULL AND TRIM(upn) <> ''
  GROUP BY LOWER(TRIM(upn))
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT
    'employee_contacts' AS source_table,
    'entra_object_id' AS identity_field,
    LOWER(TRIM(entra_object_id)) AS identity_value,
    ARRAY_AGG(id::TEXT ORDER BY id) AS row_ids,
    ARRAY_AGG(employee_name ORDER BY id) AS display_names
  FROM employee_contacts
  WHERE entra_object_id IS NOT NULL AND TRIM(entra_object_id) <> ''
  GROUP BY LOWER(TRIM(entra_object_id))
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT
    'users' AS source_table,
    'upn' AS identity_field,
    LOWER(TRIM(upn)) AS identity_value,
    ARRAY_AGG(id::TEXT ORDER BY id) AS row_ids,
    ARRAY_AGG(COALESCE(provisioned_employee_name, CONCAT_WS(' ', first_name, last_name), email) ORDER BY id) AS display_names
  FROM users
  WHERE upn IS NOT NULL AND TRIM(upn) <> ''
  GROUP BY LOWER(TRIM(upn))
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT
    'users' AS source_table,
    'entra_object_id' AS identity_field,
    LOWER(TRIM(entra_object_id)) AS identity_value,
    ARRAY_AGG(id::TEXT ORDER BY id) AS row_ids,
    ARRAY_AGG(COALESCE(provisioned_employee_name, CONCAT_WS(' ', first_name, last_name), email) ORDER BY id) AS display_names
  FROM users
  WHERE entra_object_id IS NOT NULL AND TRIM(entra_object_id) <> ''
  GROUP BY LOWER(TRIM(entra_object_id))
  HAVING COUNT(*) > 1
) conflicts;

WITH duplicate_keys AS (
  SELECT LOWER(TRIM(upn)) AS key
  FROM employee_contacts
  WHERE upn IS NOT NULL AND TRIM(upn) <> ''
  GROUP BY LOWER(TRIM(upn))
  HAVING COUNT(*) > 1
)
UPDATE employee_contacts ec
SET upn = NULL
FROM duplicate_keys dk
WHERE LOWER(TRIM(ec.upn)) = dk.key;

WITH duplicate_keys AS (
  SELECT LOWER(TRIM(entra_object_id)) AS key
  FROM employee_contacts
  WHERE entra_object_id IS NOT NULL AND TRIM(entra_object_id) <> ''
  GROUP BY LOWER(TRIM(entra_object_id))
  HAVING COUNT(*) > 1
)
UPDATE employee_contacts ec
SET entra_object_id = NULL
FROM duplicate_keys dk
WHERE LOWER(TRIM(ec.entra_object_id)) = dk.key;

WITH duplicate_keys AS (
  SELECT LOWER(TRIM(upn)) AS key
  FROM users
  WHERE upn IS NOT NULL AND TRIM(upn) <> ''
  GROUP BY LOWER(TRIM(upn))
  HAVING COUNT(*) > 1
)
UPDATE users u
SET upn = NULL
FROM duplicate_keys dk
WHERE LOWER(TRIM(u.upn)) = dk.key;

WITH duplicate_keys AS (
  SELECT LOWER(TRIM(entra_object_id)) AS key
  FROM users
  WHERE entra_object_id IS NOT NULL AND TRIM(entra_object_id) <> ''
  GROUP BY LOWER(TRIM(entra_object_id))
  HAVING COUNT(*) > 1
)
UPDATE users u
SET entra_object_id = NULL
FROM duplicate_keys dk
WHERE LOWER(TRIM(u.entra_object_id)) = dk.key;

DROP INDEX IF EXISTS ux_employee_contacts_entra_object_id;
DROP INDEX IF EXISTS ux_employee_contacts_upn;
DROP INDEX IF EXISTS ux_users_entra_object_id;
DROP INDEX IF EXISTS ux_users_upn;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_contacts_entra_object_id
  ON employee_contacts (LOWER(TRIM(entra_object_id)))
  WHERE entra_object_id IS NOT NULL AND TRIM(entra_object_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_contacts_upn
  ON employee_contacts (LOWER(TRIM(upn)))
  WHERE upn IS NOT NULL AND TRIM(upn) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_entra_object_id
  ON users (LOWER(TRIM(entra_object_id)))
  WHERE entra_object_id IS NOT NULL AND TRIM(entra_object_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_upn
  ON users (LOWER(TRIM(upn)))
  WHERE upn IS NOT NULL AND TRIM(upn) <> '';
