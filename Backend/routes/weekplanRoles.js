/* ------------------------------------------------ */
/* WEEKPLAN ROLES – ROUTES                          */
/* Mounted at: /api/weekplan-roles                  */
/* Manages per-employee per-day role assignments.   */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";

const router = express.Router();
router.use(requireAuth);

/* ---- Valid role keys ---- */
const VALID_ROLES = [
  "dispatcher",
  "dbs_project",
  "largeorder",
  "projekt",
  "lead",
  "buddy",
  "neueinsteiger",
  "cc",
  "sh",
  "dp",
  "support",
  "colo",
];

function currentLocalDateKey(base = new Date()) {
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

/* ---- Role display labels (for frontend reference) ---- */
export const ROLE_LABELS = {
  dispatcher: "Dispatcher",
  dbs_project: "DBS Project",
  largeorder: "Largeorder",
  projekt: "Projekt",
  lead: "Lead",
  buddy: "Buddy",
  neueinsteiger: "Neueinsteiger",
  cc: "CC",
  sh: "SH",
  dp: "DP",
  support: "Support",
  colo: "COLO",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDates(dates) {
  if (!Array.isArray(dates)) return [];
  const out = new Set();
  for (const d of dates) {
    const s = typeof d === "string" ? d.slice(0, 10) : "";
    if (DATE_RE.test(s)) out.add(s);
  }
  return [...out];
}

/* ------------------------------------------------ */
/* GET /api/weekplan-roles?from=YYYY-MM-DD&to=...   */
/* Returns all roles in the given date range.       */
/* ------------------------------------------------ */
router.get("/", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: "from and to query params required (YYYY-MM-DD)" });
    }

    const result = await db.query(
      `SELECT id, employee_name, to_char(date, 'YYYY-MM-DD') AS date, role_key, comment, updated_at, updated_by
       FROM weekplan_roles
       WHERE date >= $1 AND date <= $2
       ORDER BY employee_name, date`,
      [from, to]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("[weekplan-roles] GET error:", err);
    res.status(500).json({ message: "Failed to load roles" });
  }
});

/* ------------------------------------------------ */
/* GET /api/weekplan-roles/today                    */
/* Returns all roles for today (used by Dashboard). */
/* ------------------------------------------------ */
router.get("/today", async (_req, res) => {
  try {
    const today = currentLocalDateKey();
    const result = await db.query(
      `SELECT id, employee_name, to_char(date, 'YYYY-MM-DD') AS date, role_key, comment, updated_at, updated_by
       FROM weekplan_roles
       WHERE date = $1
       ORDER BY employee_name`,
      [today]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("[weekplan-roles] GET /today error:", err);
    res.status(500).json({ message: "Failed to load today's roles" });
  }
});

/* ------------------------------------------------ */
/* PUT /api/weekplan-roles                          */
/* Upsert a role for an employee on a date.         */
/* Body: { employee_name, date, role_key }          */
/* ------------------------------------------------ */
router.put("/", requirePageAccess("shiftplan", "write"), async (req, res) => {
  try {
    const { employee_name, date, role_key, comment } = req.body;

    if (!employee_name || !date || !role_key) {
      return res.status(400).json({ message: "employee_name, date, and role_key required" });
    }

    if (!VALID_ROLES.includes(role_key)) {
      return res.status(400).json({ message: `Invalid role_key. Valid: ${VALID_ROLES.join(", ")}` });
    }

    const userEmail = req.user?.email ?? "unknown";
    const safeComment = typeof comment === 'string' ? comment.trim().slice(0, 200) : null;

    const result = await db.query(
      `INSERT INTO weekplan_roles (employee_name, date, role_key, comment, updated_by)
       VALUES ($1, $2, $3, $5, $4)
       ON CONFLICT (employee_name, date)
       DO UPDATE SET role_key = $3, comment = $5, updated_at = NOW(), updated_by = $4
       RETURNING *`,
      [employee_name.trim(), date, role_key, userEmail, safeComment]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[weekplan-roles] PUT error:", err);
    res.status(500).json({ message: "Failed to save role" });
  }
});

/* ------------------------------------------------ */
/* PUT /api/weekplan-roles/bulk                     */
/* Bulk upsert roles (for multi-day selection).     */
/* Body: { assignments: [{ employee_name, date, role_key }] } */
/* ------------------------------------------------ */
router.put("/bulk", requirePageAccess("shiftplan", "write"), async (req, res) => {
  const client = await db.connect();
  try {
    const { assignments } = req.body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ message: "assignments array required" });
    }

    const userEmail = req.user?.email ?? "unknown";
    await client.query("BEGIN");

    const results = [];
    for (const a of assignments) {
      if (!a.employee_name || !a.date || !a.role_key) continue;
      if (!VALID_ROLES.includes(a.role_key)) continue;

      const r = await client.query(
        `INSERT INTO weekplan_roles (employee_name, date, role_key, updated_by, comment)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (employee_name, date)
         DO UPDATE SET role_key = $3, updated_at = NOW(), updated_by = $4, comment = $5
         RETURNING *`,
        [a.employee_name.trim(), a.date, a.role_key, userEmail, String(a.comment || "").trim().slice(0, 200) || null]
      );
      results.push(r.rows[0]);
    }

    await client.query("COMMIT");
    res.json(results);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[weekplan-roles] PUT /bulk error:", err);
    res.status(500).json({ message: "Failed to save roles in bulk" });
  } finally {
    client.release();
  }
});

/* ------------------------------------------------ */
/* DELETE /api/weekplan-roles                       */
/* Remove a role assignment.                        */
/* Body: { employee_name, date }                    */
/* ------------------------------------------------ */
router.delete("/", requirePageAccess("shiftplan", "write"), async (req, res) => {
  try {
    const { employee_name, date } = req.body;

    if (!employee_name || !date) {
      return res.status(400).json({ message: "employee_name and date required" });
    }

    await db.query(
      `DELETE FROM weekplan_roles WHERE employee_name = $1 AND date = $2`,
      [employee_name.trim(), date]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[weekplan-roles] DELETE error:", err);
    res.status(500).json({ message: "Failed to delete role" });
  }
});

/* ------------------------------------------------ */
/* DELETE /api/weekplan-roles/bulk                  */
/* Remove roles of one employee on several dates.   */
/* Body: { employee_name, dates: ["YYYY-MM-DD"] }   */
/* (Different path than DELETE "/", no shadowing.)  */
/* ------------------------------------------------ */
router.delete("/bulk", requirePageAccess("shiftplan", "write"), async (req, res) => {
  try {
    const employeeName = typeof req.body?.employee_name === "string" ? req.body.employee_name.trim() : "";
    const dates = normalizeDates(req.body?.dates);
    if (!employeeName || dates.length === 0) {
      return res.status(400).json({ message: "employee_name and dates required" });
    }

    await db.query(
      `DELETE FROM weekplan_roles WHERE employee_name = $1 AND date = ANY($2::date[])`,
      [employeeName, dates]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[weekplan-roles] DELETE /bulk error:", err);
    res.status(500).json({ message: "Failed to delete roles" });
  }
});

/* ------------------------------------------------ */
/* GET /api/weekplan-roles/newcomers?from&to        */
/* Returns newcomer marks in the date range.        */
/* ------------------------------------------------ */
router.get("/newcomers", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: "from and to query params required (YYYY-MM-DD)" });
    }

    const result = await db.query(
      `SELECT employee_name, to_char(date, 'YYYY-MM-DD') AS date
       FROM weekplan_newcomers
       WHERE date >= $1 AND date <= $2
       ORDER BY employee_name, date`,
      [from, to]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("[weekplan-roles] GET /newcomers error:", err);
    res.status(500).json({ message: "Failed to load newcomers" });
  }
});

/* ------------------------------------------------ */
/* PUT /api/weekplan-roles/newcomers/bulk           */
/* Body: { entries: [{ employee_name, date }] }     */
/* ------------------------------------------------ */
router.put("/newcomers/bulk", requirePageAccess("shiftplan", "write"), async (req, res) => {
  const entries = req.body?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: "entries array required" });
  }

  const client = await db.connect();
  try {
    const userEmail = req.user?.email ?? "unknown";
    await client.query("BEGIN");

    let saved = 0;
    for (const e of entries) {
      const name = typeof e?.employee_name === "string" ? e.employee_name.trim() : "";
      const date = typeof e?.date === "string" ? e.date.slice(0, 10) : "";
      if (!name || !DATE_RE.test(date)) continue;

      await client.query(
        `INSERT INTO weekplan_newcomers (employee_name, date, updated_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (employee_name, date)
         DO UPDATE SET updated_at = NOW(), updated_by = $3`,
        [name, date, userEmail]
      );
      saved += 1;
    }

    await client.query("COMMIT");
    res.json({ success: true, saved });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[weekplan-roles] PUT /newcomers/bulk error:", err);
    res.status(500).json({ message: "Failed to save newcomers" });
  } finally {
    client.release();
  }
});

/* ------------------------------------------------ */
/* DELETE /api/weekplan-roles/newcomers             */
/* Body: { employee_name, dates: ["YYYY-MM-DD"] }   */
/* ------------------------------------------------ */
router.delete("/newcomers", requirePageAccess("shiftplan", "write"), async (req, res) => {
  try {
    const employeeName = typeof req.body?.employee_name === "string" ? req.body.employee_name.trim() : "";
    const dates = normalizeDates(req.body?.dates);
    if (!employeeName || dates.length === 0) {
      return res.status(400).json({ message: "employee_name and dates required" });
    }

    await db.query(
      `DELETE FROM weekplan_newcomers WHERE employee_name = $1 AND date = ANY($2::date[])`,
      [employeeName, dates]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[weekplan-roles] DELETE /newcomers error:", err);
    res.status(500).json({ message: "Failed to delete newcomers" });
  }
});

export default router;
