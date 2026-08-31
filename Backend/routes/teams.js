/* ------------------------------------------------ */
/* TEAMS INTEGRATION ROUTES                         */
/* /api/teams                                       */
/* ------------------------------------------------ */

import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { config } from "../config/index.js";
import { logTeamsMessage, sendTeamsMessage } from "../services/teamsMessaging.js";

const router = express.Router();

/* ------------------------------------------------ */
/* ROUTES                                           */
/* ------------------------------------------------ */

/* GET /api/teams/log — fetch teams message log */
router.get("/log", requireAuth, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { rows } = await db.query(
      `SELECT * FROM teams_message_log ORDER BY sent_at DESC LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /teams/log error", err);
    res.status(500).json({ error: "Failed to fetch Teams log" });
  }
});

/* POST /api/teams/send — send an ad-hoc message */
router.post("/send", requireAuth, async (req, res) => {
  try {
    const { title, body, type = "ANNOUNCEMENT", recipient, channel } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: "title and body required" });
    }

    const webhookUrl = channel === "personal"
      ? config.TEAMS_PERSONAL_WEBHOOK
      : config.TEAMS_CHANNEL_WEBHOOK;

    let status = "sent";
    let errorMsg = null;

    try {
      await sendTeamsMessage(webhookUrl, title, body);
    } catch (err) {
      status = "failed";
      errorMsg = String(err.message || err);
    }

    await logTeamsMessage(type, recipient || null, channel || "channel", `${title}: ${body}`, status, errorMsg);

    if (status === "failed") {
      return res.status(502).json({ error: "Teams delivery failed", detail: errorMsg });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("POST /teams/send error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /api/teams/notify-assignment — personal assignment notification */
router.post("/notify-assignment", requireAuth, async (req, res) => {
  try {
    const { employee_name, ticket_id, ticket_title } = req.body;
    if (!employee_name || !ticket_id) {
      return res.status(400).json({ error: "employee_name and ticket_id required" });
    }

    const title = `Ticket zugewiesen: ${ticket_id}`;
    const body = `Hallo ${employee_name}, Ihnen wurde das Ticket **${ticket_title || ticket_id}** in ODIN zugewiesen.`;

    let status = "sent";
    let errorMsg = null;

    try {
      await sendTeamsMessage(config.TEAMS_PERSONAL_WEBHOOK, title, body);
    } catch (err) {
      status = "failed";
      errorMsg = String(err.message || err);
    }

    await logTeamsMessage("ASSIGNMENT", employee_name, "personal", body, status, errorMsg);

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: "Failed to send assignment notification" });
  }
});

/* POST /api/teams/announce — global team announcement */
router.post("/announce", requireAuth, async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ error: "title and body required" });

    let status = "sent";
    let errorMsg = null;

    try {
      await sendTeamsMessage(config.TEAMS_CHANNEL_WEBHOOK, title, body);
    } catch (err) {
      status = "failed";
      errorMsg = String(err.message || err);
    }

    await logTeamsMessage("ANNOUNCEMENT", null, "channel", `${title}: ${body}`, status, errorMsg);

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: "Failed to send announcement" });
  }
});

export { sendTeamsMessage, logTeamsMessage as logMessage };
export default router;
