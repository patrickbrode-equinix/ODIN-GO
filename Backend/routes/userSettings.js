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
import { areEquivalentEmployeeNames, chooseCanonicalEmployeeName } from "../lib/employeeIdentity.js";

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

/* ------------------------------------------------ */
/* PREFERRED COLLEAGUES (Wunschkollegen)            */
/* ------------------------------------------------ */

const MAX_PREFERRED_COLLEAGUES = 3;

function buildEmployeeNameVariants(row = {}) {
  const firstName = String(row.first_name || "").trim();
  const lastName = String(row.last_name || "").trim();
  const provisionedName = String(row.provisioned_employee_name || "").trim();

  return [...new Set([
    provisionedName,
    lastName && firstName ? `${lastName}, ${firstName}` : "",
    firstName && lastName ? `${firstName} ${lastName}` : "",
  ].filter(Boolean))];
}

function dedupeEmployeeEntries(entries = []) {
  const groups = [];

  for (const entry of entries) {
    const name = String(entry?.name || "").trim();
    if (!name) continue;

    const group = groups.find((candidate) => (
      areEquivalentEmployeeNames(candidate.name, name)
    ));

    if (!group) {
      groups.push({ ...entry, name });
      continue;
    }

    const canonicalName = chooseCanonicalEmployeeName([group.name, name]) || group.name;
    group.name = canonicalName;
    group.hasLoggedIn = Boolean(group.hasLoggedIn || entry.hasLoggedIn);
    group.lastLogin = group.lastLogin && entry.lastLogin
      ? (new Date(group.lastLogin).getTime() >= new Date(entry.lastLogin).getTime() ? group.lastLogin : entry.lastLogin)
      : group.lastLogin || entry.lastLogin || null;
  }

  return groups.sort((left, right) => left.name.localeCompare(right.name, "de"));
}

/**
 * GET /api/user/preferred-colleagues
 * Returns the current user's preferred colleague names.
 */
router.get("/user/preferred-colleagues", requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT preferred_employee_name FROM preferred_colleagues WHERE user_id = $1 ORDER BY created_at`,
      [req.user.id]
    );
    res.json(rows.map(r => r.preferred_employee_name));
  } catch (err) {
    console.error("GET PREFERRED COLLEAGUES ERROR:", err);
    res.status(500).json({ error: "Failed to load preferred colleagues" });
  }
});

/**
 * PUT /api/user/preferred-colleagues
 * Body: { names: string[] }
 * Replaces all preferred colleagues for the current user.
 */
router.put("/user/preferred-colleagues", requireAuth, async (req, res) => {
  try {
    const { names } = req.body || {};

    if (!Array.isArray(names)) {
      return res.status(400).json({ error: "names must be an array" });
    }

    if (names.length > MAX_PREFERRED_COLLEAGUES) {
      return res.status(400).json({ error: `Maximal ${MAX_PREFERRED_COLLEAGUES} Wunschkollegen erlaubt` });
    }

    // Resolve the logged-in user's employee_name (first_name + last_name)
    const { rows: userRows } = await db.query(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [req.user.id]
    );
    const ownName = userRows[0]
      ? `${userRows[0].last_name}, ${userRows[0].first_name}`.trim()
      : null;

    // Deduplicate & sanitise
    const unique = [...new Set(names.map(n => String(n).trim()).filter(Boolean))];

    // Block self-reference
    if (ownName && unique.includes(ownName)) {
      return res.status(400).json({ error: "Selbstauswahl ist nicht erlaubt" });
    }

    const { rows: employeePreferenceRows } = await db.query(
      `SELECT avoid_colleagues FROM employee_preferences WHERE user_id = $1`,
      [req.user.id]
    );
    const avoidColleagues = Array.isArray(employeePreferenceRows[0]?.avoid_colleagues)
      ? employeePreferenceRows[0].avoid_colleagues.map((name) => String(name || '').trim()).filter(Boolean)
      : [];
    const avoidSet = new Set(avoidColleagues);
    const overlap = unique.filter((name) => avoidSet.has(name));
    if (overlap.length > 0) {
      return res.status(400).json({
        error: `Folgende Mitarbeiter sind bereits in der Ausschlussliste: ${overlap.join(", ")}`,
      });
    }

    // Validate that all names exist in shifts (planungsrelevant)
    if (unique.length > 0) {
      const { rows: validRows } = await db.query(
        `SELECT DISTINCT employee_name FROM shifts WHERE employee_name = ANY($1)`,
        [unique]
      );
      const validNames = new Set(validRows.map(r => r.employee_name));
      const invalid = unique.filter(n => !validNames.has(n));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Ungültige Mitarbeiter: ${invalid.join(", ")}` });
      }
    }

    // Replace: delete old, insert new (in transaction)
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM preferred_colleagues WHERE user_id = $1`, [req.user.id]);

      for (const name of unique) {
        await client.query(
          `INSERT INTO preferred_colleagues (user_id, preferred_employee_name) VALUES ($1, $2)`,
          [req.user.id, name]
        );
      }

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    res.json(unique);
  } catch (err) {
    console.error("UPDATE PREFERRED COLLEAGUES ERROR:", err);
    res.status(500).json({ error: "Failed to update preferred colleagues" });
  }
});

/**
 * GET /api/user/eligible-colleagues
 * Returns all employees from the shift plan (current/recent months)
 * excluding the logged-in user. Used to populate the selection UI.
 */
router.get("/user/eligible-colleagues", requireAuth, async (req, res) => {
  try {
    // Get the logged-in user's name
    const { rows: userRows } = await db.query(
      `SELECT first_name, last_name, provisioned_employee_name FROM users WHERE id = $1`,
      [req.user.id]
    );
    const ownNames = new Set(buildEmployeeNameVariants(userRows[0] || {}));

    // Get distinct employee names from shifts and enrich them with login state.
    const { rows } = await db.query(
      `WITH shift_employees AS (
         SELECT DISTINCT employee_name
         FROM shifts
         WHERE employee_name IS NOT NULL
           AND trim(employee_name) <> ''
       )
       SELECT
         se.employee_name AS name,
         matched_user.last_login AS "lastLogin",
         (matched_user.last_login IS NOT NULL) AS "hasLoggedIn"
       FROM shift_employees se
       LEFT JOIN LATERAL (
         SELECT u.last_login
         FROM users u
         WHERE trim(COALESCE(u.provisioned_employee_name, '')) = se.employee_name
            OR trim(concat_ws(', ', NULLIF(trim(u.last_name), ''), NULLIF(trim(u.first_name), ''))) = se.employee_name
            OR trim(concat_ws(' ', NULLIF(trim(u.first_name), ''), NULLIF(trim(u.last_name), ''))) = se.employee_name
         ORDER BY u.last_login DESC NULLS LAST, u.created_at DESC
         LIMIT 1
       ) matched_user ON TRUE
       ORDER BY se.employee_name`
    );

    const colleagues = dedupeEmployeeEntries(rows
      .map((row) => ({
        name: row.name,
        lastLogin: row.lastLogin || null,
        hasLoggedIn: row.hasLoggedIn === true,
      }))
      .filter((entry) => !Array.from(ownNames).some((ownName) => areEquivalentEmployeeNames(ownName, entry.name))));

    res.json(colleagues);
  } catch (err) {
    console.error("GET ELIGIBLE COLLEAGUES ERROR:", err);
    res.status(500).json({ error: "Failed to load eligible colleagues" });
  }
});

export default router;
