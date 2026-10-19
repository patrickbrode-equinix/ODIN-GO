import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';
import { createFakePlanningDb, createRandom } from './helpers/fakePlanningDb.js';

// Runs the real generator on 40 generated employees (no database server needed).
function buildScenario(seed) {
  const rng = createRandom(seed);
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const employees = Array.from({ length: 40 }, (_, index) => {
    const roll = rng.next();
    return {
      name: `Test Person ${String(index).padStart(2, '0')}`,
      userId: 500 + index,
      preferred: roll < 0.12 ? [rng.pick(['E1', 'E2', 'L1'])] : [],
      unwanted: roll >= 0.12 && roll < 0.3 ? ['N'] : [],
      blocked: roll >= 0.3 && roll < 0.42 ? [rng.pick([2, 3])] : [],
    };
  });
  db.employees = employees.map((employee) => employee.name);
  db.preferences = employees.map((employee) => ({
    user_id: employee.userId, first_name: 'Test', last_name: employee.name, provisioned_employee_name: employee.name,
    preferred_shifts: employee.preferred, unwanted_shifts: employee.unwanted, blocked_days: employee.blocked,
    preferred_holidays: [], preferred_days: [], max_nights_per_month: null, max_weekends_per_month: null,
    night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: [],
  }));
  const dbsMembers = employees.filter((employee) => employee.preferred.length === 0 && employee.blocked.length === 0).slice(0, 3);
  db.specialPools = dbsMembers.map((employee, index) => ({
    shift_code: 'DBS', employee_name: employee.name, monthly_max_assignments: 31, working_weekdays: [1, 2, 3, 4, 5],
    free_days_after_block: 2, duration_hours: null, other_shift_codes: index === 0 ? ['LATE'] : [], other_days_per_month: null, sort_order: index,
  }));
  db.settings.set('shiftplan.dbs_enabled', 'true');
  return { db, employees, dbsMembers };
}

test('40 generated employees: wishes, DBS rule and holiday credit hold in the real generator', async () => {
  const { db, employees, dbsMembers } = buildScenario(11);
  const typeByCode = new Map(db.definitions.map((definition) => [definition.code, definition.shift_type]));
  const seriesByCode = new Map(db.definitions.map((definition) => [definition.code, definition.series_days]));
  const result = await generateShiftPlan(2027, 3, 31, 'test');
  const byEmployee = new Map(employees.map((employee) => [employee.name, new Map()]));
  for (const shift of result.shifts) byEmployee.get(shift.employee_name).set(Number(shift.day), shift.shift_code);

  const seen = new Set();
  for (const shift of result.shifts) {
    const key = `${shift.employee_name}|${shift.day}`;
    assert.ok(!seen.has(key), `double booking ${key}`);
    seen.add(key);
  }

  const base = (code) => ({ E1SA: 'E1', E1WE: 'E1', E2SA: 'E2', E2WE: 'E2', L1WE: 'L1', NK: 'N' }[code] || code);
  for (const employee of employees) {
    for (const [day, code] of byEmployee.get(employee.name)) {
      if (code === 'DBS') continue;
      const dow = new Date(2027, 2, day).getDay();
      assert.ok(!employee.blocked.includes(dow), `${employee.name} works on a blocked weekday (day ${day})`);
      assert.ok(!employee.unwanted.includes(base(code)), `${employee.name} got unwanted ${code}`);
      // Wishes are honoured first; only when the wished shift is full (or the person would stay below
      // the target hours) early is the overflow pool. Never late or night against the wish.
      if (employee.preferred.length && !employee.preferred.includes(base(code))) {
        assert.equal(typeByCode.get(code), 'early', `${employee.name} got ${code} instead of ${employee.preferred}`);
      }
    }
  }

  // DBS members: outside DBS only early/late (LATE only for the first one) and no seven-day block.
  for (const [index, member] of dbsMembers.entries()) {
    for (const [, code] of byEmployee.get(member.name)) {
      if (code === 'DBS') continue;
      assert.ok((seriesByCode.get(code) || 1) < 7, `${member.name} has seven-day block ${code} outside DBS`);
      const type = typeByCode.get(code);
      assert.ok(type === 'early' || type === 'late', `${member.name} has ${type} outside DBS`);
      if (index === 0) assert.equal(type, 'late');
    }
  }

  // March 26 2027 is Good Friday: everybody who does not work it is credited with 8 hours.
  const off = employees.find((employee) => !byEmployee.get(employee.name).has(26));
  assert.ok(off, 'somebody has the holiday off');
  const worked = [...byEmployee.get(off.name).values()].reduce((sum, code) => sum + (db.definitions.find((definition) => definition.code === code)?.duration_hours || 0), 0);
  assert.ok(result.fairness[off.name].actualHours >= worked + 8 - 0.01, 'holiday credit is part of the hours');
});

test('no staffing maximum is exceeded across holidays and month changes', async () => {
  for (const seed of [2, 3]) {
    buildScenario(seed);
    for (const month of [3, 4, 5, 12]) {
      const result = await generateShiftPlan(2027, month, new Date(2027, month, 0).getDate(), 'test');
      const exceeded = result.conflicts.filter((conflict) => conflict.type === 'max_staff_reached' || conflict.type === 'night_staffing_cap');
      assert.deepEqual(exceeded.map((conflict) => conflict.message), [], `seed ${seed} month ${month}`);
    }
  }
});
