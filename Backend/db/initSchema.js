/* ------------------------------------------------ */
/* DB INIT – SCHEMA / SEED (GROUPS + ACCESS)        */
/* ------------------------------------------------ */
/**
 * Ziel:
 * - Minimaler "Schema-Bootstrap" ohne Migrations-Framework.
 * - Erstellt Tabellen, falls sie noch nicht existieren.
 * - Seedet Default-Gruppen + Default-Policy.
 * - Stellt sicher: users.access_override (Defaults + Overrides)
 *
 * Wichtig (Cleanup):
 * - Group/Department Keys sind canonical als "kebab-case" (z.B. c-ops).
 * - Legacy "_" Keys (z.B. c_ops) werden beim Start automatisch migriert.
 *
 * Fix:
 * - In alten Ständen war users.user_group (und teils department) als ENUM angelegt.
 * - ENUM blockiert neue Keys wie "c-ops".
 * - Daher migrieren wir diese Spalten beim Start einmalig auf VARCHAR(64).
 */

import db from "../db.js";

/* ------------------------------------------------ */
/* CONSTANTS                                        */
/* ------------------------------------------------ */

/* 🔑 FINAL: NUR NOCH DIESE LEVEL */
export const ACCESS_LEVELS = ["none", "view", "write"];

// Die Page Keys müssen 1:1 zu frontend/src/config/navigation.ts passen.
const DEFAULT_POLICY = {
  dashboard: "view",
  shiftplan: "view",
  handover: "view",
  tickets: "view",
  commit_dashboard: "none",
  dispatcher_console: "none",
  tv_dashboard: "view",
  odin_logic: "view",
  settings: "view",
  user_management: "none",
  ticket_audit: "none",
};

const DEFAULT_GROUPS = [
  { key: "c-ops", label: "C-OPS Team" },
  { key: "f-ops", label: "F-OPS Team" },
  { key: "other", label: "Other Team" },
];

/* ------------------------------------------------ */
/* KEY NORMALIZATION                                */
/* ------------------------------------------------ */
/**
 * Normalisiert Group/Department Keys auf kebab-case.
 */
export function normalizeGroupKey(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  return key || "other";
}

/* ------------------------------------------------ */
/* INTERNAL MIGRATION (GROUP KEYS)                  */
/* ------------------------------------------------ */

async function migrateGroupKeysToKebabCase() {
  const groups = await db.query(
    `SELECT key, label, policy FROM groups ORDER BY key ASC`
  );

  for (const g of groups.rows) {
    const from = String(g.key || "");
    const to = normalizeGroupKey(from);

    if (!from || to === from) continue;
    if (!from.includes("_")) continue;

    const existsTo = await db.query(
      `SELECT 1 FROM groups WHERE key = $1`,
      [to]
    );

    /* 🔒 Policy defensiv normalisieren */
    const sanitizedPolicy = {};
    for (const [k, v] of Object.entries(g.policy || {})) {
      sanitizedPolicy[k] = v === "view" || v === "write" ? v : "none";
    }

    if (existsTo.rowCount === 0) {
      await db.query(
        `
        INSERT INTO groups (key, label, policy)
        VALUES ($1,$2,$3::jsonb)
        `,
        [to, g.label, JSON.stringify(sanitizedPolicy)]
      );
    }

    await db.query(
      `UPDATE users SET user_group = $1 WHERE user_group = $2`,
      [to, from]
    );

    await db.query(
      `UPDATE users SET department = $1 WHERE department = $2`,
      [to, from]
    );

    await db.query(`DELETE FROM groups WHERE key = $1`, [from]);
  }

  await db.query(
    `UPDATE users SET user_group = replace(user_group,'_','-')
     WHERE user_group IS NOT NULL AND position('_' in user_group) > 0`
  );

  await db.query(
    `UPDATE users SET department = replace(department,'_','-')
     WHERE department IS NOT NULL AND position('_' in department) > 0`
  );

  await db.query(
    `
    UPDATE users
    SET department = user_group
    WHERE department IS NULL OR department = ''
    `
  );
}

/* ------------------------------------------------ */
/* ENUM → VARCHAR MIGRATION (USERS)                 */
/* ------------------------------------------------ */

async function ensureUsersGroupColumnsAreText() {
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = 'users'
      ) THEN

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'users'
            AND column_name  = 'user_group'
            AND data_type    = 'USER-DEFINED'
        ) THEN
          ALTER TABLE users
            ALTER COLUMN user_group TYPE VARCHAR(64)
            USING user_group::text;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'users'
            AND column_name  = 'department'
            AND data_type    = 'USER-DEFINED'
        ) THEN
          ALTER TABLE users
            ALTER COLUMN department TYPE VARCHAR(64)
            USING department::text;
        END IF;

      END IF;
    END $$;
  `);
}

/* ------------------------------------------------ */
/* INIT                                             */
/* ------------------------------------------------ */

export async function initSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS groups (
      key        VARCHAR(64) PRIMARY KEY,
      label      VARCHAR(120) NOT NULL,
      policy     JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_groups_updated_at'
      ) THEN
        CREATE TRIGGER trg_groups_updated_at
        BEFORE UPDATE ON groups
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
      END IF;
    END $$;
  `);


  /* ------------------------------------------------ */
  /* CORE TABLES (users, shifts, handover, commit)    */
  /* + Brodinho Queue (queue_items)                   */
  /* ------------------------------------------------ */

  await db.query(`
  /* USERS */
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(80),
    last_name  VARCHAR(80),
    employee_id TEXT,
    entra_object_id TEXT,
    upn TEXT,
    username   VARCHAR(80),
    email      VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    approved   BOOLEAN NOT NULL DEFAULT false,
    is_root    BOOLEAN NOT NULL DEFAULT false,
    user_group VARCHAR(64) NOT NULL DEFAULT 'c-ops',
    department VARCHAR(64) NOT NULL DEFAULT 'c-ops',
    ibx        VARCHAR(64) NOT NULL DEFAULT 'FR2',
    shiftplan_manual BOOLEAN NOT NULL DEFAULT false,
    access_override JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE users ADD COLUMN IF NOT EXISTS shiftplan_manual BOOLEAN NOT NULL DEFAULT false;

  /* USER SETTINGS */
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, key)
  );

  /* SHIFTS – month schedule cells */
  CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    month VARCHAR(16) NOT NULL,
    employee_name VARCHAR(120) NOT NULL,
    day INT NOT NULL CHECK (day >= 1 AND day <= 31),
    shift_code VARCHAR(16) NOT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'import',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(month, employee_name, day)
  );
  ALTER TABLE shifts ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'import';
  CREATE INDEX IF NOT EXISTS idx_shifts_month ON shifts(month);
  CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts(employee_name);

  CREATE TABLE IF NOT EXISTS manual_shiftplan_employees (
    id SERIAL PRIMARY KEY,
    month VARCHAR(16) NOT NULL,
    employee_name VARCHAR(120) NOT NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(month, employee_name)
  );
  CREATE INDEX IF NOT EXISTS idx_manual_shiftplan_employees_month ON manual_shiftplan_employees(month);
  CREATE INDEX IF NOT EXISTS idx_manual_shiftplan_employees_name ON manual_shiftplan_employees(employee_name);

  /* EMPLOYEE CONTACTS – E-Mail-Pflege für Teams-Bot und Benachrichtigungen */
  CREATE TABLE IF NOT EXISTS employee_contacts (
    id SERIAL PRIMARY KEY,
    employee_name VARCHAR(120) NOT NULL UNIQUE,
    employee_id TEXT,
    entra_object_id TEXT,
    upn TEXT,
    email VARCHAR(255),
    email_source VARCHAR(20) NOT NULL DEFAULT 'generated',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_employee_contacts_name ON employee_contacts(employee_name);
  CREATE INDEX IF NOT EXISTS idx_employee_contacts_employee_id ON employee_contacts(LOWER(employee_id)) WHERE employee_id IS NOT NULL AND TRIM(employee_id) <> '';

  /* HANDOVER */
  CREATE TABLE IF NOT EXISTS handover (
    id SERIAL PRIMARY KEY,
    ticketnumber TEXT,
    customername TEXT,
    priority TEXT,
    area TEXT,
    description TEXT,
    commitdate TEXT,
    committime TEXT,
    status TEXT,
    createdby TEXT,
    takenby TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS handover_files (
    id SERIAL PRIMARY KEY,
    handover_id INT NOT NULL REFERENCES handover(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  /* COMMIT DASHBOARD */
  CREATE TABLE IF NOT EXISTS commit_imports (
    id SERIAL PRIMARY KEY,
    row_count INT NOT NULL DEFAULT 0,
    data JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS commit_subtypes (
    key TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    is_new BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS commit_saved_filters (
    id SERIAL PRIMARY KEY,
    label TEXT UNIQUE NOT NULL,
    rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  /* BRODINHO QUEUE (tickets) */
  CREATE TABLE IF NOT EXISTS queue_items (
    id SERIAL PRIMARY KEY,
    external_id TEXT UNIQUE NOT NULL,
    group_key TEXT NOT NULL,
    queue_type TEXT,
    so_number TEXT,
    status TEXT,
    owner TEXT,
    severity TEXT,
    commit_date TIMESTAMPTZ,
    revised_commit_date TIMESTAMPTZ,
    dispatch_date TIMESTAMPTZ,
    sched_start TIMESTAMPTZ,
    remaining_time_text TEXT,
    remaining_hours NUMERIC,
    subtype TEXT,
    system_name TEXT,
    account_name TEXT,
    customer_trouble_type TEXT,
    is_tfm BOOLEAN NOT NULL DEFAULT false,
    excel_seen_at TIMESTAMPTZ,
    jarvis_seen_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_queue_group ON queue_items(group_key);
  CREATE INDEX IF NOT EXISTS idx_queue_commit ON queue_items(commit_date);
  CREATE INDEX IF NOT EXISTS idx_queue_revised ON queue_items(revised_commit_date);

  /* BRODINHO QUEUE EXTENSIONS (delta/archiving/run-logs) */
  DO $$
  BEGIN
    -- Replace legacy UNIQUE(external_id) with UNIQUE(queue_type, external_id)
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'queue_items_external_id_key'
        AND conrelid = 'queue_items'::regclass
    ) THEN
      ALTER TABLE queue_items DROP CONSTRAINT queue_items_external_id_key;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'queue_items_queue_type_external_id_key'
        AND conrelid = 'queue_items'::regclass
    ) THEN
      ALTER TABLE queue_items
        ADD CONSTRAINT queue_items_queue_type_external_id_key UNIQUE (queue_type, external_id);
    END IF;
  END $$;

  -- Add missing columns (idempotent)
  ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS raw_json JSONB;
  ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS missing_count INT NOT NULL DEFAULT 0;
  ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
  ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS inactive_reason TEXT;
  ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS is_final_closed BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

  CREATE INDEX IF NOT EXISTS idx_queue_active_group ON queue_items(active, group_key);
  CREATE INDEX IF NOT EXISTS idx_queue_owner ON queue_items(owner);
  CREATE INDEX IF NOT EXISTS idx_queue_active_final ON queue_items(active, is_final_closed);

  CREATE TABLE IF NOT EXISTS expired_tickets (
    id SERIAL PRIMARY KEY,
    queue_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    group_name TEXT,
    owner TEXT,
    status TEXT,
    commit_date TIMESTAMPTZ,
    revised_commit_date TIMESTAMPTZ,
    remaining_time_text TEXT,
    first_seen_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(queue_type, external_id)
  );

  /* Migrate legacy UNIQUE(external_id) → UNIQUE(queue_type, external_id) on expired_tickets */
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'expired_tickets_external_id_key'
        AND conrelid = 'expired_tickets'::regclass
    ) THEN
      ALTER TABLE expired_tickets DROP CONSTRAINT expired_tickets_external_id_key;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'expired_tickets_queue_type_external_id_key'
        AND conrelid = 'expired_tickets'::regclass
    ) THEN
      ALTER TABLE expired_tickets
        ADD CONSTRAINT expired_tickets_queue_type_external_id_key UNIQUE (queue_type, external_id);
    END IF;
  END $$;

  CREATE INDEX IF NOT EXISTS idx_expired_resolved ON expired_tickets(resolved_at);
  CREATE INDEX IF NOT EXISTS idx_expired_group ON expired_tickets(group_name);

  CREATE TABLE IF NOT EXISTS crawler_runs (
    id SERIAL PRIMARY KEY,
    snapshot_at TIMESTAMPTZ NOT NULL,
    complete_types_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_active INT NOT NULL DEFAULT 0,
    new_count INT NOT NULL DEFAULT 0,
    gone_count INT NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS crawler_run_deltas (
    id SERIAL PRIMARY KEY,
    run_id INT NOT NULL REFERENCES crawler_runs(id) ON DELETE CASCADE,
    delta_type TEXT NOT NULL CHECK (delta_type IN ('NEW','GONE')),
    queue_type TEXT,
    external_id TEXT,
    group_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_crawler_deltas_run ON crawler_run_deltas(run_id);



  /* ACTIVITY LOG */
  CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id INT,
    actor_name VARCHAR(120),
    action_type VARCHAR(64) NOT NULL,
    module VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64),
    entity_id VARCHAR(64),
    correlation_id VARCHAR(64),
    payload JSONB DEFAULT '{}'::jsonb
  );
  CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(ts);
  CREATE INDEX IF NOT EXISTS idx_activity_module ON activity_log(module);

  /* KIOSK MESSAGES */
  CREATE TABLE IF NOT EXISTS kiosk_messages (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
    active BOOLEAN NOT NULL DEFAULT true,
    start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_at TIMESTAMPTZ,
    recurrence VARCHAR(32) DEFAULT 'ONCE_PER_SHIFT',
    created_by VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS kiosk_message_acks (
    id SERIAL PRIMARY KEY,
    message_id INT NOT NULL REFERENCES kiosk_messages(id) ON DELETE CASCADE,
    user_id_or_name VARCHAR(120) NOT NULL,
    shift_code VARCHAR(16) NOT NULL,
    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(message_id, user_id_or_name, shift_code)
  );

  /* WELLBEING & FAIRNESS */
  /* Config (Global or per scope) */
  CREATE TABLE IF NOT EXISTS wellbeing_config (
    id SERIAL PRIMARY KEY,
    scope TEXT UNIQUE NOT NULL DEFAULT 'global',
    night_threshold INT NOT NULL DEFAULT 4,
    weekend_threshold INT NOT NULL DEFAULT 2,
    streak_threshold INT NOT NULL DEFAULT 7,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(120)
  );

  /* Metrics (calculated per employee/month) */
  CREATE TABLE IF NOT EXISTS wellbeing_metrics (
    id SERIAL PRIMARY KEY,
    employee_name VARCHAR(120) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    night_count INT NOT NULL DEFAULT 0,
    weekend_count INT NOT NULL DEFAULT 0,
    early_count INT NOT NULL DEFAULT 0, -- [NEW]
    late_count INT NOT NULL DEFAULT 0, -- [NEW]
    max_streak INT NOT NULL DEFAULT 0,
    score INT NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_name, year, month)
  );
  CREATE INDEX IF NOT EXISTS idx_wellbeing_emp ON wellbeing_metrics(employee_name);
  CREATE INDEX IF NOT EXISTS idx_wellbeing_date ON wellbeing_metrics(year, month);

  /* SHIFT RULES (REST TIME & HARD CHANGES) */
  CREATE TABLE IF NOT EXISTS shift_rules_config (
    id SERIAL PRIMARY KEY,
    scope TEXT UNIQUE NOT NULL DEFAULT 'global',
    min_rest_hours INT NOT NULL DEFAULT 11,
    hard_change_pairs JSONB NOT NULL DEFAULT '[["L","E"], ["N","E"]]'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(120)
  );

  CREATE TABLE IF NOT EXISTS shift_violations (
    id SERIAL PRIMARY KEY,
    employee_name VARCHAR(120) NOT NULL,
    date DATE NOT NULL,
    violation_type VARCHAR(32) NOT NULL, -- 'REST', 'HARD_CHANGE'
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_name, date, violation_type)
  );
  CREATE INDEX IF NOT EXISTS idx_violations_emp ON shift_violations(employee_name);
  CREATE INDEX IF NOT EXISTS idx_violations_date ON shift_violations(date);

  /* SKILLS & COVERAGE */
  CREATE TABLE IF NOT EXISTS employee_skills (
    employee_name VARCHAR(120) PRIMARY KEY,
    can_sh BOOLEAN NOT NULL DEFAULT false,
    can_tt BOOLEAN NOT NULL DEFAULT false,
    can_cc BOOLEAN NOT NULL DEFAULT false,
    rated_skills JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS coverage_rules (
    shift_type VARCHAR(16) PRIMARY KEY, -- e.g. 'E', 'L', 'N'
    min_sh INT NOT NULL DEFAULT 0,
    min_tt INT NOT NULL DEFAULT 0,
    min_cc INT NOT NULL DEFAULT 0
  );
  -- Seed Defaults if empty
  INSERT INTO coverage_rules (shift_type, min_sh, min_tt, min_cc)
  VALUES
    ('E', 1, 1, 1),
    ('L', 1, 1, 0),
    ('N', 1, 0, 0)
  ON CONFLICT DO NOTHING;

  /* COVERAGE VIOLATIONS */
  CREATE TABLE IF NOT EXISTS coverage_violations (
    date         DATE NOT NULL,
    shift_type   VARCHAR(10) NOT NULL,
    missing      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date, shift_type)
  );

  /* STAFFING RULES (Minimum Headcount) */
  CREATE TABLE IF NOT EXISTS staffing_rules (
    shift_type   VARCHAR(10) PRIMARY KEY,
    min_count    INTEGER NOT NULL DEFAULT 0
  );

  /* STAFFING RESULTS (Daily Status) */
  CREATE TABLE IF NOT EXISTS staffing_results (
    date         DATE NOT NULL,
    shift_type   VARCHAR(10) NOT NULL,
    actual       INTEGER NOT NULL DEFAULT 0,
    min          INTEGER NOT NULL DEFAULT 0,
    status       VARCHAR(10) NOT NULL DEFAULT 'OK',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date, shift_type)
  );

/* YEAR PLANNING 2027 */
CREATE TABLE IF NOT EXISTS year_plan_2027 (
  id SERIAL PRIMARY KEY,
  employee_name VARCHAR(120) NOT NULL,
  date DATE NOT NULL,
  shift_code VARCHAR(16) NOT NULL,
  week_number INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_name, date)
);
CREATE INDEX IF NOT EXISTS idx_yp27_emp ON year_plan_2027(employee_name);
CREATE INDEX IF NOT EXISTS idx_yp27_date ON year_plan_2027(date);

/* DASHBOARD INFO */
CREATE TABLE IF NOT EXISTS dashboard_info (
  id SERIAL PRIMARY KEY,
  content TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(120)
);
/* Seed default logic handled in code, but ensuring we can query it */

/* FEATURE TOGGLES */
CREATE TABLE IF NOT EXISTS feature_toggles (
  key VARCHAR(64) PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(120)
);

/* TICKET HANDOVERS (Quick Handover from Tickets context menu) */
CREATE TABLE IF NOT EXISTS ticket_handovers (
  id SERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Workload','Terminiert','Other Teams')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  status TEXT NOT NULL DEFAULT 'open'
);

/* DASHBOARD INFO ENTRIES (multi-entry important info) */
CREATE TABLE IF NOT EXISTS dashboard_info_entries (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

/* UPDATED_AT TRIGGERS */
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $f$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $f$ LANGUAGE plpgsql;
    END IF;
  END $$;

  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_users_updated_at') THEN
      CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='shifts')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_shifts_updated_at') THEN
      CREATE TRIGGER trg_shifts_updated_at BEFORE UPDATE ON shifts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='handover')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_handover_updated_at') THEN
      CREATE TRIGGER trg_handover_updated_at BEFORE UPDATE ON handover
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='queue_items')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_queue_items_updated_at') THEN
      CREATE TRIGGER trg_queue_items_updated_at BEFORE UPDATE ON queue_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='commit_saved_filters')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_commit_saved_filters_updated_at') THEN
      CREATE TRIGGER trg_commit_saved_filters_updated_at BEFORE UPDATE ON commit_saved_filters
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='kiosk_messages')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_kiosk_messages_updated_at') THEN
      CREATE TRIGGER trg_kiosk_messages_updated_at BEFORE UPDATE ON kiosk_messages
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$;
`);

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_rotation_rules') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_rotation_rules' AND column_name = 'free_days_after_night') THEN
          ALTER TABLE shift_rotation_rules ADD COLUMN free_days_after_night INT NOT NULL DEFAULT 2;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_rotation_rules' AND column_name = 'free_days_after_weekend') THEN
          ALTER TABLE shift_rotation_rules ADD COLUMN free_days_after_weekend INT NOT NULL DEFAULT 2;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_rotation_rules' AND column_name = 'night_next_workday') THEN
          ALTER TABLE shift_rotation_rules ADD COLUMN night_next_workday SMALLINT NOT NULL DEFAULT 4;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_rotation_rules' AND column_name = 'night_next_shift_code') THEN
          ALTER TABLE shift_rotation_rules ADD COLUMN night_next_shift_code VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_rotation_rules' AND column_name = 'late_before_night_required') THEN
          ALTER TABLE shift_rotation_rules ADD COLUMN late_before_night_required BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_planning_config') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_planning_config' AND column_name = 'monthly_target_hours') THEN
          ALTER TABLE shift_planning_config ADD COLUMN monthly_target_hours NUMERIC(6,2) NOT NULL DEFAULT 174;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_planning_config' AND column_name = 'annual_target_hours') THEN
          ALTER TABLE shift_planning_config ADD COLUMN annual_target_hours NUMERIC(7,2) NOT NULL DEFAULT 2088;
        END IF;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'jarvis_display_name') THEN
          ALTER TABLE users ADD COLUMN jarvis_display_name VARCHAR(120);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'jarvis_display_name_aliases') THEN
          ALTER TABLE users ADD COLUMN jarvis_display_name_aliases JSONB NOT NULL DEFAULT '[]'::jsonb;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'jarvis_initials') THEN
          ALTER TABLE users ADD COLUMN jarvis_initials VARCHAR(10);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'jarvis_owner_code') THEN
          ALTER TABLE users ADD COLUMN jarvis_owner_code VARCHAR(40);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'queue_eligibility') THEN
          ALTER TABLE users ADD COLUMN queue_eligibility JSONB NOT NULL DEFAULT '{}'::jsonb;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_sick') THEN
          ALTER TABLE users ADD COLUMN is_sick BOOLEAN NOT NULL DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'assignment_eligible') THEN
          ALTER TABLE users ADD COLUMN assignment_eligible BOOLEAN NOT NULL DEFAULT true;
        END IF;
      END IF;
    END $$;
  `);

  for (const g of DEFAULT_GROUPS) {
    await db.query(
      `
      INSERT INTO groups (key, label, policy)
      VALUES ($1,$2,$3::jsonb)
      ON CONFLICT (key) DO NOTHING
      `,
      [
        normalizeGroupKey(g.key),
        g.label,
        JSON.stringify(DEFAULT_POLICY),
      ]
    );
  }

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = 'users'
      ) THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'users'
            AND column_name  = 'access_override'
        ) THEN
          ALTER TABLE users
            ADD COLUMN access_override JSONB NOT NULL DEFAULT '{}'::jsonb;
        END IF;
      END IF;
    END $$;
  `);

  await ensureUsersGroupColumnsAreText();
  await migrateGroupKeysToKebabCase();

  /* AUTO-DELETE COLUMN + TYPE COLUMN + HANDOVER MIGRATIONS */
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dashboard_info_entries') THEN
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dashboard_info_entries' AND column_name = 'delete_at') THEN
          ALTER TABLE dashboard_info_entries ADD COLUMN delete_at TIMESTAMPTZ;
          CREATE INDEX IF NOT EXISTS idx_dashboard_info_entries_delete_at ON dashboard_info_entries(delete_at);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dashboard_info_entries' AND column_name = 'type') THEN
          ALTER TABLE dashboard_info_entries ADD COLUMN type TEXT NOT NULL DEFAULT 'info';
          CREATE INDEX IF NOT EXISTS idx_dashboard_info_entries_type ON dashboard_info_entries(type);
        END IF;

      END IF;

      /* HANDOVER MIGRATION */
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'handover') THEN
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handover' AND column_name = 'type') THEN
          ALTER TABLE handover ADD COLUMN type TEXT NOT NULL DEFAULT 'Workload';
        END IF;

        /* New Columns for Strict Requirements */
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handover' AND column_name = 'ticket_type') THEN
          ALTER TABLE handover ADD COLUMN ticket_type TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handover' AND column_name = 'activity') THEN
          ALTER TABLE handover ADD COLUMN activity TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handover' AND column_name = 'system_name') THEN
          ALTER TABLE handover ADD COLUMN system_name TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handover' AND column_name = 'remaining_time') THEN
          ALTER TABLE handover ADD COLUMN remaining_time TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handover' AND column_name = 'start_datetime') THEN
          ALTER TABLE handover ADD COLUMN start_datetime TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handover' AND column_name = 'target_team') THEN
          ALTER TABLE handover ADD COLUMN target_team TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handover' AND column_name = 'assignee_name') THEN
          ALTER TABLE handover ADD COLUMN assignee_name TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handover' AND column_name = 'due_datetime') THEN
          ALTER TABLE handover ADD COLUMN due_datetime TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handover' AND column_name = 'recurrence') THEN
          ALTER TABLE handover ADD COLUMN recurrence TEXT;
        END IF;


        /* Add common indexes if missing */
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'handover' AND indexname = 'idx_handover_ticket') THEN
            CREATE INDEX idx_handover_ticket ON handover(ticketnumber);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'handover' AND indexname = 'idx_handover_created') THEN
            CREATE INDEX idx_handover_created ON handover(created_at);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'handover' AND indexname = 'idx_handover_type') THEN
            CREATE INDEX idx_handover_type ON handover(type);
        END IF;

      END IF;
    END $$;
  `);

  /* ------------------------------------------------ */
  /* USERS: ADD last_login IF MISSING (idempotent)    */
  /* ------------------------------------------------ */
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
  `);

  /* ------------------------------------------------ */
  /* ODIN ASSIGNMENT ENGINE – SCHEMA                  */
  /* ------------------------------------------------ */

  await db.query(`
    /* ── Employee Shift Roles ─────────────────────── */
    /* Maps employee + date + shift to an operational role */
    CREATE TABLE IF NOT EXISTS employee_shift_roles (
      id SERIAL PRIMARY KEY,
      employee_name VARCHAR(120) NOT NULL,
      date DATE NOT NULL,
      shift_code VARCHAR(16) NOT NULL,
      role_code VARCHAR(32) NOT NULL,
      comment TEXT,
      created_by VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(employee_name, date, role_code)
    );
    CREATE INDEX IF NOT EXISTS idx_esr_emp_date ON employee_shift_roles(employee_name, date);
    CREATE INDEX IF NOT EXISTS idx_esr_role ON employee_shift_roles(role_code);

    /* ── Manual Exclusions (System Names) ─────────── */
    /* Tickets with these system_names are blocked from auto-assignment */
    CREATE TABLE IF NOT EXISTS manual_exclusions (
      id SERIAL PRIMARY KEY,
      system_name VARCHAR(255) NOT NULL UNIQUE,
      reason TEXT,
      created_by VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_manual_excl_sysname ON manual_exclusions(system_name);

    /* ── Subtype Exclusions (customer_trouble_type) ── */
    /* Tickets with these subtypes are blocked from auto-assignment */
    CREATE TABLE IF NOT EXISTS subtype_exclusions (
      id SERIAL PRIMARY KEY,
      subtype VARCHAR(255) NOT NULL UNIQUE,
      reason TEXT,
      created_by VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_subtype_excl_subtype ON subtype_exclusions(subtype);

    /* ── Assignment Runs (Shadow + Live) ──────────── */
    CREATE TABLE IF NOT EXISTS assignment_runs (
      id SERIAL PRIMARY KEY,
      mode VARCHAR(16) NOT NULL DEFAULT 'shadow',
      status VARCHAR(16) NOT NULL DEFAULT 'running',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      trigger_type VARCHAR(32) NOT NULL DEFAULT 'manual',
      crawler_snapshot_at TIMESTAMPTZ,
      total_tickets INT NOT NULL DEFAULT 0,
      assigned_count INT NOT NULL DEFAULT 0,
      skipped_count INT NOT NULL DEFAULT 0,
      error_count INT NOT NULL DEFAULT 0,
      config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_message TEXT,
      created_by VARCHAR(120)
    );
    CREATE INDEX IF NOT EXISTS idx_arun_started ON assignment_runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_arun_mode ON assignment_runs(mode);

    /* ── Assignment Decisions (per ticket per run) ── */
    CREATE TABLE IF NOT EXISTS assignment_decisions (
      id SERIAL PRIMARY KEY,
      run_id INT NOT NULL REFERENCES assignment_runs(id) ON DELETE CASCADE,
      ticket_external_id TEXT NOT NULL,
      queue_type TEXT NOT NULL,
      system_name TEXT,
      priority_score INT NOT NULL DEFAULT 0,
      priority_reason TEXT NOT NULL DEFAULT '',
      assigned_to VARCHAR(120),
      decision_type VARCHAR(32) NOT NULL,
      candidates_evaluated JSONB NOT NULL DEFAULT '[]'::jsonb,
      exclusion_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
      deciding_rule TEXT,
      explanation TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_adec_run ON assignment_decisions(run_id);
    CREATE INDEX IF NOT EXISTS idx_adec_ticket ON assignment_decisions(ticket_external_id);
    CREATE INDEX IF NOT EXISTS idx_adec_assigned ON assignment_decisions(assigned_to);

    /* ── Assignment Engine Config ─────────────────── */
    CREATE TABLE IF NOT EXISTS assignment_config (
      key VARCHAR(64) PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by VARCHAR(120)
    );
    -- Seed defaults
    INSERT INTO assignment_config (key, value) VALUES
      ('engine_mode', '"shadow"'),
      ('stale_threshold_minutes', '10'),
      ('max_tickets_per_person_sh', '3'),
      ('similar_remaining_hours_threshold', '6'),
      ('enabled', 'false')
    ON CONFLICT (key) DO NOTHING;
  `);
}

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

export async function getGroups() {
  const result = await db.query(
    `SELECT key, label, policy, updated_at AS "updatedAt"
     FROM groups ORDER BY key ASC`
  );
  return result.rows;
}

export async function getGroupPolicy(groupKey) {
  const key = normalizeGroupKey(groupKey);
  const result = await db.query(
    `SELECT policy FROM groups WHERE key = $1`,
    [key]
  );
  if (result.rowCount === 0) return null;

  /* 🔒 Immer nur gültige Level zurückgeben */
  const sanitized = {};
  for (const [k, v] of Object.entries(result.rows[0].policy || {})) {
    sanitized[k] = v === "view" || v === "write" ? v : "none";
  }

  return sanitized;
}

export async function groupExists(groupKey) {
  const key = normalizeGroupKey(groupKey);
  const result = await db.query(
    `SELECT 1 FROM groups WHERE key = $1`,
    [key]
  );
  return result.rowCount > 0;
}
