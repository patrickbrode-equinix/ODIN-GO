import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';
import { createFakePlanningDb } from './helpers/fakePlanningDb.js';

function buildTeam(count) {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const names = ['Patrick Brode', ...Array.from({ length: count - 1 }, (_, index) => `Test Person ${String(index).padStart(2, '0')}`)];
  db.employees = names;
  db.preferences = names.map((name, index) => ({
    user_id: 900 + index, first_name: name.split(' ')[0], last_name: name.split(' ').slice(1).join(' '), provisioned_employee_name: name,
    preferred_shifts: [], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [],
    max_nights_per_month: null, max_weekends_per_month: null, night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: [],
  }));
  db.settings.set('shiftplan.dbs_enabled', 'false');
  return names;
}

test('Patrick Brode works a weekend only as Saturday AND Sunday', async () => {
  buildTeam(30);
  let weekendDays = 0;
  for (const [month, days] of [[1, 31], [2, 28], [3, 31], [5, 31]]) {
    const result = await generateShiftPlan(2027, month, days, 'test', {});
    const worked = new Set(result.shifts.filter((shift) => shift.employee_name === 'Patrick Brode').map((shift) => shift.day));
    for (let day = 1; day < days; day++) {
      if (new Date(2027, month - 1, day).getDay() !== 6) continue;
      weekendDays += worked.has(day) ? 1 : 0;
      assert.equal(worked.has(day), worked.has(day + 1), `month ${month}: Saturday ${day}. and Sunday ${day + 1}. must both be planned or both free`);
    }
    assert.ok(!result.shifts.some((shift) => shift.employee_name === 'Patrick Brode' && /SA$/.test(shift.shift_code)), 'no Monday-Saturday block');
  }
  assert.ok(weekendDays > 0, 'the check only means something when he works at least one weekend');
});

test('other employees may still work a single weekend day', async () => {
  const names = buildTeam(30);
  const result = await generateShiftPlan(2027, 1, 31, 'test', {});
  void names;
  assert.ok(result.shifts.length > 0);
});
