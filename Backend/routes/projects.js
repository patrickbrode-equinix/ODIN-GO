/* ------------------------------------------------ */
/* PROJECTS ROUTES                                  */
/* /api/projects                                    */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { broadcast } from "./sse.js";

const router = express.Router();

/* GET /api/projects */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = "SELECT * FROM projects";
    const params = [];

    if (status) {
      query += " WHERE status = $1";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("GET /projects error", err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

/* GET /api/projects/:id */
router.get("/employees", requireAuth, async (_req, res) => {
  const { rows } = await db.query(
    `SELECT DISTINCT employee_name AS name FROM shifts
      WHERE employee_name IS NOT NULL AND trim(employee_name) <> ''
      ORDER BY employee_name`,
  );
  res.json({ employees: rows.map((row) => row.name) });
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM projects WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

/* POST /api/projects */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, responsible, expected_done, progress = 0, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }
    const participants = Array.isArray(req.body?.participants)
      ? [...new Set(req.body.participants.map((value) => String(value || "").trim()).filter(Boolean))]
      : [];
    const creator = req.user.displayName || req.user.email || "Unbekannt";

    const { rows } = await db.query(
      `INSERT INTO projects (name, creator, responsible, expected_done, progress, description, participants)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, creator, responsible || null, expected_done || null, progress, description || null, participants]
    );

    const project = rows[0];
    broadcast("project_created", { id: project.id, name: project.name });
    res.status(201).json(project);
  } catch (err) {
    console.error("POST /projects error", err);
    res.status(500).json({ error: "Failed to create project" });
  }
});

/* PATCH /api/projects/:id */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { name, responsible, expected_done, progress, description, status, participants } = req.body;
    const { rows } = await db.query(
      `UPDATE projects
       SET name         = COALESCE($1, name),
           responsible  = COALESCE($2, responsible),
           expected_done= COALESCE($3, expected_done),
           progress     = COALESCE($4, progress),
           description  = COALESCE($5, description),
           status       = COALESCE($6, status),
           participants = COALESCE($7, participants),
           updated_at   = NOW()
       WHERE id = $8
       RETURNING *`,
      [name, responsible, expected_done, progress, description, status, Array.isArray(participants) ? participants : null, req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    broadcast("project_updated", { id: rows[0].id, name: rows[0].name, progress: rows[0].progress, status: rows[0].status });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update project" });
  }
});

/* DELETE /api/projects/:id */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM projects WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete project" });
  }
});

export default router;
