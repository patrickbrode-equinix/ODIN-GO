import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTvNightScheduleDate } from '../lib/tvSchedule.js';

describe('TV night schedule week transition', () => {
  it('keeps the previous Sunday night visible until Monday 06:45', () => {
    const result = resolveTvNightScheduleDate(new Date(2026, 5, 22, 6, 44));
    assert.equal(result.getFullYear(), 2026);
    assert.equal(result.getMonth(), 5);
    assert.equal(result.getDate(), 21);
  });

  it('switches to the new Monday night at exactly 06:45', () => {
    const result = resolveTvNightScheduleDate(new Date(2026, 5, 22, 6, 45));
    assert.equal(result.getDate(), 22);
  });

  it('uses the current date outside the Monday handover window', () => {
    const sunday = resolveTvNightScheduleDate(new Date(2026, 5, 21, 3, 0));
    const tuesday = resolveTvNightScheduleDate(new Date(2026, 5, 23, 3, 0));
    assert.equal(sunday.getDate(), 21);
    assert.equal(tuesday.getDate(), 23);
  });

  it('handles a Monday handover across month and year boundaries', () => {
    const result = resolveTvNightScheduleDate(new Date(2028, 0, 3, 2, 0));
    assert.equal(result.getFullYear(), 2028);
    assert.equal(result.getMonth(), 0);
    assert.equal(result.getDate(), 2);
  });
});
