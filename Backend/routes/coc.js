import express from "express";
import multer from "multer";
import db from "../db.js";
import { requireAuth, requireVerifiedIdentity } from "../middleware/authMiddleware.js";
import { getCocMailStatus, sendCocReviewNotification, sendCocTestEmail } from "../services/cocNotifications.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set([
      "image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf",
      "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain", "text/csv",
    ]);
    callback(allowed.has(file.mimetype) ? null : Object.assign(new Error("Dieser Dateityp ist nicht erlaubt."), { status: 400 }), allowed.has(file.mimetype));
  },
});

const CLASSIFICATIONS = new Set(["problem", "idea", "improvement"]);
const ACTIONS = new Set(["forward", "approve", "reject"]);
const CASE_SELECT = `
  SELECT c.id, c.reference, c.classification, c.title,
         c.short_description AS "shortDescription", c.description,
         c.submitter_user_id AS "submitterUserId", c.submitter_name AS "submitterName",
         c.submitter_email AS "submitterEmail", c.current_approver_user_id AS "currentApproverUserId",
         c.status, c.current_level AS "currentLevel", c.created_at AS "createdAt",
         c.updated_at AS "updatedAt", c.decided_at AS "decidedAt",
         CONCAT_WS(' ', approver.first_name, approver.last_name) AS "currentApproverName",
         COALESCE(att.count, 0)::int AS "attachmentCount"
  FROM coc_cases c
  LEFT JOIN users approver ON approver.id = c.current_approver_user_id
  LEFT JOIN LATERAL (SELECT COUNT(*) AS count FROM coc_case_attachments a WHERE a.case_id = c.id) att ON TRUE`;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isAdmin(req) {
  return req.isRoot || req.user?.is_root || req.user?.is_admin;
}

function requireCocAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.status(403).json({ code: "COC_ADMIN_REQUIRED", message: "Dieser Bereich ist nur für Administratoren freigegeben." });
}

async function canReadCase(caseId, req) {
  if (isAdmin(req)) return true;
  if (req.cocReviewCaseId && Number(req.cocReviewCaseId) !== Number(caseId)) return false;
  const result = await db.query(
    `SELECT 1 FROM coc_cases
     WHERE id = $1 AND (submitter_user_id = $2 OR current_approver_user_id = $2)
     UNION
     SELECT 1 FROM coc_case_events WHERE case_id = $1 AND actor_user_id = $2
     LIMIT 1`,
    [caseId, req.user.id],
  );
  return result.rowCount > 0;
}

async function notifyApprover(caseId, approverUserId) {
  if (!approverUserId) return { sent: false, reason: "no_approver" };
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.reference, c.title, c.classification, c.submitter_name,
              u.id AS recipient_id, u.email AS recipient_email,
              CONCAT_WS(' ', u.first_name, u.last_name) AS recipient_name
       FROM coc_cases c JOIN users u ON u.id = $2 WHERE c.id = $1`,
      [caseId, approverUserId],
    );
    const row = rows[0];
    if (!row) return { sent: false, reason: "approver_not_found" };
    return await sendCocReviewNotification({
      caseId: row.id,
      reference: row.reference,
      title: row.title,
      classification: row.classification,
      recipientUserId: row.recipient_id,
      recipientName: row.recipient_name || row.recipient_email,
      recipientEmail: row.recipient_email,
      submittedBy: row.submitter_name,
    });
  } catch (error) {
    console.error("[COC] Review notification failed:", error?.message || error);
    return { sent: false, reason: "mail_send_failed" };
  }
}

async function commandChainWouldCycle(userId, managerUserId) {
  if (!managerUserId) return false;
  const { rows } = await db.query(
    `WITH RECURSIVE managers(user_id, manager_user_id) AS (
       SELECT user_id, manager_user_id FROM coc_command_chain WHERE user_id = $1
       UNION ALL
       SELECT c.user_id, c.manager_user_id FROM coc_command_chain c
       JOIN managers m ON c.user_id = m.manager_user_id
     )
     SELECT 1 FROM managers WHERE manager_user_id = $2 LIMIT 1`,
    [managerUserId, userId],
  );
  return rows.length > 0 || Number(userId) === Number(managerUserId);
}

router.use(requireAuth);

router.get("/cases", requireVerifiedIdentity, async (req, res, next) => {
  try {
    const scope = String(req.query.scope || "mine");
    let where;
    let params;
    if (req.cocReviewCaseId) {
      where = `c.id = $1 AND c.current_approver_user_id = $2 AND c.status = 'pending'`;
      params = [req.cocReviewCaseId, req.user.id];
    } else if (scope === "inbox") where = `c.current_approver_user_id = $1 AND c.status = 'pending'`;
    else if (scope === "all" && isAdmin(req)) where = "TRUE";
    else where = "c.submitter_user_id = $1";
    params ||= scope === "all" && isAdmin(req) ? [] : [req.user.id];
    const { rows } = await db.query(`${CASE_SELECT} WHERE ${where} ORDER BY c.created_at DESC LIMIT 250`, params);
    res.json(rows);
  } catch (error) { next(error); }
});

router.get("/cases/:id", requireVerifiedIdentity, async (req, res, next) => {
  try {
    const caseId = Number(req.params.id);
    if (!Number.isInteger(caseId) || !(await canReadCase(caseId, req))) return res.status(404).json({ message: "Vorgang nicht gefunden." });
    const caseResult = await db.query(`${CASE_SELECT} WHERE c.id = $1`, [caseId]);
    if (!caseResult.rowCount) return res.status(404).json({ message: "Vorgang nicht gefunden." });
    const [events, attachments] = await Promise.all([
      db.query(`SELECT e.id, e.action, e.comment, e.actor_name AS "actorName", e.created_at AS "createdAt",
                       CONCAT_WS(' ', target.first_name, target.last_name) AS "toApproverName"
                FROM coc_case_events e LEFT JOIN users target ON target.id = e.to_approver_user_id
                WHERE e.case_id = $1 ORDER BY e.created_at ASC, e.id ASC`, [caseId]),
      db.query(`SELECT id, original_name AS name, mime_type AS "mimeType", file_size AS size, created_at AS "createdAt"
                FROM coc_case_attachments WHERE case_id = $1 ORDER BY id ASC`, [caseId]),
    ]);
    res.json({ ...caseResult.rows[0], events: events.rows, attachments: attachments.rows });
  } catch (error) { next(error); }
});

router.post("/cases", requireVerifiedIdentity, upload.array("attachments", 5), async (req, res, next) => {
  if (req.cocReviewCaseId) return res.status(403).json({ message: "Ein externer Prüflink darf keine neuen Vorgänge erstellen." });
  const client = await db.connect();
  try {
    const classification = cleanText(req.body.classification, 24).toLowerCase();
    const title = cleanText(req.body.title, 180);
    const shortDescription = cleanText(req.body.shortDescription, 500);
    const description = cleanText(req.body.description, 20000);
    if (!CLASSIFICATIONS.has(classification) || !title || !shortDescription || !description) {
      return res.status(400).json({ message: "Klassifizierung, Titel, Kurzbeschreibung und ausführliche Beschreibung sind erforderlich." });
    }
    await client.query("BEGIN");
    const chain = await client.query(`SELECT manager_user_id FROM coc_command_chain WHERE user_id = $1`, [req.user.id]);
    const managerId = chain.rows[0]?.manager_user_id || null;
    const status = managerId ? "pending" : "awaiting_routing";
    const inserted = await client.query(
      `INSERT INTO coc_cases (classification, title, short_description, description, submitter_user_id,
         submitter_name, submitter_email, current_approver_user_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [classification, title, shortDescription, description, req.user.id, req.user.displayName || req.user.loginName, req.user.email, managerId, status],
    );
    const caseId = inserted.rows[0].id;
    const reference = `COC-${new Date().getFullYear()}-${String(caseId).padStart(6, "0")}`;
    await client.query(`UPDATE coc_cases SET reference = $1 WHERE id = $2`, [reference, caseId]);
    await client.query(
      `INSERT INTO coc_case_events (case_id, actor_user_id, actor_name, action, comment, to_approver_user_id)
       VALUES ($1,$2,$3,'submitted',$4,$5)`,
      [caseId, req.user.id, req.user.displayName || req.user.loginName, managerId ? "Zur Prüfung eingereicht." : "Eingereicht; die Kommandokette muss noch zugeordnet werden.", managerId],
    );
    for (const file of req.files || []) {
      await client.query(
        `INSERT INTO coc_case_attachments (case_id, original_name, mime_type, file_size, file_data, uploaded_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [caseId, cleanText(file.originalname, 255), file.mimetype, file.size, file.buffer, req.user.id],
      );
    }
    await client.query("COMMIT");
    const notification = managerId ? await notifyApprover(caseId, managerId) : { sent: false, reason: "awaiting_routing" };
    res.status(201).json({ id: caseId, reference, status, notification, message: managerId ? "Vorgang wurde an die nächste Hierarchiestufe übermittelt." : "Vorgang gespeichert. Die Kommandokette muss noch zugeordnet werden." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally { client.release(); }
});

router.post("/cases/:id/decision", requireVerifiedIdentity, async (req, res, next) => {
  const client = await db.connect();
  try {
    const caseId = Number(req.params.id);
    const action = cleanText(req.body.action, 20).toLowerCase();
    const comment = cleanText(req.body.comment, 5000);
    if (!ACTIONS.has(action)) return res.status(400).json({ message: "Ungültige Entscheidung." });
    if (req.cocReviewCaseId && Number(req.cocReviewCaseId) !== caseId) return res.status(403).json({ message: "Dieser Prüflink gilt nicht für den angeforderten Vorgang." });
    if ((action === "reject" || action === "forward") && !comment) return res.status(400).json({ message: "Für Ablehnung oder Weitergabe ist eine Begründung erforderlich." });
    await client.query("BEGIN");
    const locked = await client.query(`SELECT * FROM coc_cases WHERE id = $1 FOR UPDATE`, [caseId]);
    const row = locked.rows[0];
    if (!row || row.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Dieser Vorgang wartet nicht mehr auf eine Entscheidung." });
    }
    if (!isAdmin(req) && Number(row.current_approver_user_id) !== Number(req.user.id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Dieser Vorgang ist einer anderen Person zur Prüfung zugewiesen." });
    }

    let status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending";
    let nextApproverId = null;
    if (action === "forward") {
      const next = await client.query(`SELECT manager_user_id, is_final_approver FROM coc_command_chain WHERE user_id = $1`, [row.current_approver_user_id]);
      if (next.rows[0]?.is_final_approver) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Diese Person ist als Endpunkt festgelegt und muss den Vorgang genehmigen oder ablehnen." });
      }
      nextApproverId = next.rows[0]?.manager_user_id || null;
      if (!nextApproverId) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Die Kommandokette endet hier, ohne dass ein Endpunkt konfiguriert wurde." });
      }
    }
    await client.query(
      `UPDATE coc_cases SET status = $1, current_approver_user_id = $2,
         current_level = current_level + CASE WHEN $3 = 'forwarded' THEN 1 ELSE 0 END,
         updated_at = NOW(), decided_at = CASE WHEN $1 IN ('approved','rejected') THEN NOW() ELSE NULL END
       WHERE id = $4`,
      [status, nextApproverId, action === "forward" ? "forwarded" : action, caseId],
    );
    await client.query(
      `INSERT INTO coc_case_events (case_id, actor_user_id, actor_name, action, comment, from_approver_user_id, to_approver_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [caseId, req.user.id, req.user.displayName || req.user.loginName, action === "forward" ? "forwarded" : action === "approve" ? "approved" : "rejected", comment || "Genehmigt.", row.current_approver_user_id, nextApproverId],
    );
    await client.query("COMMIT");
    const notification = nextApproverId ? await notifyApprover(caseId, nextApproverId) : { sent: false, reason: "case_closed" };
    res.json({ ok: true, status, nextApproverUserId: nextApproverId, notification });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally { client.release(); }
});

router.get("/attachments/:id", requireVerifiedIdentity, async (req, res, next) => {
  try {
    const attachment = await db.query(`SELECT * FROM coc_case_attachments WHERE id = $1`, [Number(req.params.id)]);
    const file = attachment.rows[0];
    if (!file || !(await canReadCase(file.case_id, req))) return res.status(404).json({ message: "Anhang nicht gefunden." });
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Length", file.file_size);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
    res.send(file.file_data);
  } catch (error) { next(error); }
});

router.get("/admin/chain", requireCocAdmin, async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, CONCAT_WS(' ', u.first_name, u.last_name) AS name, u.email,
              c.manager_user_id AS "managerUserId", c.is_final_approver AS "isFinalApprover",
              CONCAT_WS(' ', m.first_name, m.last_name) AS "managerName"
       FROM users u LEFT JOIN coc_command_chain c ON c.user_id = u.id
       LEFT JOIN users m ON m.id = c.manager_user_id
       WHERE u.is_root = FALSE ORDER BY u.first_name, u.last_name`,
    );
    res.json(rows);
  } catch (error) { next(error); }
});

router.get("/admin/notifications/status", requireCocAdmin, (_req, res) => {
  res.json(getCocMailStatus());
});

router.post("/admin/notifications/test", requireCocAdmin, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Bitte eine gültige Test-E-Mail-Adresse eingeben." });
    const result = await sendCocTestEmail(email);
    if (!result.sent) return res.status(409).json({ message: "Der CoC-Mailversand ist noch nicht vollständig konfiguriert.", ...result });
    res.json({ ok: true, message: "Test-E-Mail wurde versendet." });
  } catch (error) { next(error); }
});

router.put("/admin/chain/:userId", requireCocAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const managerUserId = req.body.managerUserId ? Number(req.body.managerUserId) : null;
    const isFinalApprover = Boolean(req.body.isFinalApprover);
    if (!Number.isInteger(userId) || (managerUserId && !Number.isInteger(managerUserId))) return res.status(400).json({ message: "Ungültige Benutzerzuordnung." });
    if (isFinalApprover && managerUserId) return res.status(400).json({ message: "Ein Endpunkt darf keine weitere vorgesetzte Person besitzen." });
    if (await commandChainWouldCycle(userId, managerUserId)) return res.status(409).json({ message: "Diese Zuordnung würde eine Schleife in der Kommandokette erzeugen." });
    await db.query(
      `INSERT INTO coc_command_chain (user_id, manager_user_id, is_final_approver, updated_at, updated_by_user_id)
       VALUES ($1,$2,$3,NOW(),$4)
       ON CONFLICT (user_id) DO UPDATE SET manager_user_id = EXCLUDED.manager_user_id,
         is_final_approver = EXCLUDED.is_final_approver, updated_at = NOW(), updated_by_user_id = EXCLUDED.updated_by_user_id`,
      [userId, managerUserId, isFinalApprover, req.user.id || null],
    );
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post("/admin/cases/:id/route", requireCocAdmin, async (req, res, next) => {
  try {
    const caseId = Number(req.params.id);
    const approverUserId = Number(req.body.approverUserId);
    const comment = cleanText(req.body.comment, 5000) || "Administrativ zugeordnet.";
    const updated = await db.query(
      `UPDATE coc_cases SET current_approver_user_id = $1, status = 'pending', updated_at = NOW()
       WHERE id = $2 AND status = 'awaiting_routing' RETURNING id`,
      [approverUserId, caseId],
    );
    if (!updated.rowCount) return res.status(409).json({ message: "Der Vorgang kann nicht mehr initial zugeordnet werden." });
    await db.query(
      `INSERT INTO coc_case_events (case_id, actor_user_id, actor_name, action, comment, to_approver_user_id)
       VALUES ($1,$2,$3,'routed',$4,$5)`,
      [caseId, req.user.id || null, req.user.displayName || req.user.loginName || "Admin", comment, approverUserId],
    );
    const notification = await notifyApprover(caseId, approverUserId);
    res.json({ ok: true, notification });
  } catch (error) { next(error); }
});

export default router;
