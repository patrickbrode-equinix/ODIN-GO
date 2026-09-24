import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildDailyShiftSlots,
  buildShiftSlots,
  buildStaffingMaximumsByShiftType,
  normalizeExclusionWeekdays,
} from '../lib/shiftplanGeneration.js';

const lateDefinitions = [
  { code: 'L1', shift_type: 'late', min_staff: 1, max_staff: 8, duration_hours: 9 },
  { code: 'L2', shift_type: 'late', min_staff: 1, max_staff: 8, duration_hours: 9 },
];

describe('cumulative staffing per shift type', () => {
  it('reads maximums and treats missing values as unlimited', () => {
    assert.deepEqual(
      buildStaffingMaximumsByShiftType([
        { shift_type: 'early', min_count: 6, max_count: null },
        { shift_type: 'late', min_count: 4, max_count: 8 },
        { shift_type: 'N', min_count: 4, max_count: 5 },
      ]),
      { late: 8, night: 5 },
    );
  });

  it('distributes the cumulative minimum across definitions', () => {
    const slots = buildShiftSlots(lateDefinitions, { late: 4 }, null, { late: 8 });
    assert.equal(slots.reduce((sum, slot) => sum + slot.planned_slots, 0), 4);
  });

  it('never plans more extra slots than the cumulative maximum', () => {
    const slots = buildDailyShiftSlots({
      shiftDefinitions: lateDefinitions,
      staffingRules: { late: 4 },
      staffingMaximums: { late: 8 },
      activeEmployees: Array.from({ length: 30 }, (_, index) => `E${index}`),
      employeeHours: {},
      monthlyTargetHours: 174,
      day: 20,
      numDays: 31,
      dayOfWeek: 3,
    });
    assert.equal(slots.reduce((sum, slot) => sum + slot.planned_slots, 0), 8);
  });
});

describe('exclusion weekdays', () => {
  it('defaults to the whole week', () => {
    assert.deepEqual(normalizeExclusionWeekdays(null), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(normalizeExclusionWeekdays([]), [0, 1, 2, 3, 4, 5, 6]);
  });

  it('parses stored JSON weekdays', () => {
    assert.deepEqual(normalizeExclusionWeekdays('[5,1,1,9]'), [1, 5]);
  });
});
