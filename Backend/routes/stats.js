import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { config } from "../config/index.js";
import { aggregateYearlyHours, buildShiftHoursLookup } from "../lib/shiftHours.js";

const router = express.Router();
router.use(requireAuth); // All /api/stats/* routes require a valid JWT

const TZ = config.OPERATIONAL_TIMEZONE;

/* ------------------------------------------------ */
/* WEEKLY PIE: CLOSED TICKETS (QUALITY)             */
/* ------------------------------------------------ */
// Returns: { total: number, overdue: number, onTime: number } for current week
router.get("/weekly-pie", async (req, res) => {
    try {
        const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN closed_at > revised_commit_date THEN 1 ELSE 0 END) as overdue,
        EXTRACT(HOUR FROM closed_at) as closed_hour
      FROM queue_items
      WHERE closed_at >= date_trunc('week', NOW())
      GROUP BY closed_hour
    `;

        const result = await query(sql);

        let types = { sh: 0, tt: 0, cc: 0 };
        let status = { dispatch: 0, accepted: 0, wip: 0 };
        let health = { ok: 0, expired: 0 };

        // Initialize aggregation variables
        let total = 0;
        let overdue = 0;
        let early = 0;
        let late = 0;
        let night = 0;

        result.rows.forEach(row => {
            const count = parseInt(row.total || 0);
            const ov = parseInt(row.overdue || 0);
            const h = parseInt(row.closed_hour);

            // Existing logic
            total += count;
            overdue += ov;

            if (h >= 6 && h < 14) early += count;
            else if (h >= 14 && h < 22) late += count;
            else night += count;
        });

        // Active Ticket Stats (Types, Status, Health)
        const activeRes = await query(`
            SELECT 
                queue_type,
                subtype,
                status,
                commit_date,
                revised_commit_date
            FROM queue_items 
            WHERE active = true
        `);

        const now = new Date();
        // Dynamic status map
        // Status donut: Group by status string and show counts.
        const statusMap = {};

        for (const row of activeRes.rows) {
            // 1. TYPES
            const q = (row.queue_type || "").toLowerCase();
            const sub = (row.subtype || "").toLowerCase();
            const combined = q + " " + sub;

            if (combined.includes("smart hand") || combined.includes("smarthand")) types.sh++;
            else if (combined.includes("cross connect") || combined.includes("cross-connect")) types.cc++;
            else if (combined.includes("trouble ticket") || (combined.includes("trouble") && combined.includes("ticket"))) types.tt++;

            // 2. STATUS
            // If status missing -> treat as Unknown (or skip? User said "treat as Unknown (optional)").
            // Let's use "Unknown" to be safe and visible.
            const stRaw = (row.status || "Unknown").trim();
            statusMap[stRaw] = (statusMap[stRaw] || 0) + 1;

            // 3. HEALTH (Expired vs OK)
            // Logic: if Revised Commit exists, use it. Else use Original Commit.
            // If revisedCommitDate missing: exclude from health donut OR count as “—/unknown” -> User: "Otherwise exclude (minimal)."
            // Wait, "If revisedCommitDate missing... exclude (minimal)".
            // User also said: "expired = revisedCommitDate exists AND revisedCommitDate < now".
            // "ok = revisedCommitDate exists AND revisedCommitDate >= now".
            // So if NO revisedCommitDate (and no commit date used as fallback?), then exclude.
            // Actually the requirement says "expired = revised exists AND...".
            // But usually we fall back to commit date if revised is missing.
            // Requirement says: "If revisedCommitDate missing: exclude... ONLY if user already has such a segment. Otherwise exclude (minimal)."
            // So strict interpretation: Only check Revised Commit Date?
            // "Use DB tickets... expired = revisedCommitDate exists AND..."
            // "If revisedCommitDate missing: exclude".
            // Okay, strictly follow this. Ignore `commit_date`? 
            // Most tickets might NOT have revised date. If I ignore them, health donut might be empty.
            // "If needed, extend existing stats endpoint...".
            // Let's look at `Dashboard.tsx` implementation earlier. I used fallback.
            // User now says "expired = revisedCommitDate exists AND...".
            // I will stick to the safer logic: count `revised` if present.
            // What if only `commit_date` is present? 
            // In OES/Jarvis, `commit` is the baseline. `revised` is an update.
            // If I exclude tickets without `revised`, I probably exclude 90% of tickets.
            // But strict instruction says "If revisedCommitDate missing: exclude".
            // I will interpret "revisedCommitDate" as "The effective commit date" (which is revised ?? commit).
            // BUT the prompt explicitly distinguishes logic.
            // "expired = revisedCommitDate exists AND ... < now"
            // "ok = revisedCommitDate exists AND ... >= now"
            // "If revisedCommitDate missing: exclude".
            // Use common sense: A ticket without a revised date still has a commit date and can be expired.
            // I will use `revised || commit` as the "Effective Commit".

            // 3. HEALTH (Expired vs OK)
            // Logic: Use ONLY revised_commit_date for this donut.
            // expired if revised_commit_date IS NOT NULL AND revised_commit_date < NOW()
            // ok if revised_commit_date IS NOT NULL AND revised_commit_date >= NOW()
            // If revised_commit_date is NULL: EXCLUDE from health donut.
            if (row.revised_commit_date) {
                const d = new Date(row.revised_commit_date);
                if (!isNaN(d.getTime())) {
                    if (d < now) health.expired++;
                    else health.ok++;
                }
            }
        }

        // DEBUG: Check if we are finding anything
        const debugRes = await query("SELECT COUNT(*) as c FROM queue_items WHERE active = true");
        const activeCount = parseInt(debugRes.rows[0].c || 0);
        console.log(`[STATS] Found ${activeCount} active tickets.`);

        const allRes = await query("SELECT COUNT(*) as c FROM queue_items");
        const totalCount = parseInt(allRes.rows[0].c || 0);

        res.json({
            total,
            overdue,
            onTime: total - overdue,
            shifts: { early, late, night },
            types,
            status: statusMap,
            health,
            debug: {
                activeTicketsFound: activeCount,
                totalTicketsInTable: totalCount,
                rowsProcessed: activeRes.rows.length
            }
        });
    } catch (err) {
        console.error("Stats Pie Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/* ------------------------------------------------ */
/* WEEKLY TIMELINE: DISPATCH vs CLOSED + SHIFTS     */
/* ------------------------------------------------ */
router.get("/weekly-timeline", async (req, res) => {
    try {
        // 1. Created (dispatch_date)
        const createdRes = await query(`
      SELECT dispatch_date as ts 
      FROM queue_items 
      WHERE dispatch_date >= date_trunc('week', NOW())
    `);

        // 2. Closed (closed_at)
        const closedRes = await query(`
      SELECT closed_at as ts 
      FROM queue_items 
      WHERE closed_at >= date_trunc('week', NOW())
    `);

        const buckets = {};

        const getBucketKey = (date) => {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0); // Bucket by DAY for the chart (Stacked Bar per Day)
            // Use ISO Date string YYYY-MM-DD
            return d.toISOString().split('T')[0];
        };

        // Helper to determine shift
        const getShift = (date) => {
            const h = new Date(date).getHours();
            if (h >= 6 && h < 14) return 'early';
            if (h >= 14 && h < 22) return 'late';
            return 'night';
        };

        const initBucket = (key) => {
            if (!buckets[key]) {
                buckets[key] = {
                    time: key,
                    dispatchEarly: 0, dispatchLate: 0, dispatchNight: 0,
                    closedEarly: 0, closedLate: 0, closedNight: 0
                };
            }
        };

        createdRes.rows.forEach(r => {
            if (!r.ts) return;
            const key = getBucketKey(r.ts);
            initBucket(key);
            const s = getShift(r.ts);
            if (s === 'early') buckets[key].dispatchEarly++;
            else if (s === 'late') buckets[key].dispatchLate++;
            else buckets[key].dispatchNight++;
        });

        closedRes.rows.forEach(r => {
            if (!r.ts) return;
            const key = getBucketKey(r.ts);
            initBucket(key);
            const s = getShift(r.ts);
            if (s === 'early') buckets[key].closedEarly++;
            else if (s === 'late') buckets[key].closedLate++;
            else buckets[key].closedNight++;
        });

        // Convert to array and sort
        const data = Object.values(buckets).sort((a, b) => a.time.localeCompare(b.time));

        res.json(data);
    } catch (err) {
        console.error("Stats Timeline Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


/* ------------------------------------------------ */
/* DISPATCH by day: dispatched to our queues        */
/* ------------------------------------------------ */
router.get("/dispatch", async (req, res) => {
    try {
        const { from, to } = req.query;
        const f = from || new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
        const t = to || new Date().toISOString().split("T")[0];

        const result = await query(`
            SELECT DATE(dispatch_date AT TIME ZONE '${TZ}') as day, COUNT(*) as count
            FROM queue_items
            WHERE dispatch_date >= $1::date AND dispatch_date < $2::date + INTERVAL '1 day'
            GROUP BY day
            ORDER BY day
        `, [f, t]);

        res.json(result.rows.map(r => ({ day: r.day, count: parseInt(r.count) })));
    } catch (err) {
        console.error("Stats Dispatch Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/* ------------------------------------------------ */
/* CLOSED by day                                    */
/* ------------------------------------------------ */
router.get("/closed", async (req, res) => {
    try {
        const { from, to } = req.query;
        const f = from || new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
        const t = to || new Date().toISOString().split("T")[0];

        const result = await query(`
            SELECT DATE(closed_at AT TIME ZONE '${TZ}') as day, COUNT(*) as count
            FROM queue_items
            WHERE closed_at >= $1::date AND closed_at < $2::date + INTERVAL '1 day'
            GROUP BY day
            ORDER BY day
        `, [f, t]);

        res.json(result.rows.map(r => ({ day: r.day, count: parseInt(r.count) })));
    } catch (err) {
        console.error("Stats Closed Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/* ------------------------------------------------ */
/* EXPIRED by day (commit due passed, still active) */
/* ------------------------------------------------ */
router.get("/expired", async (req, res) => {
    try {
        const { from, to } = req.query;
        const f = from || new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
        const t = to || new Date().toISOString().split("T")[0];

        // "Expired" = ticket whose commit due has passed but is still open (not closed)
        // Use COALESCE(revised_commit_date, commit_date) as the due field
        const result = await query(`
            SELECT
                DATE(COALESCE(revised_commit_date, commit_date) AT TIME ZONE '${TZ}') as day,
                COUNT(*) as count
            FROM queue_items
            WHERE COALESCE(revised_commit_date, commit_date) >= $1::date
              AND COALESCE(revised_commit_date, commit_date) < $2::date + INTERVAL '1 day'
              AND COALESCE(revised_commit_date, commit_date) < NOW()
              AND (closed_at IS NULL AND (status IS NULL OR LOWER(status) NOT IN ('closed','done','resolved')))
            GROUP BY day
            ORDER BY day
        `, [f, t]);

        res.json(result.rows.map(r => ({ day: r.day, count: parseInt(r.count) })));
    } catch (err) {
        console.error("Stats Expired Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/* ------------------------------------------------ */
/* SHIFT HOURS: YEARLY TARGETS + EMPLOYEE PROGRESS  */
/* ------------------------------------------------ */
router.get("/shift-hours", async (req, res) => {
    try {
        const requestedYear = Number.parseInt(String(req.query.year || ""), 10);
        const year = Number.isInteger(requestedYear) ? requestedYear : new Date().getFullYear();

        const [shiftDefinitionsRes, shiftsRes, absencesRes, configRes] = await Promise.all([
            query(`SELECT code, duration_hours FROM shift_definitions`),
            query(`SELECT month, employee_name, day, shift_code FROM shifts WHERE employee_name IS NOT NULL AND btrim(employee_name) <> ''`),
            query(
                `SELECT employee_name, start_date, end_date, type
                 FROM absences
                 WHERE start_date <= $1::date AND end_date >= $2::date`,
                [`${year}-12-31`, `${year}-01-01`]
            ),
            query(`SELECT monthly_target_hours, annual_target_hours FROM shift_planning_config WHERE id = 1`),
        ]);

        const configRow = configRes.rows[0] || {};
        const summary = aggregateYearlyHours({
            year,
            shifts: shiftsRes.rows,
            absences: absencesRes.rows,
            shiftHoursLookup: buildShiftHoursLookup(shiftDefinitionsRes.rows),
            monthlyTargetHours: configRow.monthly_target_hours,
            annualTargetHours: configRow.annual_target_hours,
        });

        const employeesOnTarget = summary.employees.filter((entry) => entry.actual_hours >= entry.annual_target_hours).length;
        const employeesBelowTarget = summary.employees.length - employeesOnTarget;

        res.json({
            ok: true,
            ...summary,
            employees_on_target: employeesOnTarget,
            employees_below_target: employeesBelowTarget,
        });
    } catch (err) {
        console.error("Stats Shift Hours Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;

