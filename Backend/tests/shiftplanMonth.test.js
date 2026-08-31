import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatShiftMonthLabel,
  monthLabelMatchesMonthId,
  monthLabelMatchesYear,
  parseDraftMonthId,
} from '../lib/shiftplanMonth.js';

describe('shiftplanMonth helpers', () => {
  it('parses draft month ids', () => {
    assert.deepEqual(parseDraftMonthId('2026-04'), { year: 2026, month: 4 });
    assert.equal(parseDraftMonthId('2026-13'), null);
    assert.equal(parseDraftMonthId('April 2026'), null);
  });

  it('formats live shift month labels', () => {
    assert.equal(formatShiftMonthLabel(2026, 4), 'April 2026');
    assert.equal(formatShiftMonthLabel(2026, 0), null);
  });

  it('matches month labels against planning year and draft id', () => {
    assert.equal(monthLabelMatchesYear('April 2026', 2026), true);
    assert.equal(monthLabelMatchesYear('Mai 2025', 2026), false);
    assert.equal(monthLabelMatchesMonthId('April 2026', '2026-04'), true);
    assert.equal(monthLabelMatchesMonthId('April 2026', '2026-05'), false);
  });
});