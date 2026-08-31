/* ------------------------------------------------ */
/* COMPETENCIES ROUTES                             */
/* /api/competencies                               */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";

const router = express.Router();

/* GET /api/competencies?employee=<name> */
router.get("/", requireAuth, requirePageAccess("shiftplan", "view"), async (req, res) => {
  try {
    const { employee } = req.query;
    let query, params;

    if (employee) {
      query = `
        SELECT ec.*, eca.customer_name, eca.approved
        FROM employee_competencies ec
        LEFT JOIN employee_customer_access eca ON eca.employee_name = ec.employee_name
        WHERE ec.employee_name ILIKE $1
        ORDER BY ec.capability
      `;
      params = [employee];
    } else {
      query = `
        SELECT * FROM employee_competencies ORDER BY employee_name, capability
      `;
      params = [];
    }

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("GET /competencies error", err);
    res.status(500).json({ error: "Failed to fetch competencies" });
  }
});

/* GET /api/competencies/employee/:name — full profile */
router.get("/employee/:name", requireAuth, requirePageAccess("shiftplan", "view"), async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);

    const [comp, access] = await Promise.all([
      db.query(
        "SELECT * FROM employee_competencies WHERE employee_name ILIKE $1 ORDER BY capability",
        [name]
      ),
      db.query(
        "SELECT * FROM employee_customer_access WHERE employee_name ILIKE $1",
        [name]
      ),
    ]);

    res.json({
      employee_name: name,
      competencies: comp.rows,
      customer_access: access.rows,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch employee profile" });
  }
});

/* POST /api/competencies */
router.post("/", requireAuth, requirePageAccess("shiftplan", "write"), async (req, res) => {
  try {
    const { employee_name, capability, level = 1, notes } = req.body;
    if (!employee_name || !capability) {
      return res.status(400).json({ error: "employee_name and capability required" });
    }

    const { rows } = await db.query(
      `INSERT INTO employee_competencies (employee_name, capability, level, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (employee_name, capability)
       DO UPDATE SET level = $3, notes = $4, updated_at = NOW()
       RETURNING *`,
      [employee_name, capability, level, notes || null, req.user?.name || req.user?.email || "system"]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /competencies error", err);
    res.status(500).json({ error: "Failed to save competency" });
  }
});

/* DELETE /api/competencies/:id */
router.delete("/:id", requireAuth, requirePageAccess("shiftplan", "write"), async (req, res) => {
  try {
    await db.query("DELETE FROM employee_competencies WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete competency" });
  }
});

/* ---- CUSTOMER ACCESS ---- */

/* GET /api/competencies/customer-access/:employee */
router.get("/customer-access/:name", requireAuth, requirePageAccess("shiftplan", "view"), async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const { rows } = await db.query(
      "SELECT * FROM employee_customer_access WHERE employee_name ILIKE $1",
      [name]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch customer access" });
  }
});

/* POST /api/competencies/customer-access */
router.post("/customer-access", requireAuth, requirePageAccess("shiftplan", "write"), async (req, res) => {
  try {
    const { employee_name, customer_name, approved = true, valid_until } = req.body;
    if (!employee_name || !customer_name) {
      return res.status(400).json({ error: "employee_name and customer_name required" });
    }

    const { rows } = await db.query(
      `INSERT INTO employee_customer_access (employee_name, customer_name, approved, valid_until, approved_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (employee_name, customer_name)
       DO UPDATE SET approved = $3, valid_until = $4, approved_by = $5
       RETURNING *`,
      [employee_name, customer_name, approved, valid_until || null, req.user?.name || "system"]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to save customer access" });
  }
});

/* DELETE /api/competencies/customer-access/:id */
router.delete("/customer-access/:id", requireAuth, requirePageAccess("shiftplan", "write"), async (req, res) => {
  try {
    await db.query("DELETE FROM employee_customer_access WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete customer access" });
  }
});

export default router;
