/* ———————————————— */
/* USERS – MANAGEMENT API (POLICY-ONLY)            */
/* Root is technical & protected via is_root       */
/* Simplified RBAC: user + admin                   */
/* ———————————————— */

import express from "express";
import crypto from "node:crypto";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  groupExists,
  normalizeGroupKey,
} from "../db/initSchema.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { syncEmployeeContacts } from "./employeeContacts.js";
import { provisionUsersFromShiftplan } from "../services/shiftUserProvisioning.service.js";
import { logActivity } from "./activity.js";
import { buildBaseAccessPolicy } from "../auth/accessControl.js";
import { resolveUserRole } from "../auth/accessControl.js";
import { isLoginNameConflictError } from "../lib/loginName.js";
import { areEquivalentEmployeeNames, chooseCanonicalEmployeeName, generateEmailFromName } from "../lib/employeeIdentity.js";

const router = express.Router();

/* ———————————————— */
/* HELPERS                                          */
/* ———————————————— */

function normalizeEmail(value) {
  return String(value || "").toLowerCase().trim();
}

function normalizeGroup(value) {
  return normalizeGroupKey(value);
}

function sanitizeAccessOverride(input) {
  const override = input && typeof input === "object" ? input : {};
  const next = {};

  for (const [pageKey, rawLevel] of Object.entries(override)) {
    if (rawLevel === "none" || rawLevel === "view" || rawLevel === "write") {
      next[pageKey] = rawLevel;
    }
  }

  return next;
}

function buildLoginNameErrorResponse(code) {
  if (code === "LOGIN_NAME_EXISTS") {
    return {
      status: 409,
      body: {
        code,
        message: "Diese automatisch erzeugte SSO-E-Mail ist bereits einem Mitarbeiter zugeordnet.",
      },
    };
  }

  return {
    status: 400,
    body: {
      code,
      message: "Die SSO-E-Mail konnte nicht aus Vor- und Nachname erzeugt werden.",
    },
  };
}

function getUserEmployeeName(row = {}) {
  return String(row.provisionedEmployeeName || `${row.firstName || ""} ${row.lastName || ""}`).trim();
}

function preferCanonicalUserRow(left, right) {
  const leftName = getUserEmployeeName(left);
  const rightName = getUserEmployeeName(right);
  const canonical = chooseCanonicalEmployeeName([leftName, rightName]);
  if (canonical) {
    if (areEquivalentEmployeeNames(rightName, canonical) && rightName.length >= leftName.length) return right;
    if (areEquivalentEmployeeNames(leftName, canonical)) return left;
  }

  if (right.hasShiftPreferences && !left.hasShiftPreferences) return right;
  return left.id <= right.id ? left : right;
}

function latestTimestamp(...values) {
  return values
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
}

function dedupeUserRows(rows = []) {
  const groups = [];

  for (const row of rows) {
    const rowName = getUserEmployeeName(row);
    const group = groups.find((entry) => {
      const groupName = getUserEmployeeName(entry.row);
      return rowName && groupName && areEquivalentEmployeeNames(rowName, groupName);
    });

    if (!group) {
      groups.push({ row: row, mergedIds: [row.id] });
      continue;
    }

    const previousRow = group.row;
    group.row = {
      ...preferCanonicalUserRow(previousRow, row),
      hasShiftPreferences: Boolean(group.row.hasShiftPreferences || row.hasShiftPreferences),
      lastLogin: latestTimestamp(previousRow.lastLogin, row.lastLogin),
    };
    group.mergedIds.push(row.id);
  }

  return groups.map((group) => ({
    ...group.row,
    duplicateUserIds: group.mergedIds.length > 1 ? group.mergedIds : undefined,
  }));
}

/* ———————————————— */
/* GET – LIST USERS                                 */
/* view access                                      */
/* ———————————————— */

router.get(
  "/",
  requireAuth,
  requirePageAccess("user_management", "view"),
  async (req, res) => {
    try {
      const result = await db.query(
        `
        SELECT
          u.id,
          u.first_name AS "firstName",
          u.last_name  AS "lastName",
          u.login_name AS "loginName",
          u.email,
          u.ibx,
          u.department,
          u.user_group AS "group",
          u.approved,
          u.is_admin   AS "isAdmin",
          u.is_root    AS "isRoot",
          u.provisioned_from_shiftplan AS "provisionedFromShiftplan",
          u.shiftplan_manual AS "shiftplanManual",
          u.provisioned_employee_name AS "provisionedEmployeeName",
          u.created_at AS "createdAt",
          COALESCE(u.last_login, u.last_seen_at) AS "lastLogin",
          CASE WHEN ep.id IS NOT NULL THEN true ELSE false END AS "hasShiftPreferences"
        FROM users u
        LEFT JOIN employee_preferences ep ON ep.user_id = u.id
        WHERE u.is_root = false
        ORDER BY u.id ASC
        `
      );

      res.json(dedupeUserRows(result.rows));
    } catch (err) {
      console.error("USERS LIST ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ———————————————— */
/* POST – CREATE USER                               */
/* write access                                     */
/* ———————————————— */

router.post(
  "/",
  requireAuth,
  requirePageAccess("user_management", "write"),
  async (req, res) => {
    const { firstName, lastName } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ message: "Vorname und Nachname sind erforderlich." });
    }

    try {
      const normalizedEmail = normalizeEmail(generateEmailFromName(`${firstName} ${lastName}`));
      if (!/^[^\s@]+@(?:[a-z0-9-]+\.)*equinix\.com$/i.test(normalizedEmail || "")) {
        return res.status(400).json({ message: "Für Jarvis SSO ist eine gültige Equinix-E-Mail-Adresse erforderlich." });
      }
      const existingEmail = await db.query(
        `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`,
        [normalizedEmail]
      );
      if (existingEmail.rowCount > 0) {
        return res.status(409).json({ message: "Diese SSO-E-Mail ist bereits einem Mitarbeiter zugeordnet.", code: "EMAIL_EXISTS" });
      }

      const username =
        firstName.trim().charAt(0).toLowerCase() +
        lastName.trim().toLowerCase();

      const passwordHash = `SSO_ONLY_${crypto.randomBytes(32).toString("hex")}`;

      const result = await db.query(
        `
        INSERT INTO users (
          first_name,
          last_name,
          username,
          login_name,
          email,
          password_hash,
          approved,
          is_admin,
          is_root,
          must_change_password,
          shiftplan_manual
        )
        VALUES ($1,$2,$3,$4,$5,$6,true,false,false,false,true)
        RETURNING id, email
        `,
        [
          firstName,
          lastName,
          username,
          normalizedEmail,
          normalizedEmail,
          passwordHash,
        ]
      );

      res.status(201).json({ id: result.rows[0].id, email: result.rows[0].email, shiftplanManual: true });
    } catch (err) {
      if (isLoginNameConflictError(err)) {
        const response = buildLoginNameErrorResponse("LOGIN_NAME_EXISTS");
        return res.status(response.status).json(response.body);
      }
      console.error("USER CREATE ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.get(
  "/:id/access-override",
  requireAuth,
  requirePageAccess("user_management", "write"),
  async (req, res) => {
    const targetUserId = Number(req.params.id);

    try {
      const result = await db.query(
        `
        SELECT
          id,
          login_name AS "loginName",
          email,
          user_group AS "group",
          is_root,
          is_admin,
          access_override AS "accessOverride"
        FROM users
        WHERE id = $1
        `,
        [targetUserId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      const user = result.rows[0];
      const role = resolveUserRole(user);

      return res.json({
        id: user.id,
        loginName: user.loginName,
        email: user.email,
        group: user.group,
        role,
        basePolicy: buildBaseAccessPolicy(role),
        accessOverride: sanitizeAccessOverride(user.accessOverride || {}),
      });
    } catch (err) {
      console.error("USER ACCESS OVERRIDE READ ERROR:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

router.get(
  "/:id/preferences",
  requireAuth,
  requirePageAccess("user_management", "view"),
  async (req, res) => {
    const targetUserId = Number(req.params.id);

    try {
      const { rows: users } = await db.query(
        `SELECT id, login_name AS "loginName", email, first_name AS "firstName", last_name AS "lastName", is_root
           FROM users
          WHERE id = $1`,
        [targetUserId]
      );
      if (users.length === 0) return res.status(404).json({ message: "User not found" });

      const { rows } = await db.query(
        `SELECT
           preferred_shifts AS "preferredShifts",
           unwanted_shifts AS "unwantedShifts",
           preferred_holidays AS "preferredHolidays",
           max_nights_per_month AS "maxNightsPerMonth",
           preferred_days AS "preferredDays",
           blocked_days AS "blockedDays",
           avoid_colleagues AS "avoidColleagues",
           workload_preference AS "workloadPreference",
           monthly_preferences AS "monthlyPreferences",
           notes,
           updated_at AS "updatedAt"
         FROM employee_preferences
         WHERE user_id = $1`,
        [targetUserId]
      );

      res.json({
        user: users[0],
        preferences: rows[0] || null,
      });
    } catch (err) {
      console.error("USER PREFERENCES READ ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.put(
  "/:id/access-override",
  requireAuth,
  requirePageAccess("user_management", "write"),
  async (req, res) => {
    const targetUserId = Number(req.params.id);
    const sanitizedOverride = sanitizeAccessOverride(req.body?.accessOverride);

    try {
      const current = await db.query(
        `SELECT id, login_name AS "loginName", email, is_root, access_override AS "accessOverride" FROM users WHERE id = $1`,
        [targetUserId]
      );

      if (current.rowCount === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      if (current.rows[0].is_root) {
        return res.status(403).json({ message: "Root user cannot be modified" });
      }

      await db.query(
        `UPDATE users SET access_override = $2::jsonb WHERE id = $1`,
        [targetUserId, JSON.stringify(sanitizedOverride)]
      );

      await logActivity(
        req.user.id,
        req.user.email,
        "USER_ACCESS_OVERRIDE_UPDATED",
        "user_management",
        "users",
        String(targetUserId),
        null,
        {
          previous: sanitizeAccessOverride(current.rows[0].accessOverride || {}),
          next: sanitizedOverride,
          targetLoginName: current.rows[0].loginName,
          targetEmail: current.rows[0].email,
        }
      );

      return res.json({ success: true, accessOverride: sanitizedOverride });
    } catch (err) {
      console.error("USER ACCESS OVERRIDE WRITE ERROR:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

router.post(
  "/provision-from-shifts",
  requireAuth,
  requirePageAccess("user_management", "write"),
  async (req, res) => {
    const dryRun = req.body?.dryRun === true;

    try {
      let contactSync = null;
      try {
        contactSync = await syncEmployeeContacts();
      } catch (contactErr) {
        console.warn("USER PROVISIONING CONTACT SYNC ERROR:", contactErr.message);
      }

      const result = await provisionUsersFromShiftplan({ dryRun });

      await logActivity(
        req.user.id,
        req.user.email,
        dryRun ? "USER_PROVISIONING_DRY_RUN" : "USER_PROVISIONING_SYNC",
        "user_management",
        "users",
        null,
        null,
        { contactSync, ...result }
      );

      res.json({ success: true, contactSync, ...result });
    } catch (err) {
      console.error("USER PROVISIONING ERROR:", err);
      res.status(500).json({ message: "User provisioning failed" });
    }
  }
);

/* ———————————————— */
/* PATCH – UPDATE USER                              */
/* write access                                     */
/* ———————————————— */

router.patch(
  "/:id",
  requireAuth,
  requirePageAccess("user_management", "write"),
  async (req, res) => {
    const targetUserId = Number(req.params.id);
    const { group, department, ibx, firstName, lastName, approved, isAdmin } = req.body;

    try {
      const current = await db.query(
        `SELECT is_root, login_name, email, first_name, last_name FROM users WHERE id = $1`,
        [targetUserId]
      );

      if (current.rowCount === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      if (current.rows[0].is_root) {
        return res
          .status(403)
          .json({ message: "Root user cannot be modified" });
      }

      const fields = [];
      const values = [];
      let idx = 1;

      if (group !== undefined || department !== undefined) {
        const g = normalizeGroup(department || group);
        if (!(await groupExists(g))) {
          return res.status(400).json({ message: "Invalid group" });
        }
        fields.push(`user_group = $${idx++}`);
        values.push(g);
        fields.push(`department = $${idx++}`);
        values.push(g);
      }

      if (ibx !== undefined) {
        fields.push(`ibx = $${idx++}`);
        values.push(ibx);
      }

      if (firstName !== undefined) {
        fields.push(`first_name = $${idx++}`);
        values.push(firstName);
      }

      if (lastName !== undefined) {
        fields.push(`last_name = $${idx++}`);
        values.push(lastName);
      }

      if (firstName !== undefined || lastName !== undefined) {
        const nextFirstName = firstName ?? current.rows[0].first_name;
        const nextLastName = lastName ?? current.rows[0].last_name;
        const normalizedEmail = normalizeEmail(generateEmailFromName(`${nextFirstName} ${nextLastName}`));
        if (!normalizedEmail) {
          return res.status(400).json({ message: "Aus dem Namen konnte keine SSO-E-Mail erzeugt werden." });
        }
        const duplicateEmail = await db.query(
          `SELECT 1 FROM users WHERE id <> $1 AND LOWER(email) = LOWER($2)`,
          [targetUserId, normalizedEmail]
        );
        if (duplicateEmail.rowCount > 0) {
          return res.status(409).json({ message: "Diese SSO-E-Mail ist bereits einem Mitarbeiter zugeordnet.", code: "EMAIL_EXISTS" });
        }

        fields.push(`email = $${idx++}`);
        values.push(normalizedEmail);
        fields.push(`login_name = $${idx++}`);
        values.push(normalizedEmail);
      }

      if (approved !== undefined) {
        fields.push(`approved = $${idx++}`);
        values.push(Boolean(approved));
      }

      if (isAdmin !== undefined) {
        fields.push(`is_admin = $${idx++}`);
        values.push(Boolean(isAdmin));
      }

      if (!fields.length) {
        return res.status(400).json({ message: "Nothing to update" });
      }

      values.push(targetUserId);

      await db.query(
        `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx}`,
        values
      );

      res.json({ success: true });
    } catch (err) {
      if (isLoginNameConflictError(err)) {
        const response = buildLoginNameErrorResponse("LOGIN_NAME_EXISTS");
        return res.status(response.status).json(response.body);
      }
      console.error("USER UPDATE ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ———————————————— */
/* DELETE – DELETE USER                             */
/* write access                                     */
/* ———————————————— */

router.delete(
  "/:id",
  requireAuth,
  requirePageAccess("user_management", "write"),
  async (req, res) => {
    const targetUserId = Number(req.params.id);

    try {
      const result = await db.query(
        `SELECT is_root FROM users WHERE id = $1`,
        [targetUserId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      if (result.rows[0].is_root) {
        return res
          .status(403)
          .json({ message: "Root user cannot be deleted" });
      }

      if (req.user.id === targetUserId) {
        return res
          .status(403)
          .json({ message: "You cannot delete your own account" });
      }

      await db.query(`DELETE FROM users WHERE id = $1`, [targetUserId]);

      res.json({ success: true });
    } catch (err) {
      console.error("USER DELETE ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
