/* ------------------------------------------------ */
/* KIOSK MESSAGES ROUTES                            */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { logActivity } from "./activity.js";

const router = express.Router();

/* GET /api/kiosk/messages/active */
/* Query: shift (e.g. E1) */
router.get("/messages/active", requireAuth, async (req, res) => {
    try {
        const shift = req.query.shift;
        const user = req.user; // from auth middleware

        if (!shift) return res.json({ data: [] });

        // Get messages that are active, valid date range, and NOT acknowledged by this user/shift
        // Simplified: Recurrence is always ONCE_PER_SHIFT for now.
        const query = `
            SELECT m.* 
            FROM kiosk_messages m
            LEFT JOIN kiosk_message_acks a ON m.id = a.message_id 
                AND (a.user_id_or_name = $1 OR a.user_id_or_name = $2)
                AND a.shift_code = $3
            WHERE m.active = true
              AND m.start_at <= NOW()
              AND (m.end_at IS NULL OR m.end_at >= NOW())
              AND a.id IS NULL
            ORDER BY m.created_at DESC
        `;

        // Match user by ID or Username/Name (fallback)
        const userIdStr = String(user.id);
        const userName = user.username || user.email;

        const result = await db.query(query, [userIdStr, userName, shift]);
        res.json({ data: result.rows });
    } catch (err) {
        console.error("KIOSK GET ERROR:", err);
        res.status(500).json({ error: "Failed to fetch messages" });
    }
});

/* POST /api/kiosk/messages (Create) */
router.post("/messages", requireAuth, async (req, res) => {
    const { title, body, severity, end_at } = req.body;
    if (!title) return res.status(400).json({ error: "Title required" });

    try {
        const result = await db.query(
            `INSERT INTO kiosk_messages (title, body, severity, end_at, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [title, body, severity || 'INFO', end_at || null, req.user.username]
        );

        // Log
        await logActivity(
            req.user.id,
            req.user.username,
            "KIOSK_MSG_CREATED",
            "KIOSK",
            "kiosk_messages",
            String(result.rows[0].id),
            null,
            { title }
        );

        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error("KIOSK POST ERROR:", err);
        res.status(500).json({ error: "Failed to create message" });
    }
});

/* POST /api/kiosk/messages/:id/ack */
router.post("/messages/:id/ack", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { shift } = req.body;
    if (!shift) return res.status(400).json({ error: "Shift required" });

    try {
        const user = req.user;
        const identifier = user.username || String(user.id);

        await db.query(`
            INSERT INTO kiosk_message_acks (message_id, user_id_or_name, shift_code)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
        `, [id, identifier, shift]);

        await logActivity(
            user.id,
            identifier,
            "KIOSK_MSG_ACK",
            "KIOSK",
            "kiosk_messages",
            id,
            null,
            { shift }
        );

        res.json({ success: true });
    } catch (err) {
        console.error("KIOSK ACK ERROR:", err);
        res.status(500).json({ error: "Failed to ack" });
    }
});

/* POST /api/kiosk/messages/:id/dismiss (Global disable) */
router.post("/messages/:id/dismiss", requireAuth, async (req, res) => {
    const { id } = req.params;
    // Check role if needed (assuming req.user.group or similar)

    try {
        await db.query(`UPDATE kiosk_messages SET active = false WHERE id = $1`, [id]);

        await logActivity(
            req.user.id,
            req.user.username,
            "KIOSK_MSG_DISMISSED",
            "KIOSK",
            "kiosk_messages",
            id,
            null,
            {}
        );

        res.json({ success: true });
    } catch (err) {
        console.error("KIOSK DISMISS ERROR:", err);
        res.status(500).json({ error: "Failed to dismiss" });
    }
});

export default router;
