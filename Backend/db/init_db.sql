-- OES QUEUE SYSTEM SCHEMA --
-- DETECT & RECONSTRUCT STRATEGY --

-- 1. Ensure Extension for UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Queue Items Table
-- Stores the individual tickets/rows from Jarvis
CREATE TABLE IF NOT EXISTS queue_items (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(255) NOT NULL, -- Row ID from Jarvis
    queue_type VARCHAR(50) NOT NULL, -- 'SmartHands', 'TroubleTickets', 'CCInstalls'
    group_key VARCHAR(100), -- For grouping (e.g. "My Tickets", "Unassigned")
    status VARCHAR(50),
    subtype VARCHAR(100),
    owner VARCHAR(100),
    sched_start TIMESTAMP,
    commit_date TIMESTAMP,
    revised_commit_date TIMESTAMP,
    account VARCHAR(255),
    system_name VARCHAR(255),
    details JSONB DEFAULT '{}', -- Flexible storage for extra columns
    active BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint: Only one entry per external_id per queue_type
    CONSTRAINT uk_queue_items_external_type UNIQUE (external_id, queue_type)
);

-- MIGRATION: Ensure last_seen exists (fix for legacy schema collision)
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS account VARCHAR(255);
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_queue_items_active_type ON queue_items(active, queue_type);
CREATE INDEX IF NOT EXISTS idx_queue_items_owner ON queue_items(owner);
CREATE INDEX IF NOT EXISTS idx_queue_items_last_seen ON queue_items(last_seen);

-- 3. Snapshots Table
-- Stores the high-level result of a scrape
CREATE TABLE IF NOT EXISTS snapshots (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    queue_type VARCHAR(50) NOT NULL,
    expected_count INTEGER, -- From Top-Card / Header
    actual_count INTEGER, -- Actual rows scraped
    missing_count INTEGER GENERATED ALWAYS AS (expected_count - actual_count) STORED,
    complete BOOLEAN NOT NULL DEFAULT FALSE,
    raw_data JSONB -- WARNING: Can be large, use carefully. Maybe store only summary or error logs here.
);

CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp DESC);

-- 4. Queue Config / Meta (Optional, for now hardcoded in code but good to have)
CREATE TABLE IF NOT EXISTS queue_config (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB
);

-- Initial Config
INSERT INTO queue_config (key, value) VALUES 
('refresh_rate_sec', '300')
ON CONFLICT (key) DO NOTHING;
