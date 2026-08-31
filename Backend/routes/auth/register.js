/* ———————————————————————————————— */
/* AUTH ROUTES – REGISTER (FINAL)     */
/* ———————————————————————————————— */

import express from "express";
import bcrypt from "bcrypt";
import db from "../../db.js";
import { groupExists, normalizeGroupKey } from "../../db/initSchema.js";
import { isLoginNameConflictError, validateLoginName } from "../../lib/loginName.js";

/* ———————————————————————————————— */
/* ROUTER SETUP                       */
/* ———————————————————————————————— */

const router = express.Router();

/* ———————————————————————————————— */
/* POST /api/auth/register            */
/* ———————————————————————————————— */

router.post("/register", async (req, res) => {
  const { firstName, lastName, loginName, email, password, ibx, department } = req.body;

  /* Pflichtfelder */
  if (!firstName || !lastName || !loginName || !password || !ibx || !department) {
    return res.status(400).json({ message: "Bitte alle Felder ausfüllen" });
  }

  try {
    const emailLower = email ? String(email).toLowerCase().trim() : null;
    const loginValidation = validateLoginName(loginName);

    if (!loginValidation.ok) {
      return res.status(400).json({
        message: "Bitte Benutzerkennung im Format Vorname@Nachname eingeben.",
        code: loginValidation.code,
      });
    }

    if (emailLower) {
      const exists = await db.query(
        `SELECT 1 FROM users WHERE email = $1`,
        [emailLower]
      );
      if (exists.rowCount > 0) {
        return res.status(400).json({ message: "E-Mail existiert bereits", code: "EMAIL_EXISTS" });
      }
    }

    const existingLogin = await db.query(
      `SELECT 1 FROM users WHERE LOWER(login_name) = LOWER($1)`,
      [loginValidation.value]
    );
    if (existingLogin.rowCount > 0) {
      return res.status(409).json({
        message: "Diese Benutzerkennung existiert bereits. Bitte Benutzerkennung manuell anpassen.",
        code: "LOGIN_NAME_EXISTS",
      });
    }

    /* GROUP / DEPARTMENT (RBAC) */
    const groupKey = normalizeGroupKey(department);
    const groupOk = await groupExists(groupKey);
    if (!groupOk) {
      return res.status(400).json({ message: "Ungültige Abteilung" });
    }

    /* USERNAME */
    const username =
      firstName.trim().charAt(0).toLowerCase() +
      lastName.trim().toLowerCase();

    /* PASSWORD HASH */
    const passwordHash = await bcrypt.hash(password, 10);

    /* INSERT USER (CLEAN + COMPLETE) */
    await db.query(
      `
      INSERT INTO users
        (
          first_name,
          last_name,
          username,
          login_name,
          email,
          password_hash,
          is_root,
          is_admin,
          approved,
          user_group,
          ibx,
          department
        )
      VALUES
        ($1,$2,$3,$4,$5,$6,false,false,false,$7,$8,$9)
      `,
      [
        firstName,
        lastName,
        username,
        loginValidation.value,
        emailLower,
        passwordHash,
        groupKey,   // RBAC group
        ibx,        // Standort / IBX
        department, // Team / Abteilung
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Registrierung eingegangen. Freigabe erforderlich.",
    });
  } catch (err) {
    if (isLoginNameConflictError(err)) {
      return res.status(409).json({
        message: "Diese Benutzerkennung existiert bereits. Bitte Benutzerkennung manuell anpassen.",
        code: "LOGIN_NAME_EXISTS",
      });
    }
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
