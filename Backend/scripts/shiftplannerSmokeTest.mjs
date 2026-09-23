#!/usr/bin/env node
/**
 * End-to-end smoke test for a running shiftplanner backend.
 *
 * Creates test employees, wishes and absences through the public API, exercises
 * the most important save endpoints and validates a generated draft.
 * Run it only against a local/test instance: it writes test data.
 *
 *   BASE_URL=http://localhost:5199/api \
 *   SHIFTPLANNER_API_KEY=... JWT_SECRET=... SHIFTPLANNER_ADMIN_PASSWORD=root \
 *   node scripts/shiftplannerSmokeTest.mjs [YYYY-MM]
 */
import jwt from "jsonwebtoken";

const BASE_URL = (process.env.BASE_URL || "http://localhost:5199/api").replace(/\/$/, "");
const API_KEY = process.env.SHIFTPLANNER_API_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const ADMIN_PASSWORD = process.env.SHIFTPLANNER_ADMIN_PASSWORD || "root";
const MONTH = process.argv[2] || "2027-01";

if (!API_KEY || !JWT_SECRET) {
  console.error("SHIFTPLANNER_API_KEY and JWT_SECRET are required.");
  process.exit(2);
}

const TEST_EMPLOYEES = [
  ["Anna", "Tester"], ["Ben", "Tester"], ["Clara", "Tester"], ["David", "Tester"],
  ["Eva", "Tester"], ["Felix", "Tester"], ["Greta", "Tester"], ["Hannes", "Tester"],
  ["Ida", "Tester"], ["Jonas", "Tester"], ["Klara", "Tester"], ["Lukas", "Tester"],
  ["Mia", "Tester"], ["Noah", "Tester"],
];

const results = [];
let adminToken = null;

function identityToken(userId, displayName) {
  return jwt.sign({ scope: "shiftplanner_identity", userId, displayName }, JWT_SECRET, { expiresIn: "1h" });
}

async function call(method, path, body, { identity, admin = true } = {}) {
  const headers = { "content-type": "application/json", "x-shiftplanner-key": API_KEY };
  if (admin && adminToken) headers["x-shiftplanner-admin"] = adminToken;
  if (identity) headers["x-shiftplanner-identity"] = identity;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  return { status: response.status, data };
}

async function step(name, fn, { acceptStatus = [200, 201] } = {}) {
  try {
    const { status, data } = await fn();
    const ok = acceptStatus.includes(status);
    results.push({ name, ok, status, error: ok ? "" : JSON.stringify(data).slice(0, 300) });
    return ok ? data : null;
  } catch (error) {
    results.push({ name, ok: false, status: "EXC", error: error.message });
    return null;
  }
}

async function roundTrip(name, path, pick = (data) => data) {
  const current = await step(`GET ${path}`, () => call("GET", path));
  if (!current) return;
  await step(`PUT ${path} (${name})`, () => call("PUT", path, pick(current)));
}

const unlock = await call("POST", "/standalone-admin/unlock", { password: ADMIN_PASSWORD });
if (unlock.status !== 200) {
  console.error("Admin unlock failed:", unlock.status, unlock.data);
  process.exit(1);
}
adminToken = unlock.data.token;

// Configuration round trips: saving unchanged values must always succeed.
await roundTrip("unchanged", "/shift-config/planning-config", (d) => d.config || d);
const rotationResponse = await call("GET", "/shift-config/rotation-rules");
const rotationRules = rotationResponse.data?.rules || null;
await roundTrip("unchanged", "/shift-config/rotation-rules", (d) => d.rules || d);
await roundTrip("unchanged", "/shift-config/fairness-rules", (d) => d.rules || d);
await roundTrip("unchanged", "/shift-config/short-night-options", (d) => d.options || d.config || d);
await roundTrip("unchanged", "/user/settings", (d) => d.settings || d);
await roundTrip("unchanged", "/user/preferences/shiftplan", (d) => d.preferences || d);

const definitions = await step("GET /shift-config/definitions", () => call("GET", "/shift-config/definitions"));
const definitionList = definitions?.definitions || definitions || [];
if (Array.isArray(definitionList) && definitionList[0]) {
  const def = definitionList[0];
  await step(`PUT /shift-config/definitions/${def.id}`, () => call("PUT", `/shift-config/definitions/${def.id}`, def));
}

// Test employees.
const users = [];
const existingUsers = await call("GET", "/admin/users");
for (const [firstName, lastName] of TEST_EMPLOYEES) {
  const name = `${firstName} ${lastName}`;
  let user = Array.isArray(existingUsers.data)
    ? existingUsers.data.find((row) => `${row.firstName ?? row.first_name} ${row.lastName ?? row.last_name}` === name)
    : null;
  if (!user) {
    const created = await step(`POST /admin/users ${name}`, () => call("POST", "/admin/users", { firstName, lastName }));
    user = created;
  }
  if (user?.id) users.push({ id: user.id, name });
  await step(`POST manual employee ${name}`, () => call("POST", "/shiftplan-control/manual-employees", { month: MONTH, employeeName: name }), { acceptStatus: [201, 409] });
}

// Wishes: the original bug report (max_weekends_per_month) is covered here.
const wishes = [
  { preferred_shifts: ["E1"], unwanted_shifts: ["N"], max_nights_per_month: null, max_weekends_per_month: 1, night_model: "SEVEN_DAY" },
  { preferred_shifts: ["L1"], unwanted_shifts: [], max_nights_per_month: 7, max_weekends_per_month: 2, night_model: "SEVEN_DAY" },
  { preferred_shifts: ["N"], unwanted_shifts: ["E1"], max_nights_per_month: 14, max_weekends_per_month: null, night_model: "SHORT" },
  { preferred_shifts: [], unwanted_shifts: ["L2"], max_nights_per_month: null, max_weekends_per_month: 3, night_model: "SEVEN_DAY",
    monthly_preferences: { [MONTH]: { preferred_shifts: ["E2"], unwanted_shifts: ["N"] } } },
];
for (let index = 0; index < Math.min(users.length, wishes.length); index += 1) {
  const user = users[index];
  const identity = identityToken(user.id, user.name);
  await step(`PUT employee-preferences ${user.name}`, () => call("PUT", "/shift-config/employee-preferences", wishes[index], { identity, admin: false }));
  await step(`GET employee-preferences ${user.name}`, () => call("GET", "/shift-config/employee-preferences", undefined, { identity, admin: false }));
  await step(`PUT ticket-preferences ${user.name}`, () => call("PUT", "/shift-config/ticket-preferences", { preferences: {} }, { identity, admin: false }));
}

// Absences.
const [yearText, monthText] = MONTH.split("-");
const absenceTypes = ["VACATION", "SICK", "TRAINING"];
const createdAbsences = [];
for (let index = 0; index < 3 && index + 4 < users.length; index += 1) {
  const startDay = String(5 + index * 7).padStart(2, "0");
  const endDay = String(9 + index * 7).padStart(2, "0");
  createdAbsences.push({ employee: users[index + 4].name, from: Number(startDay), to: Number(endDay) });
  await step(`POST /absences ${users[index + 4].name}`, () => call("POST", "/absences", {
    employee_name: users[index + 4].name,
    start_date: `${yearText}-${monthText}-${startDay}`,
    end_date: `${yearText}-${monthText}-${endDay}`,
    type: absenceTypes[index],
    note: "Smoke-Test",
  }));
}

// Other frequently used save paths.
const creator = users[0] ? identityToken(users[0].id, users[0].name) : null;
const poll = await step("POST /polls", () => call("POST", "/polls", { title: "Smoke-Test Umfrage", description: "Test", options: ["Ja", "Nein"] }, { identity: creator }));
const pollId = poll?.id || poll?.poll?.id;
if (pollId) {
  await step("POST /polls/:id/vote", () => call("POST", `/polls/${pollId}/vote`, { option_index: 0 }, { identity: creator }));
  await step("POST /polls/:id/comments", () => call("POST", `/polls/${pollId}/comments`, { comment: "Kommentar nach Abstimmung" }, { identity: creator }));
  await step("GET /polls/:id", () => call("GET", `/polls/${pollId}`, undefined, { identity: creator }));
}
if (creator) {
  await step("POST /shift-handovers", () => call("POST", "/shift-handovers", {
    direction: "early_to_late", category: "general_information", notes: "Smoke-Test", status: "open", handoverAt: new Date().toISOString(),
  }, { identity: creator }));
  await step("POST /team-handovers", () => call("POST", "/team-handovers", {
    team: "frost", ticketNumber: "T-1", customerName: "Kunde", notes: "Smoke-Test", status: "open",
  }, { identity: creator }));
}
await step("POST /dashboard/info-entries", () => call("POST", "/dashboard/info-entries", { content: "Smoke-Test", type: "info" }));
await step("POST /projects", () => call("POST", "/projects", { name: "Smoke-Test Projekt", responsible: "Anna Tester", progress: 10, participants: ["Anna Tester"] }));
await step("POST /feedback", () => call("POST", "/feedback", { type: "Bug", title: "Smoke-Test", description: "Test", route: "/" }, { identity: creator }));

// Generator.
const generated = await step(`POST /shiftplan-control/drafts/generate ${MONTH}`, () => call("POST", "/shiftplan-control/drafts/generate", { month: MONTH, title: "Smoke-Test" }, { identity: creator }));
const draft = generated?.draft || generated;
const draftId = draft?.id;
if (draftId) {
  const detail = await step("GET /drafts/:id (owner)", () => call("GET", `/shiftplan-control/drafts/${draftId}`, undefined, { identity: creator }));
  await step("PATCH /drafts/:id/metadata", () => call("PATCH", `/shiftplan-control/drafts/${draftId}/metadata`, { title: "Smoke-Test umbenannt", note: "Notiz" }, { identity: creator }));
  const firstShift = (detail?.draft?.shifts_json || detail?.shifts_json || [])[0];
  if (firstShift) {
    await step("PATCH /drafts/:id/shifts", () => call("PATCH", `/shiftplan-control/drafts/${draftId}/shifts`, {
      employeeName: firstShift.employee_name || firstShift.employeeName,
      day: firstShift.day,
      shiftCode: firstShift.shift_code || firstShift.shiftCode || firstShift.code,
    }, { identity: creator }));
  }
  await step("GET /drafts/:id (other user must not see it)", () => call("GET", `/shiftplan-control/drafts/${draftId}`, undefined, {
    identity: users[1] ? identityToken(users[1].id, users[1].name) : undefined, admin: false,
  }), { acceptStatus: [403, 404] });
  await step("POST /drafts/:id/feedback", () => call("POST", `/shiftplan-control/drafts/${draftId}/feedback`, { employeeName: users[0]?.name, day: 3, suggestion: "Bitte Frühschicht" }, { identity: creator }), { acceptStatus: [200, 201] });
  await step("PUT /drafts/:id/vote", () => call("PUT", `/shiftplan-control/drafts/${draftId}/vote`, { vote: "approve" }, { identity: creator }));
  await step("PATCH /drafts/:id/status", () => call("PATCH", `/shiftplan-control/drafts/${draftId}/status`, { status: "in_review" }, { identity: creator }));
  await step("GET /drafts (list contains own draft)", async () => {
    const response = await call("GET", "/shiftplan-control/drafts", undefined, { identity: creator });
    const list = response.data?.drafts || response.data || [];
    return { status: Array.isArray(list) && list.some((row) => row.id === draftId) ? 200 : 404, data: response.data };
  });
  await step("GET /drafts/:id/excel", () => call("GET", `/shiftplan-control/drafts/${draftId}/excel`, undefined, { identity: creator }));
  await step("POST /drafts/:id/activate", () => call("POST", `/shiftplan-control/drafts/${draftId}/activate`, {}, { identity: creator }));
  const firstMonday = [1, 2, 3, 4, 5, 6, 7].find((day) => new Date(Number(yearText), Number(monthText) - 1, day).getDay() === 1);
  const weekStart = `${yearText}-${monthText}-${String(firstMonday).padStart(2, "0")}`;
  const week = await step("POST /drafts/generate-week", () => call("POST", "/shiftplan-control/drafts/generate-week", { weekStart }, { identity: creator }), { acceptStatus: [200, 201] });
  const weekId = week?.draft?.id || week?.id;
  if (weekId) await step("DELETE /drafts/:id (week)", () => call("DELETE", `/shiftplan-control/drafts/${weekId}`, undefined, { identity: creator }));
  printGeneratorReport(detail?.draft || detail || draft);
  validateHardRules(detail?.draft || detail || draft);
}

function validateHardRules(record) {
  const shifts = record?.shifts_json || [];
  const defsByCode = new Map((Array.isArray(definitionList) ? definitionList : []).map((def) => [String(def.code).toUpperCase(), def]));
  const byDayCode = new Map();
  const byEmployee = new Map();
  for (const shift of shifts) {
    const code = String(shift.shift_code || "").toUpperCase();
    const key = `${shift.day}|${code}`;
    byDayCode.set(key, (byDayCode.get(key) || 0) + 1);
    if (!byEmployee.has(shift.employee_name)) byEmployee.set(shift.employee_name, new Map());
    const days = byEmployee.get(shift.employee_name);
    if (days.has(shift.day)) results.push({ name: `Regel: Doppelbelegung ${shift.employee_name} Tag ${shift.day}`, ok: false, status: "RULE", error: "" });
    days.set(shift.day, code);
  }
  const capacityViolations = [...byDayCode].filter(([key, count]) => {
    const def = defsByCode.get(key.split("|")[1]);
    return def && Number.isFinite(Number(def.max_staff)) && count > Number(def.max_staff);
  });
  results.push({ name: "Regel: max_staff eingehalten", ok: capacityViolations.length === 0, status: "RULE", error: capacityViolations.slice(0, 5).map(([key, count]) => `${key}=${count}`).join(", ") });

  const absenceViolations = [];
  for (const absence of createdAbsences) {
    const days = byEmployee.get(absence.employee) || new Map();
    for (let day = absence.from; day <= absence.to; day += 1) {
      if (days.has(day)) absenceViolations.push(`${absence.employee} Tag ${day}`);
    }
  }
  results.push({ name: "Regel: keine Schicht während Abwesenheit", ok: absenceViolations.length === 0, status: "RULE", error: absenceViolations.slice(0, 5).join(", ") });

  const nightViolations = [];
  // 7-day series (N, E1WE, L1WE) are allowed to exceed the regular streak limit by design.
  const longestSeries = Math.max(0, ...[...defsByCode.values()].filter((def) => def.is_active !== false).map((def) => Number(def.series_days) || 0));
  const maxConsecutive = Math.max(Number(rotationRules?.max_consecutive_workdays) || 0, longestSeries);
  const streakViolations = [];
  for (const [employee, days] of byEmployee) {
    let streak = 0;
    for (let day = 1; day <= 31; day += 1) {
      const code = days.get(day);
      const next = days.get(day + 1);
      const shiftType = defsByCode.get(code)?.shift_type;
      if (shiftType === "night" && next && defsByCode.get(next)?.shift_type !== "night") nightViolations.push(`${employee} Tag ${day}->${day + 1} (${code}->${next})`);
      streak = code ? streak + 1 : 0;
      if (maxConsecutive && streak > maxConsecutive) streakViolations.push(`${employee} Tag ${day} (${streak})`);
    }
  }
  results.push({ name: "Regel: kein Dienst direkt nach Nachtschicht", ok: nightViolations.length === 0, status: "RULE", error: nightViolations.slice(0, 5).join(", ") });
  if (maxConsecutive) {
    results.push({ name: `Regel: max. ${maxConsecutive} Arbeitstage am Stück (im Monat)`, ok: streakViolations.length === 0, status: "RULE", error: streakViolations.slice(0, 5).join(", ") });
  }

  const fairness = record?.fairness || {};
  const shortfallConflicts = new Set((record?.conflicts || []).filter((c) => c.type === "target_hours_shortfall").map((c) => c.employee || c.employee_name));
  const unexplained = Object.entries(fairness)
    .filter(([name, row]) => Number(row?.deltaHours) < -16 && !shortfallConflicts.has(name))
    .map(([name, row]) => `${name} ${row.deltaHours}h`);
  results.push({ name: "Sollstunden: kein unerklärtes Minus > 16h", ok: unexplained.length === 0, status: "RULE", error: unexplained.join(", ") });
}

function printGeneratorReport(record) {
  const shifts = record?.shifts_json || [];
  const fairness = record?.fairness || {};
  const conflicts = record?.conflicts || [];
  console.log(`\nGenerator ${MONTH}: ${shifts.length} Schichten, ${conflicts.length} Konflikte`);
  const perEmployee = fairness.employees || fairness.perEmployee || fairness;
  const rows = Array.isArray(perEmployee) ? perEmployee : Object.entries(perEmployee || {}).map(([name, value]) => ({ name, ...(value || {}) }));
  for (const row of rows) {
    const hours = row.actualHours ?? row.hours;
    const target = row.targetHours ?? row.target;
    const delta = row.deltaHours ?? (hours != null && target != null ? hours - target : null);
    if (hours == null && delta == null) continue;
    console.log(`  ${String(row.name || row.employee || row.employee_name).padEnd(16)} Ist ${hours}h  Soll ${target}h  Delta ${delta}h`);
  }
  const conflictTypes = conflicts.reduce((acc, conflict) => {
    acc[conflict.type] = (acc[conflict.type] || 0) + 1;
    return acc;
  }, {});
  console.log("  Konflikttypen:", conflictTypes);
}

console.log("\nErgebnisse:");
for (const row of results) {
  console.log(`${row.ok ? "OK  " : "FAIL"} ${String(row.status).padEnd(4)} ${row.name}${row.error ? `  -> ${row.error}` : ""}`);
}
const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} erfolgreich`);
process.exit(failed.length ? 1 : 0);
