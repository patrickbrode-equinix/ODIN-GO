import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';
import { formatShiftMonthLabel } from '../lib/shiftplanMonth.js';
import { createFakePlanningDb } from './helpers/fakePlanningDb.js';

const typeOf = (code) => (/^E/.test(code) ? 'early' : /^L/.test(code) ? 'late' : /^N/.test(code) ? 'night' : 'other');

function buildTeam(count, customize = () => ({})) {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const employees = Array.from({ length: count }, (_, index) => ({
    name: `Test Person ${String(index).padStart(2, '0')}`,
    userId: 700 + index,
    preferred: [], unwanted: [], blocked: [], colleagues: [],
    ...customize(index),
  }));
  db.employees = employees.map((employee) => employee.name);
  db.preferences = employees.map((employee) => ({
    user_id: employee.userId, first_name: 'Test', last_name: employee.name, provisioned_employee_name: employee.name,
    preferred_shifts: employee.preferred, unwanted_shifts: employee.unwanted, blocked_days: employee.blocked,
    preferred_holidays: [], preferred_days: [], max_nights_per_month: null, max_weekends_per_month: null,
    night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: employee.colleagues,
  }));
  db.settings.set('shiftplan.dbs_enabled', 'false');
  return { db, employees };
}

const generate = (year, month, options = {}) => generateShiftPlan(year, month, new Date(year, month, 0).getDate(), 'test', options);

test('January 2027 respects the December 2026 plan (live plan)', async () => {
  const { db, employees } = buildTeam(24);
  const worker = employees[0].name;
  // Worked the last 14 days of December: the streak must be broken at the start of January.
  db.shiftHistory.set(formatShiftMonthLabel(2026, 12), Array.from({ length: 14 }, (_, index) => ({ employee_name: worker, day: 18 + index, shift_code: 'E1' })));
  const result = await generate(2027, 1);
  assert.equal(result.planReport.previousMonthCarry.month, '2026-12');
  assert.ok(result.planReport.previousMonthCarry.employees >= 1);
  // The running E1 block (Mon-Thu 28.-31.12.) continues on Friday 01.01.; the long streak then forces free days.
  const january1 = result.shifts.find((shift) => shift.employee_name === worker && shift.day === 1);
  assert.equal(january1?.shift_code, 'E1');
  assert.ok(result.explanations[`${worker}_1`].reasons.some((reason) => reason.includes('Blockfortsetzung')));
  assert.equal(result.shifts.filter((shift) => shift.employee_name === worker && shift.day >= 2 && shift.day <= 3).length, 0);
});

test('without a live plan of the previous month its draft is used', async () => {
  const { db, employees } = buildTeam(24);
  const worker = employees[0].name;
  db.draftHistory.set('2027-02', Array.from({ length: 14 }, (_, index) => ({ employee_name: worker, day: 15 + index, shift_code: 'E1' })));
  const result = await generate(2027, 3);
  assert.equal(result.planReport.previousMonthCarry.month, '2027-02');
  assert.equal(result.planReport.previousMonthCarry.employees, 1);
  db.draftHistory.clear();
  assert.equal((await generate(2027, 3)).planReport.previousMonthCarry.employees, 0);
});

test('Thursday/Friday late overflow: only with the admin option, only for late+night wishers, marked in the report', async () => {
  const customize = (index) => (index < 6 ? { preferred: ['L1', 'L2', 'N'], unwanted: ['E1', 'E2'] } : {});
  const run = async (enabled) => {
    const { db } = buildTeam(30, customize);
    for (const rule of db.staffingRules) if (rule.shift_type === 'late') { rule.min_count = 2; rule.max_count = 3; }
    db.settings.set('shiftplan.late_overflow_thu_fri', String(enabled));
    return generate(2027, 2);
  };
  const lateByDay = (result) => {
    const counts = new Map();
    for (const shift of result.shifts) if (typeOf(shift.shift_code) === 'late') counts.set(shift.day, (counts.get(shift.day) || 0) + 1);
    return counts;
  };
  const off = await run(false);
  const on = await run(true);
  assert.equal(off.planReport.lateOverflow.length, 0);
  assert.equal(off.planReport.lateOverflowEnabled, false);
  assert.equal(on.planReport.lateOverflowEnabled, true);
  assert.equal(on.planReport.lateOverflowEligible.length, 6);

  const weekday = (day) => new Date(2027, 1, day).getDay();
  for (const [day, count] of lateByDay(off)) if ([1, 2, 3, 4, 5].includes(weekday(day))) assert.ok(count <= 3, `day ${day}: ${count} late without the option`);
  const onCounts = lateByDay(on);
  for (const [day, count] of onCounts) if ([1, 2, 3].includes(weekday(day))) assert.ok(count <= 3, `Mon-Wed day ${day} stays limited`);
  // Every marked overstaffing is a Thursday/Friday late shift of an eligible employee, and it exceeds the maximum.
  for (const entry of on.planReport.lateOverflow) {
    assert.ok([4, 5].includes(weekday(entry.day)));
    assert.ok(on.planReport.lateOverflowEligible.includes(entry.employee));
    assert.ok(onCounts.get(entry.day) > 3);
    assert.ok(on.explanations[`${entry.employee}_${entry.day}`].reasons.some((reason) => reason.includes('Überbesetzung')));
  }
  // The option is not a free pass: no unmarked day is above the maximum.
  const marked = new Map();
  for (const entry of on.planReport.lateOverflow) marked.set(entry.day, (marked.get(entry.day) || 0) + 1);
  for (const [day, count] of onCounts) if ([1, 2, 3, 4, 5].includes(weekday(day))) assert.ok(count - (marked.get(day) || 0) <= 3, `day ${day} exceeds the maximum without a mark`);
  assert.ok(!on.conflicts.some((conflict) => conflict.type === 'max_staff_reached' && conflict.shift === 'late'));
});

test('variety: a high slider gives a different plan per generation seed, the same seed stays reproducible', async () => {
  const run = async (priority, seed) => {
    const { db } = buildTeam(24);
    db.settings.set('shiftplan.variety_priority', String(priority));
    return generate(2027, 2, { varietySeed: seed });
  };
  const fingerprint = (result) => result.shifts.map((shift) => `${shift.employee_name}|${shift.day}|${shift.shift_code}`).sort().join(';');
  const a1 = await run(100, 11);
  const a2 = await run(100, 11);
  const b = await run(100, 12);
  assert.equal(fingerprint(a1), fingerprint(a2), 'same seed -> same plan');
  assert.notEqual(fingerprint(a1), fingerprint(b), 'other seed -> other plan');
  assert.equal(a1.planReport.varietySeed, 11);
  // At the default slider the seed has no effect.
  assert.equal(fingerprint(await run(60, 11)), fingerprint(await run(60, 12)));
});

test('colleagues who wish each other and share a preferred shift end up in the same shift type', async () => {
  const { db, employees } = buildTeam(30, (index) => (index < 3 ? { preferred: ['L1'] } : {}));
  // 0, 1 and 2 name each other.
  for (const [index, employee] of employees.slice(0, 3).entries()) {
    employee.colleagues = employees.slice(0, 3).filter((_, other) => other !== index).map((other) => other.userId);
  }
  db.preferences.forEach((row, index) => { if (index < 3) row.preferred_colleagues = employees[index].colleagues; });
  for (const rule of db.staffingRules) if (rule.shift_type === 'late') { rule.min_count = 4; rule.max_count = 6; }
  const result = await generate(2027, 2);
  const trio = employees.slice(0, 3).map((employee) => employee.name);
  let together = 0;
  let workedTogether = 0;
  for (let day = 1; day <= 28; day++) {
    const types = trio.map((name) => result.shifts.find((shift) => shift.employee_name === name && shift.day === day)).filter(Boolean).map((shift) => typeOf(shift.shift_code));
    if (types.length >= 2) { workedTogether += 1; if (new Set(types).size === 1) together += 1; }
  }
  assert.ok(workedTogether > 0);
  assert.ok(together / workedTogether >= 0.8, `only ${together}/${workedTogether} days in the same shift type`);
});
