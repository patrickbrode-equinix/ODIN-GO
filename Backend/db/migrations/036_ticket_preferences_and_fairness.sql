-- Migration 036: ticket_preferences table
-- Stores per-user ticket category preferences, willingness levels,
-- training self-assessment, and workload/flexibility preferences as JSONB.

CREATE TABLE IF NOT EXISTS ticket_preferences (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferences JSONB   NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_preferences_user ON ticket_preferences(user_id);

-- Also create a fairness_settings table for the admin fairness/variety/round-robin feature (Block 8)
CREATE TABLE IF NOT EXISTS fairness_settings (
  id                          SERIAL PRIMARY KEY,
  consecutive_category_limit  INTEGER     NOT NULL DEFAULT 0,
  fair_distribution_mode      VARCHAR(20) NOT NULL DEFAULT 'balanced',
  tie_breaker_strategy        VARCHAR(20) NOT NULL DEFAULT 'random',
  last_assignment_memory_days INTEGER     NOT NULL DEFAULT 7,
  variety_weight              NUMERIC(3,2) NOT NULL DEFAULT 0.30,
  updated_by                  INTEGER     REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a single default row
INSERT INTO fairness_settings (consecutive_category_limit, fair_distribution_mode, tie_breaker_strategy, last_assignment_memory_days, variety_weight)
VALUES (0, 'balanced', 'random', 7, 0.30)
ON CONFLICT DO NOTHING;
