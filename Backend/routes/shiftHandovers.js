import express from "express";
import db from "../db.js";
import { requireAuth, requireVerifiedIdentity } from "../middleware/authMiddleware.js";

const router = express.Router();

const DIRECTIONS = new Set(["early_to_late", "late_to_night", "night_to_early"]);
const CATEGORIES = new Set(["general_information", "incidents", "cross_connect", "trouble_ticket", "smart_hand"]);
const TICKET_CATEGORIES = new Set(["cross_connect", "trouble_ticket", "smart_hand"]);
const STATUSES = new Set(["open", "closed"]);

function text(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function mapHandover(row) {
  return {
    id: Number(row.id),
    handoverAt: row.handoverAt,
    direction: row.direction,
    category: row.category,
    ticketNumber: row.ticketNumber || "",
    customerName: row.customerName || "",
    notes: row.notes || "",
    status: STATUSES.has(row.status) ? row.status : "open",
    createdByUserId: row.createdByUserId == null ? null : Number(row.createdByUserId),
    createdByName: row.createdByName || "Unbekannt",
    createdAt: row.createdAt,
    updatedByUserId: row.updatedByUserId == null ? null : Number(row.updatedByUserId),
    updatedByName: row.updatedByName || "",
    updatedAt: row.updatedAt || null,
  };
}

router.use(requireAuth);
router.use(requireVerifiedIdentity);

router.get("/", async (req, res) => {
  const category = text(req.query?.category, 40);
  const date = text(req.query?.date, 10);
  if (category && !CATEGORIES.has(category)) {
    return res.status(400).json({ error: "INVALID_HANDOVER_CATEGORY", message: "Bitte eine gültige Kategorie auswählen." });
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "INVALID_HANDOVER_DATE", message: "Bitte ein gültiges Datum auswählen." });
  }

  try {
    const clauses = [];
    const values = [];
    if (category) {
      values.push(category);
      clauses.push(`category = $${values.length}`);
    }
    if (date) {
      values.push(date);
      clauses.push(`handover_at >= $${values.length}::date AND handover_at < $${values.length}::date + INTERVAL '1 day'`);
    }
    const { rows } = await db.query(
      `SELECT id,
              handover_at AS "handoverAt",
              handover_direction AS direction,
              category,
              ticket_number AS "ticketNumber",
              customer_name AS "customerName",
              notes,
              status,
              created_by_user_id AS "createdByUserId",
              created_by_name AS "createdByName",
              created_at AS "createdAt",
              updated_by_user_id AS "updatedByUserId",
              updated_by_name AS "updatedByName",
              updated_at AS "updatedAt"
         FROM shift_handovers
         ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY handover_at DESC, id DESC
        LIMIT 500`, values,
    );
    return res.json({ handovers: rows.map(mapHandover) });
  } catch (error) {
    console.error("SHIFT HANDOVER LIST ERROR:", error);
    return res.status(500).json({ error: "SHIFT_HANDOVER_LOAD_FAILED", message: "Die Schichtübergaben konnten nicht geladen werden." });
  }
});

router.post("/", async (req, res) => {
  const direction = text(req.body?.direction, 40);
  const category = text(req.body?.category, 40);
  const notes = text(req.body?.notes, 8000);
  const ticketNumber = text(req.body?.ticketNumber, 120);
  const customerName = text(req.body?.customerName, 240);
  const status = text(req.body?.status, 16) || "open";
  const parsedHandoverAt = new Date(req.body?.handoverAt);

  if (!DIRECTIONS.has(direction)) {
    return res.status(400).json({ error: "INVALID_HANDOVER_DIRECTION", message: "Bitte eine gültige Schichtübergabe auswählen." });
  }
  if (!CATEGORIES.has(category)) {
    return res.status(400).json({ error: "INVALID_HANDOVER_CATEGORY", message: "Bitte eine gültige Kategorie auswählen." });
  }
  if (!Number.isFinite(parsedHandoverAt.getTime())) {
    return res.status(400).json({ error: "INVALID_HANDOVER_DATE", message: "Bitte ein gültiges Datum angeben." });
  }
  if (!notes) {
    return res.status(400).json({ error: "HANDOVER_NOTES_REQUIRED", message: "Bitte die Übergabeinformationen eintragen." });
  }
  if (!STATUSES.has(status)) {
    return res.status(400).json({ error: "INVALID_HANDOVER_STATUS", message: "Bitte einen gültigen Status auswählen." });
  }
  if (TICKET_CATEGORIES.has(category) && (!ticketNumber || !customerName)) {
    return res.status(400).json({ error: "TICKET_DETAILS_REQUIRED", message: "Ticketnummer und Kundenname werden für diese Kategorie benötigt." });
  }

  const actorName = text(req.user?.displayName || req.user?.email || req.user?.loginName || "Unbekannt", 240);
  const actorId = Number.isInteger(req.user?.id) && req.user.id > 0 ? req.user.id : null;

  try {
    const { rows } = await db.query(
      `INSERT INTO shift_handovers
        (handover_at, handover_direction, category, ticket_number, customer_name, notes, status, created_by_user_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id,
                 handover_at AS "handoverAt",
                 handover_direction AS direction,
                 category,
                 ticket_number AS "ticketNumber",
                 customer_name AS "customerName",
                 notes,
                 status,
                 created_by_user_id AS "createdByUserId",
                 created_by_name AS "createdByName",
                 created_at AS "createdAt",
                 updated_by_user_id AS "updatedByUserId",
                 updated_by_name AS "updatedByName",
                 updated_at AS "updatedAt"`,
      [
        parsedHandoverAt.toISOString(),
        direction,
        category,
        TICKET_CATEGORIES.has(category) ? ticketNumber : null,
        TICKET_CATEGORIES.has(category) ? customerName : null,
        notes,
        status,
        actorId,
        actorName,
      ],
    );
    return res.status(201).json({ handover: mapHandover(rows[0]) });
  } catch (error) {
    console.error("SHIFT HANDOVER CREATE ERROR:", error);
    return res.status(500).json({ error: "SHIFT_HANDOVER_CREATE_FAILED", message: "Die Schichtübergabe konnte nicht gespeichert werden." });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const direction = text(req.body?.direction, 40);
  const category = text(req.body?.category, 40);
  const notes = text(req.body?.notes, 8000);
  const ticketNumber = text(req.body?.ticketNumber, 120);
  const customerName = text(req.body?.customerName, 240);
  const status = text(req.body?.status, 16) || "open";
  const parsedHandoverAt = new Date(req.body?.handoverAt);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "INVALID_SHIFT_HANDOVER_ID", message: "Die Schichtübergabe ist ungültig." });
  }
  if (!DIRECTIONS.has(direction)) {
    return res.status(400).json({ error: "INVALID_HANDOVER_DIRECTION", message: "Bitte eine gültige Schichtübergabe auswählen." });
  }
  if (!CATEGORIES.has(category)) {
    return res.status(400).json({ error: "INVALID_HANDOVER_CATEGORY", message: "Bitte eine gültige Kategorie auswählen." });
  }
  if (!Number.isFinite(parsedHandoverAt.getTime())) {
    return res.status(400).json({ error: "INVALID_HANDOVER_DATE", message: "Bitte ein gültiges Datum angeben." });
  }
  if (!notes) {
    return res.status(400).json({ error: "HANDOVER_NOTES_REQUIRED", message: "Bitte die Übergabeinformationen eintragen." });
  }
  if (!STATUSES.has(status)) {
    return res.status(400).json({ error: "INVALID_HANDOVER_STATUS", message: "Bitte einen gültigen Status auswählen." });
  }
  if (TICKET_CATEGORIES.has(category) && (!ticketNumber || !customerName)) {
    return res.status(400).json({ error: "TICKET_DETAILS_REQUIRED", message: "Ticketnummer und Kundenname werden für diese Kategorie benötigt." });
  }

  const actorName = text(req.user?.displayName || req.user?.email || req.user?.loginName || "Unbekannt", 240);
  const actorId = Number.isInteger(req.user?.id) && req.user.id > 0 ? req.user.id : null;
  try {
    const { rows } = await db.query(
      `UPDATE shift_handovers
          SET handover_at = $1,
              handover_direction = $2,
              category = $3,
              ticket_number = $4,
              customer_name = $5,
              notes = $6,
              status = $7,
              updated_by_user_id = $8,
              updated_by_name = $9,
              updated_at = NOW()
        WHERE id = $10
        RETURNING id,
                  handover_at AS "handoverAt",
                  handover_direction AS direction,
                  category,
                  ticket_number AS "ticketNumber",
                  customer_name AS "customerName",
                  notes,
                  status,
                  created_by_user_id AS "createdByUserId",
                  created_by_name AS "createdByName",
                  created_at AS "createdAt",
                  updated_by_user_id AS "updatedByUserId",
                  updated_by_name AS "updatedByName",
                  updated_at AS "updatedAt"`,
      [
        parsedHandoverAt.toISOString(),
        direction,
        category,
        TICKET_CATEGORIES.has(category) ? ticketNumber : null,
        TICKET_CATEGORIES.has(category) ? customerName : null,
        notes,
        status,
        actorId,
        actorName,
        id,
      ],
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "SHIFT_HANDOVER_NOT_FOUND", message: "Die Schichtübergabe wurde nicht gefunden." });
    }
    return res.json({ handover: mapHandover(rows[0]) });
  } catch (error) {
    console.error("SHIFT HANDOVER UPDATE ERROR:", error);
    return res.status(500).json({ error: "SHIFT_HANDOVER_UPDATE_FAILED", message: "Die Schichtübergabe konnte nicht aktualisiert werden." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "INVALID_SHIFT_HANDOVER_ID", message: "Die Schichtübergabe ist ungültig." });
  }

  try {
    const result = await db.query("DELETE FROM shift_handovers WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "SHIFT_HANDOVER_NOT_FOUND", message: "Die Schichtübergabe wurde nicht gefunden." });
    }
    return res.status(204).end();
  } catch (error) {
    console.error("SHIFT HANDOVER DELETE ERROR:", error);
    return res.status(500).json({ error: "SHIFT_HANDOVER_DELETE_FAILED", message: "Die Schichtübergabe konnte nicht gelöscht werden." });
  }
});

export default router;
