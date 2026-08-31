/* ------------------------------------------------ */
/* APP SETTINGS ROUTES                              */
/* /api/app-settings                                */
/* Thresholds: shift warnings, understaffing,       */
/* wellbeing, log retention.                        */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { logSettingsChange } from "../services/settingsAudit.js";

const router = express.Router();

const TICKET_RESET_TABLES = [
  'assignment_analytics_events',
  'assignment_ticket_decisions',
  'assignment_runs',
  'assignment_overrides',
  'crawler_run_deltas',
  'crawler_runs',
  'expired_tickets',
  'queue_items',
  'snapshots',
  'commit_imports',
];

async function loadExistingResetTables() {
  const { rows } = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [TICKET_RESET_TABLES]
  );

  return TICKET_RESET_TABLES.filter((tableName) => rows.some((row) => row.table_name === tableName));
}

async function loadTableCounts(client, tableNames) {
  const counts = {};

  for (const tableName of tableNames) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
    counts[tableName] = rows[0]?.count ?? 0;
  }

  return counts;
}

/* GET /api/app-settings */
router.get("/", requireAuth, requirePageAccess("admin_settings", "view"), async (req, res) => {
  try {
    const { rows } = await db.query("SELECT key, value FROM app_settings ORDER BY key");
    // Return as a flat object for convenience
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json(settings);
  } catch (err) {
    console.error("GET /app-settings error", err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

/* PUT /api/app-settings — bulk update */
router.put("/", requireAuth, requirePageAccess("admin_settings", "write"), async (req, res) => {
  try {
    const updates = req.body; // { key: value, ... }
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "Body must be a key-value object" });
    }

    const actor = req.user?.name || req.user?.email || "system";

    for (const [key, val] of Object.entries(updates)) {
      // Get old value for audit
      const { rows: old } = await db.query("SELECT value FROM app_settings WHERE key = $1", [key]);
      const oldVal = old.length > 0 ? old[0].value : null;

      await db.query(
        `INSERT INTO app_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, String(val), actor]
      );

      if (oldVal !== String(val)) {
        const domain = key.split('.')[0] || 'app';
        await logSettingsChange(domain, key, oldVal, String(val), actor);
      }
    }

    const { rows } = await db.query("SELECT key, value FROM app_settings ORDER BY key");
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  } catch (err) {
    console.error("PUT /app-settings error", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

/* PATCH /api/app-settings/:key — single value */
router.patch("/:key", requireAuth, requirePageAccess("admin_settings", "write"), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: "value is required" });
    }

    const actor = req.user?.name || req.user?.email || "system";

    // Get old value for audit
    const { rows: old } = await db.query("SELECT value FROM app_settings WHERE key = $1", [key]);
    const oldVal = old.length > 0 ? old[0].value : null;

    const { rows } = await db.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()
       RETURNING *`,
      [key, String(value), actor]
    );

    if (oldVal !== String(value)) {
      const domain = key.split('.')[0] || 'app';
      await logSettingsChange(domain, key, oldVal, String(value), actor);
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update setting" });
  }
});

router.post('/ticket-db/reset', requireAuth, requirePageAccess('admin_settings', 'write'), async (req, res) => {
  const client = await db.connect();

  try {
    if (req.body?.confirmReset !== true) {
      return res.status(400).json({ error: 'confirmReset=true is required' });
    }

    const actor = req.user?.name || req.user?.email || 'system';
    const existingTables = await loadExistingResetTables();

    if (existingTables.length === 0) {
      return res.json({
        success: true,
        resetTables: [],
        deletedRowsByTable: {},
        totalDeletedRows: 0,
      });
    }

    await client.query('BEGIN');
    const deletedRowsByTable = await loadTableCounts(client, existingTables);
    const totalDeletedRows = Object.values(deletedRowsByTable).reduce((sum, value) => sum + Number(value || 0), 0);

    await client.query(`TRUNCATE TABLE ${existingTables.join(', ')} RESTART IDENTITY CASCADE`);
    await client.query('COMMIT');

    await logSettingsChange(
      'maintenance',
      'ticket_db.reset',
      null,
      JSON.stringify({ tables: existingTables, deletedRowsByTable, totalDeletedRows }),
      actor,
      req.body?.changeNote || 'Ticket-Datenbank über Admin-Einstellungen zurückgesetzt'
    );

    res.json({
      success: true,
      resetTables: existingTables,
      deletedRowsByTable,
      totalDeletedRows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /app-settings/ticket-db/reset error', err);
    res.status(500).json({ error: 'Failed to reset ticket database' });
  } finally {
    client.release();
  }
});

export default router;
