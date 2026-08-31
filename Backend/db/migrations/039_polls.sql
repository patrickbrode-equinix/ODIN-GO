-- ============================================================
-- 039_polls.sql
-- Polls / Umfragen – questions with options, one vote per user
-- ============================================================

-- Polls (questions)
CREATE TABLE IF NOT EXISTS polls (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(500)  NOT NULL,
  description   TEXT          NOT NULL DEFAULT '',
  options       JSONB         NOT NULL DEFAULT '[]'::jsonb,   -- ["Option A","Option B",…]
  created_by    INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ends_at       TIMESTAMPTZ,                                  -- NULL = no deadline
  closed        BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polls_created_at ON polls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_polls_created_by ON polls(created_by);

-- Votes (one per user per poll)
CREATE TABLE IF NOT EXISTS poll_votes (
  id            SERIAL PRIMARY KEY,
  poll_id       INTEGER       NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id       INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index  INTEGER       NOT NULL,          -- 0-based index into polls.options
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uk_poll_votes_user UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

-- Auto-update updated_at triggers
CREATE TRIGGER trg_polls_updated_at
  BEFORE UPDATE ON polls
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_poll_votes_updated_at
  BEFORE UPDATE ON poll_votes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
