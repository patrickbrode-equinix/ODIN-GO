/* ================================================ */
/* 018 – ODIN Assignment Engine V2 (Production)     */
/* New: exclusion list, analytics events, user role */
/*      handover_type, scheduled type support       */
/* ================================================ */

-- Add role column to users for assignment role-based filtering
ALTER TABLE users ADD COLUMN IF NOT EXISTS assignment_role VARCHAR(40) NOT NULL DEFAULT 'normal';
-- shift_active: whether user is currently on shift (updated by shift sync)
ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_active BOOLEAN NOT NULL DEFAULT true;

-- Add handover_type to queue_items (workload | terminated | other_teams)
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS handover_type VARCHAR(40);
-- Add assigned_worker_id for live mode assignment tracking
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS assigned_worker_id INT;
-- Add assigned_at for live mode assignment tracking
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- 1. assignment_exclusion_list – system names that bypass auto-assignment
CREATE TABLE IF NOT EXISTS assignment_exclusion_list (
  id          SERIAL PRIMARY KEY,
  system_name TEXT NOT NULL,
  reason      TEXT,
  created_by  VARCHAR(120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(system_name)
);

CREATE INDEX IF NOT EXISTS idx_ael_active ON assignment_exclusion_list(active);

-- 2. assignment_analytics_events – hidden analytics tracking
CREATE TABLE IF NOT EXISTS assignment_analytics_events (
  id          SERIAL PRIMARY KEY,
  event_type  VARCHAR(40) NOT NULL,
  ticket_id   VARCHAR(120),
  worker_id   INT,
  worker_name VARCHAR(120),
  event_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aae_type       ON assignment_analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_aae_worker     ON assignment_analytics_events(worker_id);
CREATE INDEX IF NOT EXISTS idx_aae_created    ON assignment_analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aae_ticket     ON assignment_analytics_events(ticket_id);

-- 3. Seed new settings
INSERT INTO assignment_settings (key, value, description) VALUES
  ('assignment.crawlerMaxAgeMinutes',    '10',    'Max age of crawler data in minutes before engine stops'),
  ('assignment.enableLiveMode',          'false', 'Master switch to allow live assignment mode'),
  ('assignment.insufficientResources',   'false', 'Flag: are resources insufficient (allows CC+TT mixing)')
ON CONFLICT (key) DO NOTHING;

-- Update supported types to include Scheduled
UPDATE assignment_settings
SET value = 'TroubleTicket,SmartHands,CrossConnect,Scheduled,Other'
WHERE key = 'assignment.supportedTicketTypes'
  AND value = 'TroubleTicket,SmartHands,CrossConnect,Other';
