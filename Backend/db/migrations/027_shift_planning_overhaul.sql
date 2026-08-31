-- ============================================================
-- 027_shift_planning_overhaul.sql
-- Complete shift planning overhaul: configurable shifts,
-- rotation rules, fairness rules, employee preferences,
-- dedicated shiftplan exclusions, planning config.
-- ============================================================

/* ================================================ */
/* A. SHIFT DEFINITIONS (configurable shift types)  */
/* ================================================ */

CREATE TABLE IF NOT EXISTS shift_definitions (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(10)   NOT NULL UNIQUE,
  name            VARCHAR(60)   NOT NULL,
  short_name      VARCHAR(10)   NOT NULL,
  shift_type      VARCHAR(20)   NOT NULL DEFAULT 'early',  -- early, late, night, free, absent, special
  start_time      TIME,
  end_time        TIME,
  duration_hours  NUMERIC(4,2)  DEFAULT 8.0,
  min_staff       INT           NOT NULL DEFAULT 1,
  max_staff       INT           NOT NULL DEFAULT 5,
  color_hex       VARCHAR(7)    DEFAULT '#3b82f6',
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order      INT           NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed default shift definitions
INSERT INTO shift_definitions (code, name, short_name, shift_type, start_time, end_time, duration_hours, min_staff, max_staff, color_hex, sort_order)
VALUES
  ('E1', 'Frühschicht 1', 'E1', 'early', '06:00', '14:00', 8.0, 1, 5, '#3b82f6', 1),
  ('E2', 'Frühschicht 2', 'E2', 'early', '06:00', '14:00', 8.0, 1, 5, '#60a5fa', 2),
  ('L1', 'Spätschicht 1', 'L1', 'late', '14:00', '22:00', 8.0, 1, 5, '#f59e0b', 3),
  ('L2', 'Spätschicht 2', 'L2', 'late', '14:00', '22:00', 8.0, 1, 5, '#fbbf24', 4),
  ('N',  'Nachtschicht',   'N',  'night', '22:00', '06:00', 8.0, 1, 3, '#8b5cf6', 5)
ON CONFLICT (code) DO NOTHING;

/* ================================================ */
/* B. ROTATION RULES (configurable constraints)     */
/* ================================================ */

CREATE TABLE IF NOT EXISTS shift_rotation_rules (
  id                        SERIAL PRIMARY KEY,
  max_consecutive_same      INT     NOT NULL DEFAULT 5,      -- max same shift type in a row
  max_consecutive_workdays  INT     NOT NULL DEFAULT 6,      -- max workdays in a row
  min_free_after_streak     INT     NOT NULL DEFAULT 1,      -- min free days after max streak
  night_to_early_forbidden  BOOLEAN NOT NULL DEFAULT TRUE,   -- N→E forbidden
  late_to_early_forbidden   BOOLEAN NOT NULL DEFAULT TRUE,   -- L→E next day forbidden
  min_hours_between_shifts  INT     NOT NULL DEFAULT 11,     -- minimum rest hours
  max_nights_per_month      INT     NOT NULL DEFAULT 7,      -- max night shifts per month
  max_weekends_per_month    INT     NOT NULL DEFAULT 2,      -- max weekend shifts per month
  free_days_after_night     INT     NOT NULL DEFAULT 2,
  free_days_after_weekend   INT     NOT NULL DEFAULT 1,
  weekend_rule              VARCHAR(20) DEFAULT 'balanced',  -- balanced, minimize, none
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default rotation rules
INSERT INTO shift_rotation_rules (id, max_consecutive_same, max_consecutive_workdays, min_free_after_streak, night_to_early_forbidden, late_to_early_forbidden, min_hours_between_shifts, max_nights_per_month, max_weekends_per_month, free_days_after_night, free_days_after_weekend, weekend_rule)
VALUES (1, 5, 6, 1, TRUE, TRUE, 11, 7, 2, 2, 1, 'balanced')
ON CONFLICT (id) DO NOTHING;

/* ================================================ */
/* C. FAIRNESS RULES (configurable weights)         */
/* ================================================ */

CREATE TABLE IF NOT EXISTS shift_fairness_rules (
  id                        SERIAL PRIMARY KEY,
  balance_nights            BOOLEAN NOT NULL DEFAULT TRUE,
  balance_weekends          BOOLEAN NOT NULL DEFAULT TRUE,
  balance_total_load        BOOLEAN NOT NULL DEFAULT TRUE,
  max_deviation_percent     INT     NOT NULL DEFAULT 20,     -- max deviation between employees
  fairness_vs_preference    VARCHAR(20) DEFAULT 'fairness',  -- fairness, preference, balanced
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shift_fairness_rules (id, balance_nights, balance_weekends, balance_total_load, max_deviation_percent, fairness_vs_preference)
VALUES (1, TRUE, TRUE, TRUE, 20, 'fairness')
ON CONFLICT (id) DO NOTHING;

/* ================================================ */
/* D. PLANNING CONFIG (weights & global settings)   */
/* ================================================ */

CREATE TABLE IF NOT EXISTS shift_planning_config (
  id                        SERIAL PRIMARY KEY,
  respect_employee_wishes   BOOLEAN NOT NULL DEFAULT TRUE,
  hard_rules_priority       INT     NOT NULL DEFAULT 100,    -- 0-100 weight
  soft_wishes_priority      INT     NOT NULL DEFAULT 50,     -- 0-100 weight
  fairness_priority         INT     NOT NULL DEFAULT 80,     -- 0-100 weight
  admin_override_priority   INT     NOT NULL DEFAULT 90,     -- 0-100 weight
  monthly_target_hours      NUMERIC(6,2) NOT NULL DEFAULT 174,
  planning_mode             VARCHAR(20) DEFAULT 'month',     -- month, year
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shift_planning_config (id, respect_employee_wishes, hard_rules_priority, soft_wishes_priority, fairness_priority, admin_override_priority, monthly_target_hours)
VALUES (1, TRUE, 100, 50, 80, 90, 174)
ON CONFLICT (id) DO NOTHING;

/* ================================================ */
/* E. EMPLOYEE PREFERENCES (full wish system)       */
/* ================================================ */

CREATE TABLE IF NOT EXISTS employee_preferences (
  id                        SERIAL PRIMARY KEY,
  user_id                   INT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferred_shifts          JSONB         DEFAULT '[]'::jsonb,     -- ["E1","E2"]
  unwanted_shifts           JSONB         DEFAULT '[]'::jsonb,     -- ["N"]
  max_nights_per_month      INT           DEFAULT NULL,
  preferred_days            JSONB         DEFAULT '[]'::jsonb,     -- [1,2,3,4,5] (weekdays)
  blocked_days              JSONB         DEFAULT '[]'::jsonb,     -- [6,0] (weekends)
  avoid_colleagues          JSONB         DEFAULT '[]'::jsonb,     -- ["Name1","Name2"]
  workload_preference       VARCHAR(20)   DEFAULT 'normal',        -- light, normal, heavy
  notes                     TEXT,
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_prefs_user ON employee_preferences(user_id);

/* ================================================ */
/* F. SHIFTPLAN EXCLUSIONS (separate from tickets)  */
/* ================================================ */

CREATE TABLE IF NOT EXISTS shiftplan_exclusions (
  id              SERIAL PRIMARY KEY,
  employee_name   VARCHAR(120)  NOT NULL,
  reason          VARCHAR(60)   NOT NULL DEFAULT 'admin_override',
  reason_text     VARCHAR(255),
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by      VARCHAR(120)  NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deactivated_by  VARCHAR(120),
  deactivated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_spe_employee ON shiftplan_exclusions(employee_name);
CREATE INDEX IF NOT EXISTS idx_spe_active   ON shiftplan_exclusions(is_active);

/* ================================================ */
/* G. RBAC: add admin_settings + odin_logic pages   */
/* ================================================ */

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT key, policy FROM groups
  LOOP
    IF r.policy IS NOT NULL THEN
      -- Add odin_logic page access
      IF NOT (r.policy ? 'odin_logic') THEN
        UPDATE groups SET policy = jsonb_set(policy, '{odin_logic}', '"write"'::jsonb) WHERE key = r.key;
      END IF;
      -- Add admin_settings page access
      IF NOT (r.policy ? 'admin_settings') THEN
        UPDATE groups SET policy = jsonb_set(policy, '{admin_settings}', '"write"'::jsonb) WHERE key = r.key;
      END IF;
    END IF;
  END LOOP;
END $$;
