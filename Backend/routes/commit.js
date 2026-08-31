/* ------------------------------------------------ */
/* COMMIT ROUTES – SNAPSHOT + SUB TYPES (FINAL)     */
/* Mounted at: /api/commit                          */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(requireAuth); // All /api/commit/* routes require a valid JWT

/* ------------------------------------------------ */
/* POST /import                                     */
/* ------------------------------------------------ */

router.post("/import", async (req, res) => {
  const client = await db.connect();

  try {
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "No rows provided" });
    }

    await client.query("BEGIN");

    /* ------------------------------------------------ */
    /* AUTO DISCOVER SUB TYPES                          */
    /* ------------------------------------------------ */

    const subTypes = Array.from(
      new Set(
        rows
          .map((r) => r.activitySubType)
          .filter((v) => typeof v === "string" && v.trim().length > 0)
          .map((v) => v.trim())
      )
    );

    for (const subType of subTypes) {
      await client.query(
        `
        INSERT INTO commit_subtypes (key, status, is_new)
        VALUES ($1, 'unknown', TRUE)
        ON CONFLICT (key) DO NOTHING
        `,
        [subType]
      );
    }

    /* ------------------------------------------------ */
    /* STORE SNAPSHOT                                   */
    /* ------------------------------------------------ */

    const result = await client.query(
      `
      INSERT INTO commit_imports (row_count, data)
      VALUES ($1, $2)
      RETURNING id, created_at, row_count
      `,
      [rows.length, JSON.stringify(rows)]
    );

    await client.query("COMMIT");

    res.json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Commit import failed:", err);
    res.status(500).json({ message: "Commit import failed" });
  } finally {
    client.release();
  }
});

/* ------------------------------------------------ */
/* GET /latest                                      */
/* ------------------------------------------------ */

router.get("/latest", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const result = await db.query(
      `
      SELECT id, created_at, row_count, data
      FROM commit_imports
      ORDER BY created_at DESC
      LIMIT 1
      `
    );

    let importRecord = { id: 0, created_at: new Date().toISOString(), row_count: 0, data: [] };
    let snapshotRows = [];

    if (result.rows.length > 0) {
      importRecord = result.rows[0];
      snapshotRows = typeof importRecord.data === "string" ? JSON.parse(importRecord.data) : importRecord.data;
      if (!Array.isArray(snapshotRows)) snapshotRows = [];
    }

    // 1. Fetch ALL active queue_items
    const activeQueueRes = await db.query(
      `
      SELECT *
      FROM queue_items
      WHERE active = true
      ORDER BY commit_date ASC NULLS LAST
      `
    );

    // 2. FALLBACK: If there's no snapshot at all, serve active queue items properly mapped
    if (snapshotRows.length === 0) {
      const fallbackRows = activeQueueRes.rows.map(qi => ({
        ...qi,
        external_id: qi.external_id,
        id: qi.external_id,
        ticketNumber: qi.external_id, // fallback for ID filters
        systemName: qi.system_name || (qi.details && (qi.details.systemName || qi.details.system_name)) || "",
        salesOrder: qi.details && qi.details.salesOrder ? qi.details.salesOrder : "",
        activityNumber: qi.external_id,
        activityType: qi.queue_type === "TroubleTickets" ? "TroubleTicket" : (qi.queue_type || "Unknown"),
        activityStatus: qi.status || "Open",
        owner: qi.owner || "Unassigned",
        activitySubType: qi.subtype || "",
        group: qi.group_key || "",
        remainingRaw: qi.details && qi.details.remainingRaw ? qi.details.remainingRaw : "",
        commitDate: qi.commit_date ? new Date(qi.commit_date).toISOString() : (qi.revised_commit_date ? new Date(qi.revised_commit_date).toISOString() : null),
      }));
      return res.json({
        id: 0,
        created_at: new Date().toISOString(),
        row_count: fallbackRows.length,
        data: fallbackRows
      });
    }

    // 3. ENRICHMENT: Map external IDs from existing snapshot rows
    const idMap = new Map();
    snapshotRows.forEach((row, idx) => {
      const extId = row.activityNumber || row.ticketNumber || row.Ticket || row.id || row.external_id;
      if (extId) {
        idMap.set(String(extId).trim(), idx);
      }
    });

    const troubleTickets = [];

    // 4. Enrich existing rows and collect Trouble Tickets
    for (const qi of activeQueueRes.rows) {
      const extId = String(qi.external_id).trim();

      if (idMap.has(extId)) {
        // Enrich snapshot row
        const idx = idMap.get(extId);
        const sr = snapshotRows[idx];

        // Only overwrite if snapshot row is missing the value or is empty
        if (!sr.systemName) sr.systemName = qi.system_name || (qi.details && (qi.details.systemName || qi.details.system_name)) || "";
        if (!sr.activityNumber) sr.activityNumber = extId;
        if (!sr.activityType) sr.activityType = qi.queue_type === "TroubleTickets" ? "TroubleTicket" : (qi.queue_type || (qi.details && qi.details.activityType) || "");
        if (!sr.activityStatus) sr.activityStatus = qi.status || "";
        if (!sr.owner) sr.owner = qi.owner || "";
        if (!sr.group) sr.group = qi.group_key || "";

      } else if (qi.queue_type === "TroubleTickets") {
        // Include Trouble Tickets if due in <= 72h or overdue
        const targetDate = qi.commit_date ? new Date(qi.commit_date) : (qi.revised_commit_date ? new Date(qi.revised_commit_date) : null);
        if (targetDate) {
          const hoursDiff = (targetDate.getTime() - Date.now()) / (1000 * 60 * 60);
          if (hoursDiff <= 72) {
            troubleTickets.push({
              ...qi,
              external_id: extId, // Critical: this bypasses the frontend ID filter
              id: extId,
              ticketNumber: extId,
              systemName: qi.system_name || (qi.details && (qi.details.systemName || qi.details.system_name)) || "",
              salesOrder: qi.details && qi.details.salesOrder ? qi.details.salesOrder : "",
              activityNumber: extId,
              activityType: "TroubleTicket",
              activityStatus: qi.status || "Open",
              owner: qi.owner || "Unassigned",
              activitySubType: qi.subtype || "",
              group: qi.group_key || "",
              remainingRaw: qi.details && qi.details.remainingRaw ? qi.details.remainingRaw : "",
              commitDate: targetDate.toISOString(),
            });
          }
        }
      }
    }

    // 5. Combine Trouble Tickets and Snapshot Rows
    const finalData = [...troubleTickets, ...snapshotRows];

    return res.json({
      id: importRecord.id,
      created_at: importRecord.created_at,
      row_count: finalData.length,
      data: finalData
    });

  } catch (err) {
    console.error("Load latest commit failed:", err);
    res.status(500).json({ message: "Load latest commit failed" });
  }
});

/* ------------------------------------------------ */
/* GET /subtypes                                    */
/* ------------------------------------------------ */

router.get("/subtypes", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const result = await db.query(
      `
      SELECT id, key, status, is_new, created_at, updated_at
      FROM commit_subtypes
      ORDER BY is_new DESC, key ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Load commit subtypes failed:", err);
    res.status(500).json({ message: "Load commit subtypes failed" });
  }
});

/* ------------------------------------------------ */
/* POST /subtypes                                   */
/* ------------------------------------------------ */

router.post("/subtypes", async (req, res) => {
  try {
    const { key, status } = req.body;

    if (!key || typeof key !== "string") {
      return res.status(400).json({ message: "Invalid key value" });
    }

    const safeStatus =
      status === "relevant" || status === "ignore" ? status : "unknown";

    const result = await db.query(
      `
      INSERT INTO commit_subtypes (key, status, is_new)
      VALUES ($1, $2, TRUE)
      ON CONFLICT (key) DO NOTHING
      RETURNING id, key, status, is_new, created_at
      `,
      [key.trim(), safeStatus]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ message: "Sub-Type already exists" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Create commit subtype failed:", err);
    res.status(500).json({ message: "Create commit subtype failed" });
  }
});

/* ------------------------------------------------ */
/* PATCH /subtypes/:id                              */
/* ------------------------------------------------ */

router.patch("/subtypes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["relevant", "ignore"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const result = await db.query(
      `
      UPDATE commit_subtypes
      SET
        status = $1,
        is_new = FALSE,
        updated_at = NOW()
      WHERE id = $2
      RETURNING id, key, status, is_new, updated_at
      `,
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Sub-Type not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update commit subtype failed:", err);
    res.status(500).json({ message: "Update commit subtype failed" });
  }
});

/* ------------------------------------------------ */
/* GET /meta (Crawler Stats for Header)             */
/* ------------------------------------------------ */

router.get("/meta", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store"); // Ensure fresh data on poll

    // 1. Get last successful crawler run timestamp
    const runRes = await db.query(`
      SELECT snapshot_at
      FROM crawler_runs
      WHERE success = true
      ORDER BY snapshot_at DESC
      LIMIT 1
    `);
    const lastUpdate = runRes.rows[0]?.snapshot_at || null;

    // 2. Get active ticket counts grouped by queue_type
    const countRes = await db.query(`
      SELECT queue_type, COUNT(*) as cnt
      FROM queue_items
      WHERE active = true
      GROUP BY queue_type
    `);

    // 3. Aggregate totals
    let totalCount = 0;
    const breakdown = { sh: 0, tt: 0, cc: 0 };

    for (const row of countRes.rows) {
      const c = parseInt(row.cnt, 10) || 0;
      totalCount += c;

      const qt = String(row.queue_type || "");
      if (qt === "SmartHands") breakdown.sh += c;
      else if (qt === "TroubleTickets") breakdown.tt += c;
      else if (qt === "CCInstalls") breakdown.cc += c;
    }

    res.json({
      lastUpdate,
      count: totalCount,
      breakdown,
    });
  } catch (err) {
    console.error("Load commit meta failed:", err);
    res.status(500).json({ message: "Load commit meta failed" });
  }
});

/* ------------------------------------------------ */
/* DELETE /subtypes/:id                             */
/* ------------------------------------------------ */

router.delete("/subtypes/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
      DELETE FROM commit_subtypes
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Sub-Type not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Delete commit subtype failed:", err);
    res.status(500).json({ message: "Delete commit subtype failed" });
  }
});

export default router;
