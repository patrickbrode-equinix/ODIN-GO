import test from 'node:test';
import assert from 'node:assert/strict';
import { buildColoRolePlan, getMaxColoStaffPerDay, normalizeColoPlanningConfig, normalizeColoRequirements } from '../lib/coloPlanning.js';

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
    requirements: [
      { id: 'preparation', label: 'Colo Vorbereitung (Börse: E-Mail/Telefon)', weekdays: [1, 2, 3, 4, 5], shift_type: 'early', staff: 2 },
      { id: 'night', label: 'Colo Nacht', weekdays: [0, 1, 2, 3, 4, 5, 6], shift_type: 'night', staff: 1 },
      { id: 'weekend', label: 'Colo Wochenende (Arbeiten vor Ort)', weekdays: [0, 6], shift_type: 'early', staff: 1 },
    ],
  });
  const weekend = normalizeColoPlanningConfig({ weekendInstallationStaff: '2' }).requirements.find((entry) => entry.id === 'weekend');
  assert.equal(weekend.staff, 2);
});

test('assigns weekday early preparation and the nightly Colo cover to matching pool employees', () => {
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

  assert.equal(result.assignments.length, 2);
  const preparation = result.assignments.find((entry) => entry.task_key === 'preparation');
  const night = result.assignments.find((entry) => entry.task_key === 'night');
  assert.equal(preparation.employee_name, 'Anna Beispiel');
  assert.match(preparation.comment, /Börse/);
  assert.equal(night.employee_name, 'Nina Nacht');
  assert.equal(night.comment, 'Colo Nacht – Leitungsvorbereitung');
});

test('does not use a late shift for weekday Colo preparation', () => {
  const result = buildColoRolePlan({
    year: 2026,
    month: 8,
    numDays: 31,
    startDay: 3,
    endDay: 3,
    shiftDefinitions,
    config: { enabled: true, employeePool: ['Ben Test'], nightStaff: 0 },
    shifts: [{ employee_name: 'Ben Test', day: 3, shift_code: 'L1' }],
  });

  assert.equal(result.assignments.length, 0);
  assert.equal(result.conflicts[0].task, 'preparation');
});

test('staffs weekend early Colo work and the weekend night execution', () => {
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
      { employee_name: 'Ben Test', day: 1, shift_code: 'N' },
      { employee_name: 'Anna Beispiel', day: 2, shift_code: 'E1' },
      { employee_name: 'Ben Test', day: 2, shift_code: 'N' },
    ],
  });

  const saturday = result.assignments.filter((entry) => entry.date === '2026-08-01');
  assert.equal(saturday.length, 2);
  assert.equal(saturday.find((entry) => entry.task_key === 'weekend').employee_name, 'Anna Beispiel');
  assert.equal(saturday.find((entry) => entry.task_key === 'night').comment, 'Colo Nacht – Ausführung');
  assert.equal(result.conflicts.length, 0);
});

test('honors blocked-day and explicit no-COLO wishes', () => {
  const result = buildColoRolePlan({
    year: 2026,
    month: 8,
    numDays: 31,
    startDay: 3,
    endDay: 3,
    shiftDefinitions,
    config: { enabled: true, employeePool: ['Anna Beispiel', 'Ben Test'], nightStaff: 0 },
    shifts: [
      { employee_name: 'Anna Beispiel', day: 3, shift_code: 'E1' },
      { employee_name: 'Ben Test', day: 3, shift_code: 'E1' },
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

test('free requirements: chosen weekdays, shift type and head count decide the demand', () => {
  const config = {
    enabled: true,
    employeePool: ['Anna Beispiel', 'Ben Test', 'Cora Spaet'],
    requirements: [
      { id: 'a', weekdays: [1, 3], shift_type: 'early', staff: 2 },
      { id: 'b', weekdays: [3], shift_type: 'late', staff: 1, label: 'Colo Spät Mittwoch' },
    ],
  };
  assert.deepEqual(normalizeColoPlanningConfig(config).requirements.map((entry) => entry.id), ['a', 'b']);
  assert.equal(getMaxColoStaffPerDay(config), 3);

  // 2026-08-05 is a Wednesday: both requirements apply.
  const wednesday = buildColoRolePlan({
    year: 2026, month: 8, numDays: 31, startDay: 5, endDay: 5, shiftDefinitions, config,
    shifts: [
      { employee_name: 'Anna Beispiel', day: 5, shift_code: 'E1' },
      { employee_name: 'Ben Test', day: 5, shift_code: 'E1' },
      { employee_name: 'Cora Spaet', day: 5, shift_code: 'L1' },
    ],
  });
  assert.equal(wednesday.assignments.length, 3);
  assert.equal(wednesday.assignments.find((entry) => entry.task_key === 'b').employee_name, 'Cora Spaet');
  assert.equal(wednesday.assignments.find((entry) => entry.task_key === 'b').comment, 'Colo Spät Mittwoch');
  assert.equal(wednesday.conflicts.length, 0);

  // 2026-08-04 is a Tuesday: no requirement applies, nothing is planned and nothing is missing.
  const tuesday = buildColoRolePlan({
    year: 2026, month: 8, numDays: 31, startDay: 4, endDay: 4, shiftDefinitions, config,
    shifts: [{ employee_name: 'Anna Beispiel', day: 4, shift_code: 'E1' }],
  });
  assert.equal(tuesday.assignments.length, 0);
  assert.equal(tuesday.summary.requiredAssignments, 0);
});

test('an empty saved requirement list means no Colo demand (the legacy counts no longer apply)', () => {
  assert.deepEqual(normalizeColoPlanningConfig({ enabled: true, requirements: '[]', nightStaff: 3 }).requirements, []);
  assert.equal(normalizeColoPlanningConfig({ enabled: true, requirements: 'not json', nightStaff: 3 }).requirements.find((entry) => entry.id === 'night').staff, 3);
  assert.deepEqual(normalizeColoRequirements([{ weekdays: [], shift_type: 'early', staff: 1 }, { weekdays: [1], shift_type: 'special', staff: 1 }, { weekdays: [1], shift_type: 'early', staff: 0 }]), []);
});
