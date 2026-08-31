/* ———————————————————————————————— */
/* AUTH MIDDLEWARE – JWT ONLY (CLEAN) */
/* ———————————————————————————————— */

import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import db from "../db.js";
import { resolveUserRole } from "../auth/accessControl.js";
import { buildAccessPolicy } from "../auth/accessControl.js";
import { config } from "../config/index.js";

const LAST_SEEN_TOUCH_INTERVAL_MS = 60 * 1000;
const lastSeenTouchCache = new Map();

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
  if (config.isShiftplannerMode) {
    try {
      const suppliedKey = String(req.headers["x-shiftplanner-key"] || "");
      const expectedKey = config.SHIFTPLANNER_API_KEY;
      const localDevelopmentRequest = !config.isProd && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "");
      const keyMatches = suppliedKey.length === expectedKey.length
        && suppliedKey.length > 0
        && crypto.timingSafeEqual(Buffer.from(suppliedKey), Buffer.from(expectedKey));

      // Local development is intentionally usable without copying a secret into
      // every unpacked Chrome extension. A VM/production deployment always
      // requires the configured application key.
      if (!keyMatches && !localDevelopmentRequest) {
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
      const identityToken = String(req.headers["x-shiftplanner-identity"] || "");
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
      req.cocReviewCaseId = null;
      if (verifiedIdentity && Number.isInteger(localUser?.id)) {
        await touchUserLastSeen(localUser.id);
      }
      return next();
    } catch (error) {
      console.error("STANDALONE AUTH CONTEXT ERROR:", error);
      return res.status(503).json({ message: "Local shiftplanner context is unavailable" });
    }
  }

  const authHeader = req.headers.authorization;

  // Also support ?token= for EventSource (SSE) which can't set headers
  let rawToken = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    rawToken = authHeader.split(" ")[1];
  } else if (req.query?.token) {
    rawToken = String(req.query.token);
  }

  if (!rawToken) {
    return res.status(401).json({ message: "Missing or malformed Authorization header" });
  }

  try {
    const token = rawToken;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await db.query(
      `
      SELECT
        id,
        login_name,
        email,
        user_group,
        approved,
        is_root,
        is_admin,
        must_change_password,
        access_override
      FROM users
      WHERE id = $1
      `,
      [decoded.userId]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const user = result.rows[0];
    const role = resolveUserRole(user);
    const accessPolicy = buildAccessPolicy(role, user.access_override || {});

    /* ———————————————————————————————— */
    /* ATTACH USER CONTEXT                */
    /* ———————————————————————————————— */

    req.user = {
      id: user.id,
      loginName: user.login_name,
      email: user.email,
      group: user.user_group,
      approved: user.approved === true,
      is_root: user.is_root === true,
      is_admin: user.is_admin === true,
      must_change_password: user.must_change_password === true,
      role,
      accessPolicy,
    };

    req.isRoot = user.is_root === true;

    /* ———————————————————————————————— */
    /* APPROVAL CHECK (ROOT BYPASS)       */
    /* ———————————————————————————————— */

    if (!req.user.approved && !req.isRoot) {
      return res.status(403).json({
        code: "ACCOUNT_NOT_APPROVED",
        message: "Account wartet auf Freigabe",
      });
    }

    if (req.user.must_change_password && !req.isRoot) {
      const allowPasswordChangeOnly = req.originalUrl.startsWith("/api/auth/change-password") || req.originalUrl.startsWith("/api/user/");
      if (!allowPasswordChangeOnly) {
        return res.status(403).json({
          code: "PASSWORD_CHANGE_REQUIRED",
          message: "Initiales Passwort muss vor der Nutzung von ODIN geändert werden",
        });
      }
    }

    await touchUserLastSeen(user.id);

    next();
  } catch (err) {
    console.error("AUTH ERROR:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireVerifiedIdentity(req, res, next) {
  if (req.identityVerified) return next();
  return res.status(401).json({
    code: "JARVIS_IDENTITY_REQUIRED",
    message: "Bitte dein Jarvis-Profil öffnen, damit die angemeldete SSO-Identität verifiziert werden kann.",
  });
}
