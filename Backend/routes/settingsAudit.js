/* ------------------------------------------------ */
/* SETTINGS AUDIT ROUTES                            */
/* /api/admin/settings-audit                        */
/* ------------------------------------------------ */

import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { queryAuditLog } from "../services/settingsAudit.js";

const router = express.Router();

/* GET /api/admin/settings-audit */
router.get("/", requireAuth, requirePageAccess("admin_settings", "view"), async (req, res) => {
  try {
    const { domain, key, changed_by, start, end, limit = 100, offset = 0 } = req.query;
    const rows = await queryAuditLog({
      domain,
      key,
      changedBy: changed_by,
      start,
      end,
      limit,
      offset,
    });
    res.json(rows);
  } catch (err) {
    console.error("GET /admin/settings-audit error", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

export default router;
