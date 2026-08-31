-- Stable employee identity keys for double/multiple-name safe matching.
-- Names remain display data; Entra ID, internal employee ID and UPN are the
-- only safe machine identifiers. Legacy display-name duplicates are reported,
-- not destructively merged.

ALTER TABLE employee_contacts
  ADD COLUMN IF NOT EXISTS employee_id TEXT,
  ADD COLUMN IF NOT EXISTS entra_object_id TEXT,
  ADD COLUMN IF NOT EXISTS upn TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id TEXT,
  ADD COLUMN IF NOT EXISTS entra_object_id TEXT,
  ADD COLUMN IF NOT EXISTS upn TEXT;

UPDATE employee_contacts
SET upn = LOWER(TRIM(email))
WHERE (upn IS NULL OR TRIM(upn) = '')
  AND email IS NOT NULL
  AND TRIM(email) <> '';

UPDATE users
SET upn = LOWER(TRIM(email))
WHERE (upn IS NULL OR TRIM(upn) = '')
  AND email IS NOT NULL
  AND TRIM(email) <> '';

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
  'employee_contacts',
  'upn',
  LOWER(TRIM(upn)),
  ARRAY_AGG(id::TEXT ORDER BY id),
  ARRAY_AGG(employee_name ORDER BY id)
FROM employee_contacts
WHERE upn IS NOT NULL AND TRIM(upn) <> ''
GROUP BY LOWER(TRIM(upn))
HAVING COUNT(*) > 1;

INSERT INTO employee_identity_conflict_report (
  source_table,
  identity_field,
  identity_value,
  row_ids,
  display_names
)
SELECT
  'employee_contacts',
  'entra_object_id',
  LOWER(TRIM(entra_object_id)),
  ARRAY_AGG(id::TEXT ORDER BY id),
  ARRAY_AGG(employee_name ORDER BY id)
FROM employee_contacts
WHERE entra_object_id IS NOT NULL AND TRIM(entra_object_id) <> ''
GROUP BY LOWER(TRIM(entra_object_id))
HAVING COUNT(*) > 1;

INSERT INTO employee_identity_conflict_report (
  source_table,
  identity_field,
  identity_value,
  row_ids,
  display_names
)
SELECT
  'users',
  'upn',
  LOWER(TRIM(upn)),
  ARRAY_AGG(id::TEXT ORDER BY id),
  ARRAY_AGG(COALESCE(provisioned_employee_name, CONCAT_WS(' ', first_name, last_name), email) ORDER BY id)
FROM users
WHERE upn IS NOT NULL AND TRIM(upn) <> ''
GROUP BY LOWER(TRIM(upn))
HAVING COUNT(*) > 1;

INSERT INTO employee_identity_conflict_report (
  source_table,
  identity_field,
  identity_value,
  row_ids,
  display_names
)
SELECT
  'users',
  'entra_object_id',
  LOWER(TRIM(entra_object_id)),
  ARRAY_AGG(id::TEXT ORDER BY id),
  ARRAY_AGG(COALESCE(provisioned_employee_name, CONCAT_WS(' ', first_name, last_name), email) ORDER BY id)
FROM users
WHERE entra_object_id IS NOT NULL AND TRIM(entra_object_id) <> ''
GROUP BY LOWER(TRIM(entra_object_id))
HAVING COUNT(*) > 1;

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

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_contacts_entra_object_id
  ON employee_contacts (LOWER(entra_object_id))
  WHERE entra_object_id IS NOT NULL AND TRIM(entra_object_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_contacts_upn
  ON employee_contacts (LOWER(upn))
  WHERE upn IS NOT NULL AND TRIM(upn) <> '';

CREATE INDEX IF NOT EXISTS idx_employee_contacts_employee_id
  ON employee_contacts (LOWER(employee_id))
  WHERE employee_id IS NOT NULL AND TRIM(employee_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_entra_object_id
  ON users (LOWER(entra_object_id))
  WHERE entra_object_id IS NOT NULL AND TRIM(entra_object_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_upn
  ON users (LOWER(upn))
  WHERE upn IS NOT NULL AND TRIM(upn) <> '';

CREATE INDEX IF NOT EXISTS idx_users_employee_id
  ON users (LOWER(employee_id))
  WHERE employee_id IS NOT NULL AND TRIM(employee_id) <> '';

CREATE TABLE IF NOT EXISTS employee_identity_legacy_duplicate_report (
  id BIGSERIAL PRIMARY KEY,
  source_table TEXT NOT NULL,
  legacy_display_key TEXT NOT NULL,
  row_ids TEXT[] NOT NULL,
  display_names TEXT[] NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO employee_identity_legacy_duplicate_report (
  source_table,
  legacy_display_key,
  row_ids,
  display_names
)
SELECT
  'employee_contacts',
  LOWER(REGEXP_REPLACE(TRIM(employee_name), '\s+', ' ', 'g')) AS legacy_display_key,
  ARRAY_AGG(id::TEXT ORDER BY id) AS row_ids,
  ARRAY_AGG(employee_name ORDER BY employee_name) AS display_names
FROM employee_contacts
WHERE employee_name IS NOT NULL
  AND TRIM(employee_name) <> ''
  AND (employee_id IS NULL OR TRIM(employee_id) = '')
  AND (entra_object_id IS NULL OR TRIM(entra_object_id) = '')
  AND (upn IS NULL OR TRIM(upn) = '')
GROUP BY LOWER(REGEXP_REPLACE(TRIM(employee_name), '\s+', ' ', 'g'))
HAVING COUNT(*) > 1;

INSERT INTO employee_identity_legacy_duplicate_report (
  source_table,
  legacy_display_key,
  row_ids,
  display_names
)
SELECT
  'users',
  LOWER(REGEXP_REPLACE(TRIM(COALESCE(provisioned_employee_name, CONCAT_WS(' ', first_name, last_name))), '\s+', ' ', 'g')) AS legacy_display_key,
  ARRAY_AGG(id::TEXT ORDER BY id) AS row_ids,
  ARRAY_AGG(COALESCE(provisioned_employee_name, CONCAT_WS(' ', first_name, last_name)) ORDER BY id) AS display_names
FROM users
WHERE COALESCE(provisioned_employee_name, CONCAT_WS(' ', first_name, last_name)) IS NOT NULL
  AND TRIM(COALESCE(provisioned_employee_name, CONCAT_WS(' ', first_name, last_name))) <> ''
  AND (employee_id IS NULL OR TRIM(employee_id) = '')
  AND (entra_object_id IS NULL OR TRIM(entra_object_id) = '')
  AND (upn IS NULL OR TRIM(upn) = '')
GROUP BY LOWER(REGEXP_REPLACE(TRIM(COALESCE(provisioned_employee_name, CONCAT_WS(' ', first_name, last_name))), '\s+', ' ', 'g'))
HAVING COUNT(*) > 1;
