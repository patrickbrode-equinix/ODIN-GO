import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aggregateYearlyHours,
  countWeekdaysInYear,
  DEFAULT_ANNUAL_TARGET_HOURS,
  DEFAULT_MONTHLY_TARGET_HOURS,
  getDailyCreditedHours,
  getWorkdayBasedTargetHours,
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

  it('distributes the annual target by Mon-Fri working days per month', () => {
    // 2026 has 261 weekdays -> 2088h / 261 = 8h per weekday
    assert.equal(countWeekdaysInYear(2026), 261);
    assert.equal(getWorkdayBasedTargetHours({ year: 2026, month: 11 }), 168);
    assert.equal(getWorkdayBasedTargetHours({ year: 2026, month: 10 }), 176);
    assert.equal(getWorkdayBasedTargetHours({ year: 2026, month: 11, startDay: 1, endDay: 15 }), 80);
    let sum = 0;
    for (let month = 1; month <= 12; month++) sum += getWorkdayBasedTargetHours({ year: 2026, month });
    assert.equal(Math.round(sum), DEFAULT_ANNUAL_TARGET_HOURS);
    const result = aggregateYearlyHours({ year: 2026, shifts: [], absences: [], shiftHoursLookup: {} });
    assert.equal(result.employees.length, 0);
  });
});

describe('double-pay days (24.12. / 31.12.)', () => {
  it('pays hours from 12:00 twice and deducts the break only from 6h presence', async () => {
    const { getDoublePayDayHours } = await import('../lib/shiftHours.js');
    // 06:30-15:30: 9h presence - 1h break + 3.5h after 12:00
    assert.equal(getDoublePayDayHours({ startTime: '06:30:00', endTime: '15:30:00' }), 11.5);
    // 13:00-22:00: 9h - 1h + 9h
    assert.equal(getDoublePayDayHours({ startTime: '13:00', endTime: '22:00' }), 17);
    // 06:30-10:30: 4h presence, no break, nothing after 12:00
    assert.equal(getDoublePayDayHours({ startTime: '06:30', endTime: '10:30' }), 4);
    // Night 21:15-06:45: only 21:15-24:00 (2.75h) is doubled, 9.5h - 1h break
    assert.equal(getDoublePayDayHours({ startTime: '21:15', endTime: '06:45', endDayOffset: 1 }), 11.25);
  });

  it('uses the double-pay rule for 24.12. in the yearly aggregation only', () => {
    const times = new Map([['E1', { startTime: '06:30', endTime: '15:30', startDayOffset: 0, endDayOffset: 0 }]]);
    const result = aggregateYearlyHours({
      year: 2026,
      shifts: [
        { month: 'Dezember 2026', employee_name: 'Alice', day: 24, shift_code: 'E1' },
        { month: 'Dezember 2026', employee_name: 'Alice', day: 22, shift_code: 'E1' },
      ],
      absences: [],
      shiftHoursLookup: { E1: 8 },
      shiftTimesLookup: times,
    });
    assert.equal(result.employees[0].actual_hours, 11.5 + 8);
  });
});
