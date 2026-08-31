/* ================================================ */
/* 019 – Weekplan Roles (per employee per day)      */
/* Stores role assignments made in the Wochenplan.  */
/* Used by both Wochenplan and Dashboard views.     */
/* ================================================ */

CREATE TABLE IF NOT EXISTS weekplan_roles (
  id              SERIAL PRIMARY KEY,
  employee_name   TEXT NOT NULL,
  date            DATE NOT NULL,
  role_key        VARCHAR(40) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      VARCHAR(120),
  UNIQUE(employee_name, date)
);

CREATE INDEX IF NOT EXISTS idx_weekplan_roles_emp   ON weekplan_roles(employee_name);
CREATE INDEX IF NOT EXISTS idx_weekplan_roles_date  ON weekplan_roles(date);
CREATE INDEX IF NOT EXISTS idx_weekplan_roles_role  ON weekplan_roles(role_key);
