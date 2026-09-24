CREATE TABLE IF NOT EXISTS poll_comments (
  id          SERIAL PRIMARY KEY,
  poll_id     INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment     TEXT NOT NULL CHECK (char_length(btrim(comment)) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poll_comments_poll
  ON poll_comments (poll_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_poll_comments_updated_at ON poll_comments;
CREATE TRIGGER trg_poll_comments_updated_at
  BEFORE UPDATE ON poll_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
