/* ------------------------------------------------ */
/* STATUS ROUTE (ADMIN)                              */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";

const router = express.Router();

/* ------------------------------------------------ */
/* GET /api/status                                  */
/* (auth + role wird in server.js enforced)          */
/* ------------------------------------------------ */

router.get("/", requireAuth, requirePageAccess("admin_settings", "view"), async (req, res) => {
  const start = Date.now();

  try {
    await db.query("SELECT 1");

    res.json({
      backend: "ok",
      database: "ok",
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("STATUS ERROR:", err);

    res.status(500).json({
      backend: "error",
      database: "error",
      latencyMs: null,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
