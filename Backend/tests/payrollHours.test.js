import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEmployeeMonthHours } from '../lib/payrollHours.js';

const definitions = [
  { code: 'E1', duration_hours: 8, start_time: '06:30', end_time: '15:30', start_day_offset: 0, end_day_offset: 0 },
  { code: 'N', duration_hours: 8.5, start_time: '21:15', end_time: '06:45', start_day_offset: 0, end_day_offset: 1 },
];

test('supplement hours come from the real shift times (night 20-6, Sunday, holiday)', () => {
  // 2027-03-26 is Karfreitag (Friday), 2027-03-28 Sunday (Easter Sunday), 2027-03-23 an ordinary Tuesday
  const result = buildEmployeeMonthHours({
    year: 2027,
    month: 3,
    shifts: [
      { day: 23, shift_code: 'E1' },
      { day: 26, shift_code: 'E1' },
      { day: 27, shift_code: 'N' },
      { day: 28, shift_code: 'E1' },
      { day: 29, shift_code: 'KRANK' },
    ],
    definitions,
  });
  const byDate = Object.fromEntries(result.shifts.map((row) => [row.date, row]));
  assert.equal(byDate['2027-03-23'].night, 0);
  assert.ok(byDate['2027-03-26'].holiday >= 7.9, 'Karfreitag: the whole shift is a holiday');
  assert.ok(byDate['2027-03-27'].night > 7, 'night shift: most hours are night hours');
  assert.ok(byDate['2027-03-27'].sunday > 0, 'the night shift reaches into Sunday');
  assert.ok(byDate['2027-03-28'].sunday >= 7.9);
  assert.equal(byDate['2027-03-29'].code, 'ABW', 'sick leave reads as a neutral absence');
  assert.equal(result.totals.workedShifts, 4);
  assert.equal(result.totals.absenceDays, 1);
});

test('federal state decides the holidays: 6.1. and 1.11. are holidays in Bayern only', () => {
  // 2027-01-06 is a Wednesday, 2027-11-01 a Monday
  const he = buildEmployeeMonthHours({ year: 2027, month: 1, shifts: [{ day: 6, shift_code: 'E1' }], definitions, state: 'HE' });
  const by = buildEmployeeMonthHours({ year: 2027, month: 1, shifts: [{ day: 6, shift_code: 'E1' }], definitions, state: 'BY' });
  assert.equal(he.totals.holidayHours, 0);
  assert.ok(by.totals.holidayHours >= 7.9, 'Heilige Drei Könige counts in Bayern');
  const allSaints = buildEmployeeMonthHours({ year: 2027, month: 11, shifts: [{ day: 1, shift_code: 'E1' }], definitions, state: 'BY' });
  assert.ok(allSaints.totals.holidayHours >= 7.9, 'Allerheiligen counts in Bayern');
});

test('24.12. and 31.12. count as holiday only from 12:00 (half day), 25.12. fully', () => {
  const late = [{ code: 'L1', duration_hours: 8, start_time: '13:00', end_time: '21:00', start_day_offset: 0, end_day_offset: 0 }, ...definitions];
  const early = buildEmployeeMonthHours({ year: 2027, month: 12, shifts: [{ day: 24, shift_code: 'E1' }, { day: 25, shift_code: 'E1' }], definitions });
  const byDate = Object.fromEntries(early.shifts.map((row) => [row.date, row]));
  assert.ok(byDate['2027-12-24'].holiday < 4, '24.12. morning shift: mostly before noon, only a small part is holiday');
  assert.ok(byDate['2027-12-25'].holiday >= 7.9, '25.12. is a full holiday');
  const afternoon = buildEmployeeMonthHours({ year: 2027, month: 12, shifts: [{ day: 31, shift_code: 'L1' }], definitions: late });
  assert.ok(afternoon.totals.holidayHours >= 7.9, '31.12. afternoon shift is fully after noon');
});
