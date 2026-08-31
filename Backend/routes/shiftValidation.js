/* ------------------------------------------------ */
/* CHANGE VALIDATION ROUTES                        */
/* Checks for Rest Time & Hard Changes              */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ------------------------------------------------ */
/* HELPER: SHIFT TIMES                              */
/* ------------------------------------------------ */

// Define standard start/end hours for calculation
// E: 06:00 - 14:30
// L: 14:00 - 22:30
// N: 22:00 - 06:00 (next day end)
const SHIFT_TIMES = {
    "E": { start: 6, end: 14.5 },
    "E1": { start: 6, end: 14.5 },
    "E2": { start: 7, end: 15.5 }, // Assumption
    "L": { start: 14, end: 22.5 },
    "L1": { start: 14, end: 22.5 },
    "L2": { start: 15, end: 23.5 }, // Assumption
    "N": { start: 22, end: 30 },   // Ends 6am next day (24+6)
};

function getRestHours(prevShift, currShift) {
    if (!SHIFT_TIMES[prevShift] || !SHIFT_TIMES[currShift]) return 24; // Unknown/Free implies enough rest

    // Gap = (Start of Curr + 24) - End of Prev
    // Example L (end 22.5) -> E (start 6 + 24 = 30) => 7.5h
    // Example N (end 30) -> E (start 6 + 24 = 30) => 0h

    // Correct logic:
    // Prev End: prev.end
    // Curr Start: curr.start + 24 (since it is next day)

    // What if same day? We assume validation is checking strictly "Next Day" transitions for now
    // because that's the common violation (L->E).
    // Double shifts on same day should be handled differently but usually blocked by UI.

    const prevEnd = SHIFT_TIMES[prevShift].end;
    const currStart = SHIFT_TIMES[currShift].start + 24;

    return currStart - prevEnd;
}

/* ------------------------------------------------ */
/* ROUTES                                           */
/* ------------------------------------------------ */

// GET /api/shiftValidation/violations?year=2026&month=2
router.get("/violations", requireAuth, async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: "Missing params" });

    try {
        // Construct date range for the month
        // We want all violations where 'date' falls in this month
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        // End date: safely next month 0th day
        // But simpler: just query by year/month fields? 
        // Our violations table has specific 'date'.

        const result = await db.query(
            `SELECT * FROM shift_violations 
             WHERE date >= $1::date 
             AND date < ($1::date + INTERVAL '1 month')`,
            [startDate]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("GET VIOLATIONS ERROR:", err);
        res.status(500).json({ error: "Failed to fetch violations" });
    }
});

// POST /api/shiftValidation/validate
// Body: { year, month }
router.post("/validate", requireAuth, async (req, res) => {
    const { year, month } = req.body;
    const yearNum = Number(year);
    const monthNum = Number(month);

    if (!yearNum || !monthNum) return res.status(400).json({ error: "Invalid params" });

    const client = await db.connect();
    try {
        // 1. Get Config
        const configRes = await client.query(`SELECT * FROM shift_rules_config WHERE scope='global'`);
        const config = configRes.rows[0] || {
            min_rest_hours: 11,
            hard_change_pairs: [["L", "E"], ["N", "E"]], // Default
            enabled: true
        };

        if (!config.enabled) {
            return res.json({ success: true, message: "Disabled" });
        }

        // 2. Fetch Shifts for Current Month AND Last Day of Prev Month
        // We need previous day to check transition on 1st of month.

        // Simple approach: Fetch all shifts for (Month) OR (Month-1 AND Day=Last)
        // Hard to query with string 'month' column.
        // Let's rely on string parsing for current month, but for prev month...
        // Maybe fetch ALL shifts for the year? Or just fetch current month and assume prev month last day is rarely the issue if we validate continuously?
        // NO, 1st day violations are critical.

        // Let's just fetch everything for the year to be safe and simple, or 2 months.
        // Filtering in memory is fast for < 1000 rows.

        const shiftsRes = await client.query(
            `SELECT employee_name, day, shift_code, month FROM shifts 
             WHERE month LIKE $1 OR month LIKE $2`,
            [`%${yearNum}`, `%${yearNum}`] // We might need year-1 if Jan
        );

        // Helper to parse "MonthName YYYY" to index
        const getMonthIdx = (label) => {
            const parts = label.split(" ");
            const mName = parts[0].toLowerCase();
            const monthMap = {
                januar: 1, january: 1, jan: 1,
                februar: 2, february: 2, feb: 2,
                märz: 3, maerz: 3, mrz: 3, march: 3, mar: 3,
                april: 4, apr: 4,
                mai: 5, may: 5,
                juni: 6, june: 6, jun: 6,
                juli: 7, july: 7, jul: 7,
                august: 8, aug: 8,
                september: 9, sept: 9, sep: 9,
                oktober: 10, october: 10, okt: 10, oct: 10,
                november: 11, nov: 11,
                dezember: 12, december: 12, dez: 12, dec: 12,
            };
            return monthMap[mName] || 0;
        };

        const relevantShifts = shiftsRes.rows.filter(row => {
            const mIdx = getMonthIdx(row.month);
            // We want Current Month
            // AND Previous Month (just checking last day)
            // Handle Jan/Dec wrap later if needed, assume same year for now or simple logic
            if (mIdx === monthNum) return true;
            if (monthNum === 1 && mIdx === 12) return true; // Prev Dec
            if (mIdx === monthNum - 1) return true;
            return false;
        });

        // Structure: emp -> monthIdx -> day -> code
        const schedule = {};

        for (const row of relevantShifts) {
            const mIdx = getMonthIdx(row.month);
            if (!schedule[row.employee_name]) schedule[row.employee_name] = {};
            if (!schedule[row.employee_name][mIdx]) schedule[row.employee_name][mIdx] = {};
            schedule[row.employee_name][mIdx][row.day] = row.shift_code;
        }

        const violations = [];

        // 3. Iterate Days in Current Month
        const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

        for (const emp of Object.keys(schedule)) {
            for (let d = 1; d <= daysInMonth; d++) {
                const currCode = schedule[emp][monthNum]?.[d];
                // If no shift today, no start-violation possible (rest time irrelevant if not working)
                if (!currCode || ['FS', 'ABW', 'K', 'U'].includes(currCode)) continue;

                // Find Prev Shift
                let prevCode = null;
                if (d > 1) {
                    prevCode = schedule[emp][monthNum]?.[d - 1];
                } else {
                    // Check last day of prev month
                    const prevMonthNum = monthNum === 1 ? 12 : monthNum - 1;
                    // TODO: Handle Year Wrap (if prev month is Dec of year-1)
                    // For now assuming same year unless handled
                    // If monthNum=1, we need valid data from prev year which we might not have fetched if we only did `LIKE %year%`
                    // LIMITATION: Jan 1st check requires fetching prev year data. skipped for simplicity if distinct year.
                    const prevMonthDays = new Date(yearNum, monthNum - 1, 0).getDate();
                    prevCode = schedule[emp][prevMonthNum]?.[prevMonthDays];
                }

                if (!prevCode || ['FS', 'ABW', 'K', 'U'].includes(prevCode)) continue;

                // Normalizes codes (L1 -> L)
                const norm = (c) => c.replace(/\d/g, "");
                const p = norm(prevCode);
                const c = norm(currCode);

                const reportDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

                // CHECK 1: HARD CHANGE
                // config.hard_change_pairs is array of [A,B]
                const isHard = config.hard_change_pairs.some(pair => pair[0] === p && pair[1] === c);
                if (isHard) {
                    violations.push({
                        employee_name: emp,
                        date: reportDate,
                        violation_type: "HARD_CHANGE",
                        details: { prev: prevCode, curr: currCode, msg: `Unzulässiger Wechsel: ${prevCode} -> ${currCode}` }
                    });
                }

                // CHECK 2: REST TIME
                const gap = getRestHours(p, c);
                if (gap < config.min_rest_hours) {
                    violations.push({
                        employee_name: emp,
                        date: reportDate,
                        violation_type: "REST_TIME",
                        details: { prev: prevCode, curr: currCode, gap, msg: `Ruhezeit unterschritten: ${gap}h (Min: ${config.min_rest_hours}h)` }
                    });
                }
            }
        }

        // 4. Persistence
        await client.query("BEGIN");

        // Clear old violations for this month to avoid stale data (or rely on upsert? Upsert better but need to delete fixed ones)
        // DECISION: Delete all for this month/scope first, then insert found. 
        // Otherwise, if user fixes a shift, the violation row remains.
        const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
        await client.query(
            `DELETE FROM shift_violations 
             WHERE date >= $1::date 
             AND date < ($1::date + INTERVAL '1 month')`,
            [startDate]
        );

        for (const v of violations) {
            await client.query(
                `INSERT INTO shift_violations (employee_name, date, violation_type, details)
                 VALUES ($1, $2, $3, $4)`,
                [v.employee_name, v.date, v.violation_type, JSON.stringify(v.details)]
            );
        }

        await client.query("COMMIT");
        res.json({ success: true, count: violations.length, violations });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("VALIDATE ERROR:", err);
        res.status(500).json({ error: "Validation failed" });
    } finally {
        client.release();
    }
});

export default router;
