import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';
import { createFakePlanningDb } from './helpers/fakePlanningDb.js';

function buildTeam(count, customize) {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const names = Array.from({ length: count }, (_, index) => `Test Person ${String(index).padStart(2, '0')}`);
  db.employees = names;
  db.preferences = names.map((name, index) => ({
    user_id: 700 + index, first_name: 'Test', last_name: name, provisioned_employee_name: name,
    preferred_shifts: [], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [],
    max_nights_per_month: null, max_weekends_per_month: null, night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: [],
  }));
  db.settings.set('shiftplan.dbs_enabled', 'false');
  customize?.(db, names);
  return { db, names };
}

test('a wish for one month (only E2) overrules the general wishes and is never relaxed', async () => {
  const { names } = buildTeam(30, (db, list) => {
    // general wish: late shifts; January 2027: only E2
    db.preferences[3].preferred_shifts = ['L1', 'L2'];
    db.preferences[3].monthly_preferences = { '2027-01': { preferred_shifts: ['E2'], unwanted_shifts: [] } };
    // second person: general taboo on night, January: only E1
    db.preferences[4].unwanted_shifts = ['N'];
    db.preferences[4].monthly_preferences = { '2027-01': { preferred_shifts: ['E1'], unwanted_shifts: [] } };
    void list;
  });
  const result = await generateShiftPlan(2027, 1, 31, 'test', {});
  const codesOf = (name) => result.shifts.filter((shift) => shift.employee_name === name).map((shift) => shift.shift_code);
  const onlyE2 = codesOf(names[3]);
  assert.ok(onlyE2.length > 0, 'the employee still works');
  assert.ok(onlyE2.every((code) => code.startsWith('E2')), `only E2 wished for January, planned: ${[...new Set(onlyE2)].join(',')}`);
  const onlyE1 = codesOf(names[4]);
  assert.ok(onlyE1.length > 0);
  assert.ok(onlyE1.every((code) => code.startsWith('E1')), `only E1 wished for January, planned: ${[...new Set(onlyE1)].join(',')}`);
});

test('another month keeps the general wishes', async () => {
  const { names } = buildTeam(30, (db) => {
    db.preferences[3].preferred_shifts = ['L1', 'L2'];
    db.preferences[3].monthly_preferences = { '2027-01': { preferred_shifts: ['E2'], unwanted_shifts: [] } };
  });
  const result = await generateShiftPlan(2027, 2, 28, 'test', {});
  const codes = result.shifts.filter((shift) => shift.employee_name === names[3]).map((shift) => shift.shift_code);
  assert.ok(codes.length > 0);
  assert.ok(codes.some((code) => code.startsWith('L')), 'February: the general late wish applies');
});

test('even when many people want only E2 in a month (capacity and hours under pressure), nobody gets another shift', async () => {
  const { names } = buildTeam(30, (db) => {
    for (let index = 0; index < 18; index++) {
      db.preferences[index].preferred_shifts = index % 2 ? ['L1'] : [];
      db.preferences[index].monthly_preferences = { '2027-01': { preferred_shifts: ['E2'], unwanted_shifts: [] } };
    }
  });
  const result = await generateShiftPlan(2027, 1, 31, 'test', {});
  for (const name of names.slice(0, 18)) {
    const codes = result.shifts.filter((shift) => shift.employee_name === name).map((shift) => shift.shift_code);
    assert.ok(codes.every((code) => code.startsWith('E2')), `${name}: only E2 wished for January, planned: ${[...new Set(codes)].join(',')}`);
  }
});

test('month wishes overrule contradicting general wishes for 28 of 36 people at once', async () => {
  const { names } = buildTeam(36, (db, list) => {
    const plans = [['E2', [], ['E2']], ['E2', ['L1'], []], ['E1', ['N'], []], ['L1', ['E2'], []], ['L2', [], ['N']], ['E1', ['E1', 'E2'], []], ['E2', ['L2'], ['E2']]];
    for (let index = 0; index < 28; index++) {
      const [monthly, general, unwanted] = plans[index % plans.length];
      db.preferences[index].preferred_shifts = general;
      db.preferences[index].unwanted_shifts = unwanted.filter((code) => code !== monthly);
      db.preferences[index].monthly_preferences = { '2027-01': { preferred_shifts: [monthly], unwanted_shifts: [] } };
    }
    void list;
  });
  const wanted = new Map([['E2', 0], ['E2', 1]]);
  void wanted;
  const result = await generateShiftPlan(2027, 1, 31, 'test', {});
  const plans = ['E2', 'E2', 'E1', 'L1', 'L2', 'E1', 'E2'];
  const violations = [];
  for (const shift of result.shifts) {
    const index = names.indexOf(shift.employee_name);
    if (index >= 0 && index < 28 && !shift.shift_code.startsWith(plans[index % plans.length])) violations.push(`${shift.employee_name} wants ${plans[index % plans.length]} got ${shift.shift_code} on ${shift.day}.`);
  }
  assert.deepEqual(violations.slice(0, 5), [], `${violations.length} shifts deviate from the month wish`);
});

test('the DBS week stays complete for pool members who wished only E2 for the month (or in general)', async () => {
  const { db, names } = buildTeam(30, (database, list) => {
    database.settings.set('shiftplan.dbs_enabled', 'true');
    database.specialPools = list.slice(0, 3).map((name, index) => ({
      shift_code: 'DBS', employee_name: name, monthly_max_assignments: 31, working_weekdays: [1, 2, 3, 4, 5],
      free_days_after_block: 2, duration_hours: null, other_shift_codes: [], other_days_per_month: null, sort_order: index,
    }));
    // pool member 0: monthly wish "only E2"; pool member 1: general wish "only E2"; member 2: free
    database.preferences[0].monthly_preferences = { '2027-01': { preferred_shifts: ['E2'], unwanted_shifts: [] } };
    database.preferences[1].preferred_shifts = ['E2'];
  });
  const result = await generateShiftPlan(2027, 1, 31, 'test', {});
  const dbsShifts = result.shifts.filter((shift) => shift.shift_code === 'DBS');
  assert.ok(dbsShifts.length >= 15, `DBS must be planned for a month, got ${dbsShifts.length} days`);
  assert.ok(dbsShifts.every((shift) => names.slice(0, 3).includes(shift.employee_name)), 'only pool members work DBS');
  assert.equal(result.conflicts.filter((conflict) => conflict.type === 'dbs_week_incomplete').length, 0);
  // the wish list still applies to the regular shifts of the pool members
  for (const name of names.slice(0, 2)) {
    const regular = result.shifts.filter((shift) => shift.employee_name === name && shift.shift_code !== 'DBS').map((shift) => shift.shift_code);
    assert.ok(regular.every((code) => code.startsWith('E2')), `${name}: ${[...new Set(regular)].join(',')}`);
  }
  void db;
});
