/* ------------------------------------------------ */
/* SCHEDULE / SHIFTPLAN – ROUTES (POSTGRESQL)       */
/* RBAC: page-based (view / write)                  */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { recomputeConstraintsInternal } from "./constraints.js"; // [NEW]
import { parseMonthLabel } from "../lib/monthParser.js";
import { syncEmployeeContacts } from "./employeeContacts.js";
import {
  provisionUsersForEmployees,
  provisionUsersFromShiftplan,
} from "../services/shiftUserProvisioning.service.js";
import {
  applyImportEmployeeDecisions,
  deleteEmployeeData,
  deleteMatchedUserForEmployee,
  fetchShiftImportReview,
  summarizeImportedSchedules,
} from "../services/shiftEmployeeSync.service.js";

const router = express.Router();

/* ------------------------------------------------ */
/* GET /api/schedules – MONATSLISTE                 */
/* Recht: shiftplan:view                            */
/* ------------------------------------------------ */

router.get(
  "/",
  requireAuth,
  requirePageAccess("shiftplan", "view"),
  async (req, res) => {
    try {
      const result = await db.query(
        `SELECT month FROM (
           SELECT DISTINCT month FROM shifts
           UNION
           SELECT DISTINCT month FROM manual_shiftplan_employees
         ) AS schedule_months`
      );

      const rawMonths = result.rows
        .map((r) => r.month)
        .filter((m) => typeof m === "string" && m.trim().length > 0);

      const monthsSorted = rawMonths
        .map((label) => ({ label, parsed: parseMonthLabel(label) }))
        .filter((x) => x.parsed)
        .sort((a, b) => {
          if (a.parsed.year !== b.parsed.year) {
            return a.parsed.year - b.parsed.year;
          }
          return a.parsed.month - b.parsed.month;
        })
        .map((x) => x.label);

      res.json({ months: monthsSorted });
    } catch (err) {
      console.error("SCHEDULE MONTH LIST ERROR:", err);
      res.status(500).json({ error: "Failed to read months" });
    }
  }
);

/* ------------------------------------------------ */
/* GET /api/schedules/last-upload                   */
/* Returns the most recent shiftplan upload info.   */
/* ------------------------------------------------ */

router.get("/last-upload", requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM shiftplan_upload_log ORDER BY uploaded_at DESC LIMIT 1`
    );
    res.json(rows[0] || null);
  } catch (err) {
    // Table might not exist yet — return null gracefully
    res.json(null);
  }
});

/* ------------------------------------------------ */
/* GET /api/schedules/last-change                   */
/* Returns the most recent shiftplan change (upload */
/* OR manual edit) by checking both the upload log  */
/* and the activity log for shiftplan module.       */
/* ------------------------------------------------ */

router.get("/last-change", requireAuth, async (req, res) => {
  try {
    // Check both sources and return the most recent
    const uploadPromise = db.query(
      `SELECT uploaded_at AS ts, uploaded_by AS actor, 'upload' AS change_type FROM shiftplan_upload_log ORDER BY uploaded_at DESC LIMIT 1`
    ).catch(() => ({ rows: [] }));

    const activityPromise = db.query(
      `SELECT ts, actor_name AS actor, action_type AS change_type FROM activity_log WHERE module = 'shiftplan' ORDER BY ts DESC LIMIT 1`
    ).catch(() => ({ rows: [] }));

    const [uploadResult, activityResult] = await Promise.all([uploadPromise, activityPromise]);

    const uploadRow = uploadResult.rows[0] || null;
    const activityRow = activityResult.rows[0] || null;

    if (!uploadRow && !activityRow) {
      return res.json(null);
    }

    const uploadTs = uploadRow ? new Date(uploadRow.ts).getTime() : 0;
    const activityTs = activityRow ? new Date(activityRow.ts).getTime() : 0;

    const latest = activityTs > uploadTs ? activityRow : uploadRow;
    res.json({
      last_changed_at: latest.ts,
      changed_by: latest.actor || null,
      change_type: latest.change_type || "unknown",
    });
  } catch (err) {
    res.json(null);
  }
});

/* ------------------------------------------------ */
/* GET /api/schedules/:month – MONAT LADEN          */
/* Recht: shiftplan:view                            */
/* ------------------------------------------------ */

import { logActivity } from "./activity.js";

// Helper for padding
function pad2(n) {
  return String(n).padStart(2, "0");
}

async function resolveStoredMonthLabel(client, requestedLabel, parsedMonth) {
  const direct = await client.query(
    `SELECT 1 FROM shifts WHERE month = $1 LIMIT 1`,
    [requestedLabel],
  );
  if (direct.rowCount > 0) return requestedLabel;

  const candidates = await client.query(
    `SELECT DISTINCT month FROM shifts WHERE month LIKE $1`,
    [`%${parsedMonth.year}%`],
  );
  const matching = candidates.rows
    .map((row) => String(row.month || ""))
    .find((label) => {
      const parsed = parseMonthLabel(label);
      return parsed?.year === parsedMonth.year && parsed?.month === parsedMonth.month;
    });

  return matching || requestedLabel;
}

function normalizeEmployeeActionName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeEmployeeActions(payload) {
  const additions = Array.isArray(payload?.additions)
    ? payload.additions
      .map((item) => ({
        name: normalizeEmployeeActionName(item?.name),
        includeInImport: item?.includeInImport !== false,
        createUser: item?.createUser === true,
      }))
      .filter((item) => item.name)
    : [];

  const updates = Array.isArray(payload?.updates)
    ? payload.updates
      .map((item) => ({
        name: normalizeEmployeeActionName(item?.name),
        includeInImport: item?.includeInImport !== false,
      }))
      .filter((item) => item.name)
    : [];

  const removals = Array.isArray(payload?.removals)
    ? payload.removals
      .map((item) => ({
        name: normalizeEmployeeActionName(item?.name),
        deleteFromDatabase: item?.deleteFromDatabase === true,
        deleteOdinUser: item?.deleteOdinUser === true,
      }))
      .filter((item) => item.name)
    : [];

  return { additions, updates, removals };
}

function normalizeManualEmployeeName(value) {
  return normalizeEmployeeActionName(value);
}

function employeeIdentityKey(value) {
  return String(value || "")
    .toLocaleLowerCase("de-DE")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join("|");
}

async function fetchManualEmployeesForMonth(client, monthLabel) {
  const { rows } = await client.query(
    `SELECT employee_name, MIN(created_at) AS created_at, MIN(created_by) AS created_by
       FROM (
         SELECT employee_name, created_at, created_by
           FROM manual_shiftplan_employees
          WHERE month = $1
         UNION ALL
         SELECT CONCAT_WS(' ', first_name, last_name) AS employee_name,
                created_at,
                'User Management' AS created_by
           FROM users
          WHERE shiftplan_manual = TRUE
       ) manual_sources
      WHERE employee_name <> ''
      GROUP BY employee_name
      ORDER BY LOWER(employee_name) ASC, employee_name ASC`,
    [monthLabel]
  );

  return rows.map((row) => ({
    employee_name: row.employee_name,
    created_at: row.created_at,
    created_by: row.created_by || null,
  }));
}

async function fetchManualEmployeeNameSet(client, monthLabel) {
  const manualEmployees = await fetchManualEmployeesForMonth(client, monthLabel);
  return new Set(manualEmployees.map((entry) => entry.employee_name));
}

async function fetchExistingManualShiftRows(client, monthLabel) {
  const { rows } = await client.query(
    `SELECT employee_name, day, shift_code
       FROM shifts
      WHERE month = $1
        AND COALESCE(source, 'import') = 'manual'`,
    [monthLabel]
  );

  return rows.map((row) => ({
    employee_name: row.employee_name,
    day: Number(row.day),
    shift_code: row.shift_code,
  }));
}

function buildPersistedShiftEntries({
  scheduleData,
  existingManualRows = [],
  manualEmployeeNames = new Set(),
  preserveManualEmployees = false,
}) {
  const entryMap = new Map();
  const incomingEmployees = new Set();

  for (const [rawEmployeeName, rawDays] of Object.entries(scheduleData || {})) {
    const employeeName = normalizeManualEmployeeName(rawEmployeeName);
    if (!employeeName || !rawDays || typeof rawDays !== "object" || Array.isArray(rawDays)) continue;

    incomingEmployees.add(employeeName);

    for (const [rawDay, rawShift] of Object.entries(rawDays)) {
      const day = Number(rawDay);
      const shiftCode = String(rawShift || "").trim();
      if (!Number.isFinite(day) || day < 1 || day > 31 || !shiftCode) continue;

      entryMap.set(`${employeeName}|${day}`, {
        employeeName,
        day,
        shiftCode,
        source: manualEmployeeNames.has(employeeName) ? "manual" : "import",
      });
    }
  }

  if (preserveManualEmployees) {
    for (const row of existingManualRows) {
      const employeeName = normalizeManualEmployeeName(row.employee_name);
      const day = Number(row.day);
      const shiftCode = String(row.shift_code || "").trim();

      if (!employeeName || incomingEmployees.has(employeeName)) continue;
      if (!Number.isFinite(day) || day < 1 || day > 31 || !shiftCode) continue;

      entryMap.set(`${employeeName}|${day}`, {
        employeeName,
        day,
        shiftCode,
        source: "manual",
      });
    }
  }

  return Array.from(entryMap.values());
}

router.get(
  "/:month",
  requireAuth,
  requirePageAccess("shiftplan", "view"),
  async (req, res) => {
    try {
      const requestedMonthLabel = req.params.month;

      const parsed = parseMonthLabel(requestedMonthLabel);
      if (!parsed) {
        return res.status(400).json({
          error: "Invalid month label (expected e.g. 'Januar 2026')",
        });
      }

      const monthLabel = await resolveStoredMonthLabel(db, requestedMonthLabel, parsed);

      // Check if data exists
      let result = await db.query(
        `
        SELECT employee_name, day, shift_code
        FROM shifts
        WHERE month = $1
        `,
        [monthLabel]
      );
      const manualEmployees = await fetchManualEmployeesForMonth(db, monthLabel);
      // Every approved ODIN user is a valid planning row. New users therefore
      // appear in the shiftplan immediately, even before their first shift is
      // assigned or imported.
      const userEmployeesResult = await db.query(
        `SELECT DISTINCT CONCAT_WS(' ', first_name, last_name) AS employee_name
           FROM users
          WHERE approved = TRUE
            AND is_root = FALSE
            AND NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '') IS NOT NULL`
      );

      // --- AUTO-SEED LOGIC FOR 2027 ---
      if (parsed.year === 2027 && result.rows.length === 0) {
        // 1. Get employees who were active in 2026
        // "Distinct employees from shiftplan entries where year=2026"
        // Note: 'shifts' table has 'month' column string "Januar 2026".
        // simple LIKE query:
        const empResult = await db.query(`
           SELECT DISTINCT employee_name 
           FROM shifts 
           WHERE month LIKE '%2026'
        `);
        const employees = empResult.rows.map(r => r.employee_name);

        if (employees.length > 0) {
          const seedValues = [];
          const daysInMonth = new Date(parsed.year, parsed.month, 0).getDate();

          // 2. Generate E2 for Mon-Fri
          for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(parsed.year, parsed.month - 1, d);
            const dow = dateObj.getDay();
            if (dow === 0 || dow === 6) continue; // Skip weekend

            // shift_code = E2
            employees.forEach(emp => {
              seedValues.push([monthLabel, emp, d, "E2"]);
            });
          }

          if (seedValues.length > 0) {
            // Batch Insert
            const flatValues = [];
            const placeholders = [];
            let idx = 1;

            seedValues.forEach(row => {
              placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3})`);
              flatValues.push(row[0], row[1], row[2], row[3]);
              idx += 4;
            });

            const query = `
                  INSERT INTO shifts (month, employee_name, day, shift_code)
                  VALUES ${placeholders.join(", ")}
              `;

            await db.query(query, flatValues);

            // Log
            await logActivity(
              req.user?.id,
              req.user?.displayName || "System",
              "shiftplan_baseline_create",
              "SHIFTPLAN",
              "month",
              monthLabel,
              null,
              { year: parsed.year, month: parsed.month, createdCount: seedValues.length, shiftCode: "E2" }
            );

            // Re-fetch data
            result = await db.query(
              `
                SELECT employee_name, day, shift_code
                FROM shifts
                WHERE month = $1
                `,
              [monthLabel]
            );
          }
        }
      }
      // --------------------------------

      const schedule = {};
      let maxDay = 0;

      for (const row of result.rows) {
        const emp = row.employee_name;
        const day = Number(row.day);
        const code = row.shift_code;

        if (!schedule[emp]) schedule[emp] = {};
        schedule[emp][day] = code;
        if (day > maxDay) maxDay = day;
      }

      for (const manualEmployee of manualEmployees) {
        const employeeName = normalizeManualEmployeeName(manualEmployee.employee_name);
        if (!employeeName) continue;
        if (!schedule[employeeName]) schedule[employeeName] = {};
      }
      const scheduleEmployeeKeys = new Set(Object.keys(schedule).map(employeeIdentityKey));
      for (const userEmployee of userEmployeesResult.rows) {
        const employeeName = normalizeManualEmployeeName(userEmployee.employee_name);
        const identityKey = employeeIdentityKey(employeeName);
        if (employeeName && identityKey && !scheduleEmployeeKeys.has(identityKey)) {
          schedule[employeeName] = {};
          scheduleEmployeeKeys.add(identityKey);
        }
      }

      res.json({
        meta: {
          label: monthLabel,
          year: parsed.year,
          month: parsed.month,
          id: `${parsed.year}-${String(parsed.month).padStart(2, "0")}`,
          daysInMonth: new Date(parsed.year, parsed.month, 0).getDate() || maxDay || 31,
        },
        schedule,
        manualEmployees,
      });
    } catch (err) {
      console.error("SCHEDULE LOAD ERROR:", err);
      res.status(500).json({ error: "Failed to load schedule" });
    }
  }
);

router.get(
  "/:month/manual-employees",
  requireAuth,
  requirePageAccess("shiftplan", "view"),
  async (req, res) => {
    try {
      const monthLabel = String(req.params.month || "").trim();
      if (!parseMonthLabel(monthLabel)) {
        return res.status(400).json({ error: "Invalid month label" });
      }

      const manualEmployees = await fetchManualEmployeesForMonth(db, monthLabel);
      res.json({ employees: manualEmployees });
    } catch (err) {
      console.error("MANUAL EMPLOYEE LIST ERROR:", err);
      res.status(500).json({ error: "Failed to load manual employees" });
    }
  }
);

router.post(
  "/:month/manual-employees",
  requireAuth,
  requirePageAccess("shiftplan", "write"),
  async (req, res) => {
    const monthLabel = String(req.params.month || "").trim();
    const employeeName = normalizeManualEmployeeName(req.body?.employeeName);

    if (!parseMonthLabel(monthLabel)) {
      return res.status(400).json({ error: "Invalid month label" });
    }

    if (!employeeName) {
      return res.status(400).json({ error: "employeeName is required" });
    }

    try {
      const duplicateRes = await db.query(
        `SELECT COALESCE(source, 'import') AS source
           FROM shifts
          WHERE month = $1
            AND employee_name = $2
          LIMIT 1`,
        [monthLabel, employeeName]
      );

      if (duplicateRes.rowCount > 0 && duplicateRes.rows[0]?.source !== "manual") {
        return res.status(409).json({ error: "Employee already exists in the imported shiftplan for this month" });
      }

      const createdBy = req.user?.displayName || req.user?.email || req.user?.username || "unknown";
      const insertRes = await db.query(
        `INSERT INTO manual_shiftplan_employees (month, employee_name, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (month, employee_name) DO NOTHING
         RETURNING employee_name, created_at, created_by`,
        [monthLabel, employeeName, createdBy]
      );

      if (insertRes.rowCount === 0) {
        return res.status(409).json({ error: "Manual employee already exists for this month" });
      }

      await logActivity(
        req.user?.id,
        req.user?.displayName || req.user?.username || "System",
        "shiftplan_manual_employee_add",
        "SHIFTPLAN",
        "employee",
        employeeName,
        null,
        { month: monthLabel }
      );

      res.status(201).json({ success: true, employee: insertRes.rows[0] });
    } catch (err) {
      console.error("MANUAL EMPLOYEE CREATE ERROR:", err);
      res.status(500).json({ error: "Failed to create manual employee" });
    }
  }
);

router.delete(
  "/:month/manual-employees/:employeeName",
  requireAuth,
  requirePageAccess("shiftplan", "write"),
  async (req, res) => {
    const monthLabel = String(req.params.month || "").trim();
    const employeeName = normalizeManualEmployeeName(req.params.employeeName);

    if (!parseMonthLabel(monthLabel)) {
      return res.status(400).json({ error: "Invalid month label" });
    }

    if (!employeeName) {
      return res.status(400).json({ error: "employeeName is required" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const deleteManualEmployeeRes = await client.query(
        `DELETE FROM manual_shiftplan_employees
          WHERE month = $1
            AND employee_name = $2`,
        [monthLabel, employeeName]
      );

      if (deleteManualEmployeeRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Manual employee not found" });
      }

      await client.query(
        `DELETE FROM shifts
          WHERE month = $1
            AND employee_name = $2
            AND COALESCE(source, 'import') = 'manual'`,
        [monthLabel, employeeName]
      );

      await client.query("COMMIT");

      await logActivity(
        req.user?.id,
        req.user?.displayName || req.user?.username || "System",
        "shiftplan_manual_employee_delete",
        "SHIFTPLAN",
        "employee",
        employeeName,
        null,
        { month: monthLabel }
      );

      res.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("MANUAL EMPLOYEE DELETE ERROR:", err);
      res.status(500).json({ error: "Failed to delete manual employee" });
    } finally {
      client.release();
    }
  }
);

/* ------------------------------------------------ */
/* POST /api/schedules/import – MONAT SPEICHERN     */
/* Recht: shiftplan:write                           */
/* ------------------------------------------------ */

router.post(
  "/import",
  requireAuth,
  requirePageAccess("shiftplan", "write"),
  async (req, res) => {
    const client = await db.connect();

    try {
      const { month, data, preserveManualEmployees = true } = req.body;

      if (!month || !data) {
        return res.status(400).json({ error: "Missing data" });
      }

      const parsedMonth = parseMonthLabel(month);
      if (!parsedMonth) {
        return res.status(400).json({
          error: "Invalid month label (expected e.g. 'Januar 2026')",
        });
      }

      await client.query("BEGIN");

      // [AUDIT] 1. Fetch existing shifts for comparison
      const existingRes = await client.query(`SELECT employee_name, day, shift_code FROM shifts WHERE month = $1`, [month]);
      const existingMap = new Map(); // key: "Name|Day" -> code
      existingRes.rows.forEach(r => {
        existingMap.set(`${r.employee_name}|${r.day}`, r.shift_code);
      });

      // [AUDIT] 2. Prepare Diff
      const auditLogParams = [];
      const changedBy = req.user?.displayName || req.user?.username || "Unknown";
      const source = "UI_SAVE";
      const now = new Date();

      // We need to parse month label to get year/month for date construction
      const parsedAudit = parseMonthLabel(month);
      const year = parsedAudit?.year || new Date().getFullYear();
      const monthIdx = (parsedAudit?.month || 1) - 1; // 0-based

      const manualEmployeeNames = await fetchManualEmployeeNameSet(client, month);
      const existingManualRows = await fetchExistingManualShiftRows(client, month);
      const persistedEntries = buildPersistedShiftEntries({
        scheduleData: data,
        existingManualRows,
        manualEmployeeNames,
        preserveManualEmployees,
      });
      const incomingMap = new Map(); // key: "Name|Day" -> code

      for (const entry of persistedEntries) {
        const key = `${entry.employeeName}|${entry.day}`;
        incomingMap.set(key, entry.shiftCode);

        const oldShift = existingMap.get(key);

        if (oldShift !== entry.shiftCode) {
          const dateObj = new Date(year, monthIdx, entry.day);
          const dateStr = dateObj.toISOString().split('T')[0];
          auditLogParams.push([entry.employeeName, dateStr, oldShift || null, entry.shiftCode, changedBy, source]);
        }
      }

      // DELETIONS (Existed but not in incoming)
      // Note: Incoming `data` usually contains the FULL schedule for the month.
      // If a day is missing in `data`, it means it's deleted/empty.
      // However, `data` might be partial updates? 
      // The current implementation of `POST /import` does `DELETE FROM shifts WHERE month=$1`.
      // So it IS a full overwrite.
      // We must detect what was in `existingMap` but NOT in `incomingMap`.

      for (const [key, oldCode] of existingMap.entries()) {
        if (!incomingMap.has(key)) {
          // Deleted
          const [emp, day] = key.split('|');
          const dateObj = new Date(year, monthIdx, Number(day));
          const dateStr = dateObj.toISOString().split('T')[0];
          auditLogParams.push([emp, dateStr, oldCode, null, changedBy, source]);
        }
      }

      // [AUDIT] 3. Batch Insert Logs
      if (auditLogParams.length > 0) {
        const logPlaceholders = auditLogParams.map((_, i) =>
          `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        ).join(", ");

        const flatParams = auditLogParams.flat();

        await client.query(
          `INSERT INTO shift_change_log (employee_name, date, old_value, new_value, changed_by, source) VALUES ${logPlaceholders}`,
          flatParams
        );
      }

      // 4. Overwrite Data
      await client.query(`DELETE FROM shifts WHERE month = $1`, [month]);

      for (const entry of persistedEntries) {
        await client.query(
          `INSERT INTO shifts (month, employee_name, day, shift_code, source) VALUES ($1,$2,$3,$4,$5)`,
          [month, entry.employeeName, entry.day, entry.shiftCode, entry.source]
        );
      }

      await client.query("COMMIT");

      // [NEW] Trigger Constraint Check
      // Fire and forget (or await if we want strictness)
      recomputeConstraintsInternal(month).catch(err => console.error("Constraint Recompute Error:", err));

      let contactSync = null;
      let userProvisioning = null;
      try {
        contactSync = await syncEmployeeContacts();
      } catch (contactErr) {
        console.warn("[SCHEDULES] Employee contacts sync failed:", contactErr.message);
        contactSync = { error: contactErr.message };
      }

      try {
        userProvisioning = await provisionUsersFromShiftplan();
      } catch (provisionErr) {
        console.warn("[SCHEDULES] User provisioning failed:", provisionErr.message);
        userProvisioning = { error: provisionErr.message };
      }

      res.json({ success: true, contactSync, userProvisioning });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("IMPORT ERROR:", err);
      res.status(500).json({ error: "Import failed" });
    } finally {
      client.release();
    }
  }
);

/* ------------------------------------------------ */
/* POST /api/schedules/import/merge – BATCH UPDATE  */
/* Recht: shiftplan:write                           */
/* Body: { schedules: { [monthLabel]: { [emp]: { [day]: code } } } } */
/* ------------------------------------------------ */

router.post(
  "/import/review",
  requireAuth,
  requirePageAccess("shiftplan", "write"),
  async (req, res) => {
    try {
      const { schedules } = req.body || {};

      if (!schedules || typeof schedules !== "object") {
        return res.status(400).json({ error: "Missing or invalid schedules data" });
      }

      const review = await fetchShiftImportReview({ schedules });
      res.json({ success: true, review });
    } catch (err) {
      console.error("IMPORT REVIEW ERROR:", err);
      res.status(500).json({ error: "Failed to build import review" });
    }
  }
);

router.post(
  "/import/merge",
  requireAuth,
  requirePageAccess("shiftplan", "write"),
  async (req, res) => {
    const client = await db.connect();

    try {
      const { schedules, employeeActions } = req.body; // Object: { "Januar 2026": { ...data... }, ... }

      if (!schedules || typeof schedules !== "object") {
        return res.status(400).json({ error: "Missing or invalid schedules data" });
      }

      const normalizedActions = normalizeEmployeeActions(employeeActions);
      const filteredImport = applyImportEmployeeDecisions({
        schedules,
        additions: normalizedActions.additions,
        updates: normalizedActions.updates,
      });
      const filteredSchedules = filteredImport.schedules;
      const importSummary = summarizeImportedSchedules(filteredSchedules);
      const schedulesToPersist = filteredSchedules;

      if (importSummary.monthsCount === 0) {
        return res.status(400).json({ error: "No schedules remain after import decisions" });
      }

      await client.query("BEGIN");

      const monthsToUpdate = Object.keys(schedulesToPersist);

      for (const monthLabel of monthsToUpdate) {
        const parsedMonth = parseMonthLabel(monthLabel);
        if (!parsedMonth) {
          throw new Error(`Invalid month label: ${monthLabel}`);
        }

        const monthData = schedulesToPersist[monthLabel];
        const manualEmployeeNames = await fetchManualEmployeeNameSet(client, monthLabel);
        const existingManualRows = await fetchExistingManualShiftRows(client, monthLabel);
        const persistedEntries = buildPersistedShiftEntries({
          scheduleData: monthData,
          existingManualRows,
          manualEmployeeNames,
          preserveManualEmployees: true,
        });

        // 1. CLEAR existing data for this month
        await client.query(`DELETE FROM shifts WHERE month = $1`, [monthLabel]);

        // 2. INSERT new data
        for (const entry of persistedEntries) {
          await client.query(
            `INSERT INTO shifts (month, employee_name, day, shift_code, source) VALUES ($1, $2, $3, $4, $5)`,
            [monthLabel, entry.employeeName, entry.day, entry.shiftCode, entry.source]
          );
        }
      }

      await client.query("COMMIT");

      // Log the upload
      try {
        const uploaderName = req.user?.displayName || req.user?.email || "unknown";
        await db.query(
          `INSERT INTO shiftplan_upload_log (uploaded_by, months_affected, employees_count, changes_count)
           VALUES ($1, $2, $3, $4)`,
          [uploaderName, monthsToUpdate, importSummary.employeesCount, importSummary.changesCount]
        );
      } catch (logErr) {
        console.warn("shiftplan_upload_log insert failed (non-fatal):", logErr.message);
      }

      const cleanupResults = [];
      const deselectedImportedEmployees = [
        ...normalizedActions.additions,
        ...normalizedActions.updates,
      ]
        .filter((item) => item.includeInImport === false)
        .map((item) => ({
          name: item.name,
          deleteFromDatabase: true,
          deleteOdinUser: true,
        }));

      const requestedRemovals = [
        ...normalizedActions.removals.filter(
          (item) => item.deleteFromDatabase || item.deleteOdinUser
        ),
        ...deselectedImportedEmployees,
      ].filter((item, index, allItems) => (
        allItems.findIndex((candidate) => candidate.name.toLowerCase() === item.name.toLowerCase()) === index
      ));

      if (requestedRemovals.length > 0) {
        await client.query("BEGIN");
        try {
          for (let index = 0; index < requestedRemovals.length; index++) {
            const removal = requestedRemovals[index];
            const savepoint = `employee_cleanup_${index + 1}`;

            await client.query(`SAVEPOINT ${savepoint}`);
            try {
              const dataDeletion = removal.deleteFromDatabase
                ? await deleteEmployeeData({ employeeName: removal.name, client })
                : null;
              const userDeletion = removal.deleteOdinUser
                ? await deleteMatchedUserForEmployee({ employeeName: removal.name, actorUserId: req.user?.id, client })
                : null;

              cleanupResults.push({
                employeeName: removal.name,
                dataDeletion,
                userDeletion,
              });

              await client.query(`RELEASE SAVEPOINT ${savepoint}`);
            } catch (cleanupErr) {
              await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
              cleanupResults.push({
                employeeName: removal.name,
                error: cleanupErr.message,
              });
            }
          }

          await client.query("COMMIT");
        } catch (cleanupBatchErr) {
          await client.query("ROLLBACK");
          cleanupResults.push({ error: cleanupBatchErr.message });
        }
      }

      let contactSync = null;
      let userProvisioning = null;
      try {
        contactSync = await syncEmployeeContacts();
      } catch (contactErr) {
        console.warn("[SCHEDULES] Employee contacts sync failed:", contactErr.message);
        contactSync = { error: contactErr.message };
      }

      try {
        const employeesToProvision = normalizedActions.additions
          .filter((item) => item.includeInImport !== false && item.createUser === true)
          .map((item) => ({ employeeName: item.name, email: "" }));

        userProvisioning = employeesToProvision.length > 0
          ? await provisionUsersForEmployees({ employees: employeesToProvision })
          : {
            dryRun: false,
            totalEmployees: 0,
            uniqueEmployees: 0,
            matchedExisting: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            createdUsers: [],
            updatedUsers: [],
            skippedUsers: [],
          };
      } catch (provisionErr) {
        console.warn("[SCHEDULES] User provisioning failed:", provisionErr.message);
        userProvisioning = { error: provisionErr.message };
      }

      const deletedEmployeesCount = cleanupResults.filter((item) => item?.dataDeletion?.deletedRecords > 0).length;
      const deletedUsersCount = cleanupResults.filter((item) => item?.userDeletion?.deleted === true).length;

      res.json({
        success: true,
        updatedMonths: monthsToUpdate,
        months_count: importSummary.monthsCount,
        employees_count: importSummary.employeesCount,
        changes_count: importSummary.changesCount,
        contactSync,
        userProvisioning,
        employeeActionsResult: {
          excludedEmployees: filteredImport.excludedEmployees,
          cleanupResults,
          deletedEmployeesCount,
          deletedUsersCount,
          createdUsersCount: userProvisioning?.created ?? 0,
          updatedUsersCount: userProvisioning?.updated ?? 0,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("IMPORT MERGE ERROR:", err);
      res.status(500).json({ error: "Merge import failed: " + err.message });
    } finally {
      client.release();
    }
  }
);


/* ------------------------------------------------ */
/* PUT /api/schedules/:month/cell (write)           */
/* Body: { employeeName, day, shiftCode }           */
/* ------------------------------------------------ */

router.put(
  "/:month/cell",
  requireAuth,
  requirePageAccess("shiftplan", "write"),
  async (req, res) => {
    const month = String(req.params.month || "").trim();
    const employeeName = String(req.body?.employeeName || "").trim();
    const day = Number(req.body?.day);
    const shiftCodeRaw = req.body?.shiftCode;
    const shiftCode = shiftCodeRaw === null || shiftCodeRaw === undefined ? "" : String(shiftCodeRaw).trim();

    if (!month || !employeeName || !Number.isFinite(day) || day < 1 || day > 31) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const manualEmployeeRes = await client.query(
        `SELECT 1 FROM (
           SELECT employee_name
             FROM manual_shiftplan_employees
            WHERE month = $1
           UNION ALL
           SELECT CONCAT_WS(' ', first_name, last_name) AS employee_name
             FROM users
            WHERE shiftplan_manual = TRUE
         ) manual_sources
          WHERE employee_name = $2
          LIMIT 1`,
        [month, employeeName]
      );
      const rowSource = manualEmployeeRes.rowCount > 0 ? "manual" : "import";

      if (!shiftCode) {
        await client.query(
          `DELETE FROM shifts WHERE month=$1 AND employee_name=$2 AND day=$3`,
          [month, employeeName, day]
        );
      } else {
        await client.query(
          `
          INSERT INTO shifts (month, employee_name, day, shift_code, source)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (month, employee_name, day)
          DO UPDATE SET shift_code = EXCLUDED.shift_code,
                        source = EXCLUDED.source
          `,
          [month, employeeName, day, shiftCode, rowSource]
        );
      }

      await client.query("COMMIT");
      res.json({ success: true });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("SCHEDULE CELL UPDATE ERROR:", e);
      res.status(500).json({ error: "Update failed" });
    } finally {
      client.release();
    }
  }
);

/* ------------------------------------------------ */
/* POST /api/schedules/:month/swap (write)          */
/* Body: { employeeA, employeeB, day }              */
/* ------------------------------------------------ */

router.post(
  "/:month/swap",
  requireAuth,
  requirePageAccess("shiftplan", "write"),
  async (req, res) => {
    const month = String(req.params.month || "").trim();
    const employeeA = String(req.body?.employeeA || "").trim();
    const employeeB = String(req.body?.employeeB || "").trim();
    const day = Number(req.body?.day);

    if (!month || !employeeA || !employeeB || employeeA === employeeB || !Number.isFinite(day) || day < 1 || day > 31) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const a = await client.query(
        `SELECT shift_code FROM shifts WHERE month=$1 AND employee_name=$2 AND day=$3 FOR UPDATE`,
        [month, employeeA, day]
      );
      const b = await client.query(
        `SELECT shift_code FROM shifts WHERE month=$1 AND employee_name=$2 AND day=$3 FOR UPDATE`,
        [month, employeeB, day]
      );

      const aShift = a.rows?.[0]?.shift_code ?? null;
      const bShift = b.rows?.[0]?.shift_code ?? null;
      const manualEmployees = await fetchManualEmployeeNameSet(client, month);
      const sourceA = manualEmployees.has(employeeA) ? "manual" : "import";
      const sourceB = manualEmployees.has(employeeB) ? "manual" : "import";

      // upsert A -> bShift
      if (bShift === null) {
        await client.query(`DELETE FROM shifts WHERE month=$1 AND employee_name=$2 AND day=$3`, [month, employeeA, day]);
      } else {
        await client.query(
          `
          INSERT INTO shifts (month, employee_name, day, shift_code, source)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (month, employee_name, day)
          DO UPDATE SET shift_code = EXCLUDED.shift_code,
                        source = EXCLUDED.source
          `,
          [month, employeeA, day, bShift, sourceA]
        );
      }

      // upsert B -> aShift
      if (aShift === null) {
        await client.query(`DELETE FROM shifts WHERE month=$1 AND employee_name=$2 AND day=$3`, [month, employeeB, day]);
      } else {
        await client.query(
          `
          INSERT INTO shifts (month, employee_name, day, shift_code, source)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (month, employee_name, day)
          DO UPDATE SET shift_code = EXCLUDED.shift_code,
                        source = EXCLUDED.source
          `,
          [month, employeeB, day, aShift, sourceB]
        );
      }

      await client.query("COMMIT");
      res.json({ success: true, swapped: true });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("SCHEDULE SWAP ERROR:", e);
      res.status(500).json({ error: "Swap failed" });
    } finally {
      client.release();
    }
  }
);



/* ------------------------------------------------ */
/* GET /api/schedules/history                       */
/* ------------------------------------------------ */
router.get(
  "/history",
  requireAuth,
  async (req, res) => {
    try {
      const { year, month, employee_name, limit = 100 } = req.query;

      let query = `SELECT * FROM shift_change_log`;
      const params = [];
      const conditions = [];

      if (year && month) {
        const parsedM = Number(month);
        const start = `${year}-${String(parsedM).padStart(2, '0')}-01`;
        const end = `${year}-${String(parsedM).padStart(2, '0')}-31`;
        conditions.push(`date >= $${params.length + 1}`);
        params.push(start);
        conditions.push(`date <= $${params.length + 1}`);
        params.push(end);
      }

      if (employee_name) {
        conditions.push(`employee_name = $${params.length + 1}`);
        params.push(employee_name);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      query += ` ORDER BY changed_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const { rows } = await db.query(query, params);
      res.json(rows);

    } catch (err) {
      console.error("HISTORY ERROR:", err);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  }
);

/* ------------------------------------------------ */
/* GET /api/schedules/last-import                   */
/* Returns the timestamp of the most recent shift   */
/* import (MAX created_at from shifts table).        */
/* ------------------------------------------------ */
router.get("/last-import", requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT MAX(created_at) AS last_import FROM shifts"
    );
    res.json({ lastImport: rows[0]?.last_import ?? null });
  } catch (err) {
    console.error("LAST-IMPORT ERROR:", err);
    res.status(500).json({ error: "Failed to fetch last import timestamp" });
  }
});

export default router;
