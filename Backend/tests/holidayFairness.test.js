import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';
import { buildBankHolidayMap } from '../lib/hessenHolidays.js';
import { createFakePlanningDb } from './helpers/fakePlanningDb.js';

function buildTeam(count, wishFor = () => false) {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const names = ['Patrick Brode', ...Array.from({ length: count - 1 }, (_, index) => `Test Person ${String(index).padStart(2, '0')}`)];
  db.employees = names;
  db.preferences = names.map((name, index) => ({
    user_id: 900 + index, first_name: name.split(' ')[0], last_name: name.split(' ').slice(1).join(' '), provisioned_employee_name: name,
    preferred_shifts: wishFor(name, index) ? ['E1', 'E2'] : [], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [],
    max_nights_per_month: null, max_weekends_per_month: null, night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: [],
  }));
  db.settings.set('shiftplan.dbs_enabled', 'false');
  names.db = db;
  return names;
}

function holidayShiftCounts(result, year, month) {
  const holidays = buildBankHolidayMap(year);
  const counts = new Map();
  for (const shift of result.shifts) {
    if (!holidays[`${year}-${String(month).padStart(2, '0')}-${String(shift.day).padStart(2, '0')}`]) continue;
    if (['FS', 'S'].includes(String(shift.shift_code).toUpperCase())) continue;
    counts.set(shift.employee_name, (counts.get(shift.employee_name) || 0) + 1);
  }
  return counts;
}

test('bank holidays are spread evenly: nobody works most of them, Patrick Brode gets more', async () => {
  const names = buildTeam(30);
  let patrickTotal = 0;
  let total = 0;
  for (const month of [3, 5, 10, 12]) {
    const result = await generateShiftPlan(2027, month, new Date(2027, month, 0).getDate(), 'test', {});
    const counts = holidayShiftCounts(result, 2027, month);
    const holidayCount = Object.keys(buildBankHolidayMap(2027)).filter((date) => date.startsWith(`2027-${String(month).padStart(2, '0')}`)).length;
    assert.ok(Math.max(0, ...counts.values()) <= Math.max(2, Math.ceil(holidayCount * 0.7)), `month ${month}: one person works almost every holiday: ${JSON.stringify([...counts])}`);
    patrickTotal += counts.get('Patrick Brode') || 0;
    total += [...counts.values()].reduce((sum, value) => sum + value, 0);
  }
  assert.ok(total > 0);
  assert.ok(patrickTotal >= total / names.length, `Patrick Brode: ${patrickTotal} of ${total} holiday shifts`);
});

test('holidays already worked earlier in the year are balanced out', async () => {
  const names = buildTeam(30);
  // Employees 0-19 worked Karfreitag and Ostermontag already (March draft); 20-29 did not.
  const worked = names.slice(0, 20);
  const history = worked.flatMap((name) => [26, 29].map((day) => ({ employee_name: name, day, shift_code: 'E1' })));
  names.db.draftHistory.set('2027-03', history);
  const result = await generateShiftPlan(2027, 5, 31, 'test', {});
  const counts = holidayShiftCounts(result, 2027, 5);
  const rested = names.slice(20);
  const restedShare = rested.reduce((sum, name) => sum + (counts.get(name) || 0), 0) / Math.max([...counts.values()].reduce((sum, value) => sum + value, 0), 1);
  assert.ok(restedShare >= 0.4, `the 10 employees without holiday shifts so far (one third of the team) take clearly more than a third of the holiday shifts, share ${restedShare}`);
});

test('a team where half of the employees has wishes is still planned completely', async () => {
  const names = buildTeam(24, (name, index) => index % 2 === 1);
  const result = await generateShiftPlan(2027, 3, 31, 'test', {});
  const hours = new Map();
  for (const shift of result.shifts) hours.set(shift.employee_name, (hours.get(shift.employee_name) || 0) + 1);
  assert.equal([...hours.keys()].length, names.length, 'everybody is planned');
});

test('night shifts: Patrick Brode is rated 1.5 times and gets clearly more nights than the average', async () => {
  const names = buildTeam(60);
  const nights = new Map();
  for (let month = 1; month <= 12; month++) {
    const result = await generateShiftPlan(2027, month, new Date(2027, month, 0).getDate(), 'test', {});
    for (const shift of result.shifts) {
      if (/^N/.test(String(shift.shift_code).toUpperCase())) nights.set(shift.employee_name, (nights.get(shift.employee_name) || 0) + 1);
    }
  }
  const others = names.filter((name) => name !== 'Patrick Brode').map((name) => nights.get(name) || 0);
  const average = others.reduce((sum, value) => sum + value, 0) / others.length;
  assert.ok((nights.get('Patrick Brode') || 0) >= average * 1.5, 'Patrick ' + (nights.get('Patrick Brode') || 0) + ' nights vs average ' + average.toFixed(1));
});

test('do-not-plan list: ticked "plan on holidays" works only on bank holidays and never appears in the hours lists', async () => {
  const names = buildTeam(30);
  const [tickedName, plainName] = [names[1], names[2]];
  names.db.exclusions = [
    { employee_name: tickedName, fixed_shift_type: null, weekdays: null, plan_on_holidays: true },
    { employee_name: plainName, fixed_shift_type: null, weekdays: null, plan_on_holidays: false },
  ];
  const holidays = buildBankHolidayMap(2027);
  let tickedHolidayShifts = 0;
  for (const month of [3, 5, 12]) {
    const result = await generateShiftPlan(2027, month, new Date(2027, month, 0).getDate(), 'test', {});
    const prefix = `2027-${String(month).padStart(2, '0')}-`;
    for (const shift of result.shifts.filter((entry) => entry.employee_name === tickedName)) {
      assert.ok(holidays[`${prefix}${String(shift.day).padStart(2, '0')}`], `${tickedName} works ${prefix}${shift.day} which is no bank holiday`);
      assert.ok(!/^N/.test(shift.shift_code), 'no night block for a holiday-only employee');
      tickedHolidayShifts += 1;
    }
    assert.ok(!result.shifts.some((entry) => entry.employee_name === plainName), 'plain exclusion: not planned at all');
    assert.equal(result.fairness[tickedName], undefined, 'not in the hours list');
    assert.equal(result.fairness[plainName], undefined);
    assert.deepEqual([...result.configSnapshot.excludedEmployeeNames].sort(), [tickedName, plainName].sort());
  }
  assert.ok(tickedHolidayShifts > 0, 'the ticked employee takes holiday shifts');
});
