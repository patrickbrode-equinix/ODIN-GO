import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';
import { formatShiftMonthLabel } from '../lib/shiftplanMonth.js';
import { createFakePlanningDb } from './helpers/fakePlanningDb.js';

const typeOf = (code) => (/^N/.test(code) ? 'night' : /^E/.test(code) ? 'early' : /^L/.test(code) ? 'late' : 'other');

function buildTeam(count) {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const names = Array.from({ length: count }, (_, index) => `Test Person ${String(index).padStart(2, '0')}`);
  db.employees = names;
  db.preferences = names.map((name, index) => ({
    user_id: 900 + index, first_name: 'Test', last_name: name, provisioned_employee_name: name,
    preferred_shifts: [], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [],
    max_nights_per_month: null, max_weekends_per_month: null, night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: [],
  }));
  db.settings.set('shiftplan.dbs_enabled', 'false');
  return { db, names };
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const cellsOf = (result, name) => new Map(result.shifts.filter((shift) => shift.employee_name === name).map((shift) => [Number(shift.day), shift.shift_code]));

test('December 2026 (saved plan) continues cleanly in January 2027: nights, weekends, recovery, streaks', async () => {
  const { db, names } = buildTeam(30);
  const [nightWorker, weekendWorker, weekendBlockWorker, streakWorker, lateWorker] = names;
  const december = [];
  const add = (name, days, code) => days.forEach((day) => december.push({ employee_name: name, day, shift_code: code }));
  // Night block Monday 28.12. - Sunday 3.1.: four nights fall into December, the block goes on in January.
  add(nightWorker, range(28, 31), 'N');
  // A single weekend worked on 26./27.12. (block 21.-27.12.): the weekend of 2./3.1. must stay free.
  add(weekendWorker, range(21, 25), 'E1');
  add(weekendWorker, [26], 'E1SA');
  // A weekend block that ended on Sunday 27.12.: free days afterwards, a new week block may start later.
  add(weekendBlockWorker, range(21, 27), 'L1WE');
  // 12 days in a row up to the 31st: the streak must be broken at the start of January.
  add(streakWorker, range(20, 31), 'E1');
  // A late block that stops on Thursday 31.12.: no early shift right after it.
  add(lateWorker, range(28, 31), 'L1');
  // Half of the team worked the weekend 26./27.12. (early weekend blocks): none of them may get the weekend 2./3.1. (spacing across the month change).
  const decemberWeekendGroup = names.slice(5, 19);
  for (const name of decemberWeekendGroup) { add(name, range(21, 24), 'E1'); add(name, [25, 26, 27], 'E1WE'); }
  december.push(...names.slice(19).flatMap((name) => range(14, 18).map((day) => ({ employee_name: name, day, shift_code: 'E1' }))));
  db.shiftHistory.set(formatShiftMonthLabel(2026, 12), december);

  const result = await generateShiftPlan(2027, 1, 31, 'test', {});
  assert.equal(result.planReport.previousMonthCarry.month, '2026-12');
  assert.ok(result.planReport.previousMonthCarry.employees >= 5);

  // 1. night block continues until Sunday 3.1., then the free days
  const night = cellsOf(result, nightWorker);
  for (const day of [1, 2, 3]) assert.equal(night.get(day), 'N', `night block continues on ${day}.1.`);
  assert.ok(!night.has(4) && !night.has(5), 'free days after the night block');

  // 2. weekend 26./27.12. worked: no early / late weekend work on 2./3.1.
  const weekend = cellsOf(result, weekendWorker);
  assert.ok(!weekend.has(2) && !weekend.has(3), `weekend of 2./3.1. stays free (${[...weekend.entries()].slice(0, 4).join(',')})`);

  for (const name of decemberWeekendGroup) {
    const cells = cellsOf(result, name);
    for (const day of [2, 3]) assert.ok(!cells.has(day) || typeOf(cells.get(day)) === 'night', `${name}: worked the weekend 26./27.12. and again ${day}.1. (${cells.get(day)})`);
  }

  // 3. weekend block until Sunday: nothing in the first days of the new year that breaks the recovery
  const weekendBlock = cellsOf(result, weekendBlockWorker);
  assert.ok(!weekendBlock.has(2) && !weekendBlock.has(3), 'no weekend work right after a weekend block');

  // 4. long streak is broken
  const streak = cellsOf(result, streakWorker);
  assert.ok(!(streak.has(1) && streak.has(2) && streak.has(3) && streak.has(4)), 'streak of 12 days is not continued for another 4 days');

  // 5. no early shift directly after a late shift (rest rule across the month change)
  const late = cellsOf(result, lateWorker);
  if (late.has(1)) assert.notEqual(typeOf(late.get(1)), 'early', 'late -> early is forbidden');

  // 6. nobody gets an early shift directly after a night across the boundary
  for (const name of names) {
    const cells = cellsOf(result, name);
    const lastDecember = december.filter((entry) => entry.employee_name === name && entry.day === 31).map((entry) => entry.shift_code)[0];
    if (lastDecember && typeOf(lastDecember) === 'night' && cells.has(1)) assert.notEqual(typeOf(cells.get(1)), 'early', `${name}: night -> early`);
  }
});

test('a single month planned from the saved plan equals the chained plan for the boundary rules', async () => {
  const { db, names } = buildTeam(30);
  const december = await generateShiftPlan(2026, 12, 31, 'test', {});
  db.shiftHistory.set(formatShiftMonthLabel(2026, 12), december.shifts.map((shift) => ({ employee_name: shift.employee_name, day: shift.day, shift_code: shift.shift_code })));
  const alone = await generateShiftPlan(2027, 1, 31, 'test', {});
  const chained = await generateShiftPlan(2027, 1, 31, 'test', { carryState: december.carryState });
  const firstDays = (result) => names.map((name) => [name, [1, 2, 3, 4, 5, 6, 7].map((day) => cellsOf(result, name).get(day) || '.').join(' ')]);
  const aloneDays = new Map(firstDays(alone));
  const chainedDays = new Map(firstDays(chained));
  // continuing blocks are identical whichever way the previous month is handed over
  for (const name of names) {
    const lastDecemberCode = cellsOf(december, name).get(31);
    if (lastDecemberCode && typeOf(lastDecemberCode) === 'night') {
      assert.equal(aloneDays.get(name).split(' ').slice(0, 3).join(' '), chainedDays.get(name).split(' ').slice(0, 3).join(' '), `${name}: night continuation differs`);
    }
  }
});
