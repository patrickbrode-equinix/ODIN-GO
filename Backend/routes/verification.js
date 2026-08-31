/* ================================================ */
/* Shift Verification API Routes                    */
/* /api/verification                                */
/* ================================================ */

import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import {
  getVerificationSettings,
  updateVerificationSetting,
  getVerificationsForDate,
  getEmployeeVerification,
  processVerificationResponse,
  overrideVerificationStatus,
  triggerPendingVerifications,
  getVerificationStatusMap,
  VERIFICATION_STATUSES,
} from "../services/shiftVerification.js";
import pool from "../db.js";

const router = express.Router();

/* ------------------------------------------------ */
/* PUBLIC: TV endpoints (no auth)                   */
/* ------------------------------------------------ */

/**
 * GET /api/verification/tv/today
 * Returns verification status map for today.
 * Used by TV dashboard to display badges.
 */
router.get("/tv/today", async (_req, res) => {
  try {
    const map = await getVerificationStatusMap();
    const entries = [];
    for (const [name, data] of map) {
      entries.push({ employeeName: name, ...data });
    }
    res.json({ date: new Date().toISOString().slice(0, 10), verifications: entries });
  } catch (err) {
    console.error("GET /verification/tv/today error:", err);
    res.status(500).json({ error: "Failed to fetch verification status" });
  }
});

/* ------------------------------------------------ */
/* AUTHENTICATED ENDPOINTS                          */
/* ------------------------------------------------ */

/**
 * GET /api/verification/settings
 * Returns current verification configuration.
 */
router.get("/settings", requireAuth, async (_req, res) => {
  try {
    const settings = await getVerificationSettings();
    res.json(settings);
  } catch (err) {
    console.error("GET /verification/settings error:", err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

/**
 * PUT /api/verification/settings
 * Update one or more verification settings.
 * Body: { key: value, ... } e.g. { delayMinutes: 10, enabled: true }
 */
router.put("/settings", requireAuth, async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "Body must be an object of key/value pairs" });
    }

    const allowedKeys = ["enabled", "delayMinutes", "timeoutMinutes", "pendingBlocksAssignment", "autoAbsentOnSick", "autoAbsentOnNoResponse"];
    for (const [key, value] of Object.entries(updates)) {
      if (!allowedKeys.includes(key)) {
        return res.status(400).json({ error: `Unknown setting: ${key}` });
      }
      await updateVerificationSetting(key, value);
    }

    const settings = await getVerificationSettings();
    res.json(settings);
  } catch (err) {
    console.error("PUT /verification/settings error:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

/**
 * GET /api/verification/today
 * Returns all verification records for today.
 */
router.get("/today", requireAuth, async (_req, res) => {
  try {
    const records = await getVerificationsForDate();
    const settings = await getVerificationSettings();
    res.json({ records, settings, date: new Date().toISOString().slice(0, 10) });
  } catch (err) {
    console.error("GET /verification/today error:", err);
    res.status(500).json({ error: "Failed to fetch verifications" });
  }
});

/**
 * GET /api/verification/date/:date
 * Returns all verification records for a specific date.
 */
router.get("/date/:date", requireAuth, async (req, res) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Date format must be YYYY-MM-DD" });
    }
    const records = await getVerificationsForDate(new Date(date));
    res.json({ records, date });
  } catch (err) {
    console.error("GET /verification/date/:date error:", err);
    res.status(500).json({ error: "Failed to fetch verifications" });
  }
});

/**
 * GET /api/verification/employee/:name
 * Returns verification status for a specific employee today.
 */
router.get("/employee/:name", requireAuth, async (req, res) => {
  try {
    const record = await getEmployeeVerification(decodeURIComponent(req.params.name));
    res.json(record || { status: "no_record" });
  } catch (err) {
    console.error("GET /verification/employee/:name error:", err);
    res.status(500).json({ error: "Failed to fetch employee verification" });
  }
});

/**
 * POST /api/verification/override
 * Admin override for verification status.
 * Body: { employeeName, date, shiftCode, status, reason }
 */
router.post("/override", requireAuth, async (req, res) => {
  try {
    const { employeeName, date, shiftCode, status, reason } = req.body;
    if (!employeeName || !date || !shiftCode || !status) {
      return res.status(400).json({ error: "employeeName, date, shiftCode, and status are required" });
    }
    if (!VERIFICATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${VERIFICATION_STATUSES.join(", ")}` });
    }

    const actorName = req.user?.first_name
      ? `${req.user.first_name} ${req.user.last_name || ""}`.trim()
      : req.user?.username || "admin";

    const result = await overrideVerificationStatus(
      employeeName, date, shiftCode, status, actorName, reason || null
    );

    res.json(result);
  } catch (err) {
    console.error("POST /verification/override error:", err);
    res.status(500).json({ error: "Failed to override verification status" });
  }
});

/**
 * POST /api/verification/trigger
 * Manually trigger the verification cycle (for testing or manual execution).
 * In production this would be called by a scheduler.
 */
router.post("/trigger", requireAuth, async (req, res) => {
  try {
    // Dynamically import the Teams notification bridge
    const sendFn = await getTeamsVerificationSender();
    const result = await triggerPendingVerifications(sendFn);
    res.json(result);
  } catch (err) {
    console.error("POST /verification/trigger error:", err);
    res.status(500).json({ error: "Failed to trigger verification cycle" });
  }
});

/**
 * GET /api/verification/audit
 * Returns audit log for verifications.
 * Query params: date, employeeName, limit, offset
 */
router.get("/audit", requireAuth, async (req, res) => {
  try {
    const { date, employeeName, limit = 100, offset = 0 } = req.query;
    let query = `SELECT * FROM shift_verification_audit WHERE 1=1`;
    const params = [];

    if (date) {
      params.push(date);
      query += ` AND date = $${params.length}`;
    }
    if (employeeName) {
      params.push(decodeURIComponent(employeeName));
      query += ` AND employee_name = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(query, params);
    res.json({ entries: rows, limit: parseInt(limit, 10), offset: parseInt(offset, 10) });
  } catch (err) {
    console.error("GET /verification/audit error:", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

/* ------------------------------------------------ */
/* TEAMS BOT CALLBACK: Verification Responses       */
/* ------------------------------------------------ */

/**
 * POST /api/verification/callback
 * Called by the Teams Bot when an employee responds to a verification card.
 * Protected by shared secret (X-ODIN-Bot-Secret header).
 */
router.post("/callback", async (req, res) => {
  try {
    const secret = req.headers["x-odin-bot-secret"];
    const expectedSecret = process.env.ODIN_BOT_SECRET || process.env.TEAMS_BOT_SECRET || "dev-secret";
    if (secret !== expectedSecret) {
      return res.status(403).json({ error: "Invalid bot secret" });
    }

    const { employeeName, date, shiftCode, response, displayName } = req.body;
    if (!employeeName || !date || !shiftCode || !response) {
      return res.status(400).json({ error: "employeeName, date, shiftCode, and response are required" });
    }

    const result = await processVerificationResponse(employeeName, date, shiftCode, response);
    res.json(result);
  } catch (err) {
    console.error("POST /verification/callback error:", err);
    res.status(500).json({ error: "Failed to process verification response" });
  }
});

/* ------------------------------------------------ */
/* HELPER: Teams verification sender bridge         */
/* ------------------------------------------------ */

/**
 * Creates a function that sends verification requests via the Teams Bot.
 * Uses the ODIN backend → Teams Bot internal API bridge.
 */
async function getTeamsVerificationSender() {
  const botBaseUrl = process.env.TEAMS_BOT_URL || "http://localhost:3978";
  const botSecret = process.env.ODIN_BOT_SECRET || process.env.TEAMS_BOT_SECRET || "dev-secret";

  return async function sendTeamsVerification(employeeName, shiftCode, date) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${botBaseUrl}/api/internal/notify/verification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": botSecret,
        },
        body: JSON.stringify({ employeeName, shiftCode, date }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return { success: false, error: `Bot returned ${response.status}: ${text.slice(0, 200)}` };
      }

      const data = await response.json();
      return { success: data.success !== false, error: data.error };
    } catch (err) {
      return { success: false, error: String(err.message || err) };
    }
  };
}

export default router;
