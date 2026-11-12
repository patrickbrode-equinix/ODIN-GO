import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';
import { createFakePlanningDb } from './helpers/fakePlanningDb.js';

const POOL = ['Wießmann, Peter', 'Ruppert, Mario', 'Lai, Kok Chun'];

function buildTeam({ doubleWeeks = false } = {}) {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const names = [...POOL, ...Array.from({ length: 40 }, (_, index) => `Test Person ${String(index).padStart(2, '0')}`)];
  db.employees = names;
  db.preferences = names.map((name, index) => ({
    user_id: 900 + index, first_name: name.split(', ')[1] || 'Test', last_name: name.split(', ')[0] || `Person ${index}`, provisioned_employee_name: name,
    preferred_shifts: [], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [],
    max_nights_per_month: null, max_weekends_per_month: null, night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: [],
  }));
  db.settings.set('shiftplan.dbs_enabled', 'true');
  if (doubleWeeks) db.settings.set('shiftplan.dbs_double_weeks', 'true');
  db.specialPools = POOL.map((employee_name, index) => ({
    shift_code: 'DBS', employee_name, monthly_max_assignments: 31, working_weekdays: [0, 1, 2, 3, 4, 5, 6], free_days_after_block: 2,
    duration_hours: null, other_shift_codes: ['EARLY', 'LATE'], other_days_per_month: null, sort_order: index,
  }));
  return names;
}

async function holdersFor(months) {
  let carry = null;
  const byDate = new Map();
  for (const [year, month] of months) {
    const days = new Date(year, month, 0).getDate();
    const result = await generateShiftPlan(year, month, days, 'test', { carryState: carry });
    carry = result.carryState;
    for (let day = 1; day <= days; day++) {
      byDate.set(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, result.shifts.filter((shift) => shift.day === day && shift.shift_code === 'DBS').map((shift) => shift.employee_name));
    }
  }
  return byDate;
}

test('DBS: one holder every day, a week keeps its owner through the month change December to January', async () => {
  buildTeam();
  const holders = await holdersFor([[2026, 12], [2027, 1], [2027, 2]]);
  for (const [date, names] of holders) assert.equal(names.length, 1, `${date}: exactly one DBS holder, found ${names.join(', ') || 'nobody'}`);
  // week 28.12. - 3.1. belongs to one person
  const week = ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'].map((date) => holders.get(date)[0]);
  assert.equal(new Set(week).size, 1, `week over the month end: ${week.join(' / ')}`);
  // and every other Monday-Sunday week is one person as well
  for (const monday of ['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25', '2027-02-01']) {
    const start = new Date(`${monday}T12:00:00`);
    const owners = Array.from({ length: 7 }, (_, offset) => { const date = new Date(start); date.setDate(start.getDate() + offset); return holders.get(date.toISOString().slice(0, 10))[0]; });
    assert.equal(new Set(owners).size, 1, `week ${monday}: ${owners.join(' / ')}`);
  }
});

test('DBS double weeks: two weeks in a row, Monday and Tuesday covered by another pool member, owner back on Wednesday', async () => {
  buildTeam({ doubleWeeks: true });
  const holders = await holdersFor([[2026, 12], [2027, 1], [2027, 2]]);
  const day = (date) => holders.get(date)[0];
  for (const [date, names] of holders) assert.equal(names.length, 1, `${date}: exactly one DBS holder`);
  // January 2027: weeks start 04.01. / 11.01. / 18.01. / 25.01.; ISO week 2 (11.01.) begins a pair
  const owner = day('2027-01-13');
  assert.deepEqual(['2027-01-13', '2027-01-14', '2027-01-15', '2027-01-16', '2027-01-17'].map(day), Array(5).fill(owner), 'Wednesday to Sunday of the first week');
  assert.deepEqual(['2027-01-20', '2027-01-21', '2027-01-22', '2027-01-23', '2027-01-24'].map(day), Array(5).fill(owner), 'Wednesday to Sunday of the second week');
  for (const monday of ['2027-01-11', '2027-01-18']) {
    const tuesday = new Date(`${monday}T12:00:00`);
    tuesday.setDate(tuesday.getDate() + 1);
    const substitute = day(monday);
    assert.notEqual(substitute, owner, `${monday}: the owner is free on Monday`);
    assert.equal(day(tuesday.toISOString().slice(0, 10)), substitute, `${monday}: the same substitute covers Tuesday`);
  }
  assert.notEqual(day('2027-01-25'), owner, 'a new pair starts after the two weeks');
});
