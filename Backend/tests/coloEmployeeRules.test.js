import test from 'node:test';
import assert from 'node:assert/strict';

import { buildColoRolePlan, normalizeColoPlanningConfig } from '../lib/coloPlanning.js';

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
