import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';
import { createFakePlanningDb } from './helpers/fakePlanningDb.js';
import { mayKeepPersonalAvoidList, PERSONAL_AVOID_KEY_PREFIX } from '../lib/fixedEmployeeRules.js';

const isNight = (code) => /^N/.test(code);
const isWeekend = (year, month, day) => [0, 6].includes(new Date(year, month - 1, day).getDay());

function buildTeam(avoidIndexes) {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const names = ['Patrick Brode', ...Array.from({ length: 29 }, (_, index) => `Test Person ${String(index).padStart(2, '0')}`)];
  db.employees = names;
  db.preferences = names.map((name, index) => ({
    user_id: 700 + index, first_name: name.split(' ')[0], last_name: name.split(' ').slice(1).join(' '), provisioned_employee_name: name,
    preferred_shifts: [], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [],
    max_nights_per_month: null, max_weekends_per_month: null, night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: [],
  }));
  db.settings.set('shiftplan.dbs_enabled', 'false');
  if (avoidIndexes) db.settings.set(`${PERSONAL_AVOID_KEY_PREFIX}700`, JSON.stringify(avoidIndexes.map((index) => 700 + index)));
  return { names };
}

async function sharedDays(avoidIndexes) {
  const { names } = buildTeam(avoidIndexes);
  const result = await generateShiftPlan(2027, 3, 31, 'test', {});
  const own = new Map(result.shifts.filter((shift) => shift.employee_name === 'Patrick Brode').map((shift) => [Number(shift.day), shift.shift_code]));
  const shared = [];
  for (const index of (avoidIndexes || Array.from({ length: 29 }, (_, i) => i + 1))) {
    for (const shift of result.shifts.filter((entry) => entry.employee_name === names[index])) {
      const day = Number(shift.day);
      const mine = own.get(day);
      if (!mine) continue;
      if ((isNight(mine) && isNight(shift.shift_code)) || isWeekend(2027, 3, day)) shared.push(`${names[index]} ${day}.`);
    }
  }
  return { shared, ownDays: own.size };
}

test('only Patrick Brode may keep the personal list', () => {
  assert.equal(mayKeepPersonalAvoidList('Patrick Brode'), true);
  assert.equal(mayKeepPersonalAvoidList('Brode, Patrick'), true);
  assert.equal(mayKeepPersonalAvoidList('Godfrey Emanuel'), false);
});

test('colleagues from the personal list never share night shifts or weekend days with Patrick Brode', async () => {
  const avoid = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const control = await sharedDays(null);
  assert.ok(control.ownDays > 0);
  const withList = await sharedDays(avoid);
  const controlOverlap = (await sharedDays(null)).shared.filter((entry) => avoid.some((index) => entry.startsWith(`Test Person ${String(index - 1).padStart(2, '0')}`)));
  assert.ok(controlOverlap.length > 0, 'without the list these colleagues do share weekend days / nights (the check has teeth)');
  assert.deepEqual(withList.shared, [], `shared: ${withList.shared.slice(0, 5).join(', ')}`);
});
