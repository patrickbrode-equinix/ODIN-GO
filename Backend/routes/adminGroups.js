/* ———————————————— */
/* GROUPS – API (LIST / CREATE / POLICY)           */
/* RBAC enforced via requirePageAccess             */
/* ———————————————— */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import {
  getGroups,
  groupExists,
  normalizeGroupKey,
} from "../db/initSchema.js";

const router = express.Router();

/* ———————————————— */
/* HELPERS                                         */
/* ———————————————— */

function normalizeLabel(value) {
  return String(value || "").trim();
}

/* 🔒 FINAL: sanitize group policy */
function sanitizePolicy(input) {
  const policy = input && typeof input === "object" ? input : {};
  const out = {};

  for (const [pageKey, rawLevel] of Object.entries(policy)) {
    const level = String(rawLevel || "").toLowerCase().trim();

    if (level === "view" || level === "write") {
      out[pageKey] = level;
    } else if (level === "manage") {
      // legacy mapping
      out[pageKey] = "write";
    }
    // alles andere -> ignorieren
  }

  return out;
}

/* ———————————————— */
/* GET – GROUP LIST                                 */
/* view access                                      */
/* ———————————————— */

router.get(
  "/",
  requireAuth,
  requirePageAccess("user_management", "view"),
  async (req, res) => {
    try {
      const groups = await getGroups();
      return res.json(groups);
    } catch (err) {
      console.error("GROUP LIST ERROR:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ———————————————— */
/* POST – CREATE GROUP                              */
/* write access                                     */
/* ———————————————— */

router.post(
  "/",
  requireAuth,
  requirePageAccess("user_management", "write"),
  async (req, res) => {
    try {
      const key = normalizeGroupKey(req.body?.key);
      const label = normalizeLabel(req.body?.label);
      const policy = sanitizePolicy(req.body?.policy);

      if (!key || key.length < 2) {
        return res.status(400).json({ message: "Invalid group key" });
      }
      if (!label) {
        return res.status(400).json({ message: "Label is required" });
      }

      if (await groupExists(key)) {
        return res.status(409).json({ message: "Group already exists" });
      }

      await db.query(
        `
        INSERT INTO groups (key, label, policy)
        VALUES ($1,$2,$3::jsonb)
        `,
        [key, label, JSON.stringify(policy)]
      );

      return res.status(201).json({ success: true });
    } catch (err) {
      console.error("GROUP CREATE ERROR:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ———————————————— */
/* PATCH – UPDATE LABEL                             */
/* write access                                     */
/* ———————————————— */

router.patch(
  "/:key",
  requireAuth,
  requirePageAccess("user_management", "write"),
  async (req, res) => {
    try {
      const key = normalizeGroupKey(req.params.key);
      const label = normalizeLabel(req.body?.label);

      if (!label) {
        return res.status(400).json({ message: "Label is required" });
      }

      const result = await db.query(
        `UPDATE groups SET label = $1 WHERE key = $2 RETURNING key`,
        [label, key]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Group not found" });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("GROUP UPDATE ERROR:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ———————————————— */
/* PUT – UPDATE POLICY                              */
/* write access                                     */
/* ———————————————— */

router.put(
  "/:key/policy",
  requireAuth,
  requirePageAccess("user_management", "write"),
  async (req, res) => {
    try {
      const key = normalizeGroupKey(req.params.key);
      const policy = sanitizePolicy(req.body?.policy);

      const result = await db.query(
        `UPDATE groups SET policy = $1::jsonb WHERE key = $2 RETURNING key`,
        [JSON.stringify(policy), key]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Group not found" });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("GROUP POLICY UPDATE ERROR:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
