/* ------------------------------------------------ */
/* WELLBEING & FAIRNESS ROUTES                      */
/* Persistent storage in DB (wellbeing_metrics)     */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { parseMonthLabel } from "../lib/monthParser.js";

const router = express.Router();

/* ------------------------------------------------ */
/* CONFIG                                           */
/* ------------------------------------------------ */

// GET /api/wellbeing/config
router.get("/config", requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM wellbeing_config WHERE scope = 'global'`
        );
        if (result.rows.length === 0) {
            // Return defaults if not set
            return res.json({
                night_threshold: 4,
                weekend_threshold: 2,
                streak_threshold: 7,
            });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("WELLBEING CONFIG ERROR:", err);
        res.status(500).json({ error: "Failed to fetch config" });
    }
});

// POST /api/wellbeing/config
router.post("/config", requireAuth, requirePageAccess("settings", "write"), async (req, res) => {
    const { night_threshold, weekend_threshold, streak_threshold } = req.body;
    try {
        await db.query(
            `
      INSERT INTO wellbeing_config (scope, night_threshold, weekend_threshold, streak_threshold)
      VALUES ('global', $1, $2, $3)
      ON CONFLICT (scope) DO UPDATE
      SET night_threshold = EXCLUDED.night_threshold,
          weekend_threshold = EXCLUDED.weekend_threshold,
          streak_threshold = EXCLUDED.streak_threshold,
          updated_at = NOW(),
          updated_by = $4
      `,
            [night_threshold || 4, weekend_threshold || 2, streak_threshold || 7, req.user?.displayName || "System"]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("WELLBEING CONFIG UPDATE ERROR:", err);
        res.status(500).json({ error: "Failed to update config" });
    }
});

/* ------------------------------------------------ */
/* METRICS (GET & COMPUTE)                          */
/* ------------------------------------------------ */

// GET /api/wellbeing/metrics?year=2026&month=2
router.get("/metrics", requireAuth, async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: "Missing year/month" });

    try {
        const result = await db.query(
            `SELECT * FROM wellbeing_metrics WHERE year = $1 AND month = $2`,
            [year, month]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("WELLBEING METRICS ERROR:", err);
        res.status(500).json({ error: "Failed to fetch metrics" });
    }
});

/**
 * COMPUTE Logic
 * Iterates over the Shifts for the given month (and potentially prev/next for streaks)
 * and calculates scores.
 */
router.post("/compute", requireAuth, async (req, res) => {
    const { year, month } = req.body;
    const yearNum = Number(year);
    const monthNum = Number(month);

    if (!yearNum || !monthNum) return res.status(400).json({ error: "Invalid year/month" });

    const client = await db.connect();
    try {
        // 1. Get Config
        const configRes = await client.query(`SELECT * FROM wellbeing_config WHERE scope='global'`);
        const config = configRes.rows[0] || { night_threshold: 4, weekend_threshold: 2, streak_threshold: 7 };

        // 2. Get Shifts for this month
        // We need the month label e.g. "Februar 2026" or "February 2026"
        // Since 'shifts' table stores string labels, we might need a helper or just query by LIKE if standard format isn't guaranteed.
        // However, existing backend uses a specific format.
        // Let's rely on the frontend sending the correct month label OR try to construct it.
        // Ideally, we move to separate year/month columns in 'shifts', but for now we query by standard parsing or just ask frontend to computed per-employee?
        // No, requirement is "Calculation MUST be server-side".

        // HACK: Reconstruct label or query based on parsed logic.
        // For now, let's look for any month label that matches the year/month.
        // This is expensive but safe.

        // Better: We query ALL shifts, parse them in memory? No. 
        // Let's assume standard German format names for now or use the helper from schedules.js if we could import it.
        // Simplified: We simply assume the user triggers this for the *current view*, so maybe we can pass the label too?

        // Let's query shifts by date logic if possible? No, 'shifts' has 'month' (text) and 'day' (int).
        // We will select rows where the month text contains the year.
        // Then we parse the text to filter for the correct month index.

        const monthRows = await client.query(
            `SELECT DISTINCT month FROM shifts WHERE month LIKE $1`,
            [`%${yearNum}`],
        );
        const matchingLabels = monthRows.rows
            .map((row) => String(row.month || ""))
            .filter((label) => {
                const parsed = parseMonthLabel(label);
                return parsed?.year === yearNum && parsed?.month === monthNum;
            });
        const shiftsRes = matchingLabels.length > 0
            ? await client.query(
                `SELECT employee_name, day, shift_code, month FROM shifts WHERE month = ANY($1::text[])`,
                [matchingLabels],
            )
            : { rows: [] };
        const relevantShifts = shiftsRes.rows;

        // Group by Employee
        const empData = {};
        for (const row of relevantShifts) {
            if (!empData[row.employee_name]) empData[row.employee_name] = {};
            empData[row.employee_name][row.day] = row.shift_code;
        }

        // 3. Calculate Metrics
        await client.query("BEGIN");

        for (const [emp, days] of Object.entries(empData)) {
            let nightCount = 0;
            let weekendCount = 0;
            let earlyCount = 0; // [NEW]
            let lateCount = 0;  // [NEW]
            let currentStreak = 0;
            let maxStreak = 0;

            const date = new Date(yearNum, monthNum - 1, 1);
            const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

            for (let d = 1; d <= daysInMonth; d++) {
                const shift = days[d];
                const isWork = shift && !['FS', 'ABW', 'K', 'U', 'OFF'].includes(shift);

                // Streak
                if (isWork) {
                    currentStreak++;
                    maxStreak = Math.max(maxStreak, currentStreak);
                } else {
                    currentStreak = 0;
                }

                // Night
                if (shift === 'N') nightCount++;

                // Early (starts with E)
                if (shift && shift.startsWith('E')) earlyCount++;

                // Late (starts with L)
                if (shift && shift.startsWith('L')) lateCount++;

                // Weekend
                const dayDate = new Date(yearNum, monthNum - 1, d);
                const dow = dayDate.getDay();
                if ((dow === 0 || dow === 6) && isWork) {
                    weekendCount++;
                }
            }

            // Score Calculation (Simple)
            let score = 0;
            if (nightCount > config.night_threshold) score += (nightCount - config.night_threshold) * 10;
            if (weekendCount > config.weekend_threshold) score += (weekendCount - config.weekend_threshold) * 5;
            if (maxStreak > config.streak_threshold) score += (maxStreak - config.streak_threshold) * 5;

            // [NEW] Balance Factor (Example: high variance between E/L adds to score?)
            // For now, E/L are just metrics, score not impacted unless configured.

            // Persist
            await client.query(
                `
            INSERT INTO wellbeing_metrics
              (employee_name, year, month, night_count, weekend_count, early_count, late_count, max_streak, score, details)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (employee_name, year, month)
            DO UPDATE SET
              night_count = EXCLUDED.night_count,
              weekend_count = EXCLUDED.weekend_count,
              early_count = EXCLUDED.early_count,
              late_count = EXCLUDED.late_count,
              max_streak = EXCLUDED.max_streak,
              score = EXCLUDED.score,
              details = EXCLUDED.details,
              updated_at = NOW()
            `,
                [emp, yearNum, monthNum, nightCount, weekendCount, earlyCount, lateCount, maxStreak, score, JSON.stringify({ nightThreshold: config.night_threshold })]
            );
        }

        await client.query("COMMIT");
        res.json({ success: true, count: Object.keys(empData).length });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("WELLBEING COMPUTE ERROR:", err);
        res.status(500).json({ error: "Computation failed" });
    } finally {
        client.release();
    }
});

export default router;
