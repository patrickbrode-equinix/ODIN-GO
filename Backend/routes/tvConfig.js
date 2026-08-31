/* ------------------------------------------------ */
/* TV SLIDE CONFIG ROUTES                           */
/* /api/tv/config                                   */
/* Public GET for TV displays, auth PUT for admins  */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { logSettingsChange } from "../services/settingsAudit.js";

const router = express.Router();

/* GET /api/tv/config — public (for TV kiosk) */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT slide_id, label, enabled, duration_ms, sort_order, only_if_data, updated_by, updated_at
       FROM tv_slide_config ORDER BY sort_order`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /tv/config error", err);
    // Graceful: return defaults so TV doesn't break
    res.json([]);
  }
});

/* PUT /api/tv/config — update all slides (admin) */
router.put("/", requireAuth, requirePageAccess("admin_settings", "write"), async (req, res) => {
  try {
    const slides = req.body;
    if (!Array.isArray(slides)) {
      return res.status(400).json({ error: "Body must be an array of slide configs" });
    }

    const actor = req.user?.name || req.user?.email || "system";
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      for (const slide of slides) {
        if (!slide.slide_id) continue;

        // Fetch old value for audit
        const { rows: old } = await client.query(
          "SELECT duration_ms, enabled, sort_order FROM tv_slide_config WHERE slide_id = $1",
          [slide.slide_id]
        );

        await client.query(
          `UPDATE tv_slide_config
           SET enabled = COALESCE($2, enabled),
               duration_ms = COALESCE($3, duration_ms),
               sort_order = COALESCE($4, sort_order),
               only_if_data = COALESCE($5, only_if_data),
               updated_by = $6,
               updated_at = NOW()
           WHERE slide_id = $1`,
          [
            slide.slide_id,
            slide.enabled,
            slide.duration_ms,
            slide.sort_order,
            slide.only_if_data,
            actor,
          ]
        );

        // Audit
        if (old.length > 0) {
          const oldRow = old[0];
          if (slide.duration_ms != null && slide.duration_ms !== oldRow.duration_ms) {
            await logSettingsChange("tv", `slide.${slide.slide_id}.duration_ms`, oldRow.duration_ms, slide.duration_ms, actor, slide.change_note);
          }
          if (slide.enabled != null && slide.enabled !== oldRow.enabled) {
            await logSettingsChange("tv", `slide.${slide.slide_id}.enabled`, oldRow.enabled, slide.enabled, actor, slide.change_note);
          }
          if (slide.sort_order != null && slide.sort_order !== oldRow.sort_order) {
            await logSettingsChange("tv", `slide.${slide.slide_id}.sort_order`, oldRow.sort_order, slide.sort_order, actor, slide.change_note);
          }
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Return updated config
    const { rows } = await db.query(
      "SELECT slide_id, label, enabled, duration_ms, sort_order, only_if_data, updated_by, updated_at FROM tv_slide_config ORDER BY sort_order"
    );
    res.json(rows);
  } catch (err) {
    console.error("PUT /tv/config error", err);
    res.status(500).json({ error: "Failed to update TV config" });
  }
});

/* PATCH /api/tv/config/:slideId — single slide update */
router.patch("/:slideId", requireAuth, requirePageAccess("admin_settings", "write"), async (req, res) => {
  try {
    const { slideId } = req.params;
    const { enabled, duration_ms, sort_order, only_if_data, change_note } = req.body;
    const actor = req.user?.name || req.user?.email || "system";

    // Fetch old values
    const { rows: old } = await db.query(
      "SELECT * FROM tv_slide_config WHERE slide_id = $1",
      [slideId]
    );
    if (old.length === 0) {
      return res.status(404).json({ error: "Slide not found" });
    }

    await db.query(
      `UPDATE tv_slide_config
       SET enabled = COALESCE($2, enabled),
           duration_ms = COALESCE($3, duration_ms),
           sort_order = COALESCE($4, sort_order),
           only_if_data = COALESCE($5, only_if_data),
           updated_by = $6,
           updated_at = NOW()
       WHERE slide_id = $1`,
      [slideId, enabled, duration_ms, sort_order, only_if_data, actor]
    );

    // Audit changes
    const oldRow = old[0];
    if (duration_ms != null && duration_ms !== oldRow.duration_ms) {
      await logSettingsChange("tv", `slide.${slideId}.duration_ms`, oldRow.duration_ms, duration_ms, actor, change_note);
    }
    if (enabled != null && enabled !== oldRow.enabled) {
      await logSettingsChange("tv", `slide.${slideId}.enabled`, oldRow.enabled, enabled, actor, change_note);
    }

    const { rows } = await db.query("SELECT * FROM tv_slide_config WHERE slide_id = $1", [slideId]);
    res.json(rows[0]);
  } catch (err) {
    console.error("PATCH /tv/config error", err);
    res.status(500).json({ error: "Failed to update slide" });
  }
});

export default router;
