ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_login_name_format_check;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_login_name_ci
  ON users (LOWER(login_name));
