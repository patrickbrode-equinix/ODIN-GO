/* ------------------------------------------------ */
/* EMPLOYEE CONSTRAINTS ROUTES                      */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";

const router = express.Router();

/* ------------------------------------------------ */
/* HELPER: RECOMPUTE VIOLATIONS                     */
/* ------------------------------------------------ */

// Exported for use in schedules.js
export async function recomputeConstraintsInternal(monthLabel) {
    try {
        // 1. Fetch all constraints
        const constraintsRes = await db.query("SELECT employee_name, constraints FROM employee_constraints");
        if (constraintsRes.rows.length === 0) return; // No constraints defined

        // 2. Fetch all shifts for the month
        const shiftsRes = await db.query(
            "SELECT employee_name, day, shift_code FROM shifts WHERE month = $1",
            [monthLabel]
        );

        // Group shifts by employee
        const shiftsByEmp = {}; // { "Müller": { 1: "E1", 5: "N" ... } }
        shiftsRes.rows.forEach(r => {
            if (!shiftsByEmp[r.employee_name]) shiftsByEmp[r.employee_name] = {};
            shiftsByEmp[r.employee_name][r.day] = r.shift_code;
        });

        const violations = [];
        const parsedMonth = parseMonthLabel(monthLabel); // Use helper or assume helper available?
        // We need logic to determine weekends. 
        // Let's reimplement simple parse here to be safe and avoid circular dependencies if helper is elsewhere.

        let year = new Date().getFullYear();
        let monthIdx = 0;

        // Quick parse: "März 2026"
        const parts = monthLabel.split(" ");
        if (parts.length >= 2) {
            const mName = parts[0].toLowerCase();
            const mYear = parseInt(parts[1], 10);

            const months = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
            const idx = months.findIndex(m => mName.startsWith(m));
            if (idx !== -1) monthIdx = idx;
            if (!isNaN(mYear)) year = mYear;
        }

        // 3. Check Rules
        for (const cRow of constraintsRes.rows) {
            const empName = cRow.employee_name;
            const rules = cRow.constraints || {};
            const empShifts = shiftsByEmp[empName] || {};

            // RULE: NO_NIGHT
            if (rules.no_night) {
                for (const [day, code] of Object.entries(empShifts)) {
                    if (code === 'N') {
                        violations.push({
                            employee_name: empName,
                            date: new Date(year, monthIdx, Number(day)).toISOString().split('T')[0],
                            month: monthLabel,
                            constraint_key: 'NO_NIGHT',
                            details: { msg: `Nachtschicht am ${day}. nicht erlaubt.` }
                        });
                    }
                }
            }

            // RULE: MAX_WEEKENDS (e.g. 2)
            if (rules.max_weekends !== undefined && rules.max_weekends !== null) {
                const max = Number(rules.max_weekends);
                const weekendDaysWorked = new Set();

                // Find worked weekends
                for (const [dayStr, code] of Object.entries(empShifts)) {
                    if (!code || code === 'FS' || code === 'ABW') continue;
                    const day = Number(dayStr);
                    const date = new Date(year, monthIdx, day);
                    const dow = date.getDay();
                    if (dow === 0 || dow === 6) {
                        // Identify weekend by week number or just Saturday's date?
                        // Simple approach: Set of days.
                        // Better: Count distinct weekends. 
                        // A weekend is usually Sat+Sun. If work on Sat OR Sun (or both), it counts as 1.
                        // We can use the ISO week number or just nearest Saturday.
                        const nearestSat = new Date(date);
                        if (dow === 0) nearestSat.setDate(day - 1); // Sun -> Sat
                        weekendDaysWorked.add(nearestSat.getDate());
                    }
                }

                if (weekendDaysWorked.size > max) {
                    violations.push({
                        employee_name: empName,
                        month: monthLabel,
                        constraint_key: 'MAX_WEEKENDS',
                        details: { msg: `Max. ${max} Wochenenden erlaubt, ${weekendDaysWorked.size} geplant.` }
                    });
                }
            }

            // RULE: ONLY_EARLY
            if (rules.only_early) {
                for (const [day, code] of Object.entries(empShifts)) {
                    // Allowed: E1, E2, FS, ABW. Forbidden: L1, L2, N
                    if (['L1', 'L2', 'N'].includes(code)) {
                        violations.push({
                            employee_name: empName,
                            date: new Date(year, monthIdx, Number(day)).toISOString().split('T')[0],
                            month: monthLabel,
                            constraint_key: 'ONLY_EARLY',
                            details: { msg: `Nur Frühschicht erlaubt. (${code} gefunden)` }
                        });
                    }
                }
            }
        }

        // 4. Update Database
        await db.query(`DELETE FROM constraint_violations WHERE month = $1`, [monthLabel]);

        for (const v of violations) {
            await db.query(
                `INSERT INTO constraint_violations (employee_name, date, month, constraint_key, details)
          VALUES ($1, $2, $3, $4, $5)`,
                [v.employee_name, v.date || null, v.month, v.constraint_key, JSON.stringify(v.details)]
            );
        }

    } catch (err) {
        console.error("RECOMPUTE CONSTRAINTS ERROR:", err);
    }
}

function parseMonthLabel(label) {
    // Simple reuse if needed locally, but logic above handles it.
    return null;
}


/* ------------------------------------------------ */
/* API ROUTES                                       */
/* ------------------------------------------------ */

// GET all constraints
router.get("/", requireAuth, async (req, res) => {
    try {
        const { rows } = await db.query("SELECT * FROM employee_constraints");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Failed to load constraints" });
    }
});

// UPSERT constraint
router.post("/", requireAuth, requirePageAccess("shiftplan", "write"), async (req, res) => {
    try {
        const { employee_name, constraints } = req.body;
        if (!employee_name || !constraints) return res.status(400).json({ error: "Missing data" });

        // Upsert
        await db.query(
            `INSERT INTO employee_constraints (employee_name, constraints) VALUES ($1, $2)
       ON CONFLICT (employee_name) DO UPDATE SET constraints = EXCLUDED.constraints, updated_at = NOW()`,
            [employee_name, JSON.stringify(constraints)]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to save constraints" });
    }
});

// GET violations
router.get("/violations", requireAuth, async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) return res.status(400).json({ error: "Month required" });

        const { rows } = await db.query("SELECT * FROM constraint_violations WHERE month = $1", [month]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Failed to load violations" });
    }
});

// RECOMPUTE (Manual Trigger if needed)
router.post("/recompute", requireAuth, requirePageAccess("shiftplan", "write"), async (req, res) => {
    try {
        const { month } = req.body;
        if (!month) return res.status(400).json({ error: "Month required" });
        await recomputeConstraintsInternal(month);
        const { rows } = await db.query("SELECT * FROM constraint_violations WHERE month = $1", [month]);
        res.json({ success: true, violations: rows });
    } catch (err) {
        res.status(500).json({ error: "Recompute failed" });
    }
});

export default router;
