-- =============================================
-- MIGRATION 041: Store feedback screenshot binary data
-- Previously only the filename was saved; the actual
-- image bytes were lost after the request ended.
-- =============================================

ALTER TABLE feedback_entries
  ADD COLUMN IF NOT EXISTS screenshot_data BYTEA,
  ADD COLUMN IF NOT EXISTS screenshot_mime VARCHAR(64);
