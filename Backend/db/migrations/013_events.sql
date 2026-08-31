-- ============================================================
-- 013_events.sql
-- Events images table for TV Events slide
-- ============================================================

CREATE TABLE IF NOT EXISTS events_images (
  id            SERIAL PRIMARY KEY,
  filename      VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  url_path      VARCHAR(512) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    VARCHAR(120)
);

CREATE INDEX IF NOT EXISTS idx_events_images_created_at ON events_images(created_at);
