import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { parseMonthLabel } from '../lib/monthParser.js';
import { normalizePlanningShiftTypeKey } from '../lib/shiftplanGeneration.js';
import { classifyShiftCodeToType } from '../lib/understaffingSuggestions.js';

const router = express.Router();

/*
  STAFFING RULES & RESULTS
  ------------------------
  - Rules: Min. headcount per shift type (early / late / night, legacy E / L / N).
  - Results: Daily status (OK/FAIL) based on actual vs min.
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

const STAFFING_RESULT_TYPES = ['early', 'late', 'night'];

// POST /api/staffing/recompute
// Body: { year, month } (month 1-12). Counts distinct employees per day and
// shift type (early / late / night; N and NK both count as night) and compares
// them with staffing_rules.min_count.
router.post('/recompute', requireAuth, async (req, res) => {
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    const month = Number.parseInt(String(req.body?.month ?? ''), 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Missing year/month' });
    }

    try {
        // 1. Rules: { early: 2, late: 2, night: 1 } (legacy keys E/L/N are normalised)
        const { rows: rules } = await db.query('SELECT shift_type, min_count FROM staffing_rules');
        const ruleMap = {};
        for (const rule of rules) {
            const type = normalizePlanningShiftTypeKey(rule.shift_type);
            if (STAFFING_RESULT_TYPES.includes(type)) ruleMap[type] = Number(rule.min_count) || 0;
        }

        // 2. Live shifts of the requested month
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const { rows: definitions } = await db.query('SELECT code, shift_type, is_active FROM shift_definitions');
        const { rows: shiftRows } = await db.query(
            'SELECT month, employee_name, day, shift_code FROM shifts WHERE month LIKE $1',
            [`%${year}%`]
        );

        // 3. Distinct employees per day and type
        const dailyEmployees = {};
        for (const row of shiftRows) {
            const parsed = parseMonthLabel(String(row.month || ''));
            if (!parsed || parsed.year !== year || parsed.month !== month) continue;
            const day = Number.parseInt(String(row.day ?? ''), 10);
            if (!Number.isInteger(day) || day < 1 || day > lastDay) continue;
            const type = classifyShiftCodeToType(row.shift_code, definitions);
            if (!type) continue;
            if (!dailyEmployees[day]) dailyEmployees[day] = { early: new Set(), late: new Set(), night: new Set() };
            dailyEmployees[day][type].add(row.employee_name);
        }

        // 4. Replace the month's results in one transaction
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                'DELETE FROM staffing_results WHERE date >= $1 AND date <= $2',
                [`${monthKey}-01`, `${monthKey}-${String(lastDay).padStart(2, '0')}`]
            );

            for (let d = 1; d <= lastDay; d++) {
                const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
                for (const type of STAFFING_RESULT_TYPES) {
                    const actual = dailyEmployees[d]?.[type]?.size || 0;
                    const min = ruleMap[type] || 0;
                    const status = actual < min ? 'FAIL' : 'OK';
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
            await client.query('ROLLBACK').catch(() => {});
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
