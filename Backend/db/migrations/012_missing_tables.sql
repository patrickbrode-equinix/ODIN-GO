-- Migration 012: Missing tables for absences, constraints, shift audit log, snapshots
-- These tables are referenced in routes but were never created in any previous migration.
-- Missing tables caused 500 errors on: POST /api/schedules/import, /api/absences/*,
-- /api/constraints/*, /api/queue (snapshot), /api/reports/*

-- Absence management
CREATE TABLE IF NOT EXISTS absences (
    id              SERIAL PRIMARY KEY,
    employee_name   TEXT NOT NULL,
    employee_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    type            TEXT NOT NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_absences_employee ON absences(employee_name);
CREATE INDEX IF NOT EXISTS idx_absences_dates ON absences(start_date, end_date);

-- Absence vs shift conflict tracking
CREATE TABLE IF NOT EXISTS absence_conflicts (
    id              SERIAL PRIMARY KEY,
    employee_name   TEXT NOT NULL,
    date            DATE NOT NULL,
    conflict_type   TEXT NOT NULL,
    details         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (employee_name, date, conflict_type)
);

-- Per-employee schedule constraints (no-night, max-weekends, etc.)
CREATE TABLE IF NOT EXISTS employee_constraints (
    id              SERIAL PRIMARY KEY,
    employee_name   TEXT NOT NULL UNIQUE,
    constraints     JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraint rule violations per month
CREATE TABLE IF NOT EXISTS constraint_violations (
    id              SERIAL PRIMARY KEY,
    employee_name   TEXT NOT NULL,
    date            DATE,
    month           TEXT NOT NULL,
    constraint_key  TEXT NOT NULL,
    details         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_constraint_violations_month ON constraint_violations(month);

-- Shift change audit log (populated by POST /api/schedules/import)
CREATE TABLE IF NOT EXISTS shift_change_log (
    id              SERIAL PRIMARY KEY,
    employee_name   TEXT NOT NULL,
    date            DATE NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    changed_by      TEXT,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_change_log_date ON shift_change_log(date);
CREATE INDEX IF NOT EXISTS idx_shift_change_log_employee ON shift_change_log(employee_name);

-- Queue snapshots (used by /api/queue for history tracking)
CREATE TABLE IF NOT EXISTS snapshots (
    id              SERIAL PRIMARY KEY,
    queue_type      TEXT NOT NULL,
    expected_count  INTEGER,
    actual_count    INTEGER,
    complete        BOOLEAN,
    raw_data        JSONB,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
