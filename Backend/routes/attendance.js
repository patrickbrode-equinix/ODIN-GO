/* ------------------------------------------------ */
/* ATTENDANCE ROUTES – Kommen / Gehen tracking      */
/* ------------------------------------------------ */

import { Router } from "express";
import { query as dbQuery } from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns attendance records for the given date range.
 */
router.get("/", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "from and to query params required (YYYY-MM-DD)" });
    }
    const result = await dbQuery(
      `SELECT id, employee_name, date, arrival_time, departure_time, note, created_by, updated_at
       FROM attendance
       WHERE date >= $1 AND date <= $2
       ORDER BY employee_name, date`,
      [from, to]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[ATTENDANCE] GET error:", err);
    res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

/**
 * PUT /api/attendance
 * Upsert a single attendance record.
 * Body: { employee_name, date, arrival_time?, departure_time?, note? }
 */
router.put("/", async (req, res) => {
  try {
    const { employee_name, date, arrival_time, departure_time, note } = req.body;
    if (!employee_name || !date) {
      return res.status(400).json({ error: "employee_name and date are required" });
    }

    // Validate time format (HH:MM or null)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (arrival_time && !timeRegex.test(arrival_time)) {
      return res.status(400).json({ error: "arrival_time must be HH:MM format" });
    }
    if (departure_time && !timeRegex.test(departure_time)) {
      return res.status(400).json({ error: "departure_time must be HH:MM format" });
    }

    const createdBy = req.user?.name || req.user?.username || "system";

    const result = await dbQuery(
      `INSERT INTO attendance (employee_name, date, arrival_time, departure_time, note, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (employee_name, date)
       DO UPDATE SET
         arrival_time = COALESCE($3, attendance.arrival_time),
         departure_time = COALESCE($4, attendance.departure_time),
         note = COALESCE($5, attendance.note),
         created_by = $6,
         updated_at = NOW()
       RETURNING *`,
      [employee_name, date, arrival_time || null, departure_time || null, note || null, createdBy]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[ATTENDANCE] PUT error:", err);
    res.status(500).json({ error: "Failed to save attendance" });
  }
});

/**
 * DELETE /api/attendance/:id
 * Remove an attendance record.
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await dbQuery("DELETE FROM attendance WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("[ATTENDANCE] DELETE error:", err);
    res.status(500).json({ error: "Failed to delete attendance" });
  }
});

export default router;
