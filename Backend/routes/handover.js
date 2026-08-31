/* ———————————————————————————————— */
/* HANDOVER – API (POSTGRESQL FINAL)                */
/* RBAC: PAGE-BASED (view / write)                  */
/* ———————————————————————————————— */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { broadcast } from "./sse.js";

const router = express.Router();

/* ———————————————————————————————— */
/* HELPERS                                          */
/* ———————————————————————————————— */

function safeId(id) {
  return Number(String(id).replace(/[^0-9]/g, ""));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function buildCommitAt(commitDate, commitTime) {
  if (!commitDate || !commitTime) return null;

  try {
    const d = new Date(commitDate);
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());

    let hh = "00";
    let min = "00";

    if (typeof commitTime === "string") {
      [hh, min] = commitTime.split(":");
    }

    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  } catch {
    return null;
  }
}

function emptyHandoverFilesResponse(handoverId) {
  return {
    handoverId,
    files: [],
  };
}

/* ———————————————————————————————— */
/* GET – LIST HANDOVER                              */
/* Requires: handover:view                          */
/* ———————————————————————————————— */

/* ———————————————————————————————— */
/* GET – LIST HANDOVER                              */
/* Requires: handover:view                          */
/* ———————————————————————————————— */

router.get(
  "/",
  requireAuth,
  requirePageAccess("handover", "view"),
  async (req, res) => {
    try {
      const result = await db.query(`
        SELECT 
          id,
          ticketnumber  AS "ticketNumber",
          customername  AS "customerName",
          priority,
          type,
          ticket_type AS "ticketType",
          activity,
          system_name AS "systemName",
          remaining_time AS "remainingTime",
          start_datetime AS "startDatetime",
          target_team AS "targetTeam",
          assignee_name AS "assigneeName",
          due_datetime AS "dueDatetime",
          recurrence,
          area,
          description,
          commitdate,
          committime,
          status,
          createdby     AS "createdBy",
          created_at    AS "createdAt",
          takenby       AS "takenBy"
        FROM handover
        ORDER BY created_at DESC
      `);

      const mapped = result.rows.map((h) => ({
        id: h.id,
        ticketNumber: h.ticketNumber || "",
        customerName: h.customerName || "",
        priority: h.priority || "Low",
        type: h.type || "Workload",
        ticketType: h.ticketType || "",
        activity: h.activity || "",
        systemName: h.systemName || "",
        remainingTime: h.remainingTime || "",
        startDatetime: h.startDatetime || null,
        targetTeam: h.targetTeam || "",
        assigneeName: h.assigneeName || "",
        dueDatetime: h.dueDatetime || null,
        recurrence: h.recurrence || "",
        area: h.area || "",
        description: h.description || "",
        commitAt: buildCommitAt(h.commitdate, h.committime),
        status: h.status || "Offen",
        createdBy: h.createdBy || "",
        createdAt: h.createdAt,
        takenBy: h.takenBy || null,
        files: [],
      }));

      res.json(mapped);
    } catch (err) {
      console.error("HANDOVER GET ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ———————————————————————————————— */
/* POST – CREATE HANDOVER                           */
/* Requires: handover:write                         */
/* ———————————————————————————————— */

router.post(
  "/",
  requireAuth,
  requirePageAccess("handover", "write"),
  async (req, res) => {
    const {
      ticketNumber,
      customerName,
      priority,
      type,
      ticketType,
      activity,
      systemName,
      remainingTime,
      startDatetime,
      targetTeam,
      assigneeName,
      dueDatetime,
      recurrence,
      area,
      description,
      commitAt,
      status,
      createdBy,
      takenBy,
    } = req.body;

    let commitDate = null;
    let commitTime = null;

    if (commitAt) {
      // Assuming ISO string or similar, but let's be safe
      try {
        const [d, t] = commitAt.split("T");
        commitDate = d;
        commitTime = t ? t.substring(0, 5) : null;
      } catch (e) {
        // ignore
      }
    }

    try {
      const result = await db.query(
        `
        INSERT INTO handover
        (
          ticketnumber,
          customername,
          priority,
          type,
          ticket_type,
          activity,
          system_name,
          remaining_time,
          start_datetime,
          target_team,
          assignee_name,
          due_datetime,
          recurrence,
          area,
          description,
          commitdate,
          committime,
          status,
          createdby,
          takenby
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING id
        `,
        [
          ticketNumber,
          customerName || "",
          priority || "Low",
          type || "Workload",
          ticketType || "",
          activity || "",
          systemName || "",
          remainingTime || "",
          startDatetime || null,
          targetTeam || "",
          assigneeName || "",
          dueDatetime || null,
          recurrence || "",
          area || "",
          description,
          commitDate,
          commitTime,
          status || "Offen",
          createdBy,
          takenBy || null,
        ]
      );

      res.status(201).json({ id: result.rows[0].id });

      // Notify SSE clients
      try { broadcast("handover_created", { id: result.rows[0].id, ticketNumber, createdBy }); } catch {}
    } catch (err) {
      console.error("HANDOVER INSERT ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------------------------ */
/* GET - FILES                                      */
/* Requires: handover:view                          */
/* ------------------------------------------------ */

router.get(
  "/:id/files",
  requireAuth,
  requirePageAccess("handover", "view"),
  async (req, res) => {
    const handoverId = safeId(req.params.id);
    if (!Number.isInteger(handoverId) || handoverId <= 0) {
      return res.json(emptyHandoverFilesResponse(handoverId || null));
    }

    try {
      const result = await db.query(
        `
        SELECT
          id,
          handover_id AS "handoverId",
          filename,
          created_at AS "createdAt"
        FROM handover_files
        WHERE handover_id = $1
        ORDER BY created_at ASC, id ASC
        `,
        [handoverId]
      );

      res.json({
        handoverId,
        files: result.rows || [],
      });
    } catch (err) {
      if (err?.code === "42P01" || /handover_files/i.test(String(err?.message || ""))) {
        return res.json(emptyHandoverFilesResponse(handoverId));
      }
      console.error("HANDOVER FILES GET ERROR:", err);
      res.json(emptyHandoverFilesResponse(handoverId));
    }
  }
);

/* ———————————————————————————————— */
/* PUT – UPDATE / TAKEOVER                          */
/* Requires: handover:write                         */
/* ———————————————————————————————— */

router.put(
  "/:id",
  requireAuth,
  requirePageAccess("handover", "write"),
  async (req, res) => {
    const id = safeId(req.params.id);
    const { status, takenBy } = req.body;

    try {
      await db.query(
        `
        UPDATE handover
        SET
          status  = $1,
          takenby = $2
        WHERE id = $3
        `,
        [status, takenBy || null, id]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("HANDOVER UPDATE ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ———————————————————————————————— */
/* DELETE – HANDOVER                                */
/* Requires: handover:write                         */
/* ———————————————————————————————— */

router.delete(
  "/:id",
  requireAuth,
  requirePageAccess("handover", "write"),
  async (req, res) => {
    const id = safeId(req.params.id);

    try {
      await db.query(`DELETE FROM handover WHERE id = $1`, [id]);
      res.json({ success: true });
    } catch (err) {
      console.error("HANDOVER DELETE ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
