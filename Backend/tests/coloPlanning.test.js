import test from 'node:test';
import assert from 'node:assert/strict';
import { buildColoRolePlan, normalizeColoPlanningConfig } from '../lib/coloPlanning.js';

const shiftDefinitions = [
  { code: 'E1', shift_type: 'early' },
  { code: 'L1', shift_type: 'late' },
  { code: 'N', shift_type: 'night' },
];

test('normalizes a persisted Colo configuration', () => {
  assert.deepEqual(normalizeColoPlanningConfig({
    enabled: 'true',
    employeePool: '["Anna Beispiel","Anna Beispiel","Ben Test"]',
    weekdayPreparationStaff: '2',
  }), {
    enabled: true,
    employeePool: ['Anna Beispiel', 'Ben Test'],
    weekdayPreparationStaff: 2,
    weekendInstallationStaff: 1,
    weekendTroubleshootingStaff: 1,
  });
});

test('assigns weekday preparation only to a working daytime pool employee', () => {
  const result = buildColoRolePlan({
    year: 2026,
    month: 8,
    numDays: 31,
    startDay: 3,
    endDay: 3,
    shiftDefinitions,
    config: { enabled: true, employeePool: ['Anna Beispiel', 'Nina Nacht'] },
    shifts: [
      { employee_name: 'Anna Beispiel', day: 3, shift_code: 'E1' },
      { employee_name: 'Nina Nacht', day: 3, shift_code: 'N' },
    ],
  });

  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].employee_name, 'Anna Beispiel');
  assert.equal(result.assignments[0].comment, 'Colo Vorbereitung');
});

test('splits weekend installation and troubleshooting across different employees', () => {
  const result = buildColoRolePlan({
    year: 2026,
    month: 8,
    numDays: 31,
    startDay: 1,
    endDay: 2,
    shiftDefinitions,
    config: { enabled: true, employeePool: ['Anna Beispiel', 'Ben Test'] },
    shifts: [
      { employee_name: 'Anna Beispiel', day: 1, shift_code: 'E1' },
      { employee_name: 'Ben Test', day: 1, shift_code: 'L1' },
      { employee_name: 'Anna Beispiel', day: 2, shift_code: 'E1' },
      { employee_name: 'Ben Test', day: 2, shift_code: 'L1' },
    ],
  });

  const saturday = result.assignments.filter((entry) => entry.date === '2026-08-01');
  assert.equal(saturday.length, 2);
  assert.equal(new Set(saturday.map((entry) => entry.employee_name)).size, 2);
  assert.deepEqual(new Set(saturday.map((entry) => entry.comment)), new Set(['Colo Installation', 'Colo Troubleshooting']));
});

test('honors blocked-day and explicit no-COLO wishes', () => {
  const result = buildColoRolePlan({
    year: 2026,
    month: 8,
    numDays: 31,
    startDay: 3,
    endDay: 3,
    shiftDefinitions,
    config: { enabled: true, employeePool: ['Anna Beispiel', 'Ben Test'] },
    shifts: [
      { employee_name: 'Anna Beispiel', day: 3, shift_code: 'E1' },
      { employee_name: 'Ben Test', day: 3, shift_code: 'L1' },
    ],
    preferencesByEmployee: new Map([
      ['Anna Beispiel', { blocked_days: [1] }],
      ['Ben Test', { unwanted_shifts: ['COLO'] }],
    ]),
  });

  assert.equal(result.assignments.length, 0);
  assert.equal(result.conflicts[0].type, 'colo_understaffed');
  assert.equal(result.conflicts[0].missing, 1);
});
