CREATE TABLE IF NOT EXISTS coc_command_chain (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  manager_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_final_approver BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CHECK (manager_user_id IS NULL OR manager_user_id <> user_id)
);

CREATE TABLE IF NOT EXISTS coc_cases (
  id BIGSERIAL PRIMARY KEY,
  reference VARCHAR(32) UNIQUE,
  classification VARCHAR(24) NOT NULL
    CHECK (classification IN ('problem', 'idea', 'improvement')),
  title VARCHAR(180) NOT NULL,
  short_description VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  submitter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitter_name VARCHAR(180) NOT NULL,
  submitter_email VARCHAR(320),
  current_approver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('awaiting_routing', 'pending', 'approved', 'rejected')),
  current_level INTEGER NOT NULL DEFAULT 1 CHECK (current_level >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS coc_case_events (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES coc_cases(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(180) NOT NULL,
  action VARCHAR(32) NOT NULL
    CHECK (action IN ('submitted', 'routed', 'forwarded', 'approved', 'rejected', 'commented')),
  comment TEXT,
  from_approver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  to_approver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coc_case_attachments (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES coc_cases(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(160) NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  file_data BYTEA NOT NULL,
  uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coc_cases_submitter
  ON coc_cases (submitter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coc_cases_approver
  ON coc_cases (current_approver_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coc_events_case
  ON coc_case_events (case_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_coc_attachments_case
  ON coc_case_attachments (case_id, created_at ASC);
