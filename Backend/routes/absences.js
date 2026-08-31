import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePageAccess } from '../middleware/requirePageAccess.js';

const router = express.Router();

/*
  ABSENCE MANAGEMENT
  ------------------
  - GET /: List absences
  - POST /: Create absence
  - DELETE /:id: Delete absence
  - GET /conflicts: List conflicts
  - POST /recompute-conflicts: Check shifts vs absences
*/

// GET /api/absences
// ?year=2026&month=5 (optional filter)
router.get('/', requireAuth, async (req, res) => {
    try {
        const { year, month } = req.query;
        let query = 'SELECT * FROM absences';
        const params = [];

        if (year && month) {
            // Overlapping logic: start <= EOM AND end >= BOM
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

            query += ' WHERE start_date <= $2 AND end_date >= $1 ORDER BY start_date ASC';
            params.push(startDate, endDate);
        } else {
            query += ' ORDER BY start_date DESC LIMIT 500';
        }

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching absences:', err);
        res.status(500).json({ error: 'Failed to fetch absences' });
    }
});

// POST /api/absences
router.post('/', requireAuth, requirePageAccess('shiftplan', 'write'), async (req, res) => {
    const { employee_name, start_date, end_date, type, note } = req.body;

    if (!employee_name || !start_date || !end_date || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Resolve employee_id if possible (optional)
        const userRes = await db.query('SELECT id FROM users WHERE username = $1 OR first_name || \' \' || last_name = $1 LIMIT 1', [employee_name]);
        const employee_id = userRes.rows[0]?.id || null;

        const { rows } = await db.query(
            `INSERT INTO absences (employee_name, employee_id, start_date, end_date, type, note)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [employee_name, employee_id, start_date, end_date, type, note]
        );

        // Auto-recompute conflicts for affected range
        await recomputeConflictsInternal(employee_name, start_date, end_date);

        res.json(rows[0]);
    } catch (err) {
        console.error('Error creating absence:', err);
        res.status(500).json({ error: 'Failed to create absence' });
    }
});

// DELETE /api/absences/:id
router.delete('/:id', requireAuth, requirePageAccess('shiftplan', 'write'), async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await db.query('DELETE FROM absences WHERE id = $1 RETURNING *', [id]);
        if (rows.length > 0) {
            // Recompute conflicts for the removed range
            const abs = rows[0];
            await recomputeConflictsInternal(abs.employee_name, abs.start_date, abs.end_date);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting absence:', err);
        res.status(500).json({ error: 'Failed to delete absence' });
    }
});

// GET /api/absences/conflicts
router.get('/conflicts', requireAuth, async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'Missing year/month' });

    try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

        const { rows } = await db.query(
            `SELECT * FROM absence_conflicts 
             WHERE date >= $1 AND date <= $2`,
            [startDate, endDate]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching conflicts:', err);
        res.status(500).json({ error: 'Failed to fetch conflicts' });
    }
});

// Internal Helper for Conflict Logic
async function recomputeConflictsInternal(employeeName, startDateStr, endDateStr) {
    const GERMAN_MONTHS = [
        "Januar", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember"
    ];

    try {
        // 1. Delete existing conflicts in range for this emp
        await db.query(
            `DELETE FROM absence_conflicts 
             WHERE employee_name = $1 AND date >= $2 AND date <= $3`,
            [employeeName, startDateStr, endDateStr]
        );

        // 2. Iterate each day in absence range
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);

        // Loop through dates
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayNum = d.getDate();
            const monthIdx = d.getMonth(); // 0-11
            const year = d.getFullYear();
            const monthLabel = `${GERMAN_MONTHS[monthIdx]} ${year}`; // "Mai 2026"

            // Check if shift exists
            const { rows } = await db.query(
                `SELECT shift_code FROM shifts 
                 WHERE employee_name = $1 AND month = $2 AND day = $3`,
                [employeeName, monthLabel, dayNum]
            );

            if (rows.length > 0) {
                const shiftCode = rows[0].shift_code;
                if (!shiftCode) continue;

                // Create Conflict
                const dateStr = d.toISOString().split('T')[0];
                const conflictType = 'SHIFT_DURING_ABSENCE';
                const details = {
                    msg: `Dienst (${shiftCode}) während Abwesenheit geplant.`,
                    shift_code: shiftCode
                };

                await db.query(
                    `INSERT INTO absence_conflicts (employee_name, date, conflict_type, details)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (employee_name, date, conflict_type) DO UPDATE SET details = EXCLUDED.details, created_at = NOW()`,
                    [employeeName, dateStr, conflictType, JSON.stringify(details)]
                );
            }
        }
    } catch (err) {
        console.error('Error recomputing conflicts:', err);
    }
}

// POST /api/absences/recompute-conflicts (Manual Trigger)
router.post('/recompute-conflicts', requireAuth, async (req, res) => {
    // For now simple stub, could trigger wider recompute if needed
    res.json({ success: true, message: 'Not fully implemented globally yet, use granular create/delete.' });
});

export default router;
