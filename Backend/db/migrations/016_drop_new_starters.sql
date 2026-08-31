-- Migration 016: Remove New Starters feature (replaced by external app)
-- Drops tables and indexes created by migration 015.

DROP TABLE IF EXISTS new_starter_ratings CASCADE;
DROP TABLE IF EXISTS new_starters CASCADE;
