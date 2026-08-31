/* ------------------------------------------------ */
/* 024 – Wunschkollegen (Preferred Colleagues)      */
/* Soft preference: employee-to-employee             */
/* ------------------------------------------------ */

CREATE TABLE IF NOT EXISTS preferred_colleagues (
  id                          SERIAL PRIMARY KEY,
  user_id                     INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferred_employee_name     VARCHAR(120) NOT NULL,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, preferred_employee_name)
);

-- Prevent self-references at application level (employee_name != user's own name)
-- No FK to shifts since employee_name is not a stable PK there

CREATE INDEX IF NOT EXISTS idx_preferred_colleagues_user
  ON preferred_colleagues (user_id);
