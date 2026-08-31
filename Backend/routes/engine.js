/* ------------------------------------------------ */
/* ODIN ENGINE – API ROUTES                         */
/* Shadow run, decision logs, config, exclusions.   */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { runAssignmentEngine, loadConfig, checkCrawlerStaleness } from "../engine/assignEngine.js";
import { upsertLegacyEngineConfig } from "../services/assignmentConfigStore.js";

const router = express.Router();

router.use(requireAuth);
router.use(requirePageAccess("odin_logic", "view"));

/* ================================================ */
/* 1. TRIGGER SHADOW RUN                            */
/* ================================================ */

router.post("/run", requirePageAccess("settings", "write"), async (req, res) => {
  try {
    const config = await loadConfig();

    if (!config.enabled && config.enabled !== "true") {
      return res.status(400).json({ ok: false, error: "Engine ist deaktiviert. Bitte in der Konfiguration aktivieren." });
    }

    const result = await runAssignmentEngine({
      triggeredBy: "manual",
      triggeredByUser: req.user?.email || req.user?.username || "unknown",
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[ENGINE] Run endpoint error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ================================================ */
/* 2. GET RUNS (HISTORY)                            */
/* ================================================ */

router.get("/runs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const result = await db.query(
      `SELECT * FROM assignment_runs ORDER BY started_at DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================ */
/* 3. GET DECISIONS FOR A RUN                       */
/* ================================================ */

router.get("/runs/:runId/decisions", async (req, res) => {
  try {
    const { runId } = req.params;
    const result = await db.query(
      `SELECT * FROM assignment_decisions WHERE run_id = $1 ORDER BY priority_score ASC, id ASC`,
      [parseInt(runId, 10)]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================ */
/* 4. EXPLAIN – SINGLE TICKET DECISION              */
/* ================================================ */

router.get("/explain/:ticketExternalId", async (req, res) => {
  try {
    const { ticketExternalId } = req.params;
    const result = await db.query(
      `SELECT ad.*, ar.mode, ar.started_at AS run_started_at
       FROM assignment_decisions ad
       JOIN assignment_runs ar ON ar.id = ad.run_id
       WHERE ad.ticket_external_id = $1
       ORDER BY ad.created_at DESC
       LIMIT 10`,
      [ticketExternalId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================ */
/* 5. ENGINE CONFIG                                 */
/* ================================================ */

router.get("/config", async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/config", requirePageAccess("settings", "write"), async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "Payload erwartet: { key: value, ... }" });
    }

    const allowedKeys = [
      "engine_mode", "stale_threshold_minutes",
      "max_tickets_per_person_sh", "similar_remaining_hours_threshold",
      "enabled",
    ];
    const actor = req.user?.email || "unknown";

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowedKeys.includes(key))
    );

    const config = await upsertLegacyEngineConfig(filteredUpdates, actor);
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================ */
/* 6. MANUAL EXCLUSIONS                             */
/* ================================================ */

router.get("/exclusions", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, system_name, reason, created_by, created_at
       FROM assignment_exclusion_list
       WHERE active = true
       ORDER BY system_name ASC, created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/exclusions", requirePageAccess("settings", "write"), async (req, res) => {
  try {
    const { system_name, reason } = req.body;
    if (!system_name || !system_name.trim()) {
      return res.status(400).json({ error: "system_name ist erforderlich" });
    }

    const actor = req.user?.email || req.user?.username || "unknown";
    const result = await db.query(
      `INSERT INTO assignment_exclusion_list (system_name, reason, created_by, active)
       VALUES ($1, $2, $3)
       ON CONFLICT (system_name) DO UPDATE
       SET reason = EXCLUDED.reason,
           created_by = EXCLUDED.created_by,
           active = true
       RETURNING *`,
      [system_name.trim(), reason || null, actor]
    );

    res.status(201).json({ ok: true, exclusion: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/exclusions/:id", requirePageAccess("settings", "write"), async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM assignment_exclusion_list WHERE id = $1`, [parseInt(id, 10)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================ */
/* 6b. SUBTYPE EXCLUSIONS                           */
/* ================================================ */

router.get("/exclusions/subtypes", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM subtype_exclusions ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/exclusions/subtypes/available", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT customer_trouble_type FROM queue_items
       WHERE customer_trouble_type IS NOT NULL AND customer_trouble_type != ''
       ORDER BY customer_trouble_type`
    );
    res.json(result.rows.map((r) => r.customer_trouble_type));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/exclusions/subtypes", requirePageAccess("settings", "write"), async (req, res) => {
  try {
    const { subtype, reason } = req.body;
    if (!subtype || !subtype.trim()) {
      return res.status(400).json({ error: "subtype ist erforderlich" });
    }

    const actor = req.user?.email || req.user?.username || "unknown";
    const result = await db.query(
      `INSERT INTO subtype_exclusions (subtype, reason, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (subtype) DO NOTHING
       RETURNING *`,
      [subtype.trim(), reason || null, actor]
    );

    if (result.rowCount === 0) {
      return res.status(409).json({ error: "Subtype bereits auf der Ausnahmeliste" });
    }

    res.status(201).json({ ok: true, exclusion: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/exclusions/subtypes/:id", requirePageAccess("settings", "write"), async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM subtype_exclusions WHERE id = $1`, [parseInt(id, 10)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================ */
/* 7. CRAWLER STATUS                                */
/* ================================================ */

router.get("/crawler-status", async (req, res) => {
  try {
    const config = await loadConfig();
    const staleness = await checkCrawlerStaleness(config.stale_threshold_minutes);

    // Also get last 5 runs for context
    const runsRes = await db.query(
      `SELECT id, snapshot_at, total_active, new_count, gone_count, success, error_message, created_at
       FROM crawler_runs ORDER BY created_at DESC LIMIT 5`
    );

    res.json({
      ...staleness,
      thresholdMinutes: config.stale_threshold_minutes,
      recentRuns: runsRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================ */
/* 8. EMPLOYEE SHIFT ROLES                          */
/* ================================================ */

router.get("/roles", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "date query param erforderlich (YYYY-MM-DD)" });

    const result = await db.query(
      `SELECT * FROM employee_shift_roles WHERE date = $1 ORDER BY employee_name, role_code`,
      [date]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/roles", requirePageAccess("settings", "write"), async (req, res) => {
  try {
    const { employee_name, date, shift_code, role_code, comment } = req.body;

    if (!employee_name || !date || !shift_code || !role_code) {
      return res.status(400).json({ error: "employee_name, date, shift_code, role_code sind erforderlich" });
    }

    const actor = req.user?.email || req.user?.username || "unknown";
    const result = await db.query(
      `INSERT INTO employee_shift_roles (employee_name, date, shift_code, role_code, comment, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (employee_name, date, role_code)
       DO UPDATE SET shift_code = $3, comment = $5, updated_at = NOW()
       RETURNING *`,
      [employee_name.trim(), date, shift_code, role_code, comment || null, actor]
    );

    res.status(201).json({ ok: true, role: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/roles/:id", requirePageAccess("settings", "write"), async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM employee_shift_roles WHERE id = $1`, [parseInt(id, 10)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Bulk set roles for a date range (used by weekplan context menu) */
router.post("/roles/bulk", requirePageAccess("settings", "write"), async (req, res) => {
  try {
    const { employee_name, dates, shift_code, role_code, comment } = req.body;

    if (!employee_name || !Array.isArray(dates) || !dates.length || !shift_code || !role_code) {
      return res.status(400).json({ error: "employee_name, dates[], shift_code, role_code erforderlich" });
    }

    const actor = req.user?.email || req.user?.username || "unknown";
    const results = [];

    for (const date of dates) {
      const r = await db.query(
        `INSERT INTO employee_shift_roles (employee_name, date, shift_code, role_code, comment, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (employee_name, date, role_code)
         DO UPDATE SET shift_code = $3, comment = $5, updated_at = NOW()
         RETURNING *`,
        [employee_name.trim(), date, shift_code, role_code, comment || null, actor]
      );
      if (r.rows[0]) results.push(r.rows[0]);
    }

    res.status(201).json({ ok: true, count: results.length, roles: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
