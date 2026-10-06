import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDateKey, vacationSummary } from '../lib/vacationDays.js';

test('vacation counts weekdays only and deduplicates overlapping periods', () => {
  const result = vacationSummary([
    { start_date: '2026-10-02', end_date: '2026-10-06' },
    { start_date: '2026-10-05', end_date: '2026-10-09' },
  ], 2026);
  assert.equal(result.used, 6);
  assert.equal(result.remaining, 24);
  assert.equal(result.monthlyDays[9], 6);
});

test('vacation clips periods to the selected year including leap day', () => {
  const entries = [{ start_date: '2023-12-29', end_date: '2024-01-03' }, { start_date: '2024-02-29', end_date: '2024-03-01' }];
  assert.equal(vacationSummary(entries, 2023).used, 1);
  assert.deepEqual(vacationSummary(entries, 2024).monthlyDays.slice(0, 3), [3, 1, 1]);
});

test('vacation permits a negative balance and deleting entries restores days', () => {
  const entries = [{ start_date: '2026-01-01', end_date: '2026-02-28' }];
  assert.equal(vacationSummary(entries, 2026).remaining, -12);
  assert.equal(vacationSummary([], 2026).remaining, 30);
});

test('vacation date validation rejects malformed and impossible dates', () => {
  assert.equal(isDateKey('2024-02-29'), true);
  for (const date of ['2026-02-29', '2026-13-01', '2026-04-31', '2026-1-01', null]) assert.equal(isDateKey(date), false);
});
