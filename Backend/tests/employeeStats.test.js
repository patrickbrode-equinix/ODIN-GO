import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEmployeeOverview } from '../lib/employeeStats.js';
import { aggregateYearlyHours, buildShiftHoursLookup } from '../lib/shiftHours.js';
import { formatShiftMonthLabel } from '../lib/shiftplanMonth.js';

test('employee overview counts shift types, nights, weekends, holidays and absence days', () => {
  const definitions = [
    { code: 'E1', shift_type: 'early', duration_hours: 8 },
    { code: 'L1', shift_type: 'late', duration_hours: 8 },
    { code: 'N', shift_type: 'night', duration_hours: 8 },
  ];
  const month = formatShiftMonthLabel(2027, 3);
  const shifts = [
    { month, employee_name: 'Anna', day: 26, shift_code: 'E1' }, // Karfreitag (Friday, holiday)
    { month, employee_name: 'Anna', day: 27, shift_code: 'N' }, // Saturday
    { month, employee_name: 'Anna', day: 28, shift_code: 'N' }, // Sunday
    { month, employee_name: 'Anna', day: 29, shift_code: 'L1' },
    { month, employee_name: 'Anna', day: 30, shift_code: 'ABW' }, // absence marker, no shift
    { month, employee_name: 'Ben', day: 2, shift_code: 'E1' },
  ];
  const absences = [{ employee_name: 'Ben', start_date: '2027-03-08', end_date: '2027-03-14', type: 'VACATION' }]; // Mon-Fri = 5 days
  const summary = aggregateYearlyHours({ year: 2027, shifts, absences, shiftHoursLookup: buildShiftHoursLookup(definitions) });
  const overview = buildEmployeeOverview({ year: 2027, summary, shifts, absences, definitions });
  const anna = overview.employees.find((entry) => entry.employee_name === 'Anna');
  const ben = overview.employees.find((entry) => entry.employee_name === 'Ben');
  assert.equal(anna.total_shifts, 4);
  assert.equal(anna.night_shifts, 2);
  assert.equal(anna.early_shifts, 1);
  assert.equal(anna.late_shifts, 1);
  assert.equal(anna.saturday_days, 1);
  assert.equal(anna.sunday_days, 1);
  assert.equal(anna.weekend_days, 2);
  assert.equal(anna.holiday_days, 2); // Karfreitag 26.03. + Ostermontag 29.03.
  assert.ok(anna.actual_hours > 0);
  assert.equal(ben.absence_days.vacation, 5);
  assert.equal(ben.absence_days.total, 5);
  assert.equal(overview.totals.employees, 2);
  assert.equal(overview.totals.night_shifts, 2);
});
