import express from "express";
import db from "../db.js";
import { requireAuth, requireVerifiedIdentity } from "../middleware/authMiddleware.js";

const router = express.Router();

const DIRECTIONS = new Set(["early_to_late", "late_to_night", "night_to_early"]);
const CATEGORIES = new Set(["general_information", "incidents", "cross_connect", "trouble_ticket", "smart_hand"]);
const TICKET_CATEGORIES = new Set(["cross_connect", "trouble_ticket", "smart_hand"]);

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
    createdByUserId: row.createdByUserId == null ? null : Number(row.createdByUserId),
    createdByName: row.createdByName || "Unbekannt",
    createdAt: row.createdAt,
  };
}

router.use(requireAuth);
router.use(requireVerifiedIdentity);

router.get("/", async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id,
              handover_at AS "handoverAt",
              handover_direction AS direction,
              category,
              ticket_number AS "ticketNumber",
              customer_name AS "customerName",
              notes,
              created_by_user_id AS "createdByUserId",
              created_by_name AS "createdByName",
              created_at AS "createdAt"
         FROM shift_handovers
        ORDER BY handover_at DESC, id DESC
        LIMIT 500`,
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
  if (TICKET_CATEGORIES.has(category) && (!ticketNumber || !customerName)) {
    return res.status(400).json({ error: "TICKET_DETAILS_REQUIRED", message: "Ticketnummer und Kundenname werden für diese Kategorie benötigt." });
  }

  const actorName = text(req.user?.displayName || req.user?.email || req.user?.loginName || "Unbekannt", 240);
  const actorId = Number.isInteger(req.user?.id) && req.user.id > 0 ? req.user.id : null;

  try {
    const { rows } = await db.query(
      `INSERT INTO shift_handovers
        (handover_at, handover_direction, category, ticket_number, customer_name, notes, created_by_user_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id,
                 handover_at AS "handoverAt",
                 handover_direction AS direction,
                 category,
                 ticket_number AS "ticketNumber",
                 customer_name AS "customerName",
                 notes,
                 created_by_user_id AS "createdByUserId",
                 created_by_name AS "createdByName",
                 created_at AS "createdAt"`,
      [
        parsedHandoverAt.toISOString(),
        direction,
        category,
        TICKET_CATEGORIES.has(category) ? ticketNumber : null,
        TICKET_CATEGORIES.has(category) ? customerName : null,
        notes,
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

export default router;
