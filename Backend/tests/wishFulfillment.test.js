import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WISH_STATUS, evaluateMonthWishes } from '../lib/wishFulfillment.js';

// August 2026: 2026-08-03 is a Monday, 08-01 a Saturday.
const base = { year: 2026, month: 8 };

describe('evaluateMonthWishes', () => {
  it('scores preferred shifts by the share of matching shifts', () => {
    const result = evaluateMonthWishes({
      ...base,
      shiftsByDay: { 3: 'E1', 4: 'E1', 5: 'L1', 6: 'E2' },
      preferences: { preferred_shifts: ['E1', 'E2'] },
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].percent, 75);
    assert.equal(result.items[0].status, WISH_STATUS.PARTIAL);
    assert.equal(result.percent, 75);
  });

  it('counts every unwanted shift against the wish and lists the days', () => {
    const result = evaluateMonthWishes({
      ...base,
      shiftsByDay: { 3: 'N', 4: 'E1', 5: 'E1', 6: 'E1' },
      preferences: { unwanted_shifts: ['N'] },
    });
    const item = result.items[0];
    assert.equal(item.percent, 75);
    assert.match(item.detail, /03\.08\. \(N\)/);
  });

  it('marks a holiday wish as not met when the employee works that day', () => {
    const result = evaluateMonthWishes({
      ...base,
      shiftsByDay: { 3: 'E1' },
      preferences: { preferred_holidays: ['Testfeiertag'] },
      holidays: { '2026-08-03': 'Testfeiertag' },
    });
    assert.equal(result.items[0].status, WISH_STATUS.NOT_MET);
    assert.equal(result.percent, 0);
  });

  it('checks the night limit and ignores absences as work', () => {
    const result = evaluateMonthWishes({
      ...base,
      shiftsByDay: { 3: 'N', 4: 'N', 5: 'N', 6: 'ABW' },
      preferences: { max_nights_per_month: 3 },
      definitions: [{ code: 'N', shift_type: 'night', is_active: true }],
    });
    assert.equal(result.items[0].status, WISH_STATUS.MET);
    assert.match(result.items[0].detail, /3 Nächte/);
  });

  it('only evaluates blocked weekdays while the admin switch is on', () => {
    const preferences = { blocked_days: [1] }; // Monday
    const shiftsByDay = { 3: 'E1' };
    assert.equal(evaluateMonthWishes({ ...base, shiftsByDay, preferences, blockedDaysEnabled: false }).items.length, 0);
    const on = evaluateMonthWishes({ ...base, shiftsByDay, preferences, blockedDaysEnabled: true });
    assert.equal(on.items.length, 1);
    assert.ok(on.items[0].percent < 100);
  });

  it('has no percentage when the employee has no wishes', () => {
    const result = evaluateMonthWishes({ ...base, shiftsByDay: { 3: 'E1' }, preferences: null });
    assert.equal(result.percent, null);
    assert.deepEqual(result.items, []);
  });
});
