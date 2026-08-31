import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/* 
  STAFFING RULES & RESULTS
  ------------------------
  - Rules: Min. headcount per shift type (E, L, N).
  - Results: Daily status (OK/WARN/FAIL) based on actual vs min.
*/

// GET /api/staffing/rules
router.get('/rules', requireAuth, async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM staffing_rules');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching staffing rules:', err);
        res.status(500).json({ error: 'Failed to fetch rules' });
    }
});

// POST /api/staffing/rules
router.post('/rules', requireAuth, async (req, res) => {
    const { shift_type, min_count } = req.body;
    if (!shift_type) return res.status(400).json({ error: 'Missing shift_type' });

    try {
        await db.query(
            `INSERT INTO staffing_rules(shift_type, min_count)
VALUES($1, $2)
       ON CONFLICT(shift_type) DO UPDATE SET min_count = EXCLUDED.min_count`,
            [shift_type, min_count]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving staffing rule:', err);
        res.status(500).json({ error: 'Failed to save rule' });
    }
});

// GET /api/staffing/results
// ?year=2026&month=5
router.get('/results', requireAuth, async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'Missing year/month' });

    try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        // Last day of month
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

        const { rows } = await db.query(
            `SELECT * FROM staffing_results 
       WHERE date >= $1 AND date <= $2
       ORDER BY date ASC`,
            [startDate, endDate]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching staffing results:', err);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

// POST /api/staffing/recompute
// Triggers calculation for a month
router.post('/recompute', requireAuth, async (req, res) => {
    const { year, month } = req.body;
    if (!year || !month) return res.status(400).json({ error: 'Missing year/month' });

    try {
        // 1. Fetch Rules
        const { rows: rules } = await db.query('SELECT * FROM staffing_rules');
        const ruleMap = {}; // { 'E': 2, 'L': 2, 'N': 1 }
        rules.forEach(r => ruleMap[r.shift_type] = r.min_count);

        // 2. Fetch Shifts for month
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

        const { rows: shifts } = await db.query(
            `SELECT s.date, s.shift_type 
       FROM shifts s
       WHERE s.date >= $1 AND s.date <= $2`,
            [startDate, endDate]
        );

        // 3. Aggregate Counts per Day & Shift Type
        // Map<"YYYY-MM-DD", { E: 0, L: 0, N: 0 }>
        const dailyCounts = {};

        // Helper to init day
        const getDayObj = (dateStr) => {
            if (!dailyCounts[dateStr]) dailyCounts[dateStr] = { E: 0, L: 0, N: 0 };
            return dailyCounts[dateStr];
        };

        shifts.forEach(s => {
            const d = s.date.toISOString().split('T')[0];
            const type = s.shift_type.toUpperCase();

            const dayObj = getDayObj(d);

            // Match E1/E2 -> E, L1/L2 -> L, N -> N
            if (type.startsWith('E')) dayObj.E++;
            else if (type.startsWith('L')) dayObj.L++;
            else if (type === 'N') dayObj.N++;
        });

        // 4. Compare with Rules & Upsert Results
        const results = [];
        const shiftTypes = ['E', 'L', 'N'];

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            // Loop days 1..lastDay
            for (let d = 1; d <= lastDay; d++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayCounts = dailyCounts[dateStr] || { E: 0, L: 0, N: 0 };

                for (const type of shiftTypes) {
                    const actual = dayCounts[type] || 0;
                    const min = ruleMap[type] || 0;
                    let status = 'OK';

                    if (actual < min) status = 'FAIL';
                    else if (actual === min) status = 'OK'; // Exact match is OK
                    // Could implement WARN logic if needed, e.g. actual == min + 1?
                    // For now: < min = FAIL, >= min = OK.

                    // UPSERT
                    await client.query(
                        `INSERT INTO staffing_results(date, shift_type, actual, min, status)
VALUES($1, $2, $3, $4, $5)
             ON CONFLICT(date, shift_type) 
             DO UPDATE SET actual = EXCLUDED.actual, min = EXCLUDED.min, status = EXCLUDED.status, created_at = NOW()`,
                        [dateStr, type, actual, min, status]
                    );
                }
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error recomputing staffing:', err);
        res.status(500).json({ error: 'Compute failed' });
    }
});

export default router;
