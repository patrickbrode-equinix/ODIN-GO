/* ------------------------------------------------ */
/* USER SETTINGS + META ROUTES (FINAL)              */
/* ------------------------------------------------ */

import express from "express";
import { requireAuth, requireVerifiedIdentity } from "../middleware/authMiddleware.js";
import db from "../db.js";
import {
  getUserSettings,
  updateUserSettings,
  getUserMeta,
} from "../db/userSettings.js";

const router = express.Router();
router.use("/user", requireAuth, requireVerifiedIdentity);

/* ------------------------------------------------ */
/* GET /api/user/settings                           */
/* ------------------------------------------------ */

router.get("/user/settings", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await getUserSettings(userId);
    return res.json(settings);
  } catch (err) {
    console.error("GET USER SETTINGS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------ */
/* PUT /api/user/settings                           */
/* ------------------------------------------------ */

router.put("/user/settings", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const patch = req.body || {};

    // ✋ Whitelist – nur erlaubte Felder
    const allowedPatch = {
      language: patch.language,
      theme: patch.theme,
      notify_email: patch.notify_email,
      notify_browser: patch.notify_browser,
      notify_shift_reminder: patch.notify_shift_reminder,
      dashboard_config: patch.dashboard_config,
    };

    const updated = await updateUserSettings(userId, allowedPatch);
    return res.json(updated);
  } catch (err) {
    console.error("UPDATE USER SETTINGS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------ */
/* GET /api/user/meta                               */
/* Read-only Systemdaten                            */
/* ------------------------------------------------ */

router.get("/user/meta", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const meta = await getUserMeta(userId);

    if (!meta) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(meta);
  } catch (err) {
    console.error("GET USER META ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------ */
/* GET /api/user/preferences/shiftplan              */
/* ------------------------------------------------ */

import { getShiftplanPreferences, updateShiftplanPreferences } from "../db/userSettings.js";

router.get("/user/preferences/shiftplan", requireAuth, async (req, res) => {
  try {
    const prefs = await getShiftplanPreferences(req.user.id);
    res.json(prefs);
  } catch (err) {
    console.error("GET SHIFTPLAN PREFS ERROR:", err);
    res.status(500).json({ error: "Failed to load preferences" });
  }
});

router.put("/user/preferences/shiftplan", requireAuth, async (req, res) => {
  try {
    const patch = req.body || {};
    const updated = await updateShiftplanPreferences(req.user.id, patch);
    res.json(updated);
  } catch (err) {
    console.error("UPDATE SHIFTPLAN PREFS ERROR:", err);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

export default router;
