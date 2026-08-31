import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import {
  getCurrentNotificationOccurrenceKeys,
  getNotificationOccurrenceKey,
} from "../lib/jarvisNotificationSchedule.js";

const router = express.Router();
const RECURRENCES = new Set(["once", "daily", "weekly", "monthly"]);
const NOTIFICATION_KINDS = new Set(["notification", "instruction"]);
const ACTIVE_POLL_AFTER_MS = 15_000;

function normalizeRecipientIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

const RECIPIENTS_SELECT = `
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', u.id,
        'displayName', COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.login_name, u.email),
        'email', u.email
      )
      ORDER BY u.last_name NULLS LAST, u.first_name NULLS LAST, u.id
    )
      FROM jarvis_notification_recipients nr
      JOIN users u ON u.id = nr.user_id
     WHERE nr.notification_id = n.id
  ), '[]'::json) AS recipients`;

async function loadPreference(userId) {
  const { rows } = await db.query(
    `SELECT enabled FROM jarvis_notification_preferences WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.enabled !== false;
}

async function loadRecipients() {
  const { rows } = await db.query(
    `SELECT
       id,
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), login_name, email) AS "displayName",
       email
     FROM users
     WHERE approved = TRUE
       AND is_root = FALSE
     ORDER BY last_name NULLS LAST, first_name NULLS LAST, id`,
  );
  return rows;
}

async function loadNotificationList() {
  const { rows } = await db.query(
    `SELECT n.*, ${RECIPIENTS_SELECT}
       FROM jarvis_notifications n
      ORDER BY n.created_at DESC
      LIMIT 100`,
  );
  return rows;
}

async function loadActiveNotifications(userId, now = new Date()) {
  const occurrenceKeys = getCurrentNotificationOccurrenceKeys(now);
  const { rows } = await db.query(
    `SELECT n.id, n.title, n.body, n.recurrence, n.notification_kind, n.created_by, n.created_at,
            CASE n.recurrence
              WHEN 'once' THEN 'once'
              WHEN 'daily' THEN $2::text
              WHEN 'weekly' THEN $3::text
              WHEN 'monthly' THEN $4::text
            END AS occurrence_key
       FROM jarvis_notifications n
      WHERE n.active = TRUE
        AND n.start_at <= NOW()
        AND (n.end_at IS NULL OR n.end_at >= NOW())
        AND (
          NOT EXISTS (
            SELECT 1 FROM jarvis_notification_recipients nr
             WHERE nr.notification_id = n.id
          )
          OR EXISTS (
            SELECT 1 FROM jarvis_notification_recipients nr
             WHERE nr.notification_id = n.id
               AND nr.user_id = $1
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM jarvis_notification_dismissals d
           WHERE d.notification_id = n.id
             AND d.user_id = $1
             AND d.occurrence_key = CASE n.recurrence
               WHEN 'once' THEN 'once'
               WHEN 'daily' THEN $2::text
               WHEN 'weekly' THEN $3::text
               WHEN 'monthly' THEN $4::text
             END
        )
      ORDER BY CASE WHEN n.notification_kind = 'instruction' THEN 0 ELSE 1 END, n.created_at DESC
      LIMIT 20`,
    [userId, occurrenceKeys.daily, occurrenceKeys.weekly, occurrenceKeys.monthly],
  );
  return rows;
}

router.get("/active", requireAuth, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    const enabled = await loadPreference(req.user.id);
    const notifications = enabled ? await loadActiveNotifications(req.user.id) : [];
    res.json({ notifications, enabled, pollAfterMs: ACTIVE_POLL_AFTER_MS, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("JARVIS NOTIFICATION ACTIVE ERROR:", error);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.get("/bootstrap", requireAuth, async (req, res) => {
  try {
    const [notifications, recipients, enabled] = await Promise.all([
      loadNotificationList(),
      loadRecipients(),
      loadPreference(req.user.id),
    ]);
    res.json({ notifications, recipients, enabled, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("JARVIS NOTIFICATION BOOTSTRAP ERROR:", error);
    res.status(500).json({ error: "Failed to load notification workspace" });
  }
});

router.get("/preferences", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT enabled FROM jarvis_notification_preferences WHERE user_id = $1`,
    [req.user.id],
  );
  res.json({ enabled: rows[0]?.enabled !== false });
});

router.put("/preferences", requireAuth, async (req, res) => {
  const enabled = req.body?.enabled !== false;
  await db.query(
    `INSERT INTO jarvis_notification_preferences (user_id, enabled)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
    [req.user.id, enabled],
  );
  res.json({ enabled });
});

router.get("/recipients", requireAuth, async (_req, res) => {
  try {
    res.json({ recipients: await loadRecipients() });
  } catch (error) {
    console.error("JARVIS NOTIFICATION RECIPIENTS ERROR:", error);
    res.status(500).json({ error: "Failed to load recipients" });
  }
});

router.get("/staffing", requireAuth, async (_req, res) => {
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const month = `${months[parts.month - 1]} ${parts.year}`;
  const { rows } = await db.query(
    `SELECT upper(trim(shift_code)) AS shift_code, COUNT(DISTINCT employee_name)::int AS count
       FROM shifts WHERE month = $1 AND day = $2 GROUP BY upper(trim(shift_code))`,
    [month, parts.day],
  );
  const staffing = { early: 0, late: 0, night: 0 };
  for (const row of rows) {
    if (/^(E|HE)/.test(row.shift_code)) staffing.early += row.count;
    else if (/^(L|HL)/.test(row.shift_code)) staffing.late += row.count;
    else if (row.shift_code === "N") staffing.night += row.count;
  }
  res.json({ date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`, ...staffing });
});

router.post("/:id/dismiss", requireAuth, async (req, res) => {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({ error: "INVALID_NOTIFICATION_ID", message: "Die Notification-ID ist ungültig." });
    }
    const notification = await db.query(
      `SELECT n.id, n.recurrence
         FROM jarvis_notifications n
        WHERE n.id = $1
          AND n.active = TRUE
          AND (
            NOT EXISTS (SELECT 1 FROM jarvis_notification_recipients nr WHERE nr.notification_id = n.id)
            OR EXISTS (SELECT 1 FROM jarvis_notification_recipients nr WHERE nr.notification_id = n.id AND nr.user_id = $2)
          )`,
      [notificationId, req.user.id],
    );
    if (!notification.rows[0]) {
      return res.json({ success: true, dismissed: false, message: "Die Notification ist nicht mehr aktiv." });
    }
    const occurrenceKey = getNotificationOccurrenceKey(notification.rows[0].recurrence);
    await db.query(
      `INSERT INTO jarvis_notification_dismissals (notification_id, user_id, occurrence_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (notification_id, user_id, occurrence_key)
       DO UPDATE SET dismissed_at = EXCLUDED.dismissed_at`,
      [notificationId, req.user.id, occurrenceKey],
    );
    res.json({ success: true, dismissed: true, occurrenceKey });
  } catch (error) {
    console.error("JARVIS NOTIFICATION DISMISS ERROR:", error);
    res.status(500).json({ error: "Failed to dismiss notification" });
  }
});

router.get("/", requireAuth, async (_req, res) => {
  try {
    res.json({ notifications: await loadNotificationList() });
  } catch (error) {
    console.error("JARVIS NOTIFICATION LIST ERROR:", error);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();
  const recurrence = String(req.body?.recurrence || "once").trim();
  const notificationKind = String(req.body?.notificationKind || "notification").trim();
  const recipientUserIds = normalizeRecipientIds(req.body?.recipientUserIds);
  if (!title || !RECURRENCES.has(recurrence) || !NOTIFICATION_KINDS.has(notificationKind)) {
    return res.status(400).json({ error: "Invalid notification" });
  }
  const creator = req.user.displayName || req.user.email || "Unbekannt";
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    if (recipientUserIds.length > 0) {
      const validRecipients = await client.query(
        `SELECT id FROM users WHERE id = ANY($1::int[]) AND approved = TRUE AND is_root = FALSE`,
        [recipientUserIds],
      );
      if (validRecipients.rows.length !== recipientUserIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "INVALID_RECIPIENTS", message: "Mindestens ein ausgewählter Empfänger ist nicht verfügbar." });
      }
    }

    const { rows } = await client.query(
      `INSERT INTO jarvis_notifications (title, body, recurrence, notification_kind, start_at, end_at, created_by, created_by_user_id)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6::timestamptz, $7, $8)
       RETURNING *`,
      [title, body, recurrence, notificationKind, req.body?.startAt || null, req.body?.endAt || null, creator, req.user.id],
    );

    for (const userId of recipientUserIds) {
      await client.query(
        `INSERT INTO jarvis_notification_recipients (notification_id, user_id) VALUES ($1, $2)`,
        [rows[0].id, userId],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ notification: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("JARVIS NOTIFICATION CREATE ERROR:", error);
    res.status(500).json({ error: "Failed to create notification" });
  } finally {
    client.release();
  }
});

router.patch("/:id", requireAuth, requirePageAccess("admin_settings", "write"), async (req, res) => {
  const active = req.body?.active === true;
  const { rows } = await db.query(
    `UPDATE jarvis_notifications SET active = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [Number(req.params.id), active],
  );
  if (!rows[0]) return res.status(404).json({ error: "Notification not found" });
  res.json({ notification: rows[0] });
});

router.delete("/:id", requireAuth, requirePageAccess("admin_settings", "write"), async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM jarvis_notifications WHERE id = $1 RETURNING id`,
      [Number(req.params.id)],
    );
    if (!rows[0]) return res.status(404).json({ error: "Notification not found" });
    res.json({ success: true, id: rows[0].id });
  } catch (error) {
    console.error("JARVIS NOTIFICATION DELETE ERROR:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

export default router;
