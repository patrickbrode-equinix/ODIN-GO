import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePlanningHealth, getAllowedShiftTypes } from '../lib/planningHealth.js';

const rotation = {
  max_consecutive_workdays: 6, max_nights_per_month: 7, max_weekends_per_month: 2, min_free_weekends_per_month: 2,
  late_before_night_required: false,
};
const staffingRules = [
  { shift_type: 'early', min_count: 6, max_count: null },
  { shift_type: 'late', min_count: 4, max_count: 8 },
  { shift_type: 'night', min_count: 4, max_count: 5 },
];
const planConfig = { respect_employee_wishes: true, monthly_target_hours: 174 };
const ids = (issues) => issues.map((issue) => issue.id);

test('a clean default configuration produces no errors', () => {
  const issues = analyzePlanningHealth({ rotation, planConfig, staffingRules, employeeCount: 40, preferences: [] });
  assert.deepEqual(issues.filter((issue) => issue.level === 'error'), []);
});

test('binding wishes decide which shift types an employee can work', () => {
  const strengths = { preferred_shifts: 100, unwanted_shifts: 100 };
  assert.deepEqual([...getAllowedShiftTypes({ preferred_shifts: ['L2'] }, strengths)], ['late']);
  assert.deepEqual([...getAllowedShiftTypes({ unwanted_shifts: ['N'] }, strengths)].sort(), ['early', 'late']);
  assert.equal(getAllowedShiftTypes({ unwanted_shifts: ['L2'] }, strengths), null);
  assert.equal(getAllowedShiftTypes({ preferred_shifts: ['L2'] }, { preferred_shifts: 50, unwanted_shifts: 100 }), null);
});

test('more late-only employees than the late maximum is reported', () => {
  const preferences = Array.from({ length: 9 }, (_, index) => ({ name: `Spaet ${index}`, preferred_shifts: ['L1'] }));
  const issues = analyzePlanningHealth({ rotation, planConfig, staffingRules, employeeCount: 40, preferences });
  assert.ok(ids(issues).includes('wish-exclusive-late'));
});

test('night-only wishes against a small night limit are reported', () => {
  const preferences = [{ name: 'Nacht', preferred_shifts: ['N'] }];
  const issues = analyzePlanningHealth({ rotation, planConfig, staffingRules, employeeCount: 40, preferences });
  assert.ok(ids(issues).includes('wish-night-only-limit'));
});

test('contradicting numbers are errors', () => {
  const issues = analyzePlanningHealth({
    rotation: { ...rotation, late_before_night_required: true, min_free_weekends_per_month: 3 },
    planConfig,
    staffingRules: [{ shift_type: 'late', min_count: 5, max_count: 3 }],
    employeeCount: 40,
  });
  assert.ok(ids(issues).includes('staffing-min-max-late'));
  assert.ok(ids(issues).includes('late-before-night'));
  assert.ok(ids(issues).includes('weekends-free-vs-max'));
  assert.equal(issues[0].level, 'error');
});

test('wishes switched off are reported once instead of silently ignoring the strengths', () => {
  const issues = analyzePlanningHealth({ rotation, planConfig: { ...planConfig, respect_employee_wishes: false }, staffingRules, employeeCount: 10 });
  assert.ok(ids(issues).includes('wishes-master-off'));
});

test('DBS and Colo pools are checked against their demand', () => {
  const issues = analyzePlanningHealth({
    rotation, planConfig, staffingRules, employeeCount: 40,
    dbsConfig: { enabled: true, shiftCode: 'DBS' },
    dbsPool: [{ employee_name: 'Ben', working_weekdays: [1, 2, 3], other_shift_codes: ['NIGHT'] }],
    preferences: [{ name: 'Ben', blocked_days: [2] }],
    coloConfig: { enabled: true, employeePool: ['A'], requirements: [{ id: 'x', weekdays: [1], shift_type: 'early', staff: 2 }] },
  });
  assert.ok(ids(issues).includes('dbs-pool-single'));
  assert.ok(ids(issues).includes('dbs-blocked-Ben'));
  assert.ok(ids(issues).includes('dbs-outside-night-Ben'));
  assert.ok(ids(issues).includes('colo-pool-too-small'));
});
