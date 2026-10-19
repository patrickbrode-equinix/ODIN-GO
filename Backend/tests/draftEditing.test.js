import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyDraftHoursChange, getDraftShiftHours } from '../routes/shiftplanControl.js';

const snapshot = {
  shiftDefinitions: [
    { code: 'E1', durationHours: 8.5, dayOverrides: [] },
    { code: 'N', durationHours: 10, dayOverrides: [{ weekday: 5, duration_hours: 9 }] },
  ],
};

describe('draft editing: hours of a shift', () => {
  it('uses the duration of the shift definition and day overrides', () => {
    assert.equal(getDraftShiftHours(snapshot, '2027-03', 2, 'e1'), 8.5);
    // 2027-03-05 is a Friday (weekday 5): the override applies
    assert.equal(getDraftShiftHours(snapshot, '2027-03', 5, 'N'), 9);
    assert.equal(getDraftShiftHours(snapshot, '2027-03', 2, 'N'), 10);
  });

  it('counts free markers and unknown codes as 0 hours', () => {
    assert.equal(getDraftShiftHours(snapshot, '2027-03', 2, 'FS'), 0);
    assert.equal(getDraftShiftHours(snapshot, '2027-03', 2, ''), 0);
  });
});

describe('draft editing: fairness follows manual changes', () => {
  const fairness = { 'Anna A': { actualHours: 160, targetHours: 168, deltaHours: -8, total: 20 } };

  it('adds the hours difference to Ist and Differenz', () => {
    const next = applyDraftHoursChange(fairness, 'Anna A', 8.5, 1);
    assert.equal(next['Anna A'].actualHours, 168.5);
    assert.equal(next['Anna A'].deltaHours, 0.5);
    assert.equal(next['Anna A'].total, 21);
    assert.equal(fairness['Anna A'].actualHours, 160, 'the stored value is not mutated');
  });

  it('ignores employees without a fairness entry', () => {
    assert.deepEqual(applyDraftHoursChange(fairness, 'Unknown', 8), fairness);
  });

  it('a swap between two employees moves hours from one to the other', () => {
    const both = { A: { actualHours: 100, targetHours: 100, deltaHours: 0, total: 10 }, B: { actualHours: 100, targetHours: 100, deltaHours: 0, total: 10 } };
    // A gives E1 (8.5h) to B and takes N (10h) from B
    let next = applyDraftHoursChange(both, 'A', 10 - 8.5);
    next = applyDraftHoursChange(next, 'B', 8.5 - 10);
    assert.equal(next.A.actualHours, 101.5);
    assert.equal(next.B.actualHours, 98.5);
  });
});
