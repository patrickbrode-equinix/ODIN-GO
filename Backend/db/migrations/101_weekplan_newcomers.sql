/* ================================================ */
/* 101 – Weekplan Newcomers (per employee per day)  */
/* Independent of weekplan_roles: an employee can   */
/* be marked "Neueinsteiger" AND have a role.       */
/* ================================================ */

CREATE TABLE IF NOT EXISTS weekplan_newcomers (
  id              SERIAL PRIMARY KEY,
  employee_name   TEXT NOT NULL,
  date            DATE NOT NULL,
  updated_by      TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_name, date)
);

CREATE INDEX IF NOT EXISTS idx_weekplan_newcomers_date ON weekplan_newcomers(date);
CREATE INDEX IF NOT EXISTS idx_weekplan_newcomers_emp  ON weekplan_newcomers(employee_name);
