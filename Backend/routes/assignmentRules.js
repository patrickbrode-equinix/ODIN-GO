/* ------------------------------------------------ */
/* ASSIGNMENT RULES CONFIG ROUTES                    */
/* /api/assignment-rules                             */
/* CRUD for configurable assignment logic rules      */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { logSettingsChange } from "../services/settingsAudit.js";

const router = express.Router();

/* GET /api/assignment-rules — all rules */
router.get("/", requireAuth, requirePageAccess("odin_logic", "view"), async (_req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM assignment_rules ORDER BY category, sort_order"
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /assignment-rules error", err);
    res.status(500).json({ error: "Failed to fetch rules" });
  }
});

/* GET /api/assignment-rules/:ruleKey — single rule with history */
router.get("/:ruleKey", requireAuth, requirePageAccess("odin_logic", "view"), async (req, res) => {
  try {
    const { ruleKey } = req.params;
    const { rows: rules } = await db.query(
      "SELECT * FROM assignment_rules WHERE rule_key = $1",
      [ruleKey]
    );
    if (rules.length === 0) return res.status(404).json({ error: "Rule not found" });

    const { rows: history } = await db.query(
      "SELECT * FROM assignment_rules_history WHERE rule_key = $1 ORDER BY version DESC LIMIT 20",
      [ruleKey]
    );

    res.json({ rule: rules[0], history });
  } catch (err) {
    console.error("GET /assignment-rules/:key error", err);
    res.status(500).json({ error: "Failed to fetch rule" });
  }
});

/* PUT /api/assignment-rules/:ruleKey — update rule config */
router.put("/:ruleKey", requireAuth, requirePageAccess("odin_logic", "write"), async (req, res) => {
  try {
    const { ruleKey } = req.params;
    const { config_json, enabled, sort_order, change_note } = req.body;
    const actor = req.user?.name || req.user?.email || "system";

    // Fetch current
    const { rows: current } = await db.query(
      "SELECT * FROM assignment_rules WHERE rule_key = $1",
      [ruleKey]
    );
    if (current.length === 0) return res.status(404).json({ error: "Rule not found" });

    const oldRule = current[0];
    const newVersion = oldRule.version + 1;
    const newConfig = config_json || oldRule.config_json;
    const newEnabled = enabled != null ? enabled : oldRule.enabled;
    const newOrder = sort_order != null ? sort_order : oldRule.sort_order;

    // Save history first
    await db.query(
      `INSERT INTO assignment_rules_history (rule_id, rule_key, config_json, version, changed_by, change_note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [oldRule.id, ruleKey, oldRule.config_json, oldRule.version, actor, change_note || null]
    );

    // Update rule
    await db.query(
      `UPDATE assignment_rules SET
         config_json = $2,
         enabled = $3,
         sort_order = $4,
         version = $5,
         updated_by = $6,
         updated_at = NOW()
       WHERE rule_key = $1`,
      [ruleKey, newConfig, newEnabled, newOrder, newVersion, actor]
    );

    // Audit
    await logSettingsChange(
      "assignment",
      ruleKey,
      JSON.stringify(oldRule.config_json),
      JSON.stringify(newConfig),
      actor,
      change_note
    );

    const { rows } = await db.query("SELECT * FROM assignment_rules WHERE rule_key = $1", [ruleKey]);
    res.json(rows[0]);
  } catch (err) {
    console.error("PUT /assignment-rules error", err);
    res.status(500).json({ error: "Failed to update rule" });
  }
});

/* POST /api/assignment-rules/:ruleKey/rollback/:version — rollback to a previous version */
router.post("/:ruleKey/rollback/:version", requireAuth, requirePageAccess("odin_logic", "write"), async (req, res) => {
  try {
    const { ruleKey, version } = req.params;
    const actor = req.user?.name || req.user?.email || "system";

    // Find the history entry
    const { rows: history } = await db.query(
      "SELECT * FROM assignment_rules_history WHERE rule_key = $1 AND version = $2",
      [ruleKey, parseInt(version)]
    );
    if (history.length === 0) return res.status(404).json({ error: "Version not found" });

    // Get current rule
    const { rows: current } = await db.query(
      "SELECT * FROM assignment_rules WHERE rule_key = $1",
      [ruleKey]
    );
    if (current.length === 0) return res.status(404).json({ error: "Rule not found" });

    const oldRule = current[0];
    const newVersion = oldRule.version + 1;
    const rollbackConfig = history[0].config_json;

    // Save current as history
    await db.query(
      `INSERT INTO assignment_rules_history (rule_id, rule_key, config_json, version, changed_by, change_note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [oldRule.id, ruleKey, oldRule.config_json, oldRule.version, actor, `Rollback to v${version}`]
    );

    // Apply rollback
    await db.query(
      `UPDATE assignment_rules SET
         config_json = $2,
         version = $3,
         updated_by = $4,
         updated_at = NOW()
       WHERE rule_key = $1`,
      [ruleKey, rollbackConfig, newVersion, actor]
    );

    await logSettingsChange("assignment", ruleKey, JSON.stringify(oldRule.config_json), JSON.stringify(rollbackConfig), actor, `Rollback to v${version}`);

    const { rows } = await db.query("SELECT * FROM assignment_rules WHERE rule_key = $1", [ruleKey]);
    res.json(rows[0]);
  } catch (err) {
    console.error("POST /assignment-rules/rollback error", err);
    res.status(500).json({ error: "Rollback failed" });
  }
});

/* PATCH /api/assignment-rules/:ruleKey/toggle — quick enable/disable */
router.patch("/:ruleKey/toggle", requireAuth, requirePageAccess("odin_logic", "write"), async (req, res) => {
  try {
    const { ruleKey } = req.params;
    const actor = req.user?.name || req.user?.email || "system";

    const { rows } = await db.query(
      "UPDATE assignment_rules SET enabled = NOT enabled, updated_by = $2, updated_at = NOW() WHERE rule_key = $1 RETURNING *",
      [ruleKey, actor]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Rule not found" });

    await logSettingsChange("assignment", `${ruleKey}.enabled`, !rows[0].enabled, rows[0].enabled, actor);
    res.json(rows[0]);
  } catch (err) {
    console.error("PATCH /assignment-rules/toggle error", err);
    res.status(500).json({ error: "Toggle failed" });
  }
});

export default router;
