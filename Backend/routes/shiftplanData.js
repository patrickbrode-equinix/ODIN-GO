import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/shiftplan/month-availability?year=YYYY
router.get("/month-availability", requireAuth, async (req, res) => {
  const year = Number.parseInt(String(req.query.year), 10) || new Date().getFullYear();
  const monthNames = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];

  try {
    const { rows } = await db.query(
      "SELECT DISTINCT month FROM shifts WHERE month LIKE $1",
      [`% ${year}`],
    );
    const found = new Set(rows.map((row) => row.month));
    const result = {};
    for (const name of monthNames) {
      const label = `${name} ${year}`;
      result[label] = found.has(label);
    }
    res.json(result);
  } catch (error) {
    console.error("Month availability error:", error);
    res.status(500).json({ error: "Failed to fetch month availability" });
  }
});

export default router;
