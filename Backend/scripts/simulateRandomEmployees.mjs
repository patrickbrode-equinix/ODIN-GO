#!/usr/bin/env node
/* ================================================ */
/* Random-employee simulation of the real generator  */
/* No database server needed: the pool is replaced   */
/* by tests/helpers/fakePlanningDb.js.               */
/*                                                   */
/* node scripts/simulateRandomEmployees.mjs          */
/*   [--seed 1] [--employees 40] [--months 3]        */
/*   [--start 2027-01] [--json out.json] [--quiet]   */
/* ================================================ */

import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((list, value, index, all) => {
  if (value.startsWith('--')) list.push([value.slice(2), all[index + 1] && !all[index + 1].startsWith('--') ? all[index + 1] : true]);
  return list;
}, []));
const seed = Number(args.seed ?? 1);
const employeeCount = Number(args.employees ?? 40);
const monthCount = Number(args.months ?? 3);
const [startYear, startMonth] = String(args.start ?? '2027-01').split('-').map(Number);

const { default: pool } = await import('../db.js');
const { generateShiftPlan } = await import('../routes/shiftplanControl.js');
const { createFakePlanningDb, createRandom } = await import('../tests/helpers/fakePlanningDb.js');
const { formatShiftMonthLabel } = await import('../lib/shiftplanMonth.js');

const rng = createRandom(seed);
const originalConsole = { warn: console.warn, log: console.log };
if (args.quiet) console.warn = () => {};

/* ---------- random employees ---------- */

const FIRST = ['Anna', 'Ben', 'Carla', 'Dario', 'Eva', 'Finn', 'Gina', 'Hugo', 'Ines', 'Jan', 'Kira', 'Leon', 'Mia', 'Nico', 'Olga', 'Paul', 'Quirin', 'Rosa', 'Sven', 'Tina', 'Uwe', 'Vera', 'Willi', 'Xenia', 'Yusuf', 'Zoe'];
const LAST = ['Adler', 'Berg', 'Conrad', 'Dietz', 'Engel', 'Fuchs', 'Graf', 'Haas', 'Imhof', 'Jung', 'Keller', 'Lang', 'Maier', 'Nagel', 'Otto', 'Peters', 'Roth', 'Sauer', 'Thiel', 'Ulrich', 'Vogel', 'Wolf'];
const SHIFT_WISHES = ['E1', 'E2', 'L1', 'L2'];

function buildEmployees() {
  return Array.from({ length: employeeCount }, (_, index) => {
    const first = FIRST[index % FIRST.length];
    const last = LAST[(index * 7 + 3) % LAST.length];
    const name = `${first} ${last}${index >= FIRST.length ? ` ${index}` : ''}`;
    const roll = rng.next();
    const harsh = args.mix === 'harsh';
    let preferred = [];
    let unwanted = [];
    let nightModel = rng.chance(harsh ? 0.5 : 0.2) && !args.seven ? 'SHORT' : 'SEVEN_DAY';
    let maxNights = null;
    // typical: most people are flexible; harsh: many hard wishes (stress test)
    const limits = harsh ? [0.12, 0.40, 0.55] : [0.03, 0.16, 0.26];
    if (roll < limits[0]) { preferred = ['N']; maxNights = rng.pick([null, 7, 14]); }
    else if (roll < limits[1]) { preferred = [rng.pick(harsh ? SHIFT_WISHES : ['E1', 'E1', 'E2', 'E2', 'L1', 'L2'])]; unwanted = rng.chance(0.7) ? ['N'] : []; }
    else if (roll < limits[2]) { preferred = rng.shuffle(SHIFT_WISHES).slice(0, 2); unwanted = ['N']; }
    else { unwanted = rng.chance(0.4) ? [rng.pick(['N', 'L2', 'E2'])] : []; }
    unwanted = unwanted.filter((code) => !preferred.includes(code));
    if (unwanted.includes('N')) maxNights = 0;
    const blocked = rng.chance(args.mix === 'harsh' ? 0.3 : 0.15) ? rng.shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, rng.int(1, 2)) : [];
    return {
      index,
      name,
      first,
      last,
      userId: 1000 + index,
      preferred,
      unwanted,
      blocked,
      maxNights,
      maxWeekends: rng.pick([null, null, 1, 2]),
      nightModel,
      holidays: rng.chance(0.15) ? ['Neujahr'] : [],
      colleagues: [],
    };
  });
}

const employees = buildEmployees();
// Fixed pair rule of the real team: these two are never planned together on night or weekend shifts.
for (const [index, first, last] of [[5, 'Patrick', 'Brode'], [9, 'Godfrey', 'Emanuel']]) {
  if (employees[index]) Object.assign(employees[index], { first, last, name: `${first} ${last}` });
}
if (args.profile === 'flexible') {
  for (const employee of employees) Object.assign(employee, { preferred: [], unwanted: [], blocked: [], maxNights: null, maxWeekends: null, holidays: [] });
}
for (const employee of employees) {
  if (!rng.chance(0.3)) continue;
  const options = employees.filter((other) => other !== employee);
  employee.colleagues = rng.shuffle(options).slice(0, rng.int(1, 2)).map((other) => other.userId);
}
// --mutual N: N groups of 2-3 employees who wish each other as colleagues (some with the same shift wish, some flexible).
const mutualGroups = [];
if (args.mutual) {
  const pool = rng.shuffle(employees.filter((employee) => !employee.preferred.includes('N')));
  let cursor = 0;
  for (let index = 0; index < Number(args.mutual) && cursor + 3 <= pool.length; index++) {
    const size = index % 2 === 0 ? 3 : 2;
    const members = pool.slice(cursor, cursor + size);
    cursor += size;
    const shared = [['E1'], ['L1'], []][index % 3];
    // every fourth group: different lists with one shift in common (L1)
    const overlapping = index % 4 === 3 ? [['E1', 'L1'], ['L1', 'E2'], ['L1', 'E2']] : null;
    for (const [memberIndex, member] of members.entries()) {
      Object.assign(member, { preferred: overlapping ? [...overlapping[memberIndex]] : [...shared], unwanted: [], blocked: [], maxNights: member.maxNights, colleagues: members.filter((other) => other !== member).map((other) => other.userId) });
    }
    mutualGroups.push(members.map((member) => member.name));
  }
}
const dbsPoolSize = Math.min(4, Math.floor(employeeCount / 8));
const dbsPool = rng.shuffle(employees).slice(0, dbsPoolSize).map((employee, index) => ({
  employee,
  weekdays: index % 2 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5],
  outside: index % 3 === 0 ? ['EARLY'] : index % 3 === 1 ? ['LATE'] : [],
}));
// --lnonly N: N employees (not in DBS) who exclude early shifts (unwanted E1/E2) and want late/night only.
if (args.lnonly) {
  const dbsNames = new Set(dbsPool.map((entry) => entry.employee.name));
  const candidates = employees.filter((employee) => !dbsNames.has(employee.name));
  for (const employee of candidates.slice(0, Number(args.lnonly))) {
    Object.assign(employee, { preferred: ['L1', 'L2', 'N'], unwanted: ['E1', 'E2'], blocked: [], maxNights: null, nightModel: 'SEVEN_DAY' });
  }
}// --coloeasy: pool members that accept every shift type (realistic admin choice: people who can do Colo nights)
const coloCandidates = args.coloeasy ? employees.filter((employee) => !employee.unwanted.includes('N') && !employee.preferred.length && employee.maxNights !== 0) : employees;
const coloPool = rng.shuffle(coloCandidates).slice(0, Math.min(6, Math.floor(employeeCount / 6))).map((employee) => employee.name);

/* ---------- fake database ---------- */

const { db, query } = createFakePlanningDb();
pool.query = query;
db.employees = employees.map((employee) => employee.name);
db.preferences = employees.map((employee) => ({
  id: employee.index + 1,
  user_id: employee.userId,
  first_name: employee.first,
  last_name: employee.last,
  email: `${employee.userId}@example.invalid`,
  provisioned_employee_name: employee.name,
  preferred_shifts: employee.preferred,
  unwanted_shifts: employee.unwanted,
  preferred_holidays: employee.holidays,
  preferred_days: [],
  blocked_days: employee.blocked,
  max_nights_per_month: employee.maxNights,
  max_weekends_per_month: employee.maxWeekends,
  night_model: employee.nightModel,
  monthly_preferences: {},
  preferred_colleagues: employee.colleagues,
  updated_at: new Date(),
}));
db.specialPools = dbsPool.map(({ employee, weekdays, outside }, index) => ({
  shift_code: 'DBS', employee_name: employee.name, monthly_max_assignments: 31, working_weekdays: weekdays,
  free_days_after_block: 2, duration_hours: null, other_shift_codes: outside, other_days_per_month: null, sort_order: index,
}));
// --late N / --night N: fixed weekday staffing (minimum = maximum), like a tightly configured team.
for (const [type, key] of [['late', 'late'], ['night', 'night']]) {
  if (args[key]) {
    const rule = db.staffingRules.find((entry) => entry.shift_type === type);
    if (rule) { rule.min_count = Number(args[key]); rule.max_count = Number(args[key]); }
  }
}db.settings.set('shiftplan.dbs_enabled', 'true');
if (args.inexp) db.settings.set('shiftplan.inexperienced_employees', JSON.stringify(employees.filter((employee) => !dbsPool.some((entry) => entry.employee.name === employee.name) && employee.preferred.length === 0).slice(0, Number(args.inexp)).map((employee) => employee.name)));
if (args.gap) db.settings.set('shiftplan.min_weekend_gap_weeks', String(args.gap));
if (args.colo !== 'off') {
  db.settings.set('shiftplan.colo_enabled', 'true');
  db.settings.set('shiftplan.colo_pool', JSON.stringify(coloPool));
}
for (const [key, value] of Object.entries(args)) {
  if (key.startsWith('rot:')) db.rotation[key.slice(4)] = Number.isNaN(Number(value)) ? value : Number(value);
  if (key.startsWith('plan:')) db.planConfig[key.slice(5)] = Number.isNaN(Number(value)) ? value : Number(value);
  if (key.startsWith('set:')) db.settings.set(key.slice(4), String(value));
}

// Vacation for a share of the employees, different in every month.
function addAbsences(year, month) {
  const days = new Date(year, month, 0).getDate();
  db.absences = [];
  if (args.absences === 'off') return;
  for (const employee of employees) {
    if (!rng.chance(0.2)) continue;
    const startDay = rng.int(1, Math.max(1, days - 9));
    const length = rng.int(3, 9);
    const pad = (n) => String(n).padStart(2, '0');
    db.absences.push({
      employee_name: employee.name, employee_id: null, type: 'VACATION', source: 'self',
      start_date: `${year}-${pad(month)}-${pad(startDay)}`, end_date: `${year}-${pad(month)}-${pad(Math.min(days, startDay + length - 1))}`,
    });
  }
}

/* ---------- audit ---------- */

const typeByCode = new Map(db.definitions.map((definition) => [definition.code, definition.shift_type]));
const seriesByCode = new Map(db.definitions.map((definition) => [definition.code, definition.series_days]));
const baseCode = (code) => ({ E1SA: 'E1', E1WE: 'E1', E2SA: 'E2', E2WE: 'E2', L1WE: 'L1', NK: 'N', NS: 'N' }[code] || code);
const dbsByName = new Map(dbsPool.map((entry) => [entry.employee.name, entry]));

function classify(employee) {
  if (dbsByName.has(employee.name)) return 'DBS';
  if (employee.preferred.includes('N')) return 'Nacht-Wunsch';
  if (employee.preferred.length === 1) return employee.preferred[0].startsWith('E') ? 'Früh-Wunsch' : 'Spät-Wunsch';
  if (employee.preferred.length > 1) return 'Zwei-Wünsche';
  if (employee.blocked.length) return 'Sperrtage';
  return employee.unwanted.length ? 'Unerwünscht' : 'Flexibel';
}

function audit(result, year, month, carryIn) {
  const numDays = new Date(year, month, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const violations = [];
  const metrics = { month: `${year}-${pad(month)}`, assignments: result.shifts.length };
  const byEmployee = new Map(employees.map((employee) => [employee.name, new Map()]));
  for (const shift of result.shifts) byEmployee.get(shift.employee_name)?.set(Number(shift.day), shift.shift_code);

  let typeChanges = 0;
  let weekTypes = 0;
  let isolated = 0;
  const isolatedList = [];
  let blocks = 0;
  let hoursShort = 0;
  let employeesBelowTarget = 0;
  let worstShortfall = 0;
  const shortfalls = [];
  const sevenOutsideDbs = [];
  const wishWorkDays = { preferredOnly: 0, total: 0 };
  const perEmployee = [];

  for (const employee of employees) {
    const days = byEmployee.get(employee.name);
    const absent = (day) => db.absences.some((absence) => absence.employee_name === employee.name
      && `${year}-${pad(month)}-${pad(day)}` >= absence.start_date && `${year}-${pad(month)}-${pad(day)}` <= absence.end_date);
    let nights = 0;
    const weekendKeys = new Set();
    let streak = 0;
    let longestStreak = 0;
    for (let day = 1; day <= numDays; day++) {
      const code = days.get(day);
      const dow = new Date(year, month - 1, day).getDay();
      if (code) {
        streak += 1;
        longestStreak = Math.max(longestStreak, streak);
        const base = baseCode(code);
        const record = (reason) => violations.push({ employee: employee.name, day, code, reason });
        if (code !== 'DBS') {
          if (employee.unwanted.includes(base)) record('Unerwünschte Schicht');
          if (employee.preferred.length && !employee.preferred.includes(base)) record('Nicht in Wunschschichten');
        }
        if (employee.blocked.includes(dow)) record('Gesperrter Wochentag');
        if (absent(day)) record('Urlaub');
        if (year === 2027 && month === 1 && day === 1 && employee.holidays.includes('Neujahr')) record('Feiertagswunsch');
        if (base === 'N') nights += 1;
        if (dow === 0 || dow === 6) weekendKeys.add(dow === 0 ? day - 1 : day);
        wishWorkDays.total += 1;
        if (employee.preferred.includes(base)) wishWorkDays.preferredOnly += 1;
        const isolatedDay = !days.get(day - 1) && !days.get(day + 1);
        if (isolatedDay) { isolated += 1; isolatedList.push(`${employee.name.slice(0, 12)}[${classify(employee)}] ${pad(month)}-${pad(day)} ${code}`); }
        if (!days.get(day - 1)) blocks += 1;
        const dbs = dbsByName.get(employee.name);
        if (dbs && code !== 'DBS' && ((seriesByCode.get(code) || 1) >= 6 || /(SA|WE)$/.test(code))) {
          sevenOutsideDbs.push(`${employee.name} Tag ${day} ${code}`);
        }
        if (dbs && code !== 'DBS') {
          const type = typeByCode.get(code);
          const allowed = dbs.outside.length ? dbs.outside : ['EARLY', 'LATE'];
          const token = type === 'early' ? 'EARLY' : type === 'late' ? 'LATE' : 'NIGHT';
          if (!allowed.includes(token)) violations.push({ employee: employee.name, day, code, reason: `DBS-Mitarbeiter außerhalb DBS: ${token} nicht erlaubt` });
        }
      } else {
        streak = 0;
      }
    }
    if (employee.maxNights !== null && nights > employee.maxNights) violations.push({ employee: employee.name, reason: `Nachtlimit ${nights}/${employee.maxNights}` });
    if (employee.maxWeekends !== null && employee.maxWeekends > 0 && weekendKeys.size > employee.maxWeekends) violations.push({ employee: employee.name, reason: `Wochenendlimit ${weekendKeys.size}/${employee.maxWeekends}` });
    if (longestStreak > 7) violations.push({ employee: employee.name, reason: `${longestStreak} Arbeitstage am Stück` });
    const fairness = result.fairness[employee.name];
    const actual = fairness?.actualHours ?? 0;
    const target = fairness?.targetHours ?? 0;
    if (actual + 0.01 < target) {
      employeesBelowTarget += 1;
      hoursShort += target - actual;
      worstShortfall = Math.max(worstShortfall, target - actual);
      shortfalls.push({ employee: employee.name, actual, target, missing: Number((target - actual).toFixed(1)) });
    }
    {
      let previousType = null;
      for (let week = 0; week <= Math.floor((numDays - 1 + ((new Date(year, month - 1, 1).getDay() + 6) % 7)) / 7); week++) {
        const counts = {};
        for (let d = 1; d <= numDays; d++) {
          if (Math.floor((d - 1 + ((new Date(year, month - 1, 1).getDay() + 6) % 7)) / 7) !== week) continue;
          const type = typeByCode.get(days.get(d));
          if (type) counts[type] = (counts[type] || 0) + 1;
        }
        const top = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
        if (!top || top[1] < 3) continue;
        weekTypes += 1;
        if (previousType && previousType !== top[0]) typeChanges += 1;
        previousType = top[0];
      }
    }
    perEmployee.push({ employee: employee.name, profile: classify(employee), shifts: days.size, actual, target, nights, weekends: weekendKeys.size, longestStreak });
  }

  const colleagueStats = { wishes: 0, shared: 0, weeks: 0, alignedWeeks: 0 };
  const weekOf = (day) => Math.floor((day - 1 + ((new Date(year, month - 1, 1).getDay() + 6) % 7)) / 7);
  const majorityType = (days, week, startDay, endDay) => {
    const counts = {};
    for (let d = startDay; d <= endDay; d++) { if (weekOf(d) !== week) continue; const type = typeByCode.get(days.get(d)); if (type) counts[type] = (counts[type] || 0) + 1; }
    const entries = Object.entries(counts).sort((x, y) => y[1] - x[1]);
    return entries.length && entries[0][1] >= 3 ? entries[0][0] : null;
  };
  for (const employee of employees) {
    for (const colleagueId of employee.colleagues) {
      const colleague = employees.find((other) => other.userId === colleagueId);
      if (!colleague) continue;
      const own = byEmployee.get(employee.name);
      const theirs = byEmployee.get(colleague.name);
      let ownDays = 0;
      let sharedDays = 0;
      for (const [day, code] of own) {
        ownDays += 1;
        const otherCode = theirs.get(day);
        if (otherCode && typeByCode.get(otherCode) === typeByCode.get(code)) sharedDays += 1;
      }
      for (let week = 0; week <= weekOf(numDays); week++) {
        const ownType = majorityType(own, week, 1, numDays);
        const otherType = majorityType(theirs, week, 1, numDays);
        if (ownType && otherType) { colleagueStats.weeks += 1; if (ownType === otherType) colleagueStats.alignedWeeks += 1; }
      }
      colleagueStats.wishes += 1;
      if (ownDays > 0) colleagueStats.shared += sharedDays / ownDays;
    }
  }

  const perDayType = {};
  for (let day = 1; day <= numDays; day++) {
    for (const type of ['early', 'late', 'night']) perDayType[`${day}:${type}`] = 0;
  }
  for (const shift of result.shifts) {
    const type = typeByCode.get(shift.shift_code);
    if (type) perDayType[`${shift.day}:${type}`] += 1;
  }
  const staffing = { earlyMin: Infinity, earlyMax: 0, lateMin: Infinity, lateMax: 0, nightMin: Infinity, nightMax: 0 };
  for (let day = 1; day <= numDays; day++) {
    for (const type of ['early', 'late', 'night']) {
      const value = perDayType[`${day}:${type}`];
      staffing[`${type}Min`] = Math.min(staffing[`${type}Min`], value);
      staffing[`${type}Max`] = Math.max(staffing[`${type}Max`], value);
    }
  }
  const conflicts = result.conflicts.reduce((map, conflict) => ({ ...map, [conflict.type]: (map[conflict.type] || 0) + 1 }), {});
  const doubleBooked = new Set();
  const seen = new Set();
  for (const shift of result.shifts) {
    const key = `${shift.employee_name}|${shift.day}`;
    if (seen.has(key)) doubleBooked.add(key);
    seen.add(key);
  }
  if (doubleBooked.size) violations.push({ reason: `Doppelte Tageszuweisung: ${[...doubleBooked].join(', ')}` });
  if (sevenOutsideDbs.length) for (const entry of sevenOutsideDbs) violations.push({ reason: `7-Tage-Block außerhalb DBS: ${entry}` });

  return {
    ...metrics,
    employeesBelowTarget,
    hoursShort: Number(hoursShort.toFixed(1)),
    worstShortfall: Number(worstShortfall.toFixed(1)),
    typeChangeShare: weekTypes ? Number((typeChanges / weekTypes).toFixed(2)) : 0,
    isolatedWorkDays: isolated,
    isolatedList,
    workBlocks: blocks,
    avgBlockLength: blocks ? Number((wishWorkDays.total / blocks).toFixed(2)) : 0,
    preferredShare: wishWorkDays.total ? Number((wishWorkDays.preferredOnly / wishWorkDays.total).toFixed(2)) : 0,
    colleagueWeekAlign: colleagueStats.weeks ? Number((colleagueStats.alignedWeeks / colleagueStats.weeks).toFixed(2)) : null,
    colleagueShare: colleagueStats.wishes ? Number((colleagueStats.shared / colleagueStats.wishes).toFixed(2)) : null,
    staffing,
    conflicts,
    violations,
    shortfalls,
    perEmployee,
    coloSummary: result.planReport.colo || null,
    byProfile: Object.fromEntries([...new Set(perEmployee.map((entry) => entry.profile))].map((profile) => { const rows = perEmployee.filter((entry) => entry.profile === profile); return [profile, { n: rows.length, avgMissing: Number((rows.reduce((sum, row) => sum + Math.max(row.target - row.actual, 0), 0) / rows.length).toFixed(1)) }]; })),
    conflictMessages: result.conflicts.map((conflict) => conflict.message),
    shiftsRaw: result.shifts,
    reasonsRaw: args.explain ? Object.fromEntries(Object.entries(result.explanations).map(([key, value]) => [key, (value.reasons || []).slice(0, 3)])) : undefined,
  };
}

/* ---------- structure audit: holes inside blocks, weekend frequency, pair rule ---------- */

const absenceDayKey = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const SATURDAY_KEYS_SEEN = new Map(); // employee -> Set of Saturday timestamps worked (chained over months)

function auditStructure(result, year, month) {
  const numDays = new Date(year, month, 0).getDate();
  const cells = new Map(); // name -> Map(day -> code)
  for (const shift of result.shifts) {
    if (!cells.has(shift.employee_name)) cells.set(shift.employee_name, new Map());
    cells.get(shift.employee_name).set(Number(shift.day), shift.shift_code);
  }
  const holes = [];
  const weekendsPerEmployee = [];
  const tooFrequentWeekends = [];
  for (const employee of employees) {
    const own = cells.get(employee.name) || new Map();
    const absent = (day) => db.absences.some((absence) => absence.employee_name === employee.name
      && absenceDayKey(year, month, day) >= absence.start_date && absenceDayKey(year, month, day) <= absence.end_date);
    for (let day = 2; day < numDays; day++) {
      if (own.has(day) || !own.has(day - 1) || !own.has(day + 1) || absent(day)) continue;
      const holeDow = new Date(year, month - 1, day).getDay();
      if (holeDow === 1 || holeDow === 0 || employee.blocked.includes(holeDow)) continue; // only a free day inside a Mon-Sun week counts (blocked days are wishes)
      const before = typeByCode.get(own.get(day - 1));
      const after = typeByCode.get(own.get(day + 1));
      if (before && before === after && before !== 'special') holes.push(`${employee.name} ${month}/${day} ${own.get(day - 1)}-frei-${own.get(day + 1)}`);
    }
    // a weekend counts as worked when Saturday OR Sunday is worked (a single Saturday is already a weekend)
    const worked = SATURDAY_KEYS_SEEN.get(employee.name) || new Set();
    let count = 0;
    for (let day = 1; day <= numDays; day++) {
      const dow = new Date(year, month - 1, day).getDay();
      if ((dow === 6 || dow === 0) && own.has(day)) {
        const saturday = new Date(year, month - 1, dow === 6 ? day : day - 1).getTime();
        if (!worked.has(saturday)) { worked.add(saturday); count += 1; }
      }
    }
    SATURDAY_KEYS_SEEN.set(employee.name, worked);
    weekendsPerEmployee.push(count);
    const sorted = [...worked].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index++) {
      const weeks = Math.round((sorted[index] - sorted[index - 1]) / (7 * 86400000));
      if (weeks <= 1 && new Date(sorted[index]).getMonth() === month - 1) tooFrequentWeekends.push(`${employee.name} ${month}`);
    }
  }
  const pairViolations = [];
  const first = cells.get('Patrick Brode') || new Map();
  const second = cells.get('Godfrey Emanuel') || new Map();
  for (let day = 1; day <= numDays; day++) {
    if (!first.has(day) || !second.has(day)) continue;
    const dow = new Date(year, month - 1, day).getDay();
    const night = typeByCode.get(first.get(day)) === 'night' && typeByCode.get(second.get(day)) === 'night';
    if (night || dow === 0 || dow === 6) pairViolations.push(`${month}/${day} ${first.get(day)}+${second.get(day)}`);
  }
  // night coverage: how many days of the month have fewer night workers than asked (--night N, default 4)
  const nightWanted = Number(args.night || 4);
  const nightShort = [];
  for (let day = 1; day <= numDays; day++) {
    const count = [...cells.values()].filter((own) => typeByCode.get(own.get(day)) === 'night').length;
    if (count > 0 && count < nightWanted) nightShort.push(`${month}/${day}:${count}`);
  }
  // weekend codes (SA/WE) on a run of working days without any weekend day
  let weCodesWithoutWeekend = 0;
  for (const own of cells.values()) {
    const days = [...own.keys()].sort((x, y) => x - y);
    for (let i = 0; i < days.length;) {
      let j = i;
      while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
      const run = days.slice(i, j + 1);
      i = j + 1;
      if (run[0] === 1 || run.at(-1) === numDays) continue;
      if (run.some((d) => [0, 6].includes(new Date(year, month - 1, d).getDay()))) continue;
      weCodesWithoutWeekend += run.filter((d) => /(SA|WE)$/.test(own.get(d))).length;
    }
  }
  const histogram = weekendsPerEmployee.reduce((map, value) => ({ ...map, [value]: (map[value] || 0) + 1 }), {});
  return { holes: holes.length, holeList: holes, weekendHistogram: histogram, weekendsInConsecutiveWeeks: tooFrequentWeekends.length, pairViolations, nightShort, weCodesWithoutWeekend };
}

/* ---------- run ---------- */

const report = { seed, mutualGroups, employees: employeeCount, months: [], dbsPool: dbsPool.map((entry) => ({ name: entry.employee.name, outside: entry.outside })), coloPool };
let year = startYear;
let month = startMonth;
// The saved drafts of earlier months feed the next month (hour balance, shift continuity) like in the real app.
let chainedCarry = null;
for (let index = 0; index < monthCount; index++) {
  addAbsences(year, month);
  const numDays = new Date(year, month, 0).getDate();
  const result = await generateShiftPlan(year, month, numDays, 'simulation', { varietySeed: Number(args.vseed ?? 0), carryState: args.nochain ? null : chainedCarry });
  chainedCarry = result.carryState;
  if (process.env.DEBUG_DAY) {
    const debug = JSON.parse(process.env.DEBUG_DAY);
    if (debug.year === year && debug.mon === month) {
      for (const shift of result.shifts.filter((entry) => Number(entry.day) === debug.day && typeByCode.get(entry.shift_code) === debug.type)) {
        console.log('[DEBUG_DAY]', shift.employee_name, shift.shift_code, JSON.stringify(result.explanations[`${shift.employee_name}_${shift.day}`]?.reasons?.slice(0, 3)));
      }
    }
  }
  report.months.push(audit(result, year, month));
  report.months.at(-1).structure = auditStructure(result, year, month);
  report.months.at(-1).structure.inexperienced = result.planReport.inexperienced;
  const label = formatShiftMonthLabel(year, month);
  db.shiftHistory.set(label, result.shifts.map((shift) => ({ employee_name: shift.employee_name, day: shift.day, shift_code: shift.shift_code })));
  month += 1;
  if (month > 12) { month = 1; year += 1; }
}

console.warn = originalConsole.warn;
const totalViolations = report.months.reduce((sum, entry) => sum + entry.violations.length, 0);
report.totalViolations = totalViolations;
if (args.json && typeof args.json === 'string') fs.writeFileSync(args.json, JSON.stringify(report, null, 2));
if (!args.quiet) {
  for (const entry of report.months) {
    const { violations, shortfalls, perEmployee, conflictMessages, shiftsRaw, byProfile, isolatedList, ...summary } = entry;
    if (args.isolated) originalConsole.log(`  Einzeltage:\n    ${isolatedList.join('\n    ')}`);
    originalConsole.log('  Profile (Ø fehlende Stunden):', JSON.stringify(byProfile));
    originalConsole.log(JSON.stringify(summary));
    const grouped = violations.reduce((map, violation) => ({ ...map, [violation.reason.replace(/\d+/g, '#')]: (map[violation.reason.replace(/\d+/g, '#')] || 0) + 1 }), {});
    originalConsole.log('  Verstöße:', JSON.stringify(grouped));
    if (args.grid) {
      const days = Number(entry.month.slice(5)) ? new Date(Number(entry.month.slice(0, 4)), Number(entry.month.slice(5)), 0).getDate() : 31;
      const header = Array.from({ length: days }, (_, i) => String(i + 1).padStart(4)).join('');
      originalConsole.log('  ' + ''.padEnd(24) + header);
      for (const employee of employees) {
        const own = new Map(entry.shiftsRaw.filter((shift) => shift.employee_name === employee.name).map((shift) => [Number(shift.day), shift.shift_code]));
        const wish = (employee.preferred.join('/') || '-') + ' !' + (employee.unwanted.join('/') || '-') + (employee.blocked.length ? ' x' + employee.blocked.join('') : '');
        const row = Array.from({ length: days }, (_, i) => (own.get(i + 1) || '.').padStart(4)).join('');
        const perf = entry.perEmployee.find((p) => p.employee === employee.name);
        originalConsole.log('  ' + (employee.name.slice(0, 14) + ' ' + wish).padEnd(24).slice(0, 24) + row + '  ' + perf.actual + '/' + perf.target + (dbsByName.has(employee.name) ? ' DBS' : ''));
      }
    }
    if (args.verbose) {
      originalConsole.log('  Unter Soll:', JSON.stringify(shortfalls));
      originalConsole.log(`  Konflikte:\n    ${conflictMessages.filter((m) => !/Zielzeit/.test(m)).slice(0, 40).join('\n    ')}`);
      originalConsole.log('  Beispiele:', JSON.stringify(violations.slice(0, 12)));
    }
  }
}
originalConsole.log(`Struktur: Lücken im Block=${report.months.map((entry) => entry.structure.holes).join('/')} | Wochenenden direkt hintereinander=${report.months.map((entry) => entry.structure.weekendsInConsecutiveWeeks).join('/')} | Paar-Verstöße=${report.months.map((entry) => entry.structure.pairViolations.length).join('/')} | WE-Code ohne Wochenende=${report.months.map((entry) => entry.structure.weCodesWithoutWeekend).join('/')} | Nacht<Soll=${report.months.map((entry) => entry.structure.nightShort.length).join('/')} | Wochenenden pro Person ${JSON.stringify(report.months.map((entry) => entry.structure.weekendHistogram))}`);
if (args.inexp) originalConsole.log('  Wenig Erfahrung: ' + JSON.stringify(report.months.map((entry) => entry.structure.inexperienced)));
if (args.nights) originalConsole.log('  Nacht zu klein: ' + report.months.flatMap((entry) => entry.structure.nightShort).join(' '));
if (args.holes) originalConsole.log('  Lücken:\n    ' + report.months.flatMap((entry) => entry.structure.holeList).join('\n    '));
const tolerance = (predicate) => report.months.map((entry) => entry.perEmployee.filter(predicate).length).join('/');
originalConsole.log(`Abweichung > 10h unter Soll: ${tolerance((row) => row.target - row.actual > 10)}  | > 10h über Soll: ${tolerance((row) => row.actual - row.target > 10)}`);
{
  // Year balance: cumulative actual - official target per employee (goal: within +-20h).
  const balance = new Map();
  for (const entry of report.months) for (const row of entry.perEmployee) balance.set(row.employee, (balance.get(row.employee) || 0) + (row.actual - row.target));
  const values = [...balance.values()].map((value) => Number(value.toFixed(1))).sort((x, y) => x - y);
  report.yearBalance = Object.fromEntries(balance);
  const outside = values.filter((value) => Math.abs(value) > 20).length;
  originalConsole.log(`Jahressaldo (Ist-Soll kumuliert; Ziel >= -20): min=${values[0]} max=${values.at(-1)} median=${values[Math.floor(values.length / 2)]} unter -20h: ${values.filter((value) => value < -20).length} über +20h: ${values.filter((value) => value > 20).length}/${values.length}`);
  if (args.balances) originalConsole.log('  ' + [...balance.entries()].map(([name, value]) => `${name}:${value.toFixed(1)}`).join('  '));
}
originalConsole.log(`seed=${seed} Verstöße gesamt=${totalViolations} Mitarbeiter unter Soll=${report.months.map((entry) => entry.employeesBelowTarget).join('/')} isolierte Tage=${report.months.map((entry) => entry.isolatedWorkDays).join('/')}`);
process.exit(0);
