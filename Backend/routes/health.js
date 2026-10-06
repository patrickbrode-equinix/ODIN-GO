/* ------------------------------------------------ */
/* HEALTH ROUTE (PUBLIC)                             */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";

const router = express.Router();

/* ------------------------------------------------ */
/* GET /api/health                                  */
/* Always 200 — backend process is alive.           */
/* Use /api/ready for dependency-aware checks.      */
/* ------------------------------------------------ */

router.get("/", async (req, res) => {
  const start = Date.now();

  let dbStatus = "unknown";

  try {
    await db.query("SELECT 1");
    dbStatus = "ok";
  } catch (err) {
    // IMPORTANT: Health should be reachable even if Postgres is down,
    // otherwise the frontend looks "broken" and Vite shows proxy 500s.
    dbStatus = "error";
    console.error("HEALTH DB ERROR:", err);
  }

  // Always 200: backend is up, database may or may not be.
  res.json({
    backend: "ok",
    database: dbStatus,
    latencyMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  });
});

/* ------------------------------------------------ */
/* GET /api/ready                                   */
/* 200 if backend + DB are ready.                  */
/* 503 if DB is not reachable (used by healthcheck).*/
/* ------------------------------------------------ */

router.get("/ready", async (req, res) => {
  const start = Date.now();
  try {
    await db.query("SELECT 1");
    res.json({
      ready: true,
      database: "ok",
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      ready: false,
      database: "error",
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
