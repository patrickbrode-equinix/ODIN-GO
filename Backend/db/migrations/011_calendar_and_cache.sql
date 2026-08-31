-- Migration 011: Calendar site config + Islamic & sun-times cache tables
-- These tables are required by routes/shiftplanData.js and routes/ramadan.js
-- Missing tables caused unhandled promise rejection (server crash on first request)

CREATE TABLE IF NOT EXISTS calendar_site_config (
    id              SERIAL PRIMARY KEY,
    site_name       TEXT NOT NULL UNIQUE,
    lat             DOUBLE PRECISION NOT NULL DEFAULT 52.5200,
    lon             DOUBLE PRECISION NOT NULL DEFAULT 13.4050,
    tz              TEXT NOT NULL DEFAULT 'Europe/Berlin',
    islamic_method  TEXT NOT NULL DEFAULT 'Diyanet',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS islamic_calendar_cache (
    id              SERIAL PRIMARY KEY,
    year            INTEGER NOT NULL,
    site_name       TEXT NOT NULL,
    tz              TEXT NOT NULL,
    ramadan_start   DATE,
    ramadan_end     DATE,
    eid_fitr_date   DATE,
    eid_adha_date   DATE,
    source          TEXT,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (year, site_name, tz)
);

CREATE TABLE IF NOT EXISTS sun_times_cache (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    site_name       TEXT NOT NULL,
    tz              TEXT NOT NULL,
    sunrise         TEXT,
    sunset          TEXT,
    fajr            TEXT,
    maghrib         TEXT,
    source          TEXT,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (date, site_name, tz)
);
