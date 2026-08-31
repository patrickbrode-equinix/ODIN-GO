/* ———————————————————————————————— */
/* AUTH ROUTES – LOGIN (FINAL / CLEAN) */
/* Single source of truth: DB users   */
/* ———————————————————————————————— */

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../../db.js";
import { config } from "../../config/index.js";
import { ensureUserSettings } from "../../db/userSettings.js";
import { buildAccessPolicy, resolveUserRole } from "../../auth/accessControl.js";
import { normalizeLoginNameForLookup, validateLoginName } from "../../lib/loginName.js";

const router = express.Router();

/* ———————————————————————————————— */
/* RBAC HELPERS                       */
/* ———————————————————————————————— */

/* ———————————————————————————————— */
/* POST /api/auth/login               */
/* ———————————————————————————————— */

router.post("/login", async (req, res) => {
  const { loginName, password } = req.body;

  if (!loginName || !password) {
    return res
      .status(400)
      .json({ message: "Benutzerkennung und Passwort erforderlich", code: "LOGIN_NAME_REQUIRED" });
  }

  const loginValidation = validateLoginName(loginName);
  if (!loginValidation.ok) {
    return res.status(400).json({
      message: "Bitte Benutzerkennung im Format Vorname@Nachname eingeben.",
      code: loginValidation.code,
    });
  }

  try {
    /* USER LOAD */
    const { rows } = await db.query(
      `
      SELECT
        id,
        login_name,
        email,
        first_name,
        last_name,
        password_hash,
        is_root,
        is_admin,
        approved,
        user_group,
        ibx,
        department,
        must_change_password,
        access_override
      FROM users
      WHERE LOWER(login_name) = $1
      `,
      [normalizeLoginNameForLookup(loginName)]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Ungültige Zugangsdaten" });
    }

    const user = rows[0];

    /* DISPLAY NAME (SINGLE SOURCE OF TRUTH) */
    const displayName =
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.login_name ||
      user.email;

    /* PASSWORD CHECK */
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Ungültige Zugangsdaten" });
    }

    /* APPROVAL */
    if (!user.is_root && user.approved !== true) {
      return res.status(403).json({ message: "Account pending approval" });
    }

    const role = resolveUserRole(user);
    const accessPolicy = buildAccessPolicy(role, user.access_override || {});

    /* ENSURE SETTINGS */
    await ensureUserSettings(user.id);

    /* LAST LOGIN */
    await db.query(
      `UPDATE users SET last_login = NOW() WHERE id = $1`,
      [user.id]
    );

    /* JWT (TECH ONLY) */
    const token = jwt.sign(
      {
        userId: user.id,
        isRoot: user.is_root === true,
        isAdmin: user.is_admin === true,
        role,
      },
      config.JWT_SECRET,
      {
        expiresIn: config.JWT_EXPIRES_IN,
      }
    );

    /* FINAL RESPONSE */
    return res.json({
      token,
      user: {
        id: user.id,
        loginName: user.login_name,
        email: user.email,

        firstName: user.first_name,
        lastName: user.last_name,
        displayName,

        location: user.ibx,
        team: user.department,
        group: user.user_group,

        approved: user.approved,
        mustChangePassword: user.must_change_password === true,
        isRoot: user.is_root === true,
        isAdmin: user.is_admin === true,
        role,

        accessPolicy,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
