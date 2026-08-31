import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { config } from '../config/index.js';

const router = express.Router();

// Helper to format month label (e.g. "März 2026")
// Replicated locally to avoid dependency issues if utils aren't shared
const getMonthName = (monthIndex) => {
    const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    return months[monthIndex - 1];
};

// POST /api/reports/generate
// Body: { year, month }
router.post('/generate', requireAuth, async (req, res) => {
    const { year, month } = req.body;
    if (!year || !month) return res.status(400).json({ error: 'Missing year/month' });

    try {
        const monthLabel = `${getMonthName(month)} ${year}`;
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

        // 1. Fetch Violations (Warnungen)
        const { rows: violations } = await db.query(
            `SELECT * FROM constraint_violations 
             WHERE month = $1
             ORDER BY employee_name`,
            [monthLabel]
        );

        // 2. Fetch Understaffing (Unterbesetzung)
        const { rows: understaffing } = await db.query(
            `SELECT * FROM staffing_results 
             WHERE date >= $1 AND date <= $2 AND status = 'FAIL'
             ORDER BY date ASC`,
            [startDate, endDate]
        );

        // 3. Generate CSV
        const lines = [];
        lines.push("Datum;Typ;Bereich/Mitarbeiter;Details");

        // Add Violations
        for (const v of violations) {
            const dateStr = v.date ? new Date(v.date).toLocaleDateString('de-DE') : monthLabel;
            const details = v.details?.msg || JSON.stringify(v.details);
            lines.push(`${dateStr};Regelverstoß;${v.employee_name};${details}`);
        }

        // Add Understaffing
        for (const u of understaffing) {
            const dateStr = new Date(u.date).toLocaleDateString('de-DE');
            lines.push(`${dateStr};Unterbesetzung;${u.shift_type};Ist: ${u.actual} / Soll: ${u.min}`);
        }

        const csvContent = lines.join("\n");
        const userId = req.user ? req.user.id : null;

        // 4. Save Record
        const { rows: reportRows } = await db.query(
            `INSERT INTO reports (type, params, payload, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            ['MONTHLY_ISSUES_CSV', JSON.stringify({ year, month }), csvContent, userId]
        );

        res.json({ success: true, reportId: reportRows[0].id });

    } catch (err) {
        console.error("REPORT GENERATION ERROR:", err);
        res.status(500).json({ error: "Failed to generate report" });
    }
});

// GET /api/reports/:id/download
router.get('/:id/download', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await db.query("SELECT * FROM reports WHERE id = $1", [id]);
        if (rows.length === 0) return res.status(404).send("Report not found");

        const report = rows[0];
        const filename = `report_${report.id}_${new Date().toISOString().split('T')[0]}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Add BOM for Excel compatibility
        res.send('\uFEFF' + report.payload);

    } catch (err) {
        console.error("REPORT DOWNLOAD ERROR:", err);
        res.status(500).send("Download failed");
    }
});




/* ------------------------------------------------ */
/* NEW EXPORTS (XLSX)                               */
/* ------------------------------------------------ */

import XLSX from 'xlsx';

// GET /api/reports/shiftplan/export
// Query: from, to
router.get('/shiftplan/export', requireAuth, async (req, res) => {
    try {
        const { from, to } = req.query;
        if (!from || !to) return res.status(400).send("Missing from/to");

        // Fetch Shifts
        const query = `
            SELECT shift.month, shift.day, shift.employee_name, shift.shift_code
            FROM shifts shift
            -- We need to construct a date to filter by range.
            -- This validates "Month String" format is consistent or we use a smarter query.
            -- Given the current DB structure (month="Januar 2026", day=1), strict date filtering is hard in SQL directly
            -- without a complex conversion.
            -- EASIER STRATEGY: 
            -- 1. Parse 'from' and 'to' in JS.
            -- 2. Iterate months between from/to.
            -- 3. Fetch all shifts for those months.
            -- 4. Filter exact days in JS.
        `;

        // Let's grab ALL shifts first (or optimization: grab relevant months)
        // Optimization: Filter by month string matching if possible, but normalization is tricky.
        // We will fetch ALL shifts for the involved months.

        const fromDate = new Date(from);
        const toDate = new Date(to);

        // Helper to get needed month labels
        const neededMonths = new Set();
        let cur = new Date(fromDate);
        cur.setDate(1);
        while (cur <= toDate) {
            const mName = getMonthName(cur.getMonth() + 1);
            const y = cur.getFullYear();
            neededMonths.add(`${mName} ${y}`);
            cur.setMonth(cur.getMonth() + 1);
        }

        const { rows } = await db.query(`SELECT * FROM shifts WHERE month = ANY($1)`, [Array.from(neededMonths)]);

        // Pivot Data
        // Row: Employee
        // Cols: Date
        const dataMap = {}; // { emp: { dateStr: code } }
        const allDates = [];

        // Generate all dates in range
        let iter = new Date(fromDate);
        while (iter <= toDate) {
            allDates.push(iter.toISOString().split('T')[0]);
            iter.setDate(iter.getDate() + 1);
        }

        for (const row of rows) {
            // Convert Month+Day to DateStr
            const parts = row.month.split(' '); // ["Januar", "2026"]
            const monthIdx = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"].indexOf(parts[0]);
            const year = parseInt(parts[1]);

            if (monthIdx === -1) continue;

            // Construct Date
            // Note: row.day is 1-31
            const d = new Date(year, monthIdx, row.day);
            // Adjust for TZ if needed, but here simply:
            // We use local construction 
            // Better: use explicit YYYY-MM-DD string construction
            const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(row.day).padStart(2, '0')}`;

            if (dateStr >= from && dateStr <= to) {
                if (!dataMap[row.employee_name]) dataMap[row.employee_name] = {};
                dataMap[row.employee_name][dateStr] = row.shift_code;
            }
        }

        // Build Sheet
        const wb = XLSX.utils.book_new();
        const wsData = [];

        // Header
        wsData.push(["Mitarbeiter", ...allDates]);

        // Rows
        for (const emp of Object.keys(dataMap).sort()) {
            const row = [emp];
            for (const date of allDates) {
                row.push(dataMap[emp][date] || "");
            }
            wsData.push(row);
        }

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Schichtplan");

        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="shiftplan_export_${from}_${to}.xlsx"`);
        res.send(buf);

    } catch (err) {
        console.error("SHIFTPLAN EXPORT ERROR:", err);
        res.status(500).send("Export failed");
    }
});

// GET /api/reports/changes/export
router.get('/changes/export', requireAuth, async (req, res) => {
    try {
        const { from, to } = req.query;
        if (!from || !to) return res.status(400).send("Missing from/to");

        const query = `
            SELECT * FROM shift_change_log 
            WHERE date >= $1 AND date <= $2
            ORDER BY date DESC, changed_at DESC
        `;
        const { rows } = await db.query(query, [from, to]);

        // Transform for nice Excel
        const data = rows.map(r => ({
            Datum: new Date(r.date).toLocaleDateString('de-DE'),
            Mitarbeiter: r.employee_name,
            "Alt": r.old_value || "",
            "Neu": r.new_value || "",
            "Geändert am": new Date(r.changed_at).toLocaleString('de-DE', { timeZone: config.OPERATIONAL_TIMEZONE }),
            "Geändert von": r.changed_by,
            "Quelle": r.source
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Änderungen");

        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="changelog_export_${from}_${to}.xlsx"`);
        res.send(buf);

    } catch (err) {
        console.error("CHANGES EXPORT ERROR:", err);
        res.status(500).send("Export failed");
    }
});

// GET /api/reports/changelog/exists
// Returns { exists: true } if there's any data in shift_change_log
router.get('/changelog/exists', async (req, res) => {
    try {
        const { rows } = await db.query("SELECT 1 FROM shift_change_log LIMIT 1");
        res.json({ exists: rows.length > 0 });
    } catch (err) {
        // Table may not exist yet – return false gracefully
        res.json({ exists: false });
    }
});

export default router;
