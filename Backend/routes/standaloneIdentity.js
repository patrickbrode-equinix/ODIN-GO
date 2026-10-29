import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { config } from "../config/index.js";

const router = express.Router();
const EQUINIX_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)*equinix\.com$/i;

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function keysMatch(supplied, expected) {
  const left = Buffer.from(String(supplied || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isLocalDevelopmentRequest(req) {
  return !config.isProd && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "");
}

router.post("/verify", async (req, res) => {
  try {
    return await verifyIdentity(req, res);
  } catch (error) {
    console.error("STANDALONE IDENTITY VERIFY ERROR:", error);
    if (!res.headersSent) res.status(500).json({ message: "Die Identität konnte nicht geprüft werden." });
  }
});

async function verifyIdentity(req, res) {
  if (!keysMatch(req.headers["x-shiftplanner-key"], config.SHIFTPLANNER_API_KEY) && !isLocalDevelopmentRequest(req)) {
    return res.status(401).json({ message: "Invalid local application key" });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  const reportedName = String(req.body?.displayName || "").trim();
  const jarvisUserName = String(req.body?.jarvisUserName || "").trim();
  if (!EQUINIX_EMAIL.test(email) && !jarvisUserName) {
    return res.status(400).json({ message: "Jarvis hat keine Benutzerkennung bereitgestellt." });
  }

  // The Mendix user name (e.g. "nschauer") and the e-mail shown in the Jarvis profile menu are both accepted:
  // every identifier is compared with e-mail, UPN and login name.
  const identifiers = [...new Set([email, jarvisUserName.toLowerCase()].filter(Boolean))];
  let { rows } = await db.query(
    `SELECT id, first_name, last_name, login_name, email, upn, approved, is_admin, is_root
     FROM users
     WHERE LOWER(email) = ANY($1::text[])
        OR LOWER(COALESCE(upn, '')) = ANY($1::text[])
        OR LOWER(COALESCE(login_name, '')) = ANY($1::text[])
     ORDER BY approved DESC, id ASC
     LIMIT 2`,
    [identifiers],
  );
  // Fallback by name, accepted only when it maps to exactly one approved employee: a full display name from
  // Mendix, the name reported by the profile menu, or "first.last" taken from the e-mail address.
  if (!rows.length) {
    const nameKeys = new Set([
      jarvisUserName,
      reportedName,
      EQUINIX_EMAIL.test(email) ? email.split("@")[0].replace(/[._-]+/g, " ") : "",
    ].map(normalizeName).filter((key) => key.includes(" ")));
    if (nameKeys.size > 0) {
      const candidates = await db.query(
        `SELECT id, first_name, last_name, login_name, email, upn, approved, is_admin, is_root
           FROM users
          WHERE approved = TRUE
          ORDER BY id ASC`,
      );
      rows = candidates.rows.filter((candidate) => nameKeys.has(normalizeName(`${candidate.first_name || ""} ${candidate.last_name || ""}`)));
    }
  }
  if (rows.length > 1) {
    return res.status(409).json({
      code: "SSO_USER_AMBIGUOUS",
      message: "Die Jarvis-Kennung ist mehreren Mitarbeitern zugeordnet. Bitte die Nutzerkennung im User Management eindeutig hinterlegen.",
    });
  }
  const user = rows[0];
  if (!user) {
    return res.status(404).json({
      code: "SSO_USER_NOT_MAPPED",
      message: `Der Jarvis-Benutzer ${email || jarvisUserName} ist noch keinem Mitarbeiter im Schichtplaner zugeordnet.`,
    });
  }

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ")
    || reportedName
    || user.login_name
    || email
    || jarvisUserName;
  const verifiedEmail = user.email || user.upn || email;
  await db.query(
    `UPDATE users
        SET last_login = NOW(), last_seen_at = NOW()
      WHERE id = $1`,
    [user.id],
  );
  const token = jwt.sign(
    { scope: "shiftplanner_identity", userId: user.id, email: verifiedEmail, displayName },
    config.JWT_SECRET,
    { expiresIn: "4h" },
  );

  return res.json({
    token,
    expiresIn: "4h",
    user: { id: user.id, displayName, email: verifiedEmail, isAdmin: user.is_admin === true || user.is_root === true },
    verificationMethod: "jarvis_sso_session",
  });
}

export default router;
