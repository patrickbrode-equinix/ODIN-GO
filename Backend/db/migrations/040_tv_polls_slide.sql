-- ============================================================
-- 040_tv_polls_slide.sql
-- Add "polls" slide to tv_slide_config
-- ============================================================

INSERT INTO tv_slide_config (slide_id, label, enabled, duration_ms, sort_order, only_if_data)
VALUES ('polls', 'Umfragen / Polls', TRUE, 15000, 8, TRUE)
ON CONFLICT (slide_id) DO NOTHING;
