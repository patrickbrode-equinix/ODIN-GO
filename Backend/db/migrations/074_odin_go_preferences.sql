CREATE TABLE IF NOT EXISTS odin_go_user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  launcher_x_ratio DOUBLE PRECISION CHECK (launcher_x_ratio BETWEEN 0 AND 1),
  launcher_y_ratio DOUBLE PRECISION CHECK (launcher_y_ratio BETWEEN 0 AND 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
