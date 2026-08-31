
/* ------------------------------------------------ */
/* COVERAGE & SKILLS ROUTES                         */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";

const router = express.Router();

function normalizeRatedSkills(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return Object.fromEntries(
        Object.entries(value)
            .map(([skill, rating]) => {
                const normalizedSkill = String(skill || "").trim();
                const normalizedRating = Number.parseInt(String(rating ?? ""), 10);

                if (!normalizedSkill) return null;
                if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) return null;

                return [normalizedSkill, normalizedRating];
            })
            .filter(Boolean)
    );
}

/* ------------------------------------------------ */
/* SKILLS                                           */
/* ------------------------------------------------ */

// GET /api/coverage/skills
router.get("/skills", requireAuth, async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM employee_skills");
        res.json(result.rows);
    } catch (err) {
        console.error("SKILLS GET ERROR:", err);
        res.status(500).json({ error: "Failed to fetch skills" });
    }
});

// POST /api/coverage/skills
// Updates a single employee's skills
router.post("/skills", requireAuth, requirePageAccess("shiftplan_control", "write"), async (req, res) => {
    const { employee_name, can_sh, can_tt, can_cc, rated_skills } = req.body;
    if (!employee_name) return res.status(400).json({ error: "Missing employee_name" });

    const normalizedRatedSkills = normalizeRatedSkills(rated_skills);

    try {
        await db.query(
            `
            INSERT INTO employee_skills (employee_name, can_sh, can_tt, can_cc, rated_skills)
            VALUES ($1, COALESCE($2, false), COALESCE($3, false), COALESCE($4, false), COALESCE($5::jsonb, '{}'::jsonb))
            ON CONFLICT (employee_name) DO UPDATE
            SET can_sh = COALESCE($2, employee_skills.can_sh),
                can_tt = COALESCE($3, employee_skills.can_tt),
                can_cc = COALESCE($4, employee_skills.can_cc),
                rated_skills = COALESCE($5::jsonb, employee_skills.rated_skills),
                updated_at = NOW()
            `,
            [
                employee_name,
                typeof can_sh === "boolean" ? can_sh : null,
                typeof can_tt === "boolean" ? can_tt : null,
                typeof can_cc === "boolean" ? can_cc : null,
                rated_skills === undefined ? null : JSON.stringify(normalizedRatedSkills),
            ]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("SKILLS UPDATE ERROR:", err);
        res.status(500).json({ error: "Failed to update skills" });
    }
});

/* ------------------------------------------------ */
/* RULES                                            */
/* ------------------------------------------------ */

// GET /api/coverage/rules
router.get("/rules", requireAuth, async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM coverage_rules");
        res.json(result.rows);
    } catch (err) {
        console.error("RULES GET ERROR:", err);
        res.status(500).json({ error: "Failed to fetch rules" });
    }
});

/* ------------------------------------------------ */
/* VIOLATIONS & COMPUTE                             */
/* ------------------------------------------------ */

// GET /api/coverage/violations?year=2026&month=2
router.get("/violations", requireAuth, async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: "Missing params" });

    try {
        // Simple date range check
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day

        const result = await db.query(
            "SELECT * FROM coverage_violations WHERE date >= $1 AND date <= $2",
            [startDate, endDate]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("VIOLATIONS GET ERROR:", err);
        res.status(500).json({ error: "Failed to fetch violations" });
    }
});

// POST /api/coverage/compute
router.post("/compute", requireAuth, async (req, res) => {
    const { year, month } = req.body;
    const yearNum = Number(year);
    const monthNum = Number(month);

    if (!yearNum || !monthNum) return res.status(400).json({ error: "Invalid params" });

    const client = await db.connect();
    try {
        await client.query("BEGIN");

        // 1. Fetch Rules
        const rulesRes = await client.query("SELECT * FROM coverage_rules");
        const rules = {}; // 'E' -> { min_sh, ... }
        for (const r of rulesRes.rows) rules[r.shift_type] = r;

        // 2. Fetch Skills
        const skillsRes = await client.query("SELECT * FROM employee_skills");
        const skills = {}; // 'Max Mustermann' -> { can_sh, ... }
        for (const s of skillsRes.rows) skills[s.employee_name] = s;

        // 3. Fetch Shifts
        // Reuse logic from wellbeing: find shifts via month label query
        // Or better: Assume frontend sends us the shifts? No, backend recalc must be standalone.
        // We use the same LIKE query as in wellbeing.js
        const shiftsRes = await client.query(
            `SELECT employee_name, day, shift_code, month FROM shifts WHERE month LIKE $1`,
            [`%${yearNum}`]
        );

        // Filter for correct month (Simple parser again)
        const relevantShifts = shiftsRes.rows.filter(row => {
            const parts = row.month.split(" ");
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
            return monthMap[mName] === monthNum;
        });

        // 4. Group by Day
        const days = {}; // day -> { 'E': [empName, ...], 'L': [...], ... }
        const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

        for (const row of relevantShifts) {
            const d = row.day;
            if (!days[d]) days[d] = { E: [], L: [], N: [] };

            const s = row.shift_code;
            if (!s) continue;

            // Mapping Shift Codes to Types
            // E1, E2, E3... -> E
            // L1, L2... -> L
            // N -> N
            let type = null;
            if (s.startsWith('E')) type = 'E';
            if (s.startsWith('L')) type = 'L';
            if (s === 'N') type = 'N';

            if (type && days[d][type]) {
                days[d][type].push(row.employee_name);
            }
        }

        // 5. Check Rules
        // Clear existing violations for period
        const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
        const endDate = new Date(yearNum, monthNum, 0).toISOString().split('T')[0];

        await client.query(
            "DELETE FROM coverage_violations WHERE date >= $1 AND date <= $2",
            [startDate, endDate]
        );

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayShifts = days[d] || { E: [], L: [], N: [] };

            // Check each rule
            for (const [type, rule] of Object.entries(rules)) {
                if (!dayShifts[type]) continue; // Should not happen if initialized

                const employees = dayShifts[type];

                let countSH = 0;
                let countTT = 0;
                let countCC = 0;

                for (const emp of employees) {
                    const sk = skills[emp];
                    if (sk) {
                        if (sk.can_sh) countSH++;
                        if (sk.can_tt) countTT++;
                        if (sk.can_cc) countCC++;
                    }
                }

                const missing = {};
                if (countSH < rule.min_sh) missing.sh = rule.min_sh - countSH;
                if (countTT < rule.min_tt) missing.tt = rule.min_tt - countTT;
                if (countCC < rule.min_cc) missing.cc = rule.min_cc - countCC;

                if (Object.keys(missing).length > 0) {
                    await client.query(
                        `INSERT INTO coverage_violations (date, shift_type, missing) VALUES ($1, $2, $3)`,
                        [dateStr, type, JSON.stringify(missing)]
                    );
                }
            }
        }

        await client.query("COMMIT");
        res.json({ success: true });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("COVERAGE COMPUTE ERROR:", err);
        res.status(500).json({ error: "Compute failed" });
    } finally {
        client.release();
    }
});

export default router;
