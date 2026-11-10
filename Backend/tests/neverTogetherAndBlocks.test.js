import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';
import { getNeverTogetherRule, getTogetherPartners, isNightTeamMember, violatesNeverTogether } from '../lib/fixedEmployeeRules.js';
import { createFakePlanningDb } from './helpers/fakePlanningDb.js';

const typeOf = (code) => (/^E/.test(code) ? 'early' : /^L/.test(code) ? 'late' : /^N/.test(code) ? 'night' : 'other');

function buildTeam(count, customize = () => ({})) {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  const employees = Array.from({ length: count }, (_, index) => ({
    name: `Test Person ${String(index).padStart(2, '0')}`,
    userId: 800 + index,
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

const generate = (year, month) => generateShiftPlan(year, month, new Date(year, month, 0).getDate(), 'test', {});

test('the pair rule is recognised whatever the spelling of the names', () => {
  const rule = getNeverTogetherRule('Brode, Patrick', 'Godfrey Emanuel');
  assert.ok(rule);
  assert.equal(getNeverTogetherRule('Patrick Brode', 'Someone Else'), null);
  assert.equal(violatesNeverTogether(rule, 'night', 'night', 3), true, 'both on night');
  assert.equal(violatesNeverTogether(rule, 'early', 'late', 6), true, 'both on a Saturday');
  assert.equal(violatesNeverTogether(rule, 'early', 'late', 2), false, 'different shifts on a weekday are fine');
  assert.equal(violatesNeverTogether(rule, 'night', 'early', 3), false);
});

test('Patrick Brode and Godfrey Emanuel are never planned together on nights or weekend days', async () => {
  // Both wish for nights, so without the rule they would meet on night blocks and on weekends.
  const names = { 0: 'Patrick Brode', 1: 'Godfrey Emanuel' };
  const { employees } = buildTeam(14, (index) => (index < 2 ? { name: names[index], preferred: ['N'] } : {}));
  for (const [year, month] of [[2027, 2], [2027, 3], [2027, 4]]) {
    const result = await generate(year, month);
    const cells = (name) => new Map(result.shifts.filter((shift) => shift.employee_name === name).map((shift) => [Number(shift.day), shift.shift_code]));
    const first = cells(employees[0].name);
    const second = cells(employees[1].name);
    for (const [day, code] of first) {
      if (!second.has(day)) continue;
      const weekday = new Date(year, month - 1, day).getDay();
      assert.ok(weekday !== 0 && weekday !== 6, `${month}/${day}: both work on a weekend day`);
      assert.ok(!(typeOf(code) === 'night' && typeOf(second.get(day)) === 'night'), `${month}/${day}: both work the night shift`);
    }
  }
});

test('nobody works a weekend in two weeks in a row, and blocks have no free day inside', async () => {
  buildTeam(30);
  const results = [];
  let carryState = null;
  for (const [year, month] of [[2027, 2], [2027, 3], [2027, 4]]) {
    const result = await generateShiftPlan(year, month, new Date(year, month, 0).getDate(), 'test', { carryState });
    carryState = result.carryState;
    results.push({ year, month, result });
  }
  const weekIndex = (year, month, day) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000;
    return Math.round(monday / (7 * 86400000));
  };
  const weekendsByEmployee = new Map();
  for (const { year, month, result } of results) {
    for (const shift of result.shifts) {
      const weekday = new Date(year, month - 1, Number(shift.day)).getDay();
      if (weekday !== 0 && weekday !== 6) continue;
      // Night blocks always contain a weekend; there the spacing is only a penalty (the night minimum comes first).
      if (typeOf(shift.shift_code) === 'night') continue;
      if (!weekendsByEmployee.has(shift.employee_name)) weekendsByEmployee.set(shift.employee_name, new Set());
      weekendsByEmployee.get(shift.employee_name).add(weekIndex(year, month, Number(shift.day)));
    }
  }
  for (const [name, weeks] of weekendsByEmployee) {
    const sorted = [...weeks].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index++) {
      assert.ok(sorted[index] - sorted[index - 1] >= 3, `${name}: weekends only ${sorted[index] - sorted[index - 1]} week(s) apart`);
    }
  }

  for (const { year, month, result } of results) {
    const numDays = new Date(year, month, 0).getDate();
    const byEmployee = new Map();
    for (const shift of result.shifts) {
      if (!byEmployee.has(shift.employee_name)) byEmployee.set(shift.employee_name, new Map());
      byEmployee.get(shift.employee_name).set(Number(shift.day), shift.shift_code);
    }
    for (const [name, cells] of byEmployee) {
      for (let day = 2; day < numDays; day++) {
        const weekday = new Date(year, month - 1, day).getDay();
        if (weekday === 0 || weekday === 1 || cells.has(day) || !cells.has(day - 1) || !cells.has(day + 1)) continue;
        const sameType = typeOf(cells.get(day - 1)) === typeOf(cells.get(day + 1));
        assert.ok(!sameType, `${name} ${month}/${day}: free day inside a block (${cells.get(day - 1)} - frei - ${cells.get(day + 1)})`);
      }
    }
  }
});

test('the fixed groups are recognised: Marco + Mustafar, night team with Noah and Patrick Brode', () => {
  const people = ['Marco Dessi', 'Mustafa Sherzai', 'Noah Schauer', 'Patrick Brode', 'Anna Adler', 'Marco Other'];
  assert.deepEqual([...new Set(getTogetherPartners('Marco Dessi', people).map((entry) => entry.partner))].sort(), ['Mustafa Sherzai', 'Noah Schauer', 'Patrick Brode']);
  assert.deepEqual(getTogetherPartners('Anna Adler', people), []);
  assert.equal(isNightTeamMember('Patrick Brode'), true);
  assert.equal(isNightTeamMember('Brode, Patrick'), true);
  assert.equal(isNightTeamMember('Anna Adler'), false);
  assert.equal(isNightTeamMember('Marco Other'), false, 'only the exact people, not everybody with the same first name');
  assert.equal(isNightTeamMember('Sherzai, Mustafa'), true);
  assert.equal(isNightTeamMember('Patrick Other'), false);
});

test('the night minimum holds on every day of three months', async () => {
  const { db } = buildTeam(36);
  const wanted = Math.max(...db.staffingRules.filter((rule) => rule.shift_type === 'night').map((rule) => Number(rule.min_count) || 0));
  assert.ok(wanted >= 3, 'the default night minimum is set');
  let carryState = null;
  for (const [year, month] of [[2027, 2], [2027, 3], [2027, 4]]) {
    const result = await generateShiftPlan(year, month, new Date(year, month, 0).getDate(), 'test', { carryState });
    carryState = result.carryState;
    const perDay = new Map();
    for (const shift of result.shifts) if (typeOf(shift.shift_code) === 'night') perDay.set(shift.day, (perDay.get(shift.day) || 0) + 1);
    for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
      assert.ok((perDay.get(day) || 0) >= wanted, `${month}/${day}: only ${perDay.get(day) || 0} of ${wanted} night shifts`);
    }
  }
});

test('Marco and Mustafar work in the same shift type on most shared days', async () => {
  const names = { 0: 'Marco Dessi', 1: 'Mustafa Sherzai', 2: 'Noah Schauer', 3: 'Patrick Brode' };
  const { employees } = buildTeam(30, (index) => (index < 4 ? { name: names[index] } : {}));
  let same = 0;
  let shared = 0;
  let carryState = null;
  for (const [year, month] of [[2027, 2], [2027, 3], [2027, 4]]) {
    const result = await generateShiftPlan(year, month, new Date(year, month, 0).getDate(), 'test', { carryState });
    carryState = result.carryState;
    const cells = (name) => new Map(result.shifts.filter((shift) => shift.employee_name === name).map((shift) => [Number(shift.day), typeOf(shift.shift_code)]));
    const first = cells(employees[0].name);
    const second = cells(employees[1].name);
    for (const [day, type] of first) {
      if (!second.has(day) || type === 'other') continue;
      shared += 1;
      if (second.get(day) === type) same += 1;
    }
  }
  assert.ok(shared > 10, 'both are planned on enough common days');
  assert.ok(same / shared >= 0.7, `only ${same} of ${shared} shared days in the same shift type`);
});

test('weekend codes (SA/WE) only appear when the block really contains a weekend day', async () => {
  buildTeam(30);
  let carryState = null;
  for (const [year, month] of [[2027, 2], [2027, 3], [2027, 4]]) {
    const numDays = new Date(year, month, 0).getDate();
    const result = await generateShiftPlan(year, month, numDays, 'test', { carryState });
    carryState = result.carryState;
    const byEmployee = new Map();
    for (const shift of result.shifts) {
      if (!byEmployee.has(shift.employee_name)) byEmployee.set(shift.employee_name, new Map());
      byEmployee.get(shift.employee_name).set(Number(shift.day), shift.shift_code);
    }
    for (const [name, cells] of byEmployee) {
      const days = [...cells.keys()].sort((a, b) => a - b);
      for (let index = 0; index < days.length;) {
        let end = index;
        while (end + 1 < days.length && days[end + 1] === days[end] + 1) end++;
        const run = days.slice(index, end + 1);
        index = end + 1;
        if (run[0] === 1 || run.at(-1) === numDays) continue;
        if (run.some((day) => [0, 6].includes(new Date(year, month - 1, day).getDay()))) continue;
        for (const day of run) assert.ok(!/(SA|WE)$/.test(cells.get(day)), `${name} ${month}/${day}: ${cells.get(day)} without a weekend in the block`);
      }
    }
  }
});

test('inexperienced employees (admin list) are never planned together in late or night shifts', async () => {
  const { db, employees } = buildTeam(30);
  const newcomers = employees.slice(0, 4).map((employee) => employee.name);
  db.settings.set('shiftplan.inexperienced_employees', JSON.stringify(newcomers));
  let carryState = null;
  for (const [year, month] of [[2027, 2], [2027, 3], [2027, 4]]) {
    const result = await generateShiftPlan(year, month, new Date(year, month, 0).getDate(), 'test', { carryState });
    carryState = result.carryState;
    assert.equal(result.planReport.inexperienced.employees, 4);
    const perDayType = new Map();
    for (const shift of result.shifts) {
      const type = typeOf(shift.shift_code);
      if (type !== 'late' && type !== 'night') continue;
      if (!newcomers.includes(shift.employee_name)) continue;
      const key = `${shift.day}|${type}`;
      perDayType.set(key, (perDayType.get(key) || 0) + 1);
    }
    for (const [key, count] of perDayType) assert.ok(count < 2, `${month}/${key}: ${count} inexperienced in the same shift`);
  }
});
