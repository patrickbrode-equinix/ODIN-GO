import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ------------------------------------------------ */
/* 1. SNAPSHOT INGESTION                            */
/* NOTE: POST /snapshot is handled exclusively by   */
/* routes/queue/snapshot.route.js (mounted first    */
/* in server.js). This old handler has been removed */
/* to prevent 400 MISSING_QUEUE_TYPE fallthrough.   */
/* ------------------------------------------------ */
/* (handler removed — see routes/queue/snapshot.route.js) */

/* ------------------------------------------------ */
/* 2. GET TICKETS (FOR GRID)                        */
/* ------------------------------------------------ */

router.get("/tickets", requireAuth, async (req, res) => {
  try {
    const { queueType } = req.query;
    let sql = `
      SELECT * FROM queue_items 
      WHERE active = TRUE
    `;
    const params = [];

    if (queueType) {
      sql += ` AND queue_type = $1`;
      params.push(queueType);
    }

    sql += ` ORDER BY group_key ASC, id ASC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Get Tickets Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/* ------------------------------------------------ */
/* 3. GET GROUPS (FOR SIDEBAR)                      */
/* ------------------------------------------------ */

router.get("/groups", requireAuth, async (req, res) => {
  try {
    const sql = `
      SELECT 
        queue_type, 
        group_key, 
        COUNT(*) as count 
      FROM queue_items 
      WHERE active = TRUE 
      GROUP BY queue_type, group_key 
      ORDER BY queue_type, group_key`;

    const result = await query(sql);

    // Transform for easier frontend consumption
    // { "SmartHands": [ { name: "Group A", count: 5 } ] }
    const grouped = {};
    result.rows.forEach(row => {
      if (!grouped[row.queue_type]) grouped[row.queue_type] = [];
      grouped[row.queue_type].push({ name: row.group_key, count: parseInt(row.count) });
    });

    res.json(grouped);
  } catch (err) {
    console.error("Get Groups Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/* ------------------------------------------------ */
/* 4. STATS / DEBUG                                 */
/* ------------------------------------------------ */

router.get("/debug/last-snapshot", requireAuth, async (req, res) => {
  try {
    const result = await query("SELECT * FROM snapshots ORDER BY id DESC LIMIT 5");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
