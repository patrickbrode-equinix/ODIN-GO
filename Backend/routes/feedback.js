/* ------------------------------------------------ */
/* FEEDBACK ROUTE – DB ONLY                          */
/* Admin sieht nur eingereichte User-Feedbacks       */
/* ------------------------------------------------ */

import express from "express";
import multer from "multer";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import db from "../db.js";
import { config } from "../config/index.js";

const router = express.Router();

/* ------------------------------------------------ */
/* MULTER – Screenshot in Memory (kein Disk)        */
/* ------------------------------------------------ */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Nur Bilddateien (PNG, JPEG, GIF, WebP) sind erlaubt"));
    }
  },
});

async function getFeedbackSettings() {
  try {
    const { rows } = await db.query("SELECT key, value FROM app_settings WHERE key LIKE 'feedback.%'");
    return Object.fromEntries(rows.map(r => [r.key.replace('feedback.', ''), r.value]));
  } catch {
    return {};
  }
}

async function saveFeedbackToDb(data) {
  try {
    await db.query(
      `INSERT INTO feedback_entries (type, title, description, sender_name, sender_email, screenshot_name, screenshot_data, screenshot_mime, email_sent, email_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [data.type, data.title, data.description, data.senderName, data.senderEmail, data.screenshotName, data.screenshotData || null, data.screenshotMime || null, false, null]
    );
  } catch (err) {
    console.error("[FEEDBACK] Failed to save feedback to DB:", err.message);
  }
}

router.get(
  "/entries",
  requireAuth,
  requirePageAccess("admin_settings", "view"),
  async (req, res) => {
    const rawLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

    try {
      const { rows } = await db.query(
        `SELECT
           id,
           type,
           title,
           description,
           sender_name AS "senderName",
           sender_email AS "senderEmail",
           screenshot_name AS "screenshotName",
           status,
           created_at AS "createdAt"
         FROM feedback_entries
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );

      res.json(rows);
    } catch (err) {
      console.error("[FEEDBACK] Failed to load feedback entries:", err);
      res.status(500).json({ error: "Feedback-Eintraege konnten nicht geladen werden." });
    }
  }
);

/* ------------------------------------------------ */
/* POST /api/feedback                               */
/* ------------------------------------------------ */

router.post(
  "/",
  requireAuth,
  upload.single("screenshot"),
  async (req, res) => {
    try {
      const { type, title, description, route } = req.body;

      // Validierung
      if (!type || !["Bug", "Verbesserung"].includes(type)) {
        return res.status(400).json({ error: "Typ muss 'Bug' oder 'Verbesserung' sein" });
      }
      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return res.status(400).json({ error: "Titel ist ein Pflichtfeld" });
      }
      if (!description || typeof description !== "string" || description.trim().length === 0) {
        return res.status(400).json({ error: "Beschreibung ist ein Pflichtfeld" });
      }

      // User-Kontext
      const senderName = req.user?.displayName || req.user?.email || "Unbekannt";
      const senderEmail = req.user?.email || "unbekannt@local";
      const timestamp = new Date().toLocaleString("de-DE", { timeZone: config.OPERATIONAL_TIMEZONE });

      const settings = await getFeedbackSettings();
      if (settings.enabled === 'false') {
        return res.status(403).json({ error: "Feedback-Funktion ist aktuell deaktiviert." });
      }

      if (req.file && settings.allow_screenshots === 'false') {
        return res.status(400).json({ error: "Screenshots sind aktuell deaktiviert." });
      }

      const maxSizeMb = Number.parseFloat(String(settings.max_size_mb ?? "10"));
      if (req.file && Number.isFinite(maxSizeMb) && maxSizeMb > 0) {
        const maxSizeBytes = maxSizeMb * 1024 * 1024;
        if (req.file.size > maxSizeBytes) {
          return res.status(400).json({ error: `Screenshot ist groesser als ${maxSizeMb} MB.` });
        }
      }

      await saveFeedbackToDb({
        type,
        title: title.trim(),
        description: `${description.trim()}\n\nKontext:\n- Route: ${route || "-"}\n- Zeitpunkt: ${timestamp}`,
        senderName,
        senderEmail,
        screenshotName: req.file?.originalname || null,
        screenshotData: req.file?.buffer || null,
        screenshotMime: req.file?.mimetype || null,
      });

      res.json({
        success: true,
        message: "Feedback wurde gespeichert und ist im Admin-Bereich sichtbar.",
      });

    } catch (err) {
      console.error("[FEEDBACK] Fehler beim Speichern:", err);
      try {
        await saveFeedbackToDb({
          type: req.body?.type,
          title: req.body?.title,
          description: req.body?.description,
          senderName: req.user?.email || 'unknown',
          senderEmail: req.user?.email,
          screenshotName: req.file?.originalname || null,
          screenshotData: req.file?.buffer || null,
          screenshotMime: req.file?.mimetype || null,
        });
      } catch { /* ignore */ }
      res.status(500).json({
        error: "Feedback konnte nicht gespeichert werden. Bitte versuchen Sie es spaeter erneut.",
      });
    }
  }
);

/* ------------------------------------------------ */
/* PATCH /api/feedback/entries/:id/status            */
/* ------------------------------------------------ */

const VALID_STATUSES = ['open', 'in_progress', 'done'];

router.patch(
  "/entries/:id/status",
  requireAuth,
  requirePageAccess("admin_settings", "write"),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      if (!status || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status muss einer von ${VALID_STATUSES.join(', ')} sein` });
      }
      const { rows } = await db.query(
        `UPDATE feedback_entries SET status = $1 WHERE id = $2
         RETURNING id, type, title, description, sender_name AS "senderName",
                   sender_email AS "senderEmail", screenshot_name AS "screenshotName",
                   status, created_at AS "createdAt"`,
        [status, id]
      );
      if (!rows.length) return res.status(404).json({ error: "Feedback-Eintrag nicht gefunden" });
      res.json(rows[0]);
    } catch (err) {
      console.error("[FEEDBACK] Status update error:", err);
      res.status(500).json({ error: "Status konnte nicht aktualisiert werden." });
    }
  }
);

/* ------------------------------------------------ */
/* DELETE /api/feedback/entries/:id                  */
/* ------------------------------------------------ */

router.delete(
  "/entries/:id",
  requireAuth,
  requirePageAccess("admin_settings", "write"),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { rows } = await db.query(
        `DELETE FROM feedback_entries WHERE id = $1 RETURNING id`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: "Feedback-Eintrag nicht gefunden" });
      res.json({ ok: true, deleted: rows[0].id });
    } catch (err) {
      console.error("[FEEDBACK] Delete error:", err);
      res.status(500).json({ error: "Feedback konnte nicht geloescht werden." });
    }
  }
);

/* ------------------------------------------------ */
/* GET /api/feedback/entries/:id/screenshot          */
/* ------------------------------------------------ */

router.get(
  "/entries/:id/screenshot",
  requireAuth,
  requirePageAccess("admin_settings", "view"),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { rows } = await db.query(
        `SELECT screenshot_data, screenshot_mime, screenshot_name FROM feedback_entries WHERE id = $1`,
        [id]
      );
      if (!rows.length || !rows[0].screenshot_data) {
        return res.status(404).json({ error: "Kein Screenshot vorhanden" });
      }
      const { screenshot_data, screenshot_mime, screenshot_name } = rows[0];
      res.set("Content-Type", screenshot_mime || "image/png");
      res.set("Content-Disposition", `inline; filename="${screenshot_name || "screenshot"}"`);
      res.send(screenshot_data);
    } catch (err) {
      console.error("[FEEDBACK] Screenshot serve error:", err);
      res.status(500).json({ error: "Screenshot konnte nicht geladen werden." });
    }
  }
);

export default router;
