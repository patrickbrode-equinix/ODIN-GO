-- Encrypted payroll profile of an employee ("Abrechnung").
-- The browser encrypts the profile with a key that is derived from the employee's own payroll password
-- (PBKDF2 + AES-256-GCM). The server stores only ciphertext, salt and IV: neither administrators nor
-- database operators can read salary, tax class, children or any other value. A forgotten password
-- cannot be recovered; the employee deletes the profile and enters the data again.
CREATE TABLE IF NOT EXISTS payroll_profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  salt           TEXT NOT NULL,
  iv             TEXT NOT NULL,
  ciphertext     TEXT NOT NULL,
  kdf            TEXT NOT NULL DEFAULT 'PBKDF2-SHA256',
  kdf_iterations INTEGER NOT NULL DEFAULT 600000,
  version        INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payroll_profiles IS 'End-to-end encrypted payroll profile; ciphertext only, no plaintext values.';
