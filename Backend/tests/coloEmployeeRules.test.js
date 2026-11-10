import test from 'node:test';
import assert from 'node:assert/strict';

import { buildColoRolePlan, isColoAllowedByRule, normalizeColoPlanningConfig } from '../lib/coloPlanning.js';

const definitions = [{ code: 'E1', shift_type: 'early' }, { code: 'L1', shift_type: 'late' }, { code: 'N', shift_type: 'night' }];
const requirements = [{ id: 'prep', weekdays: [1, 2], shift_type: 'early', staff: 1 }, { id: 'night', weekdays: [1, 2], shift_type: 'night', staff: 1 }];

test('per-person Colo rules are normalised: unlimited entries are dropped, names follow the pool spelling', () => {
  const config = normalizeColoPlanningConfig({
    enabled: true,
    employeePool: ['Anna Adler', 'Ben Berg', 'Cora Cron'],
    employeeRules: JSON.stringify({
      'adler, anna': { shift_types: ['night'], weekdays: [] },
      'Ben Berg': { shift_types: ['early', 'late', 'night'], weekdays: [0, 1, 2, 3, 4, 5, 6] },
      'Unknown Person': { shift_types: ['early'] },
    }),
  });
  assert.deepEqual(config.employeeRules, { 'Anna Adler': { shift_types: ['night'], weekdays: [] } });
});

test('a pool member is only planned for Colo on the shift types and weekdays that were allowed', () => {
  const shifts = [
    { employee_name: 'Anna Adler', day: 4, shift_code: 'E1' },
    { employee_name: 'Ben Berg', day: 4, shift_code: 'E1' },
    { employee_name: 'Anna Adler', day: 5, shift_code: 'E1' },
    { employee_name: 'Ben Berg', day: 5, shift_code: 'E1' },
  ];
  const plan = buildColoRolePlan({
    year: 2027, month: 1, numDays: 31, shifts, shiftDefinitions: definitions,
    config: {
      enabled: true,
      employeePool: ['Anna Adler', 'Ben Berg'],
      // Anna: no early Colo at all; Ben: early Colo only on Tuesday
      employeeRules: { 'Anna Adler': { shift_types: ['night'] }, 'Ben Berg': { weekdays: [2] } },
      requirements,
    },
  });
  const monday = plan.assignments.filter((entry) => entry.date === '2027-01-04');
  const tuesday = plan.assignments.filter((entry) => entry.date === '2027-01-05');
  assert.equal(monday.length, 0, 'on Monday neither may take the early Colo task');
  assert.deepEqual(tuesday.map((entry) => entry.employee_name), ['Ben Berg']);
  assert.ok(plan.conflicts.some((conflict) => conflict.type === 'colo_understaffed' && conflict.date === '2027-01-04'));
});

test('granular rule: Colo early only Monday-Friday and Sunday, never Saturday; legacy and full rules still work', () => {
  const config = normalizeColoPlanningConfig({
    enabled: true,
    employeePool: ['Kok Chun', 'Ben Berg', 'Cora Cron'],
    employeeRules: {
      'Kok Chun': { allowed: { early: [1, 2, 3, 4, 5, 0], late: [], night: [] } },
      'Ben Berg': { allowed: { early: [0, 1, 2, 3, 4, 5, 6], late: [0, 1, 2, 3, 4, 5, 6], night: [0, 1, 2, 3, 4, 5, 6] } },
      'Cora Cron': { shift_types: ['night'] },
    },
  });
  assert.deepEqual(config.employeeRules['Kok Chun'].allowed, { early: [0, 1, 2, 3, 4, 5], late: [], night: [] });
  assert.equal(config.employeeRules['Ben Berg'], undefined, 'a full matrix is no limit');
  assert.deepEqual(config.employeeRules['Cora Cron'], { shift_types: ['night'], weekdays: [] });
  const rule = config.employeeRules['Kok Chun'];
  assert.equal(isColoAllowedByRule(rule, 'early', 1), true);
  assert.equal(isColoAllowedByRule(rule, 'early', 0), true);
  assert.equal(isColoAllowedByRule(rule, 'early', 6), false);
  assert.equal(isColoAllowedByRule(rule, 'night', 1), false);
  assert.equal(isColoAllowedByRule(undefined, 'night', 6), true);
});

test('a pool member on the DBS duty takes the Colo task on the allowed weekdays (Mon-Fri and Sunday early, not Saturday)', () => {
  // 2027-01-03 Sunday ... 2027-01-09 Saturday
  const shifts = [];
  for (let day = 3; day <= 9; day++) {
    shifts.push({ employee_name: 'Kok Chun', day, shift_code: 'DBS' });
    shifts.push({ employee_name: 'Ben Berg', day, shift_code: 'E1' });
  }
  const plan = buildColoRolePlan({
    year: 2027, month: 1, numDays: 31, startDay: 3, endDay: 9,
    shifts, shiftDefinitions: [...definitions, { code: 'DBS', shift_type: 'special' }],
    dbsShiftCode: 'DBS',
    config: {
      enabled: true,
      employeePool: ['Kok Chun', 'Ben Berg'],
      employeeRules: { 'Kok Chun': { dbs_cover: { early: [1, 2, 3, 4, 5, 0] } } },
      requirements: [{ id: 'early', weekdays: [0, 1, 2, 3, 4, 5, 6], shift_type: 'early', staff: 1 }],
    },
  });
  const whoOn = (date) => plan.assignments.filter((entry) => entry.date === date).map((entry) => `${entry.employee_name}:${entry.shift_code}`);
  assert.deepEqual(whoOn('2027-01-03'), ['Kok Chun:DBS'], 'Sunday');
  assert.deepEqual(whoOn('2027-01-04'), ['Kok Chun:DBS'], 'Monday');
  assert.deepEqual(whoOn('2027-01-08'), ['Kok Chun:DBS'], 'Friday');
  assert.deepEqual(whoOn('2027-01-09'), ['Ben Berg:E1'], 'Saturday: not covered by DBS, the early person takes it');
  // without the rule the DBS duty never counts as Colo
  const without = buildColoRolePlan({
    year: 2027, month: 1, numDays: 31, startDay: 4, endDay: 4,
    shifts, shiftDefinitions: [...definitions, { code: 'DBS', shift_type: 'special' }], dbsShiftCode: 'DBS',
    config: { enabled: true, employeePool: ['Kok Chun', 'Ben Berg'], requirements: [{ id: 'early', weekdays: [1], shift_type: 'early', staff: 1 }] },
  });
  assert.deepEqual(without.assignments.map((entry) => entry.employee_name), ['Ben Berg']);
});

test('generator: the DBS holder with a DBS cover rule is the Colo person on those days, nobody else is added for it', async () => {
  const { default: pool } = await import('../db.js');
  const { generateShiftPlan } = await import('../routes/shiftplanControl.js');
  const { createFakePlanningDb } = await import('./helpers/fakePlanningDb.js');
  const run = async (withRule) => {
    const { db, query } = createFakePlanningDb();
    pool.query = query;
    const names = Array.from({ length: 30 }, (_, index) => `Test Person ${String(index).padStart(2, '0')}`);
    db.employees = names;
    db.preferences = names.map((name, index) => ({
      user_id: 800 + index, first_name: 'Test', last_name: name, provisioned_employee_name: name,
      preferred_shifts: [], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [],
      max_nights_per_month: null, max_weekends_per_month: null, night_model: 'SEVEN_DAY', monthly_preferences: {}, preferred_colleagues: [],
    }));
    db.settings.set('shiftplan.dbs_enabled', 'true');
    db.specialPools = [{ shift_code: 'DBS', employee_name: names[0], monthly_max_assignments: 31, working_weekdays: [1, 2, 3, 4, 5, 6], free_days_after_block: 2, duration_hours: null, other_shift_codes: [], other_days_per_month: null, sort_order: 0 }];
    db.settings.set('shiftplan.colo_enabled', 'true');
    db.settings.set('shiftplan.colo_pool', JSON.stringify(names.slice(0, 6)));
    db.settings.set('shiftplan.colo_requirements', JSON.stringify([{ id: 'early', weekdays: [1, 2, 3, 4, 5], shift_type: 'early', staff: 1 }]));
    if (withRule) db.settings.set('shiftplan.colo_pool_rules', JSON.stringify({ [names[0]]: { dbs_cover: { early: [1, 2, 3, 4, 5] } } }));
    const result = await generateShiftPlan(2027, 2, 28, 'test', {});
    return { result, names };
  };
  const { result, names } = await run(true);
  const dbsDays = result.shifts.filter((shift) => shift.employee_name === names[0] && shift.shift_code === 'DBS').map((shift) => shift.day);
  assert.ok(dbsDays.length >= 10, `the DBS person works DBS (${dbsDays.length} days)`);
  const colo = result.configSnapshot?.coloAssignments ?? result.config_snapshot?.coloAssignments ?? result.coloAssignments ?? [];
  const weekdayDbsDays = dbsDays.filter((day) => { const weekday = new Date(2027, 1, day).getDay(); return weekday >= 1 && weekday <= 5; });
  for (const day of weekdayDbsDays) {
    const date = `2027-02-${String(day).padStart(2, '0')}`;
    const forDay = colo.filter((entry) => entry.date === date);
    assert.deepEqual(forDay.map((entry) => `${entry.employee_name}:${entry.shift_code}`), [`${names[0]}:DBS`], date);
  }
  assert.equal(result.planReport?.coloRepair?.filter((entry) => weekdayDbsDays.includes(entry.day)).length ?? 0, 0, 'no extra early person planned on those days');
});
