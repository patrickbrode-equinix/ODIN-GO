CREATE TABLE IF NOT EXISTS subtype_exclusions (
  id SERIAL PRIMARY KEY,
  subtype VARCHAR(255) NOT NULL UNIQUE,
  reason TEXT,
  created_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subtype_exclusions_subtype ON subtype_exclusions(subtype);