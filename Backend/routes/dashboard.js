import express from "express";
const router = express.Router();
import { query } from "../db/index.js";
import { getCriticalWorkloadSnapshot } from "../assignment/services/criticalWorkload.js";
import { logActivity } from "./activity.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { broadcast } from "./sse.js";

router.use(requireAuth); // All /api/dashboard/* routes require a valid JWT

/* ------------------------------------------------ */
/* DASHBOARD INFO                                   */
/* ------------------------------------------------ */

router.get("/critical-workload", async (_req, res) => {
    try {
        const snapshot = await getCriticalWorkloadSnapshot({ queryFn: query });
        res.json(snapshot);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch critical workload" });
    }
});

router.get("/config", async (_req, res) => {
    try {
        const { rows } = await query(
            "SELECT key, value FROM app_settings WHERE key = 'threshold.critical_ticket_window_hours'"
        );
        const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
        const criticalTicketWindowHours = Math.max(
            1,
            Number.parseInt(String(settings["threshold.critical_ticket_window_hours"] || "72"), 10) || 72,
        );

        res.json({
            data: {
                criticalTicketWindowHours,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch dashboard config" });
    }
});

router.get("/info", async (req, res) => {
    try {
        const result = await query("SELECT * FROM dashboard_info ORDER BY id DESC LIMIT 1");
        // If no row, return default
        const data = result.rows[0] || { content: "", is_visible: false };
        res.json({ data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch dashboard info" });
    }
});

router.put("/info", async (req, res) => {
    const { content, is_visible } = req.body;
    const user = req.user?.displayName || "System";

    try {
        // Upsert logic: simple way is to check count or just always insert/update
        // Let's keep a single row for simplicity, or just simple UPDATE if exists
        // actually, let's just INSERT a new row to keep history? No, requirement says 'persist', usually implies current state.
        // Let's use a single row pattern with ID=1 or similar, OR just update the latest.
        // Better: UPSERT on ID=1

        // Check if row exists
        const check = await query("SELECT id FROM dashboard_info ORDER BY id DESC LIMIT 1");
        let newData;

        if (check.rows.length === 0) {
            const ins = await query(
                "INSERT INTO dashboard_info (content, is_visible, updated_by) VALUES ($1, $2, $3) RETURNING *",
                [content, is_visible, user]
            );
            newData = ins.rows[0];
        } else {
            const id = check.rows[0].id;
            const upd = await query(
                "UPDATE dashboard_info SET content=$1, is_visible=$2, updated_by=$3, updated_at=NOW() WHERE id=$4 RETURNING *",
                [content, is_visible, user, id]
            );
            newData = upd.rows[0];
        }

        await logActivity(
            req.user?.id,
            user,
            "DASHBOARD_INFO_UPDATE",
            "DASHBOARD",
            "dashboard_info",
            newData.id,
            null,
            { content, is_visible }
        );

        res.json({ data: newData });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update dashboard info" });
    }
});

/* ------------------------------------------------ */
/* DASHBOARD INFO ENTRIES (multi-entry)             */
/* ------------------------------------------------ */

router.get("/info-entries", async (req, res) => {
    try {
        const result = await query("SELECT * FROM dashboard_info_entries WHERE delete_at IS NULL OR delete_at > NOW() ORDER BY created_at DESC");
        res.json({ data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch info entries" });
    }
});

router.post("/info-entries", async (req, res) => {
    const { content, type = 'info' } = req.body;
    if (!content || !content.trim()) {
        return res.status(400).json({ error: "content is required" });
    }
    // Validate type
    if (type !== 'info' && type !== 'instruction') {
        return res.status(400).json({ error: "Invalid type" });
    }

    try {
        const result = await query(
            "INSERT INTO dashboard_info_entries (content, type) VALUES ($1, $2) RETURNING *",
            [content.trim(), type]
        );
        const entry = result.rows[0];
        // Broadcast realtime update to all SSE clients
        broadcast("info_created", { id: entry.id, type: entry.type, content: entry.content });
        res.status(201).json({ data: entry });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create info entry" });
    }
});

router.patch("/info-entries/:id", async (req, res) => {
    const { id } = req.params;
    const { deleteAt, type } = req.body; // Expects ISO string or null, type optional

    try {
        // Build dynamic update
        const fields = [];
        const values = [];
        let idx = 1;

        if (deleteAt !== undefined) {
            fields.push(`delete_at = $${idx++}`);
            values.push(deleteAt);
        }
        if (type !== undefined) {
            if (type !== 'info' && type !== 'instruction') return res.status(400).json({ error: "Invalid type" });
            fields.push(`type = $${idx++}`);
            values.push(type);
        }

        if (fields.length === 0) return res.json({ error: "No fields to update" });

        values.push(id);
        const result = await query(
            `UPDATE dashboard_info_entries SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
            values
        );
        res.json({ data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update info entry" });
    }
});

router.delete("/info-entries/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await query("DELETE FROM dashboard_info_entries WHERE id = $1", [id]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete info entry" });
    }
});

/* AUTO-CLEANUP INTERVAL (15 min) */
setInterval(async () => {
    try {
        await query("DELETE FROM dashboard_info_entries WHERE delete_at IS NOT NULL AND delete_at <= NOW()");
    } catch (e) {
        console.error("Auto-Cleanup info entries failed", e);
    }
}, 15 * 60 * 1000);

/* ------------------------------------------------ */
/* FEATURE TOGGLES                                  */
/* ------------------------------------------------ */

router.get("/toggles", async (req, res) => {
    try {
        const result = await query("SELECT key, is_enabled FROM feature_toggles");
        // Convert to object { key: true/false }
        const toggles = {};
        result.rows.forEach(r => {
            toggles[r.key] = r.is_enabled;
        });
        res.json({ data: toggles });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch toggles" });
    }
});

router.put("/toggles/:key", async (req, res) => {
    const { key } = req.params;
    const { is_enabled } = req.body;
    const user = req.user?.displayName || "System";

    try {
        const result = await query(
            `INSERT INTO feature_toggles (key, is_enabled, updated_by, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW()
             RETURNING *`,
            [key, is_enabled, user]
        );

        await logActivity(
            req.user?.id,
            user,
            "TOGGLE_CHANGED",
            "DASHBOARD",
            "feature_toggles",
            key,
            null,
            { key, is_enabled }
        );

        res.json({ data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update toggle" });
    }
});

export default router;
