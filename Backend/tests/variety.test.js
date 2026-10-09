import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getVarietyAdjustment, getVarietyJitter, normalizeVarietyPriority } from '../lib/shiftplanGeneration.js';
import { buildEmployeeNameLookup, findEmployeeName, resolveAbsenceEmployeeName } from '../lib/employeeNameResolution.js';
import { evaluateMonthWishes } from '../lib/wishFulfillment.js';

describe('getVarietyAdjustment', () => {
  const history = [{ code: 'E1', type: 'early' }, { code: 'E1', type: 'early' }];

  it('penalises the same code and type again', () => {
    const repeat = getVarietyAdjustment({ history, nextCode: 'E1', nextType: 'early' });
    const other = getVarietyAdjustment({ history, nextCode: 'L1', nextType: 'late' });
    assert.ok(repeat.score < 0);
    assert.ok(other.score > 0);
    assert.ok(other.score > repeat.score);
  });

  it('does nothing without history or with priority 0', () => {
    assert.equal(getVarietyAdjustment({ history: [], nextCode: 'E1', nextType: 'early' }).score, 0);
    assert.equal(getVarietyAdjustment({ history, nextCode: 'E1', nextType: 'early', priority: 0 }).score, 0);
  });

  it('scales with the priority', () => {
    const normal = getVarietyAdjustment({ history, nextCode: 'E1', nextType: 'early', priority: 60 }).score;
    const strong = getVarietyAdjustment({ history, nextCode: 'E1', nextType: 'early', priority: 100 }).score;
    assert.ok(strong < normal);
  });

  it('keeps the priority inside 0..100 and falls back to the default', () => {
    assert.equal(normalizeVarietyPriority('abc'), 60);
    assert.equal(normalizeVarietyPriority(500), 100);
    assert.equal(normalizeVarietyPriority(-5), 0);
  });
});

describe('getVarietyJitter', () => {
  const base = { employee: 'Jane Doe', year: 2027, month: 1, weekKey: '2027-01-04', shiftCode: 'E1' };

  it('is reproducible and bounded', () => {
    assert.equal(getVarietyJitter(base), getVarietyJitter(base));
    for (const weekKey of ['a', 'b', 'c', 'd', 'e']) assert.ok(Math.abs(getVarietyJitter({ ...base, weekKey })) <= 60);
  });

  it('differs between weeks', () => {
    const values = new Set(['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].map((weekKey) => getVarietyJitter({ ...base, weekKey })));
    assert.ok(values.size > 1);
  });

  it('is off at priority 0', () => {
    assert.equal(getVarietyJitter({ ...base, priority: 0 }), 0);
  });
});

describe('employee name matching for absences', () => {
  const lookup = buildEmployeeNameLookup(['Wießmann, Peter', 'Sboui, Issam', 'Drüssler, Eleasar']);

  it('matches "First Last" and spellings without umlauts', () => {
    assert.equal(findEmployeeName('Peter Wießmann', lookup), 'Wießmann, Peter');
    assert.equal(findEmployeeName('Peter Wiessmann', lookup), 'Wießmann, Peter');
    assert.equal(findEmployeeName('Eleasar Druessler', lookup), 'Drüssler, Eleasar');
    assert.equal(findEmployeeName('Unknown Person', lookup), null);
  });

  it('falls back to the names of the linked user account', () => {
    const candidates = new Map([[7, ['Issam Sboui']]]);
    assert.equal(resolveAbsenceEmployeeName({ employee_name: 'is.sboui', employee_id: 7 }, lookup, candidates), 'Sboui, Issam');
    assert.equal(resolveAbsenceEmployeeName({ employee_name: 'is.sboui', employee_id: 8 }, lookup, candidates), null);
  });
});

describe('vacation wishes in the wish evaluation', () => {
  it('is met when the employee is free during the vacation', () => {
    const result = evaluateMonthWishes({
      year: 2027, month: 3,
      shiftsByDay: { 1: 'E1', 2: 'E1', 20: 'E1' },
      vacations: [{ start_date: '2027-03-08', end_date: '2027-03-12', source: 'self' }],
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].category, 'Urlaub');
    assert.equal(result.items[0].percent, 100);
    assert.match(result.items[0].wish, /Mitarbeiterwunsch/);
  });

  it('counts worked vacation days against the wish', () => {
    const result = evaluateMonthWishes({
      year: 2027, month: 3,
      shiftsByDay: { 8: 'E1', 9: 'E1' },
      vacations: [{ start_date: '2027-03-08', end_date: '2027-03-12', source: null }],
    });
    assert.equal(result.items[0].percent, 60);
    assert.match(result.items[0].detail, /Trotzdem eingeplant/);
  });

  it('clips a vacation that starts before the month', () => {
    const result = evaluateMonthWishes({
      year: 2027, month: 3,
      shiftsByDay: {},
      vacations: [{ start_date: '2027-02-25', end_date: '2027-03-03', source: 'self' }],
    });
    assert.match(result.items[0].detail, /3 Tage/);
  });
});
