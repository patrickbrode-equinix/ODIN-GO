import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildDayLimitMap,
  buildStaffingForContext,
  resolveStaffingDayContext,
} from '../lib/staffingLimits.js';
import { applyWeekendBlockSlots, buildShiftSlots } from '../lib/shiftplanGeneration.js';

describe('resolveStaffingDayContext', () => {
  it('maps weekdays, weekend days and holidays', () => {
    assert.equal(resolveStaffingDayContext({ dayOfWeek: 3 }), 'weekday');
    assert.equal(resolveStaffingDayContext({ dayOfWeek: 6 }), 'saturday');
    assert.equal(resolveStaffingDayContext({ dayOfWeek: 0 }), 'sunday');
    assert.equal(resolveStaffingDayContext({ dayOfWeek: 3, holidayName: 'Neujahr' }), 'holiday_international');
    assert.equal(resolveStaffingDayContext({ dayOfWeek: 0, holidayName: '1. Weihnachtstag' }), 'holiday_international');
    // Holidays that only exist in Germany (and the company holidays) are national.
    assert.equal(resolveStaffingDayContext({ dayOfWeek: 4, holidayName: 'Christi Himmelfahrt' }), 'holiday_national');
    assert.equal(resolveStaffingDayContext({ dayOfWeek: 4, holidayName: 'Tag der Deutschen Einheit' }), 'holiday_national');
    assert.equal(resolveStaffingDayContext({ dayOfWeek: 4, holidayName: 'Heiligabend' }), 'holiday_national');
  });
});

describe('buildStaffingForContext', () => {
  const weekdayRules = { early: 6, late: 4, night: 4 };
  const weekdayMaximums = { late: 8, night: 5 };
  const dayLimitMap = buildDayLimitMap([
    { day_context: 'sunday', shift_type: 'early', min_count: 2, max_count: 3 },
    { day_context: 'sunday', shift_type: 'late', min_count: 1, max_count: null },
  ]);

  it('keeps the weekday values on weekdays', () => {
    const { rules, maximums } = buildStaffingForContext({ context: 'weekday', weekdayRules, weekdayMaximums, dayLimitMap });
    assert.deepEqual(rules, weekdayRules);
    assert.deepEqual(maximums, weekdayMaximums);
  });

  it('replaces early/late on Sunday but keeps the global night values', () => {
    const { rules, maximums } = buildStaffingForContext({ context: 'sunday', weekdayRules, weekdayMaximums, dayLimitMap });
    assert.deepEqual(rules, { early: 2, late: 1, night: 4 });
    // late has no maximum on Sunday -> unlimited (the weekday cap of 8 is dropped)
    assert.deepEqual(maximums, { early: 3, night: 5 });
  });

  it('falls back to the defaults for missing rows', () => {
    const { rules } = buildStaffingForContext({ context: 'holiday_national', weekdayRules, weekdayMaximums, dayLimitMap: buildDayLimitMap([]) });
    assert.equal(rules.early, 4);
    assert.equal(rules.late, 1);
  });
});

describe('buildShiftSlots with global staffing (per-shift min/max neutralised)', () => {
  const definitions = ['E1', 'E2'].map((code) => ({
    code, shift_type: 'early', min_staff: 0, max_staff: 99, applicable_days: [0, 1, 2, 3, 4, 5, 6],
  }));

  it('distributes the global minimum over E1 and E2 and never exceeds the global maximum', () => {
    // The admin tab rejects min > max; if it ever happens the maximum wins.
    const slots = buildShiftSlots(definitions, { early: 6 }, 2, { early: 4 });
    assert.equal(slots.reduce((sum, slot) => sum + slot.planned_slots, 0), 4);
    assert.ok(slots.every((slot) => slot.planned_slots === 2));
  });

  it('plans exactly the minimum when it is inside the maximum', () => {
    const slots = buildShiftSlots(definitions, { early: 4 }, 2, { early: 6 });
    assert.equal(slots.reduce((sum, slot) => sum + slot.planned_slots, 0), 4);
  });
});

describe('applyWeekendBlockSlots (Monday decides the weekend headcount)', () => {
  const all = [0, 1, 2, 3, 4, 5, 6];
  const slot = (code, series_days, applicable_days, planned_slots) => ({ code, shift_type: 'early', series_days, applicable_days, planned_slots });
  const baseSlots = () => [
    slot('E1', 5, [1, 2, 3, 4, 5], 1),
    slot('E2', 5, [1, 2, 3, 4, 5], 1),
    slot('E1SA', 6, [1, 2, 3, 4, 5, 6], 1),
    slot('E2SA', 6, [1, 2, 3, 4, 5, 6], 1),
    slot('E1WE', 7, all, 1),
    slot('E2WE', 7, all, 1),
  ];
  const planned = (slots) => Object.fromEntries(slots.map((entry) => [entry.code, entry.planned_slots]));
  const total = (slots) => slots.reduce((sum, entry) => sum + entry.planned_slots, 0);

  it('raises the Sunday blocks to the Sunday minimum and keeps the daily total', () => {
    const result = applyWeekendBlockSlots({
      slots: baseSlots(),
      saturday: { early: { min: 4, max: 6 } },
      sunday: { early: { min: 4, max: 6 } },
    });
    assert.equal(planned(result).E1WE + planned(result).E2WE, 4);
    // Saturday needs 4 as well, and the two blocks through Sunday already cover that.
    assert.equal(planned(result).E1SA + planned(result).E2SA, 0);
    assert.equal(total(result), 6);
    assert.equal(planned(result).E1 + planned(result).E2, 2);
  });

  it('does not touch anything when the weekend minimum is already met', () => {
    const result = applyWeekendBlockSlots({
      slots: baseSlots(),
      saturday: { early: { min: 2, max: null } },
      sunday: { early: { min: 2, max: null } },
    });
    assert.deepEqual(planned(result), planned(baseSlots()));
  });

  it('never exceeds the Sunday maximum', () => {
    const result = applyWeekendBlockSlots({
      slots: baseSlots(),
      saturday: null,
      sunday: { early: { min: 5, max: 3 } },
    });
    assert.ok(planned(result).E1WE + planned(result).E2WE <= 3);
  });

  it('cuts the weekend blocks down to the Saturday and Sunday maximum and keeps the daily total', () => {
    const heavy = [
      slot('E1', 5, [1, 2, 3, 4, 5], 5), slot('E2', 5, [1, 2, 3, 4, 5], 5),
      slot('E1SA', 6, [1, 2, 3, 4, 5, 6], 2), slot('E2SA', 6, [1, 2, 3, 4, 5, 6], 2),
      slot('E1WE', 7, all, 3), slot('E2WE', 7, all, 3),
    ];
    const result = applyWeekendBlockSlots({
      slots: heavy,
      saturday: { early: { min: 3, max: 5 } },
      sunday: { early: { min: 1, max: 3 } },
    });
    const sunday = planned(result).E1WE + planned(result).E2WE;
    const saturday = sunday + planned(result).E1SA + planned(result).E2SA;
    assert.ok(sunday >= 1 && sunday <= 3, `Sunday ${sunday}`);
    assert.ok(saturday >= 3 && saturday <= 5, `Saturday ${saturday}`);
    assert.equal(total(result), 20);
  });

  it('respects the weekday maximum when it moves slots to the weekday blocks', () => {
    const heavy = [
      slot('E1', 5, [1, 2, 3, 4, 5], 5), slot('E2', 5, [1, 2, 3, 4, 5], 5),
      slot('E1WE', 7, all, 3), slot('E2WE', 7, all, 3),
    ];
    const result = applyWeekendBlockSlots({
      slots: heavy,
      saturday: { early: { min: 0, max: 2 } },
      sunday: { early: { min: 0, max: 2 } },
      weekdayMaximums: { early: 14 },
    });
    assert.equal(planned(result).E1WE + planned(result).E2WE, 2);
    assert.ok(total(result) <= 14, `total ${total(result)}`);
  });

  it('keeps a single weekend block family inside both limits (late)', () => {
    const late = [{ code: 'L1', shift_type: 'late', series_days: 5, applicable_days: [1, 2, 3, 4, 5], planned_slots: 2 }, { code: 'L1WE', shift_type: 'late', series_days: 7, applicable_days: all, planned_slots: 6 }];
    const result = applyWeekendBlockSlots({
      slots: late,
      saturday: { late: { min: 1, max: 3 } },
      sunday: { late: { min: 2, max: 3 } },
    });
    assert.equal(planned(result).L1WE, 3);
    assert.equal(planned(result).L1, 5);
  });

  it('ignores days outside the plan (null limits)', () => {
    const result = applyWeekendBlockSlots({ slots: baseSlots(), saturday: null, sunday: null });
    assert.deepEqual(planned(result), planned(baseSlots()));
  });
});
