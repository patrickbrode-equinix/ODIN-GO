import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMonthlyPreferences } from '../lib/understaffingSuggestions.js';

const base = {
  preferred_shifts: ['E1'],
  unwanted_shifts: ['N'],
  monthly_preferences: {
    '2027-02': { preferred_shifts: ['N'], unwanted_shifts: ['E1'] },
    '2027-03': { preferred_shifts: [], unwanted_shifts: [] },
    '2027-04': { preferred_shifts: ['L1', 'E1'], unwanted_shifts: ['E1'] },
  },
};

test('a month with a selection replaces the general wishes completely', () => {
  const february = mergeMonthlyPreferences(base, '2027-02');
  assert.deepEqual(february.preferred_shifts, ['N']);
  assert.deepEqual(february.unwanted_shifts, ['E1'], 'the general taboo N does not block the month in which N is wished');
});

test('a month without any selection is no wish: the general wishes apply', () => {
  assert.equal(mergeMonthlyPreferences(base, '2027-03'), base);
  assert.equal(mergeMonthlyPreferences(base, '2027-05'), base);
});

test('a shift that is wanted and unwanted in the same month stays a taboo', () => {
  const april = mergeMonthlyPreferences(base, '2027-04');
  assert.deepEqual(april.preferred_shifts, ['L1']);
  assert.deepEqual(april.unwanted_shifts, ['E1']);
});
