import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHolidayWorkPreferenceScore,
  getHolidayShiftStaffingLimit,
  normalizeHolidayStaffingConfig,
} from '../lib/holidayPreferences.js';

describe('holiday preference helpers', () => {
  test('normalizes holiday staffing config safely', () => {
    const config = normalizeHolidayStaffingConfig({
      Neujahr: { early: '2', late: 3 },
      Invalid: 'x',
    });

    assert.deepEqual(config, {
      Neujahr: { early: 2, late: 3 },
      Invalid: { early: 0, late: 0 },
    });
  });

  test('returns staffing limits only for early and late holiday shifts', () => {
    const config = { Neujahr: { early: 2, late: 1 } };

    assert.equal(getHolidayShiftStaffingLimit(config, 'Neujahr', 'early'), 2);
    assert.equal(getHolidayShiftStaffingLimit(config, 'Neujahr', 'late'), 1);
    assert.equal(getHolidayShiftStaffingLimit(config, 'Neujahr', 'night'), null);
    assert.equal(getHolidayShiftStaffingLimit(config, 'Karfreitag', 'early'), null);
  });

  test('scores holiday selections as positive work preferences', () => {
    const result = applyHolidayWorkPreferenceScore({
      score: 100,
      reasons: [],
      holidayName: 'Neujahr',
      preferredHolidays: ['Neujahr'],
      softWishesPriority: 10,
    });

    assert.equal(result.score, 220);
    assert.deepEqual(result.reasons, ['Mitarbeiterwunsch: Neujahr arbeiten']);
  });
});
