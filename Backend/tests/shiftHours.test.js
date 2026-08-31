import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aggregateYearlyHours,
  DEFAULT_ANNUAL_TARGET_HOURS,
  DEFAULT_MONTHLY_TARGET_HOURS,
  getDailyCreditedHours,
} from '../lib/shiftHours.js';

describe('shiftHours helpers', () => {
  it('credits ABW and paid absences while keeping FS at zero hours', () => {
    assert.equal(getDailyCreditedHours({ shiftCode: 'ABW', isWeekend: false }), 8);
    assert.equal(getDailyCreditedHours({ shiftCode: 'FS', isWeekend: false }), 0);
    assert.equal(getDailyCreditedHours({ absenceType: 'VACATION', isWeekend: false }), 8);
    assert.equal(getDailyCreditedHours({ absenceType: 'TRAINING', isWeekend: true }), 0);
    assert.equal(getDailyCreditedHours({ shiftCode: 'E1', shiftHours: 8, isHoliday: true }), 8);
  });

  it('aggregates monthly and annual hours without double-counting absence days with shifts', () => {
    const result = aggregateYearlyHours({
      year: 2026,
      shifts: [
        { month: 'Januar 2026', employee_name: 'Alice', day: 5, shift_code: 'E1' },
        { month: 'Januar 2026', employee_name: 'Alice', day: 6, shift_code: 'ABW' },
        { month: 'Januar 2026', employee_name: 'Alice', day: 7, shift_code: 'FS' },
        { month: 'Januar 2026', employee_name: 'Bob', day: 8, shift_code: 'N' },
      ],
      absences: [
        { employee_name: 'Alice', start_date: '2026-01-08', end_date: '2026-01-09', type: 'SICK' },
        { employee_name: 'Bob', start_date: '2026-01-08', end_date: '2026-01-08', type: 'VACATION' },
      ],
      shiftHoursLookup: { E1: 8, N: 8 },
      monthlyTargetHours: 174,
      annualTargetHours: 2088,
    });

    assert.equal(result.employees.length, 2);

    const alice = result.employees.find((entry) => entry.employee_name === 'Alice');
    const bob = result.employees.find((entry) => entry.employee_name === 'Bob');

    assert.equal(alice.actual_hours, 32);
    assert.equal(alice.months[0].actual_hours, 32);
    assert.equal(bob.actual_hours, 8);
    assert.equal(bob.months[0].actual_hours, 8);
    assert.equal(result.team_actual_hours, 40);
  });

  it('falls back to monthly and annual defaults when targets are missing', () => {
    const result = aggregateYearlyHours({
      year: 2026,
      shifts: [],
      absences: [],
      shiftHoursLookup: {},
    });

    assert.equal(result.monthly_target_hours, DEFAULT_MONTHLY_TARGET_HOURS);
    assert.equal(result.annual_target_hours, DEFAULT_ANNUAL_TARGET_HOURS);
  });
});
