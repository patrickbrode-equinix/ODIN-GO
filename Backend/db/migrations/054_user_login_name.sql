ALTER TABLE users
  ADD COLUMN IF NOT EXISTS login_name VARCHAR(160);

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL;

CREATE TABLE IF NOT EXISTS user_login_name_migration_issues (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  issue_type VARCHAR(64) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, issue_type)
);

DELETE FROM user_login_name_migration_issues
WHERE issue_type IN ('missing_name_parts', 'duplicate_generated_login_name', 'conflicts_existing_login_name');

WITH generated AS (
  SELECT
    u.id,
    CASE
      WHEN btrim(COALESCE(u.first_name, '')) = '' OR btrim(COALESCE(u.last_name, '')) = '' THEN NULL
      ELSE
        regexp_replace(
          initcap(
            regexp_replace(
              replace(replace(replace(replace(replace(replace(replace(COALESCE(u.first_name, ''), 'Ä', 'Ae'), 'Ö', 'Oe'), 'Ü', 'Ue'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
              '[^A-Za-z0-9]+',
              ' ',
              'g'
            )
          ),
          '\s+',
          '',
          'g'
        )
        || '@' ||
        regexp_replace(
          initcap(
            regexp_replace(
              replace(replace(replace(replace(replace(replace(replace(COALESCE(u.last_name, ''), 'Ä', 'Ae'), 'Ö', 'Oe'), 'Ü', 'Ue'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
              '[^A-Za-z0-9]+',
              ' ',
              'g'
            )
          ),
          '\s+',
          '',
          'g'
        )
    END AS generated_login_name
  FROM users u
  WHERE u.login_name IS NULL
)
INSERT INTO user_login_name_migration_issues (user_id, issue_type, details)
SELECT u.id, 'missing_name_parts', jsonb_build_object('firstName', u.first_name, 'lastName', u.last_name)
FROM users u
WHERE u.login_name IS NULL
  AND (btrim(COALESCE(u.first_name, '')) = '' OR btrim(COALESCE(u.last_name, '')) = '')
ON CONFLICT (user_id, issue_type) DO UPDATE SET details = EXCLUDED.details;

WITH generated AS (
  SELECT
    u.id,
    regexp_replace(
      initcap(
        regexp_replace(
          replace(replace(replace(replace(replace(replace(replace(COALESCE(u.first_name, ''), 'Ä', 'Ae'), 'Ö', 'Oe'), 'Ü', 'Ue'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
          '[^A-Za-z0-9]+',
          ' ',
          'g'
        )
      ),
      '\s+',
      '',
      'g'
    )
    || '@' ||
    regexp_replace(
      initcap(
        regexp_replace(
          replace(replace(replace(replace(replace(replace(replace(COALESCE(u.last_name, ''), 'Ä', 'Ae'), 'Ö', 'Oe'), 'Ü', 'Ue'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
          '[^A-Za-z0-9]+',
          ' ',
          'g'
        )
      ),
      '\s+',
      '',
      'g'
    ) AS generated_login_name
  FROM users u
  WHERE u.login_name IS NULL
    AND btrim(COALESCE(u.first_name, '')) <> ''
    AND btrim(COALESCE(u.last_name, '')) <> ''
), duplicate_candidates AS (
  SELECT LOWER(g.generated_login_name) AS login_key
  FROM generated g
  GROUP BY LOWER(g.generated_login_name)
  HAVING COUNT(*) > 1
)
INSERT INTO user_login_name_migration_issues (user_id, issue_type, details)
SELECT g.id, 'duplicate_generated_login_name', jsonb_build_object('loginName', g.generated_login_name)
FROM generated g
JOIN duplicate_candidates d ON d.login_key = LOWER(g.generated_login_name)
ON CONFLICT (user_id, issue_type) DO UPDATE SET details = EXCLUDED.details;

WITH generated AS (
  SELECT
    u.id,
    regexp_replace(
      initcap(
        regexp_replace(
          replace(replace(replace(replace(replace(replace(replace(COALESCE(u.first_name, ''), 'Ä', 'Ae'), 'Ö', 'Oe'), 'Ü', 'Ue'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
          '[^A-Za-z0-9]+',
          ' ',
          'g'
        )
      ),
      '\s+',
      '',
      'g'
    )
    || '@' ||
    regexp_replace(
      initcap(
        regexp_replace(
          replace(replace(replace(replace(replace(replace(replace(COALESCE(u.last_name, ''), 'Ä', 'Ae'), 'Ö', 'Oe'), 'Ü', 'Ue'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
          '[^A-Za-z0-9]+',
          ' ',
          'g'
        )
      ),
      '\s+',
      '',
      'g'
    ) AS generated_login_name
  FROM users u
  WHERE u.login_name IS NULL
    AND btrim(COALESCE(u.first_name, '')) <> ''
    AND btrim(COALESCE(u.last_name, '')) <> ''
)
INSERT INTO user_login_name_migration_issues (user_id, issue_type, details)
SELECT g.id, 'conflicts_existing_login_name', jsonb_build_object('loginName', g.generated_login_name)
FROM generated g
JOIN users u
  ON u.id <> g.id
 AND u.login_name IS NOT NULL
 AND LOWER(u.login_name) = LOWER(g.generated_login_name)
ON CONFLICT (user_id, issue_type) DO UPDATE SET details = EXCLUDED.details;

WITH generated AS (
  SELECT
    u.id,
    regexp_replace(
      initcap(
        regexp_replace(
          replace(replace(replace(replace(replace(replace(replace(COALESCE(u.first_name, ''), 'Ä', 'Ae'), 'Ö', 'Oe'), 'Ü', 'Ue'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
          '[^A-Za-z0-9]+',
          ' ',
          'g'
        )
      ),
      '\s+',
      '',
      'g'
    )
    || '@' ||
    regexp_replace(
      initcap(
        regexp_replace(
          replace(replace(replace(replace(replace(replace(replace(COALESCE(u.last_name, ''), 'Ä', 'Ae'), 'Ö', 'Oe'), 'Ü', 'Ue'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
          '[^A-Za-z0-9]+',
          ' ',
          'g'
        )
      ),
      '\s+',
      '',
      'g'
    ) AS generated_login_name
  FROM users u
  WHERE u.login_name IS NULL
    AND btrim(COALESCE(u.first_name, '')) <> ''
    AND btrim(COALESCE(u.last_name, '')) <> ''
), blocked_ids AS (
  SELECT user_id AS id
  FROM user_login_name_migration_issues
  WHERE issue_type IN ('duplicate_generated_login_name', 'conflicts_existing_login_name')
)
UPDATE users u
SET login_name = g.generated_login_name
FROM generated g
LEFT JOIN blocked_ids b ON b.id = g.id
WHERE u.id = g.id
  AND b.id IS NULL
  AND u.login_name IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_login_name_unique_ci'
  ) THEN
    CREATE UNIQUE INDEX users_login_name_unique_ci ON users (LOWER(login_name)) WHERE login_name IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_login_name_format_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_login_name_format_check
      CHECK (
        login_name IS NULL
        OR (
          login_name ~ '^[A-Za-z0-9]+@[A-Za-z0-9]+$'
          AND login_name !~* '\\.(de|com|net|org|io)$'
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE login_name IS NULL) THEN
    ALTER TABLE users ALTER COLUMN login_name SET NOT NULL;
  END IF;
END $$;
