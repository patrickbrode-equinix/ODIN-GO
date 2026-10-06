import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_SHIFT_MODES,
  normalizeFreeDaysAfter,
  normalizeShortNightSeriesDays,
  sanitizeShiftModes,
} from '../lib/shiftDefinitionInput.js';

describe('sanitizeShiftModes', () => {
  it('returns [] for non-arrays and empty arrays', () => {
    assert.deepEqual(sanitizeShiftModes(undefined), []);
    assert.deepEqual(sanitizeShiftModes('x'), []);
    assert.deepEqual(sanitizeShiftModes([]), []);
  });

  it('keeps a valid mode and normalises HH:MM:SS times', () => {
    const [mode] = sanitizeShiftModes([{ id: 2, label: ' Spät ', start_time: '14:00:00', end_time: '22:30', duration_hours: 8.5, free_days_after: 2 }]);
    assert.deepEqual(mode, { id: 2, label: 'Spät', start_time: '14:00', end_time: '22:30', duration_hours: 8.5, free_days_after: 2 });
  });

  it('clamps numbers, falls back for bad times/labels and drops duplicate ids', () => {
    const result = sanitizeShiftModes([
      { id: 1, label: '', start_time: 'abc', end_time: '25:00', duration_hours: 99, free_days_after: 50 },
      { id: 1, label: 'Duplikat' },
      { id: 'x', label: 'B', duration_hours: -3, free_days_after: -1 },
      null,
    ], { start_time: '06:00', end_time: '14:00', duration_hours: 8 });
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], { id: 1, label: 'Modus 1', start_time: '06:00', end_time: '14:00', duration_hours: 24, free_days_after: 14 });
    assert.equal(result[1].id, 3);
    assert.equal(result[1].duration_hours, 0);
    assert.equal(result[1].free_days_after, 0);
  });

  it('limits the number of modes and the label length', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, label: 'x'.repeat(200) }));
    const result = sanitizeShiftModes(many);
    assert.equal(result.length, MAX_SHIFT_MODES);
    assert.equal(result[0].label.length, 60);
  });
});

describe('normalizeFreeDaysAfter / normalizeShortNightSeriesDays', () => {
  it('maps empty values to null and clamps to 0..14', () => {
    assert.equal(normalizeFreeDaysAfter(null), null);
    assert.equal(normalizeFreeDaysAfter(''), null);
    assert.equal(normalizeFreeDaysAfter(undefined), null);
    assert.equal(normalizeFreeDaysAfter('abc'), null);
    assert.equal(normalizeFreeDaysAfter(0), 0);
    assert.equal(normalizeFreeDaysAfter('3'), 3);
    assert.equal(normalizeFreeDaysAfter(99), 14);
    assert.equal(normalizeFreeDaysAfter(-4), 0);
  });

  it('clamps the short night series to 1..7 with default 3', () => {
    assert.equal(normalizeShortNightSeriesDays(undefined), 3);
    assert.equal(normalizeShortNightSeriesDays('abc'), 3);
    assert.equal(normalizeShortNightSeriesDays(0), 1);
    assert.equal(normalizeShortNightSeriesDays(4), 4);
    assert.equal(normalizeShortNightSeriesDays(20), 7);
  });
});
