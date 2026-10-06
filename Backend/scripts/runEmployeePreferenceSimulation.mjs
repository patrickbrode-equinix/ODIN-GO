#!/usr/bin/env node
// Runs the real generator against a dedicated local PostgreSQL test database.
// No production/local application database or credentials are modified.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '55439' || process.env.DB_NAME !== 'odin_generator_test' || process.env.DATABASE_URL) {
  throw new Error('Only the dedicated local odin_generator_test database on port 55439 is permitted.');
}
const { default: pool } = await import('../db.js');
const { runMigrations } = await import('../db/migrations/runner.js');
const { ensureShiftplanSchema } = await import('../lib/ensureShiftplanSchema.js');
const { generateShiftPlan } = await import('../routes/shiftplanControl.js');
const { generatePeriodDrafts } = await import('../services/planningPeriodDrafts.js');
const { formatShiftMonthLabel } = await import('../lib/shiftplanMonth.js');
const outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../reports');
const runName = process.argv[2] || 'current';
if (!/^[a-z0-9-]+$/.test(runName)) throw new Error('Invalid run name');
const months = ['2027-01', '2027-02', '2027-03'];

function profile(index) {
  const common = { preferred_shifts: [], unwanted_shifts: [], preferred_days: [], blocked_days: [], preferred_holidays: [], max_nights_per_month: 7, max_weekends_per_month: 2, night_model: 'SEVEN_DAY', monthly_preferences: {} };
  if (index < 8) return { ...common, group: 'Frühdienst', preferred_shifts: [index % 2 ? 'E2' : 'E1'], unwanted_shifts: ['N'], blocked_days: index % 3 === 0 ? [6, 0] : [3], max_nights_per_month: 0, max_weekends_per_month: index % 3 === 0 ? 0 : 1 };
  if (index < 16) return { ...common, group: 'Spätdienst', preferred_shifts: [index % 2 ? 'L2' : 'L1'], unwanted_shifts: ['N'], blocked_days: index % 2 ? [0] : [6, 0], max_nights_per_month: 0, max_weekends_per_month: index % 2 ? 1 : 0 };
  if (index < 28) return { ...common, group: 'Nachtdienst', preferred_shifts: ['N'], night_model: index % 2 ? 'SHORT' : 'SEVEN_DAY', max_nights_per_month: index % 3 ? 7 : 3, blocked_days: index % 4 === 0 ? [0] : [], preferred_holidays: index % 3 === 0 ? ['Neujahr'] : [] };
  if (index < 32) return { ...common, group: 'Früh/Spät gemischt', preferred_shifts: ['E2', 'L2'], unwanted_shifts: ['N'], preferred_days: [1, 2, 3, 4, 5], blocked_days: [6, 0], max_nights_per_month: 0, max_weekends_per_month: 0 };
  if (index < 36) return { ...common, group: 'Monatlicher Wechsel', preferred_shifts: ['E1'], unwanted_shifts: ['N'], monthly_preferences: { '2027-02': { preferred_shifts: ['L1'], unwanted_shifts: ['E2'] }, '2027-03': { preferred_shifts: ['E2', 'L2'], unwanted_shifts: ['L1'] } }, max_nights_per_month: 0, max_weekends_per_month: 1 };
  return { ...common, group: 'Flexibel mit Limits', unwanted_shifts: index % 2 ? ['L2'] : [], preferred_holidays: ['Neujahr'], max_nights_per_month: index % 2 ? 3 : 0, max_weekends_per_month: index % 2 ? 1 : 0, blocked_days: index % 2 ? [2] : [0] };
}
const employees = Array.from({ length: 40 }, (_, index) => ({ name: `Sim${String(index + 1).padStart(2, '0')} Wunschtest`, index, ...profile(index) }));
const absences = [
  { name: employees[0].name, start: '2027-01-08', end: '2027-01-17' },
  { name: employees[8].name, start: '2027-01-25', end: '2027-02-05' },
  { name: employees[20].name, start: '2027-02-10', end: '2027-02-21' },
  { name: employees[32].name, start: '2027-03-08', end: '2027-03-19' },
];

// Independent audit: do not reuse the generator's preference matching helpers.
function preferenceCode(code) {
  const value = String(code).toUpperCase();
  if (value === 'E1SA' || value === 'E1WE') return 'E1';
  if (value === 'L1WE') return 'L1';
  if (value === 'NK') return 'N';
  return value;
}
function audit(result, month) {
  const [year, mon] = month.split('-').map(Number);
  const violations = [];
  const details = employees.map(employee => {
    const monthly = employee.monthly_preferences[month] || {};
    const preferred = monthly.preferred_shifts || employee.preferred_shifts;
    const unwanted = [...employee.unwanted_shifts, ...(monthly.unwanted_shifts || [])];
    const shifts = result.shifts.filter(shift => shift.employee_name === employee.name && !['ABW', 'FS', 'S', 'SEMINAR'].includes(shift.shift_code));
    const nightDays = [];
    const weekends = new Set();
    let preferredMatches = 0;
    for (const shift of shifts) {
      const day = Number(shift.day);
      const date = new Date(Date.UTC(year, mon - 1, day));
      const dateKey = date.toISOString().slice(0, 10);
      const dow = date.getUTCDay();
      const code = preferenceCode(shift.shift_code);
      const record = reason => violations.push({ employee: employee.name, month, day, code: shift.shift_code, reason });
      if (unwanted.includes(code)) record('Unerwünschte Schicht');
      if (preferred.length && !preferred.includes(code)) record('Außerhalb der bevorzugten Schichten');
      else if (preferred.length) preferredMatches += 1;
      if (employee.blocked_days.includes(dow)) record('Gesperrter Wochentag');
      if (absences.some(absence => absence.name === employee.name && dateKey >= absence.start && dateKey <= absence.end)) record('Urlaub');
      if (dateKey === '2027-01-01' && employee.preferred_holidays.includes('Neujahr')) record('Gewünschter freier Feiertag');
      if (code === 'N') nightDays.push(day);
      if (dow === 0 || dow === 6) {
        if (dow === 0) date.setUTCDate(date.getUTCDate() - 1);
        weekends.add(date.toISOString().slice(0, 10));
      }
    }
    if (nightDays.length > employee.max_nights_per_month) violations.push({ employee: employee.name, month, reason: `Nachtlimit ${nightDays.length}/${employee.max_nights_per_month}` });
    if (weekends.size > employee.max_weekends_per_month) violations.push({ employee: employee.name, month, reason: `Wochenendlimit ${weekends.size}/${employee.max_weekends_per_month}` });
    let streak = 0;
    let longestNightRun = 0;
    for (let day = 1; day <= new Date(year, mon, 0).getDate(); day++) { streak = nightDays.includes(day) ? streak + 1 : 0; longestNightRun = Math.max(streak, longestNightRun); }
    if (employee.night_model === 'SHORT' && longestNightRun > 3) violations.push({ employee: employee.name, month, reason: `SHORT-Nachtblock ${longestNightRun}/3` });
    return { employee: employee.name, group: employee.group, month, preferred, unwanted, blockedDays: employee.blocked_days, shifts: shifts.length, preferredMatches, nights: nightDays.length, weekendBlocks: weekends.size, longestNightRun, hours: result.fairness[employee.name]?.actualHours || 0, target: result.fairness[employee.name]?.targetHours || 0, assignments: shifts.map(shift => `${shift.day}:${shift.shift_code}`).join(' ') };
  });
  const duplicateDays = result.shifts.map(shift => `${shift.employee_name}|${shift.day}`);
  if (new Set(duplicateDays).size !== duplicateDays.length) violations.push({ month, reason: 'Doppelte Tageszuweisung' });
  if (result.planReport.totalEmployees !== 40) violations.push({ month, reason: `Falsche Mitarbeiterzahl: ${result.planReport.totalEmployees}` });
  if (!result.shifts.length) violations.push({ month, reason: 'Leerer Plan' });
  for (const conflict of result.conflicts) {
    for (const suggestion of conflict.suggestions || []) {
      const employee = employees.find(entry => entry.name === suggestion.employee);
      if (!employee) { violations.push({ month, reason: 'Unbekannter Ersatzkandidat' }); continue; }
      const monthly = employee.monthly_preferences[month] || {};
      const preferred = monthly.preferred_shifts || employee.preferred_shifts;
      const unwanted = [...employee.unwanted_shifts, ...(monthly.unwanted_shifts || [])];
      const code = preferenceCode(suggestion.shiftCode);
      const record = reason => violations.push({ employee: employee.name, month, reason: `Ersatzvorschlag: ${reason}` });
      if (unwanted.includes(code) || (preferred.length && !preferred.includes(code))) record('Schichtwunsch verletzt');
      if (code === 'N' && employee.night_model === 'SHORT' && suggestion.coverageDays.length > 3) record('SHORT-Nachtblock zu lang');
      for (const day of suggestion.coverageDays || []) {
        const date = new Date(Date.UTC(year, mon - 1, day));
        const dateKey = date.toISOString().slice(0, 10);
        if (employee.blocked_days.includes(date.getUTCDay())) record('Gesperrter Wochentag');
        if (absences.some(absence => absence.name === employee.name && dateKey >= absence.start && dateKey <= absence.end)) record('Urlaub');
        if (dateKey === '2027-01-01' && employee.preferred_holidays.includes('Neujahr')) record('Gewünschter freier Feiertag');
      }
    }
  }
  const conflicts = result.conflicts.reduce((map, conflict) => ({ ...map, [conflict.type]: (map[conflict.type] || 0) + 1 }), {});
  return { month, assignments: result.shifts.length, employeesAssigned: details.filter(row => row.shifts > 0).length, violations, details, conflicts };
}

try {
  await runMigrations();
  await ensureShiftplanSchema();
  // This database exists only for this simulation. Reset just its own fixture rows.
  await pool.query('TRUNCATE employee_preferences, manual_shiftplan_employees, absences, shiftplan_drafts, shifts, users RESTART IDENTITY CASCADE');
  for (const employee of employees) {
    const { rows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, login_name, password_hash, approved, user_group, department)
       VALUES ($1, 'Wunschtest', $2, $3, 'SIMULATION_ONLY', TRUE, 'c-ops', 'c-ops') RETURNING id`,
      [employee.name.split(' ')[0], `sim${employee.index + 1}@simulation.invalid`, `sim${employee.index + 1}`]);
    employee.id = rows[0].id;
    await pool.query(
      `INSERT INTO employee_preferences (user_id, preferred_shifts, unwanted_shifts, preferred_days, blocked_days, preferred_holidays, max_nights_per_month, max_weekends_per_month, night_model, monthly_preferences)
       VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10::jsonb)`,
      [employee.id, JSON.stringify(employee.preferred_shifts), JSON.stringify(employee.unwanted_shifts), JSON.stringify(employee.preferred_days), JSON.stringify(employee.blocked_days), JSON.stringify(employee.preferred_holidays), employee.max_nights_per_month, employee.max_weekends_per_month, employee.night_model, JSON.stringify(employee.monthly_preferences)]);
    for (const month of months) await pool.query('INSERT INTO manual_shiftplan_employees (month, employee_name, created_by) VALUES ($1,$2,$3)', [formatShiftMonthLabel(...month.split('-').map(Number)), employee.name, 'preference-simulation']);
  }
  for (const absence of absences) await pool.query("INSERT INTO absences (employee_name, start_date, end_date, type, note) VALUES ($1,$2,$3,'VACATION','Simulation')", [absence.name, absence.start, absence.end]);
  // Explicitly ask for maximum wish priority. Leave the weekday admin pool empty
  // to detect silent disregard of saved employee wishes.
  await pool.query('UPDATE shift_planning_config SET respect_employee_wishes = TRUE, soft_wishes_priority = 100 WHERE id = 1');
  await pool.query("DELETE FROM app_settings WHERE key = 'shiftplan.blocked_weekday_employee_pool'");
  const storedUsers = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (storedUsers.rows[0].count !== 40) throw new Error('Fixture must persist exactly 40 employees');
  const report = { run: runName, createdAt: new Date().toISOString(), employees: 40, profiles: structuredClone(employees), absences, monthly: [], quarter: [], stress: [] };
  for (const month of months) {
    const [year, mon] = month.split('-').map(Number);
    report.monthly.push(audit(await generateShiftPlan(year, mon, new Date(year, mon, 0).getDate(), 'preference-simulation'), month));
  }
  const receipt = await generatePeriodDrafts({ year: 2027, quarter: 1, createdBy: 'preference-simulation', ownerId: employees[0].id, pool, generateMonth: generateShiftPlan });
  const drafts = await pool.query('SELECT * FROM shiftplan_drafts WHERE id = ANY($1::int[]) ORDER BY month', [receipt.generated.map(entry => entry.draftId)]);
  for (const draft of drafts.rows) report.quarter.push(audit({ shifts: draft.shifts_json, fairness: draft.fairness, conflicts: draft.conflicts, planReport: draft.config_snapshot.planReport }, draft.month));
  // Deliberately infeasible wishes: no employee accepts late shifts. The
  // correct result is an unfilled slot, never silently assigning late work.
  await pool.query(`UPDATE employee_preferences SET preferred_shifts = '["E1"]', unwanted_shifts = '[]', monthly_preferences = '{}'`);
  employees.forEach(employee => { employee.preferred_shifts = ['E1']; employee.unwanted_shifts = []; employee.monthly_preferences = {}; });
  report.stress.push(audit(await generateShiftPlan(2027, 1, 31, 'preference-simulation-stress'), '2027-01'));
  await pool.query('UPDATE shift_planning_config SET soft_wishes_priority = 50 WHERE id = 1');
  report.stress.push({ ...audit(await generateShiftPlan(2027, 1, 31, 'preference-simulation-default-weight'), '2027-01'), scenario: 'Standardgewicht 50%; Wünsche bleiben verbindlich' });
  report.totalViolations = [...report.monthly, ...report.quarter, ...report.stress].reduce((sum, row) => sum + row.violations.length, 0);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `generator-preferences-40-${runName}.json`), JSON.stringify(report, null, 2));
  const lines = ['# Generatorprüfung mit 40 Mitarbeitern', '', `Lauf: ${runName}. Echte PostgreSQL-Testdatenbank; bestehende Datenbank unverändert.`, '',
    '40 gespeicherte Mitarbeiterprofile, drei Monatsläufe, Q1 2027 mit Monatsübergängen und ein absichtlich unlösbarer Präferenzfall bei 100% und 50% Wunschgewicht.', '',
    '| Lauf | Monat | Zuweisungen | Mitarbeiter mit Diensten | Wunschverletzungen |', '|---|---|---:|---:|---:|',
    ...['monthly', 'quarter', 'stress'].flatMap(type => report[type].map(row => `| ${type} | ${row.month} | ${row.assignments} | ${row.employeesAssigned}/40 | ${row.violations.length} |`)), '',
    `Gesamte Wunschverletzungen: **${report.totalViolations}**`, '', '## Grenzen', '',
    'Geprüft wurden Schichtauswahl einschließlich Monatswünschen, unerwünschte Schichten, gesperrte Wochentage, Urlaub, freier Neujahrstag, individuelle Nacht-/Wochenendgrenzen, kurze Nachtblöcke und Ersatzvorschläge. Kollegenwünsche und COLO-Aufgaben waren nicht Teil dieses Szenarios.', '',
    'Wünsche haben bei aktivierter Wunschberücksichtigung Vorrang vor Sollstunden und Besetzungszielen. Ruhezeiten und Abwesenheiten gelten zusätzlich. Unlösbare Wünsche führen zu offenen Diensten bzw. ausgewiesenen Sollstunden-Konflikten, nicht zur Garantie vollständiger Besetzung.', '',
    'Sim19 und Sim25 wünschen ausschließlich Nächte im Sieben-Tage-Modell, begrenzen ihre Nächte aber auf drei pro Monat. Ein vollständiger Block ist damit unmöglich; diese Mitarbeiter erhalten im regulären Szenario keine Dienste. Keine automatische Änderung ihres Modells oder ihrer Schichtwünsche.', '',
    ...['monthly', 'quarter', 'stress'].flatMap(type => report[type].flatMap(row => [
      `## ${type}: ${row.month}`, '', ...(row.scenario ? [row.scenario, ''] : []), `Konflikte: ${JSON.stringify(row.conflicts)}`, '',
      '| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |',
      '|---|---|---|---|---:|---:|---:|---:|---|',
      ...row.details.map(detail => `| ${detail.employee} | ${detail.group} | ${detail.preferred.join(', ') || 'flexibel'} | ${detail.blockedDays.join(', ') || '–'} | ${detail.shifts} | ${detail.preferredMatches} | ${detail.nights} | ${detail.weekendBlocks} | ${detail.hours}/${detail.target} |`), '',
      ...row.violations.slice(0, 80).map(violation => `- ${violation.employee || ''}, Tag ${violation.day || '–'}, ${violation.code || ''}: ${violation.reason}`), '',
    ]))];
  await fs.writeFile(path.join(outputDir, `generator-preferences-40-${runName}.md`), `${lines.join('\n').trimEnd()}\n`);
  console.log(JSON.stringify({ employees: 40, totalViolations: report.totalViolations, runs: [...report.monthly, ...report.quarter, ...report.stress].map(({ month, assignments, employeesAssigned, violations }) => ({ month, assignments, employeesAssigned, violations: violations.length })) }, null, 2));
  process.exitCode = report.totalViolations ? 1 : 0;
} finally { await pool.end(); }
