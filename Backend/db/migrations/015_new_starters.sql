-- Migration 015: New Starters / Probation Period Management
-- Adds tables for managing new employees during their probation phase,
-- including ratings per category, comments, and computed probation dates.

-- ──────────────────────────────────────────────────────────────────
-- 1. Main table: new_starters
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS new_starters (
    id                    SERIAL PRIMARY KEY,
    first_name            TEXT NOT NULL,
    last_name             TEXT NOT NULL,
    start_date            DATE NOT NULL,
    -- Populated by backend on insert/update (start_date + 6 months)
    probation_end_date    DATE NOT NULL,
    -- 14 days before probation_end_date
    last_termination_date DATE NOT NULL,
    comment               TEXT,
    status                TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'archived')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_new_starters_status     ON new_starters(status);
CREATE INDEX IF NOT EXISTS idx_new_starters_start_date ON new_starters(start_date DESC);

-- ──────────────────────────────────────────────────────────────────
-- 2. Ratings table: one row per new_starter (upsert-able)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS new_starter_ratings (
    id                      SERIAL PRIMARY KEY,
    new_starter_id          INTEGER NOT NULL
                               REFERENCES new_starters(id) ON DELETE CASCADE,

    -- 10 rating categories, each 1–5 or NULL if not yet rated
    punctuality             SMALLINT CHECK (punctuality BETWEEN 1 AND 5),
    politeness              SMALLINT CHECK (politeness BETWEEN 1 AND 5),
    team_integration        SMALLINT CHECK (team_integration BETWEEN 1 AND 5),
    motivation              SMALLINT CHECK (motivation BETWEEN 1 AND 5),
    technical_understanding SMALLINT CHECK (technical_understanding BETWEEN 1 AND 5),
    work_quality            SMALLINT CHECK (work_quality BETWEEN 1 AND 5),
    german_language         SMALLINT CHECK (german_language BETWEEN 1 AND 5),
    english_language        SMALLINT CHECK (english_language BETWEEN 1 AND 5),
    workplace_cleanliness   SMALLINT CHECK (workplace_cleanliness BETWEEN 1 AND 5),
    clothing_cleanliness    SMALLINT CHECK (clothing_cleanliness BETWEEN 1 AND 5),

    -- Pre-computed average (backend updates this on each save)
    average_rating          NUMERIC(3,2),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (new_starter_id)
);

CREATE INDEX IF NOT EXISTS idx_nsr_starter ON new_starter_ratings(new_starter_id);
