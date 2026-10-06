import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  NIGHT_MODELS,
  NIGHT_PLANNING_MODES,
  getNightSeriesDaysForModel,
  resolveNightFillTarget,
} from '../lib/shiftplanGeneration.js';

describe('getNightSeriesDaysForModel with configurable short block length', () => {
  it('keeps 3 as default for short blocks', () => {
    assert.equal(getNightSeriesDaysForModel({ nightModel: NIGHT_MODELS.SHORT, remainingDays: 10 }), 3);
  });

  it('uses the configured short series length and the remaining days', () => {
    assert.equal(getNightSeriesDaysForModel({ nightModel: NIGHT_MODELS.SHORT, remainingDays: 10, shortSeriesDays: 4 }), 4);
    assert.equal(getNightSeriesDaysForModel({ nightModel: NIGHT_MODELS.SHORT, remainingDays: 2, shortSeriesDays: 5 }), 2);
    assert.equal(getNightSeriesDaysForModel({ nightModel: NIGHT_MODELS.SHORT, remainingDays: 10, shortSeriesDays: 99 }), 7);
  });

  it('does not affect the seven-day model', () => {
    assert.equal(getNightSeriesDaysForModel({ nightModel: NIGHT_MODELS.SEVEN_DAY, remainingDays: 10, shortSeriesDays: 2 }), 7);
  });
});

describe('resolveNightFillTarget (MIXED fills up to the night maximum)', () => {
  it('adds extra short-block slots up to the maximum in MIXED mode', () => {
    assert.deepEqual(
      resolveNightFillTarget({ planningMode: NIGHT_PLANNING_MODES.MIXED, shiftType: 'night', neededStaff: 2, maxStaff: 5 }),
      { fillTarget: 5, extraSlots: 3 },
    );
  });

  it('never lowers the planned staffing', () => {
    assert.deepEqual(
      resolveNightFillTarget({ planningMode: NIGHT_PLANNING_MODES.MIXED, shiftType: 'night', neededStaff: 4, maxStaff: 3 }),
      { fillTarget: 4, extraSlots: 0 },
    );
  });

  it('respects a holiday capacity', () => {
    assert.deepEqual(
      resolveNightFillTarget({ planningMode: NIGHT_PLANNING_MODES.MIXED, shiftType: 'night', neededStaff: 1, maxStaff: 5, holidayCapacity: 3 }),
      { fillTarget: 3, extraSlots: 2 },
    );
  });

  it('does nothing for other modes or other shift types', () => {
    for (const planningMode of [NIGHT_PLANNING_MODES.SEVEN_DAY_ONLY, NIGHT_PLANNING_MODES.SHORT_ONLY]) {
      assert.deepEqual(resolveNightFillTarget({ planningMode, shiftType: 'night', neededStaff: 2, maxStaff: 5 }), { fillTarget: 2, extraSlots: 0 });
    }
    assert.deepEqual(
      resolveNightFillTarget({ planningMode: NIGHT_PLANNING_MODES.MIXED, shiftType: 'early', neededStaff: 2, maxStaff: 5 }),
      { fillTarget: 2, extraSlots: 0 },
    );
  });
});
