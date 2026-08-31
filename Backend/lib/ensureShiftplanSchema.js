import pool from '../db.js';

let ensurePromise = null;

export async function ensureShiftplanSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const { rows } = await pool.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (
            (table_name = 'shift_definitions' AND column_name = 'series_days')
            OR (table_name = 'shiftplan_exclusions' AND column_name = 'fixed_shift_type')
          )
      `);

      const hasSeriesDays = rows.some((row) => row.table_name === 'shift_definitions' && row.column_name === 'series_days');
      const hasFixedShiftType = rows.some((row) => row.table_name === 'shiftplan_exclusions' && row.column_name === 'fixed_shift_type');

      if (!hasSeriesDays) {
        await pool.query(`
          ALTER TABLE shift_definitions
            ADD COLUMN IF NOT EXISTS series_days SMALLINT NOT NULL DEFAULT 1
        `);
        await pool.query(`
          UPDATE shift_definitions
          SET series_days = CASE
            WHEN code IN ('E1', 'E2', 'L1', 'L2') THEN 5
            WHEN code = 'N' THEN 7
            ELSE series_days
          END
          WHERE code IN ('E1', 'E2', 'L1', 'L2', 'N')
            AND series_days = 1
        `);
      }

      if (!hasFixedShiftType) {
        await pool.query(`
          ALTER TABLE shiftplan_exclusions
            ADD COLUMN IF NOT EXISTS fixed_shift_type VARCHAR(20)
        `);
      }

      await pool.query(`
        ALTER TABLE shift_planning_config
          ADD COLUMN IF NOT EXISTS monthly_target_hours NUMERIC(6,2) NOT NULL DEFAULT 174
      `);

      await pool.query(`
        ALTER TABLE shift_planning_config
          ADD COLUMN IF NOT EXISTS annual_target_hours NUMERIC(7,2) NOT NULL DEFAULT 2088
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS shiftplan_draft_feedback (
          id BIGSERIAL PRIMARY KEY,
          draft_id INTEGER NOT NULL REFERENCES shiftplan_drafts(id) ON DELETE CASCADE,
          employee_name VARCHAR(160) NOT NULL,
          day SMALLINT CHECK (day BETWEEN 1 AND 31),
          suggestion TEXT NOT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'accepted', 'declined', 'resolved')),
          created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_by_name VARCHAR(160) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          reviewed_by VARCHAR(160),
          reviewed_at TIMESTAMPTZ
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_shiftplan_draft_feedback_draft
          ON shiftplan_draft_feedback (draft_id, created_at DESC)
      `);
      await pool.query(`
        ALTER TABLE shiftplan_draft_feedback
          ALTER COLUMN employee_name DROP NOT NULL
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS shiftplan_draft_votes (
          draft_id INTEGER NOT NULL REFERENCES shiftplan_drafts(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          vote VARCHAR(24) NOT NULL CHECK (vote IN ('approve', 'needs_changes')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (draft_id, user_id)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_shiftplan_draft_votes_draft
          ON shiftplan_draft_votes (draft_id, vote)
      `);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  return ensurePromise;
}
