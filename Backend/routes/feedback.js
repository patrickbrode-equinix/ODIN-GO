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

let feedbackSchemaPromise = null;

async function ensureFeedbackSchema() {
  if (!feedbackSchemaPromise) {
    feedbackSchemaPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS feedback_entries (
          id SERIAL PRIMARY KEY,
          type VARCHAR(32) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          sender_name VARCHAR(120),
          sender_email VARCHAR(255),
          screenshot_name VARCHAR(255),
          screenshot_data BYTEA,
          screenshot_mime VARCHAR(64),
          email_sent BOOLEAN DEFAULT FALSE,
          email_error TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'open',
          admin_comment TEXT,
          status_updated_by VARCHAR(120),
          status_updated_at TIMESTAMPTZ,
          archived_at TIMESTAMPTZ,
          archived_by VARCHAR(120),
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await db.query(`
        ALTER TABLE feedback_entries
          ADD COLUMN IF NOT EXISTS screenshot_data BYTEA,
          ADD COLUMN IF NOT EXISTS screenshot_mime VARCHAR(64),
          ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open',
          ADD COLUMN IF NOT EXISTS admin_comment TEXT,
          ADD COLUMN IF NOT EXISTS status_updated_by VARCHAR(120),
          ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS archived_by VARCHAR(120)
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_feedback_entries_archived_at ON feedback_entries(archived_at)');
    })().catch((error) => {
      feedbackSchemaPromise = null;
      throw error;
    });
  }
  return feedbackSchemaPromise;
}

router.use(async (_req, _res, next) => {
  try {
    await ensureFeedbackSchema();
    next();
  } catch (error) {
    next(error);
  }
});

function isPatrickBrode(user) {
  const normalize = (value) => String(value || '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
  const displayName = normalize(user?.displayName);
  const email = normalize(user?.email);
  return displayName === 'patrick brode' || email === 'patrick.brode@eu.equinix.com' || email === 'patrick.brode@equinix.com';
}

function requirePatrickBrode(req, res, next) {
  if (isPatrickBrode(req.user)) return next();
  return res.status(403).json({ error: 'Nur Patrick Brode darf den Feedback-Status bearbeiten.' });
}

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
  const { rows } = await db.query(
    `INSERT INTO feedback_entries (type, title, description, sender_name, sender_email, screenshot_name, screenshot_data, screenshot_mime, email_sent, email_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, created_at AS "createdAt"`,
    [data.type, data.title, data.description, data.senderName, data.senderEmail, data.screenshotName, data.screenshotData || null, data.screenshotMime || null, false, null]
  );
  return rows[0];
}

router.get(
  "/entries",
  requireAuth,
  async (req, res) => {
    const rawLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

    const archived = String(req.query.archived || '').trim().toLowerCase() === 'true';
    const isOwner = !isPatrickBrode(req.user);
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
           admin_comment AS "adminComment",
           status_updated_by AS "statusUpdatedBy",
           status_updated_at AS "statusUpdatedAt",
           archived_at AS "archivedAt",
           archived_by AS "archivedBy",
           created_at AS "createdAt"
         FROM feedback_entries
         WHERE archived_at IS ${archived ? 'NOT' : ''} NULL
           AND ($2::boolean = FALSE OR sender_email = $3)
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit, isOwner, req.user?.email || '']
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
      if (title.trim().length > 255) {
        return res.status(400).json({ error: "Der Titel darf höchstens 255 Zeichen lang sein." });
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

      const entry = await saveFeedbackToDb({
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
        entry,
        message: "Feedback wurde gespeichert und ist im Admin-Bereich sichtbar.",
      });

    } catch (err) {
      console.error("[FEEDBACK] Fehler beim Speichern:", err);
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
  requirePatrickBrode,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, comment } = req.body;
      if (!status || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status muss einer von ${VALID_STATUSES.join(', ')} sein` });
      }
      const adminComment = String(comment || '').trim();
      if (!adminComment) return res.status(400).json({ error: 'Ein Kommentar ist für die Statusänderung erforderlich.' });
      const { rows } = await db.query(
        `UPDATE feedback_entries
            SET status = $1,
                admin_comment = $2,
                status_updated_by = $3,
                status_updated_at = NOW()
          WHERE id = $4 AND archived_at IS NULL
         RETURNING id, type, title, description, sender_name AS "senderName",
                   sender_email AS "senderEmail", screenshot_name AS "screenshotName",
                   status, admin_comment AS "adminComment", status_updated_by AS "statusUpdatedBy",
                   status_updated_at AS "statusUpdatedAt", created_at AS "createdAt"`,
        [status, adminComment, req.user.displayName || req.user.email || 'Patrick Brode', id]
      );
      if (!rows.length) return res.status(404).json({ error: "Feedback-Eintrag nicht gefunden" });
      res.json(rows[0]);
    } catch (err) {
      console.error("[FEEDBACK] Status update error:", err);
      res.status(500).json({ error: "Status konnte nicht aktualisiert werden." });
    }
  }
);

router.patch(
  "/entries/:id/archive",
  requireAuth,
  requirePatrickBrode,
  async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `UPDATE feedback_entries
            SET archived_at = NOW(), archived_by = $1
          WHERE id = $2 AND archived_at IS NULL
          RETURNING id, archived_at AS "archivedAt", archived_by AS "archivedBy"`,
        [req.user.displayName || req.user.email || 'Patrick Brode', id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Feedback-Eintrag nicht gefunden oder bereits archiviert.' });
      res.json(rows[0]);
    } catch (err) {
      console.error('[FEEDBACK] Archive error:', err);
      res.status(500).json({ error: 'Feedback konnte nicht archiviert werden.' });
    }
  }
);

/* ------------------------------------------------ */
/* DELETE /api/feedback/entries/:id                  */
/* ------------------------------------------------ */

router.delete(
  "/entries/:id",
  requireAuth,
  requirePatrickBrode,
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
