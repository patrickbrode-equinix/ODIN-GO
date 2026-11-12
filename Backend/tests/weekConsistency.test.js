import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';
import { alignBoundaryWeeks, planWeekCodes } from '../lib/weekConsistency.js';
import { createFakePlanningDb } from './helpers/fakePlanningDb.js';

const hasCode = (code) => ['E1', 'E2', 'L1', 'L2', 'E1SA', 'E2SA', 'E1WE', 'E2WE', 'L1WE'].includes(code);
const week = (...codes) => codes.map((code, offset) => ({ offset, code })).filter((cell) => cell.code);

test('the code of a week follows the weekend that is really worked', () => {
  assert.equal(planWeekCodes(week('E1WE', 'E1WE', 'E1WE', 'E1WE', 'E1WE'), hasCode).targetCode, 'E1', 'WE code without weekend becomes plain');
  assert.equal(planWeekCodes(week('E1SA', 'E1SA', 'E1SA', 'E1SA', 'E1SA'), hasCode).targetCode, 'E1', 'SA code without Saturday becomes plain');
  assert.equal(planWeekCodes(week('E1', 'E1', 'E1', 'E1', 'E1', 'E1WE'), hasCode).targetCode, 'E1SA', 'a lone Saturday makes it a Monday-Saturday block');
  assert.equal(planWeekCodes(week('E2', 'E2', 'E2', 'E2', 'E2', 'E2WE', 'E2WE'), hasCode).targetCode, 'E2WE');
  assert.equal(planWeekCodes(week('E1', 'E2', 'E1', 'E1', 'E2'), hasCode).targetCode, 'E1', 'E1 and E2 mixed: the family that is worked more often wins');
  assert.ok(planWeekCodes(week('L2', 'L2', 'L2', 'L2', 'L2', 'L2'), hasCode).cells.every((cell) => cell.code === 'L2'), 'no weekend variant exists for L2: nothing to change');
  assert.equal(planWeekCodes(week('N', 'N', 'N'), hasCode), null, 'nights are not part of the rule');
});

test('a week across a month boundary is aligned on both sides', () => {
  const definitions = ['E1', 'E2', 'E1SA', 'E1WE', 'E2WE'].map((code) => ({ code, durationHours: 8 }));
  // 2027-05-31 is a Monday: Monday still in May, Tuesday to Sunday in June
  const may = { month: '2027-05', result: { configSnapshot: { shiftDefinitions: definitions }, shifts: [{ employee_name: 'Anna', day: 31, shift_code: 'E1WE' }] } };
  const june = { month: '2027-06', result: { configSnapshot: { shiftDefinitions: definitions }, shifts: [1, 2, 3, 4].map((day) => ({ employee_name: 'Anna', day, shift_code: 'E1' })) } };
  const changes = alignBoundaryWeeks([may, june]);
  assert.equal(may.result.shifts[0].shift_code, 'E1', 'Mon E1WE + Tue-Fri E1 without weekend: all plain E1');
  assert.deepEqual(june.result.shifts.map((shift) => shift.shift_code), ['E1', 'E1', 'E1', 'E1']);
  assert.equal(changes.length, 1);
  // with a Saturday + Sunday in June the whole week becomes E1WE
  const may2 = { month: '2027-05', result: { configSnapshot: { shiftDefinitions: definitions }, shifts: [{ employee_name: 'Ben', day: 31, shift_code: 'E1' }] } };
  const june2 = { month: '2027-06', result: { configSnapshot: { shiftDefinitions: definitions }, shifts: [1, 2, 3, 4, 5, 6].map((day) => ({ employee_name: 'Ben', day, shift_code: day === 5 || day === 6 ? 'E1WE' : 'E1' })) } };
  alignBoundaryWeeks([may2, june2]);
  assert.equal(may2.result.shifts[0].shift_code, 'E1WE');
  assert.ok(june2.result.shifts.every((shift) => shift.shift_code === 'E1WE'));
});

test('generated plans: no weekend code without weekend, no SA without Saturday, one family per week', async () => {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const names = Array.from({ length: 36 }, (_, index) => `Test Person ${String(index).padStart(2, '0')}`);
  db.employees = names;
  db.preferences = names.map((name, index) => ({
    user_id: 900 + index, first_name: 'Test', last_name: `Person ${String(index).padStart(2, '0')}`, provisioned_employee_name: name,
    preferred_shifts: [], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [],
    max_nights_per_month: null, max_weekends_per_month: null, night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: [],
  }));
  db.settings.set('shiftplan.dbs_enabled', 'false');
  const problems = [];
  for (const month of [2, 3, 4, 5, 6]) {
    const days = new Date(2027, month, 0).getDate();
    const result = await generateShiftPlan(2027, month, days, 'test', {});
    const byEmployee = new Map();
    for (const shift of result.shifts) {
      if (!byEmployee.has(shift.employee_name)) byEmployee.set(shift.employee_name, new Map());
      byEmployee.get(shift.employee_name).set(shift.day, String(shift.shift_code).toUpperCase());
    }
    for (const [employee, cells] of byEmployee) {
      for (let monday = 1; monday + 6 <= days; monday++) {
        if (new Date(2027, month - 1, monday).getDay() !== 1) continue;
        const codes = Array.from({ length: 7 }, (_, offset) => cells.get(monday + offset) || '');
        const work = codes.filter((code) => /^(E1|E2|L1|L2)(SA|WE)?$/.test(code));
        if (work.length === 0) continue;
        const families = new Set(work.map((code) => code.replace(/(SA|WE)$/, '')));
        const sat = /^(E1|E2|L1|L2)/.test(codes[5]);
        const sun = /^(E1|E2|L1|L2)/.test(codes[6]);
        const label = `${employee} ${month}/${monday}: ${codes.join(' ') }`;
        if (families.size > 1) problems.push(`mixed family ${label}`);
        // L1WE is the only weekend code of the late shift (there is no L1SA): Monday-Saturday late also carries it
        const lateSaturdayBlock = work.every((code) => code.startsWith('L1')) && sat;
        if (work.some((code) => code.endsWith('WE')) && !(sat && sun) && !lateSaturdayBlock) problems.push(`WE without weekend ${label}`);
        if (work.some((code) => code.endsWith('SA')) && !sat) problems.push(`SA without Saturday ${label}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('Christmas weekend is staffed like a holiday: early and late shifts on 25.12. and 26.12.', async () => {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const names = Array.from({ length: 43 }, (_, index) => `Test Person ${String(index).padStart(2, '0')}`);
  db.employees = names;
  db.preferences = names.map((name, index) => ({
    user_id: 900 + index, first_name: 'Test', last_name: `Person ${String(index).padStart(2, '0')}`, provisioned_employee_name: name,
    preferred_shifts: [], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [],
    max_nights_per_month: null, max_weekends_per_month: index % 4 === 0 ? 1 : null, night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: [],
  }));
  db.settings.set('shiftplan.dbs_enabled', 'false');
  const result = await generateShiftPlan(2027, 12, 31, 'test', {});
  const count = (day, pattern) => result.shifts.filter((shift) => shift.day === day && pattern.test(shift.shift_code)).length;
  console.log(`CHRISTMAS 25.12. early ${count(25, /^E/)} late ${count(25, /^L/)} | 26.12. early ${count(26, /^E/)} late ${count(26, /^L/)}`);
  assert.ok(count(25, /^E/) >= 4, '1. Weihnachtstag: early shift staffed');
  assert.ok(count(26, /^E/) >= 2, '2. Weihnachtstag: early shift staffed');
  assert.ok(count(25, /^L/) >= 1 && count(26, /^L/) >= 1, 'late shift staffed on both days');
});
