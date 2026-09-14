import express from "express";
import db from "../db.js";
import { requireAuth, requireVerifiedIdentity } from "../middleware/authMiddleware.js";

const router = express.Router();
const TEAMS = new Set(["frost", "tfm", "other"]);
const STATUSES = new Set(["open", "closed"]);

function text(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function mapEntry(row) {
  return {
    id: Number(row.id), team: row.team, ticketNumber: row.ticketNumber || "", customerName: row.customerName || "", notes: row.notes || "",
    status: STATUSES.has(row.status) ? row.status : "open", createdByName: row.createdByName || "Unknown", createdAt: row.createdAt,
    updatedByName: row.updatedByName || "", updatedAt: row.updatedAt || null,
  };
}

function readPayload(body = {}) {
  return {
    team: text(body.team, 16), ticketNumber: text(body.ticketNumber, 120), customerName: text(body.customerName, 240), notes: text(body.notes, 8000), status: text(body.status, 16) || "open",
  };
}

function validate(payload) {
  if (!TEAMS.has(payload.team)) return "Bitte ein gültiges Zielteam auswählen.";
  if (!payload.ticketNumber || !payload.customerName || !payload.notes) return "Ticketnummer, Kundenname und Beschreibung sind erforderlich.";
  if (!STATUSES.has(payload.status)) return "Bitte einen gültigen Status auswählen.";
  return null;
}

const returningFields = `id, team, ticket_number AS "ticketNumber", customer_name AS "customerName", notes, status,
  created_by_name AS "createdByName", created_at AS "createdAt", updated_by_name AS "updatedByName", updated_at AS "updatedAt"`;

router.use(requireAuth);
router.use(requireVerifiedIdentity);

router.get("/", async (req, res) => {
  const team = text(req.query?.team, 16);
  const status = text(req.query?.status, 16);
  if (team && !TEAMS.has(team)) return res.status(400).json({ error: "INVALID_TEAM" });
  if (status && !STATUSES.has(status)) return res.status(400).json({ error: "INVALID_STATUS" });
  const values = [];
  const clauses = [];
  if (team) { values.push(team); clauses.push(`team = $${values.length}`); }
  if (status) { values.push(status); clauses.push(`status = $${values.length}`); }
  try {
    const { rows } = await db.query(`SELECT ${returningFields} FROM team_handovers ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY status ASC, created_at DESC LIMIT 500`, values);
    return res.json({ handovers: rows.map(mapEntry) });
  } catch (error) {
    console.error("TEAM HANDOVER LIST ERROR:", error);
    return res.status(500).json({ error: "TEAM_HANDOVER_LOAD_FAILED" });
  }
});

router.post("/", async (req, res) => {
  const payload = readPayload(req.body);
  const error = validate(payload);
  if (error) return res.status(400).json({ error: "INVALID_TEAM_HANDOVER", message: error });
  const actorName = text(req.user?.displayName || req.user?.email || "Unknown", 240);
  const actorId = Number.isInteger(req.user?.id) ? req.user.id : null;
  try {
    const { rows } = await db.query(
      `INSERT INTO team_handovers (team, ticket_number, customer_name, notes, status, created_by_user_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${returningFields}`,
      [payload.team, payload.ticketNumber, payload.customerName, payload.notes, payload.status, actorId, actorName]
    );
    return res.status(201).json({ handover: mapEntry(rows[0]) });
  } catch (caught) {
    console.error("TEAM HANDOVER CREATE ERROR:", caught);
    return res.status(500).json({ error: "TEAM_HANDOVER_CREATE_FAILED" });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const payload = readPayload(req.body);
  const error = validate(payload);
  if (!Number.isInteger(id) || id <= 0 || error) return res.status(400).json({ error: "INVALID_TEAM_HANDOVER", message: error });
  const actorName = text(req.user?.displayName || req.user?.email || "Unknown", 240);
  const actorId = Number.isInteger(req.user?.id) ? req.user.id : null;
  try {
    const { rows } = await db.query(
      `UPDATE team_handovers SET team=$1, ticket_number=$2, customer_name=$3, notes=$4, status=$5, updated_by_user_id=$6, updated_by_name=$7, updated_at=NOW()
       WHERE id=$8 RETURNING ${returningFields}`,
      [payload.team, payload.ticketNumber, payload.customerName, payload.notes, payload.status, actorId, actorName, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "TEAM_HANDOVER_NOT_FOUND" });
    return res.json({ handover: mapEntry(rows[0]) });
  } catch (caught) {
    console.error("TEAM HANDOVER UPDATE ERROR:", caught);
    return res.status(500).json({ error: "TEAM_HANDOVER_UPDATE_FAILED" });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "INVALID_TEAM_HANDOVER" });
  try {
    const result = await db.query("DELETE FROM team_handovers WHERE id=$1", [id]);
    if (!result.rowCount) return res.status(404).json({ error: "TEAM_HANDOVER_NOT_FOUND" });
    return res.status(204).end();
  } catch (caught) {
    console.error("TEAM HANDOVER DELETE ERROR:", caught);
    return res.status(500).json({ error: "TEAM_HANDOVER_DELETE_FAILED" });
  }
});

export default router;
