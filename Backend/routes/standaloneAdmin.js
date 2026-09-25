import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import db from "../db.js";
import { config } from "../config/index.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

function keysMatch(supplied, expected) {
  const left = Buffer.from(String(supplied || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function verifyAdminPassword(password) {
  try {
    const { rows } = await db.query("SELECT value FROM app_settings WHERE key = $1", ["shiftplanner.admin_password_hash"]);
    const storedHash = rows[0]?.value;
    if (storedHash) return bcrypt.compare(String(password || ""), String(storedHash));
  } catch (error) {
    console.warn("ADMIN PASSWORD STORE UNAVAILABLE:", error?.message || error);
  }
  return keysMatch(password, config.SHIFTPLANNER_ADMIN_PASSWORD);
}

export async function resetStandaloneAdminPasswordIfRequested() {
  if (!config.SHIFTPLANNER_RESET_ADMIN_PASSWORD) return false;

  const hash = await bcrypt.hash(String(config.SHIFTPLANNER_ADMIN_PASSWORD), 12);
  await db.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    ["shiftplanner.admin_password_hash", hash, "deployment-reset"],
  );
  console.warn("[ADMIN] Standalone admin password reset from deployment configuration.");
  return true;
}

// The web version signs in with the admin password only (no application key),
// so repeated wrong passwords per client are slowed down.
const UNLOCK_WINDOW_MS = 15 * 60 * 1000;
const UNLOCK_MAX_FAILURES = 10;
const unlockFailures = new Map();

function getUnlockClientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

router.post("/unlock", async (req, res) => {
  if (!config.isShiftplannerMode) return res.status(404).json({ message: "Not found" });

  const clientKey = getUnlockClientKey(req);
  const now = Date.now();
  const failures = (unlockFailures.get(clientKey) || []).filter((timestamp) => now - timestamp < UNLOCK_WINDOW_MS);
  if (failures.length >= UNLOCK_MAX_FAILURES) {
    unlockFailures.set(clientKey, failures);
    return res.status(429).json({ message: "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen." });
  }

  if (!await verifyAdminPassword(req.body?.password)) {
    unlockFailures.set(clientKey, [...failures, now]);
    return res.status(401).json({ message: "Admin-Passwort ist falsch." });
  }
  unlockFailures.delete(clientKey);

  const token = jwt.sign(
    { scope: "shiftplanner_admin" },
    config.JWT_SECRET,
    { expiresIn: "4h" },
  );

  return res.json({ token, expiresIn: "4h" });
});

router.post("/change-password", requireAuth, async (req, res) => {
  if (!config.isShiftplannerMode) return res.status(404).json({ message: "Not found" });
  if (!req.user?.is_admin) return res.status(403).json({ message: "Admin-Berechtigung erforderlich." });

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ message: "Altes und neues Passwort sind erforderlich." });
  if (!await verifyAdminPassword(currentPassword)) {
    return res.status(400).json({ message: "Aktuelles Admin-Passwort ist falsch." });
  }

  const hash = await bcrypt.hash(String(newPassword), 12);
  await db.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    ["shiftplanner.admin_password_hash", hash, req.user?.displayName || req.user?.email || "admin"],
  );
  return res.json({ success: true });
});

export default router;
