-- ============================================================
-- 014_events_visibility.sql
-- Add is_visible flag to events_images (default: visible)
-- ============================================================

ALTER TABLE events_images
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_events_images_visible ON events_images(is_visible);
