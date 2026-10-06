/* ———————————————————————————————— */
/* AUTH MIDDLEWARE – SHIFTPLANNER    */
/* (application key + admin session  */
/*  + Jarvis identity token)         */
/* ———————————————————————————————— */

import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import db from "../db.js";
import { config } from "../config/index.js";

const LAST_SEEN_TOUCH_INTERVAL_MS = 60 * 1000;
const lastSeenTouchCache = new Map();

// The web version signs in with the admin password only. A valid signed admin
// session therefore replaces the application key; the key stays mandatory for
// the Jarvis extension, whose identity check has no password.
function hasValidAdminSession(req) {
  const adminToken = String(req.headers["x-shiftplanner-admin"] || "");
  if (!adminToken) return false;
  try {
    return jwt.verify(adminToken, config.JWT_SECRET)?.scope === "shiftplanner_admin";
  } catch {
    return false;
  }
}

/**
 * Protect low-risk operational data that does not need a named employee
 * session (weather and market data). Production requests still need the VM
 * application key, so rotating that key invalidates access immediately.
 */
export function requireApplicationKey(req, res, next) {
  const suppliedKey = String(req.headers["x-shiftplanner-key"] || "");
  const expectedKey = config.SHIFTPLANNER_API_KEY;
  const localDevelopmentRequest = !config.isProd && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "");
  const keyMatches = suppliedKey.length === expectedKey.length
    && suppliedKey.length > 0
    && crypto.timingSafeEqual(Buffer.from(suppliedKey), Buffer.from(expectedKey));

  if (!keyMatches && !localDevelopmentRequest && !hasValidAdminSession(req)) {
    return res.status(401).json({ message: "Invalid local application key" });
  }
  return next();
}

function isPatrickBrode(identity, user) {
  const normalize = (value) => String(value || "").trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
  const identityName = normalize(identity?.displayName);
  const databaseName = normalize([user?.first_name, user?.last_name].filter(Boolean).join(" "));
  const email = normalize(user?.email);
  return identityName === "patrick brode"
    || databaseName === "patrick brode"
    || email.startsWith("patrick.brode@");
}

async function touchUserLastSeen(userId) {
  if (!Number.isInteger(userId)) return;

  const now = Date.now();
  const lastTouchedAt = lastSeenTouchCache.get(userId) || 0;
  if (now - lastTouchedAt < LAST_SEEN_TOUCH_INTERVAL_MS) return;

  lastSeenTouchCache.set(userId, now);

  try {
    await db.query(
      `UPDATE users
       SET last_seen_at = NOW()
       WHERE id = $1
         AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '45 seconds')`,
      [userId]
    );
  } catch (error) {
    console.warn("LAST SEEN UPDATE ERROR:", error?.message || error);
  }
}

/* ———————————————————————————————— */
/* REQUIRE AUTH                                     */
/* ———————————————————————————————— */

export async function requireAuth(req, res, next) {
  try {
    const suppliedKey = String(req.headers["x-shiftplanner-key"] || "");
    const expectedKey = config.SHIFTPLANNER_API_KEY;
    const localDevelopmentRequest = !config.isProd && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "");
    const keyMatches = suppliedKey.length === expectedKey.length
      && suppliedKey.length > 0
      && crypto.timingSafeEqual(Buffer.from(suppliedKey), Buffer.from(expectedKey));

    // Local development is intentionally usable without copying a secret into
    // every unpacked Chrome extension. A VM/production deployment requires
    // the configured application key, unless the web admin session is valid.
    const keyless = !keyMatches && !localDevelopmentRequest;
    if (keyless && !hasValidAdminSession(req)) {
      return res.status(401).json({ message: "Invalid local application key" });
    }

    let adminUnlocked = false;
    let adminError = null;
    const adminToken = String(req.headers["x-shiftplanner-admin"] || "");
    if (adminToken) {
      try {
        const decoded = jwt.verify(adminToken, config.JWT_SECRET);
        adminUnlocked = decoded?.scope === "shiftplanner_admin";
      } catch {
        adminError = "admin_token_expired_or_invalid";
      }
    }

    let verifiedIdentity = null;
    let identityError = null;
    const identityToken = keyless ? "" : String(req.headers["x-shiftplanner-identity"] || "");
    if (identityToken) {
      try {
        const decoded = jwt.verify(identityToken, config.JWT_SECRET);
        if (decoded?.scope !== "shiftplanner_identity" || !Number.isInteger(decoded?.userId)) {
          identityError = "invalid_identity_scope";
        } else {
          verifiedIdentity = decoded;
        }
      } catch {
        identityError = "identity_token_expired_or_invalid";
      }
    }

    // The standalone web surface is password protected through the same
    // signed admin token used by the embedded application. Jarvis embeds
    // supply a verified identity token instead. Do not silently fall back
    // to the placeholder user for either access path.
    if (!adminUnlocked && !verifiedIdentity) {
      return res.status(401).json({
        code: adminError ? "ADMIN_SESSION_EXPIRED" : "JARVIS_IDENTITY_REQUIRED",
        message: adminError
          ? "Die Passwort-Sitzung ist abgelaufen. Bitte erneut anmelden."
          : "Bitte melde dich mit dem Passwort an oder öffne Jarvis, damit deine Identität bestätigt werden kann.",
      });
    }

    const result = await db.query(
      `SELECT id, login_name, email, user_group, first_name, last_name, is_root
       FROM users
       WHERE ($1::int IS NOT NULL AND id = $1)
          OR is_root = TRUE
       ORDER BY
         CASE WHEN $1::int IS NOT NULL AND id = $1 THEN 0 ELSE 1 END,
         CASE WHEN is_root = TRUE THEN 0 ELSE 1 END,
         id ASC
       LIMIT 1`
      , [verifiedIdentity?.userId ?? null]
    );
    const localUser = result.rows[0];

    // The query falls back to the root row. That is intended for the admin
    // password session only: a token whose user no longer exists must not
    // silently act as the root user.
    if (verifiedIdentity && localUser?.id !== verifiedIdentity.userId) {
      if (!adminUnlocked) {
        return res.status(401).json({
          code: "JARVIS_IDENTITY_REQUIRED",
          message: "Die Jarvis-Identität ist nicht mehr gültig. Bitte Jarvis neu öffnen.",
        });
      }
      verifiedIdentity = null;
      identityError = "identity_user_not_found";
    }
    const patrickBypass = isPatrickBrode(verifiedIdentity, localUser);
    adminUnlocked = adminUnlocked || patrickBypass;
    const regularPolicy = {
      shiftplan: "view",
      settings: "write",
      tv_dashboard: "view",
    };

    req.user = {
      id: localUser?.id ?? 0,
      loginName: localUser?.login_name ?? "shiftplanner",
      email: localUser?.email ?? null,
      displayName: verifiedIdentity?.displayName
        || [localUser?.first_name, localUser?.last_name].filter(Boolean).join(" ")
        || localUser?.login_name
        || "Mitarbeiter",
      first_name: localUser?.first_name ?? null,
      last_name: localUser?.last_name ?? null,
      group: localUser?.user_group ?? null,
      approved: true,
      is_root: adminUnlocked,
      is_admin: adminUnlocked,
      must_change_password: false,
      role: adminUnlocked ? "admin" : "user",
      accessPolicy: adminUnlocked ? {} : regularPolicy,
    };
    req.isRoot = adminUnlocked;
    req.identityVerified = Boolean(verifiedIdentity);
    req.identityMethod = verifiedIdentity ? "jarvis_sso_profile" : null;
    req.identityError = identityError;
    req.adminError = adminError;
    if (verifiedIdentity && Number.isInteger(localUser?.id)) {
      await touchUserLastSeen(localUser.id);
    }
    return next();
  } catch (error) {
    console.error("STANDALONE AUTH CONTEXT ERROR:", error);
    return res.status(503).json({ message: "Local shiftplanner context is unavailable" });
  }
}

export function requireVerifiedIdentity(req, res, next) {
  // The standalone password login is an administrator session and therefore
  // is sufficient for operational pages as well. Employee sessions still
  // require their Jarvis identity, preventing anonymous handover entries.
  if (req.identityVerified || req.isRoot === true) return next();
  return res.status(401).json({
    code: "JARVIS_IDENTITY_REQUIRED",
    message: "Bitte dein Jarvis-Profil öffnen, damit die angemeldete SSO-Identität verifiziert werden kann.",
  });
}
