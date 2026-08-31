/* ------------------------------------------------ */
/* FAIRNESS SETTINGS – admin-only CRUD              */
/* ------------------------------------------------ */

import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePageAccess } from '../middleware/requirePageAccess.js';

const router = Router();
router.use(requireAuth);
router.use(requirePageAccess('odin_logic', 'write'));

/* GET current settings */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM fairness_settings ORDER BY id LIMIT 1');
    res.json({ ok: true, settings: rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* PUT update settings */
router.put('/', async (req, res) => {
  try {
    const {
      consecutive_category_limit,
      fair_distribution_mode,
      tie_breaker_strategy,
      last_assignment_memory_days,
      variety_weight,
    } = req.body;

    const VALID_MODES = ['strict', 'balanced', 'relaxed'];
    const VALID_STRATEGIES = ['random', 'round_robin', 'least_recent'];

    const safeLimit = Math.max(0, Math.min(50, parseInt(consecutive_category_limit) || 0));
    const safeMode = VALID_MODES.includes(fair_distribution_mode) ? fair_distribution_mode : 'balanced';
    const safeStrategy = VALID_STRATEGIES.includes(tie_breaker_strategy) ? tie_breaker_strategy : 'random';
    const safeMemoryDays = Math.max(1, Math.min(90, parseInt(last_assignment_memory_days) || 7));
    const safeWeight = Math.max(0, Math.min(1, parseFloat(variety_weight) || 0.3));

    const { rows } = await pool.query(
      `UPDATE fairness_settings
         SET consecutive_category_limit = $1,
             fair_distribution_mode     = $2,
             tie_breaker_strategy       = $3,
             last_assignment_memory_days = $4,
             variety_weight             = $5,
             updated_by                 = $6,
             updated_at                 = NOW()
       WHERE id = (SELECT id FROM fairness_settings ORDER BY id LIMIT 1)
       RETURNING *`,
      [safeLimit, safeMode, safeStrategy, safeMemoryDays, safeWeight, req.user?.id]
    );

    if (!rows.length) {
      // If no row exists yet, insert one
      const ins = await pool.query(
        `INSERT INTO fairness_settings (consecutive_category_limit, fair_distribution_mode, tie_breaker_strategy, last_assignment_memory_days, variety_weight, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [safeLimit, safeMode, safeStrategy, safeMemoryDays, safeWeight, req.user?.id]
      );
      return res.json({ ok: true, settings: ins.rows[0] });
    }

    res.json({ ok: true, settings: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
