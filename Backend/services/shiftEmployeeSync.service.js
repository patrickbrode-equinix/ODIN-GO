import db from "../db.js";
import { normalizeName } from "../lib/nameNorm.js";
import { findExistingUserForEmployeeName } from "./shiftUserProvisioning.service.js";

function normalizeEmployeeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function sortNames(names) {
  return [...names].sort((a, b) => a.localeCompare(b, "de"));
}

function buildNameMap(names) {
  const byNormalized = new Map();

  for (const rawName of names) {
    const name = normalizeEmployeeName(rawName);
    if (!name) continue;

    const key = normalizeName(name);
    if (!key || byNormalized.has(key)) continue;
    byNormalized.set(key, name);
  }

  return byNormalized;
}

function summarizeUserMatch(match) {
  if (!match?.user) return null;

  return {
    ...match.user,
    match: match.match,
  };
}

function countShiftEntries(schedules = {}) {
  let total = 0;

  for (const monthData of Object.values(schedules)) {
    if (!monthData || typeof monthData !== "object") continue;

    for (const days of Object.values(monthData)) {
      if (!days || typeof days !== "object") continue;
      total += Object.values(days).filter((value) => String(value || "").trim() !== "").length;
    }
  }

  return total;
}

function countEmployeeShiftEntries(schedules = {}, employeeName) {
  const employeeKey = normalizeName(normalizeEmployeeName(employeeName));
  if (!employeeKey) return 0;

  let total = 0;

  for (const monthData of Object.values(schedules || {})) {
    if (!monthData || typeof monthData !== "object") continue;

    for (const [rawEmployeeName, days] of Object.entries(monthData)) {
      if (normalizeName(normalizeEmployeeName(rawEmployeeName)) !== employeeKey) continue;
      if (!days || typeof days !== "object") continue;
      total += Object.values(days).filter((value) => String(value || "").trim() !== "").length;
    }
  }

  return total;
}

export function collectEmployeeNamesFromSchedules(schedules = {}) {
  const names = [];

  for (const monthData of Object.values(schedules)) {
    if (!monthData || typeof monthData !== "object") continue;
    names.push(...Object.keys(monthData));
  }

  return sortNames([...buildNameMap(names).values()]);
}

export function buildShiftImportReview({
  schedules,
  existingEmployeesInTargetMonths = [],
  existingUsers = [],
}) {
  const importedNameMap = buildNameMap(collectEmployeeNamesFromSchedules(schedules));
  const existingNameMap = buildNameMap(existingEmployeesInTargetMonths);
  const importedKeys = new Set(importedNameMap.keys());
  const existingKeys = new Set(existingNameMap.keys());

  const importedEmployees = sortNames(
    [...importedKeys]
      .map((key) => importedNameMap.get(key))
      .filter(Boolean)
  ).map((name) => {
    const userMatch = findExistingUserForEmployeeName(name, existingUsers);
    const protectedUser = userMatch?.user?.isRoot || userMatch?.user?.isAdmin;
    const existsInTargetMonths = existingKeys.has(normalizeName(name));

    return {
      name,
      includeInImport: true,
      importedShiftCount: countEmployeeShiftEntries(schedules, name),
      existsInTargetMonths,
      createUser: !existsInTargetMonths && !userMatch,
      canCreateUser: !existsInTargetMonths && !userMatch,
      canDeleteUser: Boolean(userMatch?.user) && !protectedUser,
      deleteUserReason: !userMatch?.user
        ? "Kein passender ODIN-User gefunden"
        : protectedUser
        ? "Geschützter ODIN-User"
        : null,
      user: summarizeUserMatch(userMatch),
    };
  });

  const newEmployees = importedEmployees.filter((item) => !item.existsInTargetMonths);

  const missingEmployees = sortNames(
    [...existingKeys]
      .filter((key) => !importedKeys.has(key))
      .map((key) => existingNameMap.get(key))
      .filter(Boolean)
  ).map((name) => {
    const userMatch = findExistingUserForEmployeeName(name, existingUsers);
    const protectedUser = userMatch?.user?.isRoot || userMatch?.user?.isAdmin;

    return {
      name,
      deleteFromDatabase: false,
      deleteOdinUser: false,
      canDeleteUser: Boolean(userMatch?.user) && !protectedUser,
      deleteUserReason: !userMatch?.user
        ? "Kein passender ODIN-User gefunden"
        : protectedUser
        ? "Geschützter ODIN-User"
        : null,
      user: summarizeUserMatch(userMatch),
    };
  });

  const matchedEmployees = importedEmployees.filter((item) => item.existsInTargetMonths);

  return {
    months: sortNames(Object.keys(schedules || {})),
    importedEmployeeCount: importedNameMap.size,
    existingEmployeeCount: existingNameMap.size,
    importedEmployees,
    newEmployees,
    matchedEmployees,
    missingEmployees,
  };
}

export function applyImportEmployeeDecisions({
  schedules,
  additions = [],
  updates = [],
}) {
  const includeByName = new Map();

  for (const action of additions) {
    const key = normalizeName(normalizeEmployeeName(action?.name));
    if (!key) continue;
    includeByName.set(key, action?.includeInImport !== false);
  }

  for (const action of updates) {
    const key = normalizeName(normalizeEmployeeName(action?.name));
    if (!key) continue;
    includeByName.set(key, action?.includeInImport !== false);
  }

  const filteredSchedules = {};
  const excludedEmployees = new Set();

  for (const [monthLabel, monthData] of Object.entries(schedules || {})) {
    const filteredMonth = {};

    for (const [rawEmployeeName, rawDays] of Object.entries(monthData || {})) {
      const employeeName = normalizeEmployeeName(rawEmployeeName);
      const employeeKey = normalizeName(employeeName);
      const shouldInclude = includeByName.has(employeeKey)
        ? includeByName.get(employeeKey) !== false
        : true;

      if (!shouldInclude) {
        excludedEmployees.add(employeeName);
        continue;
      }

      const days = {};
      for (const [rawDay, rawShift] of Object.entries(rawDays || {})) {
        const day = Number(rawDay);
        const shift = String(rawShift || "").trim();
        if (!Number.isFinite(day) || day < 1 || day > 31 || !shift) continue;
        days[day] = shift;
      }

      if (Object.keys(days).length > 0) {
        filteredMonth[employeeName] = days;
      }
    }

    filteredSchedules[monthLabel] = filteredMonth;
  }

  return {
    schedules: filteredSchedules,
    excludedEmployees: sortNames([...excludedEmployees]),
  };
}

export function mergeSchedulesByEmployee(baseSchedules = {}, preservedSchedules = {}) {
  const mergedSchedules = {};

  for (const [monthLabel, monthData] of Object.entries(baseSchedules || {})) {
    mergedSchedules[monthLabel] = { ...(monthData || {}) };
  }

  for (const [monthLabel, monthData] of Object.entries(preservedSchedules || {})) {
    const targetMonth = mergedSchedules[monthLabel] || {};

    for (const [employeeName, rawDays] of Object.entries(monthData || {})) {
      const days = {};

      for (const [rawDay, rawShift] of Object.entries(rawDays || {})) {
        const day = Number(rawDay);
        const shift = String(rawShift || "").trim();
        if (!Number.isFinite(day) || day < 1 || day > 31 || !shift) continue;
        days[day] = shift;
      }

      if (Object.keys(days).length > 0) {
        targetMonth[normalizeEmployeeName(employeeName)] = days;
      }
    }

    mergedSchedules[monthLabel] = targetMonth;
  }

  return mergedSchedules;
}

export async function fetchShiftImportReview({ schedules, client = db }) {
  const months = Object.keys(schedules || {});
  const existingEmployeesRes = months.length > 0
    ? await client.query(
      `SELECT DISTINCT employee_name
       FROM shifts
       WHERE month = ANY($1::text[])
         AND COALESCE(source, 'import') <> 'manual'
       ORDER BY employee_name ASC`,
      [months]
    )
    : { rows: [] };

  const existingUsersRes = await client.query(
    `SELECT id, email, username, first_name, last_name, approved,
            provisioned_from_shiftplan, provisioned_employee_name,
            is_admin, is_root
     FROM users
     ORDER BY id ASC`
  );

  return buildShiftImportReview({
    schedules,
    existingEmployeesInTargetMonths: existingEmployeesRes.rows.map((row) => row.employee_name),
    existingUsers: existingUsersRes.rows,
  });
}

const EMPLOYEE_DELETE_STEPS = [
  { table: "shifts", column: "employee_name" },
  { table: "manual_shiftplan_employees", column: "employee_name" },
  { table: "employee_contacts", column: "employee_name" },
  { table: "absences", column: "employee_name" },
  { table: "absence_conflicts", column: "employee_name" },
  { table: "employee_skills", column: "employee_name" },
  { table: "wellbeing_metrics", column: "employee_name" },
  { table: "shift_violations", column: "employee_name" },
  { table: "year_plan_2027", column: "employee_name" },
  { table: "employee_shift_roles", column: "employee_name" },
  { table: "assignment_employee_exclusions", column: "employee_name" },
  { table: "shiftplan_exclusions", column: "employee_name" },
  { table: "preferred_colleagues", column: "preferred_employee_name" },
];

async function loadExistingTables(client) {
  const tableNames = EMPLOYEE_DELETE_STEPS.map((entry) => entry.table);
  const { rows } = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [tableNames]
  );

  return new Set(rows.map((row) => row.table_name));
}

export async function deleteEmployeeData({ employeeName, client }) {
  const normalizedEmployeeName = normalizeEmployeeName(employeeName);
  const existingTables = await loadExistingTables(client);
  const byTable = {};
  let deletedRecords = 0;

  for (const step of EMPLOYEE_DELETE_STEPS) {
    if (!existingTables.has(step.table)) continue;

    const result = await client.query(
      `DELETE FROM ${step.table} WHERE ${step.column} = $1`,
      [normalizedEmployeeName]
    );

    byTable[`${step.table}.${step.column}`] = result.rowCount;
    deletedRecords += result.rowCount;
  }

  return {
    employeeName: normalizedEmployeeName,
    deletedRecords,
    byTable,
  };
}

export async function deleteMatchedUserForEmployee({
  employeeName,
  actorUserId,
  client,
}) {
  const normalizedEmployeeName = normalizeEmployeeName(employeeName);
  const existingUsersRes = await client.query(
    `SELECT id, email, username, first_name, last_name, approved,
            provisioned_from_shiftplan, provisioned_employee_name,
            is_admin, is_root
     FROM users
     ORDER BY id ASC`
  );

  const userMatch = findExistingUserForEmployeeName(normalizedEmployeeName, existingUsersRes.rows);
  if (!userMatch?.user) {
    return {
      employeeName: normalizedEmployeeName,
      deleted: false,
      reason: "user_not_found",
    };
  }

  if (userMatch.user.isRoot) {
    return {
      employeeName: normalizedEmployeeName,
      deleted: false,
      reason: "protected_root",
      user: userMatch.user,
    };
  }

  if (userMatch.user.isAdmin) {
    return {
      employeeName: normalizedEmployeeName,
      deleted: false,
      reason: "protected_admin",
      user: userMatch.user,
    };
  }

  if (actorUserId && Number(actorUserId) === Number(userMatch.user.id)) {
    return {
      employeeName: normalizedEmployeeName,
      deleted: false,
      reason: "self_delete_blocked",
      user: userMatch.user,
    };
  }

  await client.query(`DELETE FROM users WHERE id = $1`, [userMatch.user.id]);

  return {
    employeeName: normalizedEmployeeName,
    deleted: true,
    userId: userMatch.user.id,
    email: userMatch.user.email,
    match: userMatch.match,
  };
}

export function summarizeImportedSchedules(schedules = {}) {
  return {
    monthsCount: Object.keys(schedules).length,
    employeesCount: collectEmployeeNamesFromSchedules(schedules).length,
    changesCount: countShiftEntries(schedules),
  };
}