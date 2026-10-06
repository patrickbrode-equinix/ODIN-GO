import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STRENGTHS,
  PREFERENCE_STRENGTH_KEYS,
  SOFT_PENALTY_BASE,
  classifyPreferenceViolation,
  evaluateShiftWishViolations,
  isHardStrength,
  isIgnoredStrength,
  parsePreferenceStrengths,
  scaleBonus,
  softPenalty,
} from '../lib/preferenceStrength.js';
import { isShiftBlockedByEmployeePreference } from '../lib/shiftplanGeneration.js';

test('parsePreferenceStrengths returns defaults for missing input', () => {
  assert.deepEqual(parsePreferenceStrengths([]), DEFAULT_STRENGTHS);
  assert.deepEqual(parsePreferenceStrengths(null), DEFAULT_STRENGTHS);
  assert.equal(DEFAULT_STRENGTHS.colleagues, 50);
});

test('parsePreferenceStrengths clamps, rounds and ignores invalid values (rows and map)', () => {
  const rows = [
    { key: PREFERENCE_STRENGTH_KEYS.unwanted_shifts, value: '40' },
    { key: PREFERENCE_STRENGTH_KEYS.preferred_shifts, value: '150' },
    { key: PREFERENCE_STRENGTH_KEYS.holidays, value: '-5' },
    { key: PREFERENCE_STRENGTH_KEYS.blocked_days, value: 'abc' },
    { key: PREFERENCE_STRENGTH_KEYS.max_nights, value: '33.6' },
    { key: PREFERENCE_STRENGTH_KEYS.colleagues, value: '' },
  ];
  const parsed = parsePreferenceStrengths(rows);
  assert.equal(parsed.unwanted_shifts, 40);
  assert.equal(parsed.preferred_shifts, 100);
  assert.equal(parsed.holidays, 0);
  assert.equal(parsed.blocked_days, 100);
  assert.equal(parsed.max_nights, 34);
  assert.equal(parsed.max_weekends, 100);
  assert.equal(parsed.colleagues, 50);

  const fromMap = parsePreferenceStrengths({ [PREFERENCE_STRENGTH_KEYS.colleagues]: 80, max_weekends: 10 });
  assert.equal(fromMap.colleagues, 80);
  assert.equal(fromMap.max_weekends, 10);
});

test('hard / ignored predicates', () => {
  assert.equal(isHardStrength(100), true);
  assert.equal(isHardStrength(99), false);
  assert.equal(isIgnoredStrength(0), true);
  assert.equal(isIgnoredStrength(1), false);
});

test('softPenalty scales the base linearly', () => {
  assert.equal(SOFT_PENALTY_BASE, 50000);
  assert.equal(softPenalty(100), 50000);
  assert.equal(softPenalty(50), 25000);
  assert.equal(softPenalty(0), 0);
  assert.equal(softPenalty(50, 1000), 500);
});

test('scaleBonus reproduces +300 at the default colleague strength 50', () => {
  assert.equal(scaleBonus(50, 300, 50), 300);
  assert.equal(scaleBonus(100, 300, 50), 600);
  assert.equal(scaleBonus(0, 300, 50), 0);
  assert.equal(scaleBonus(25, 300, 50), 150);
});

test('classifyPreferenceViolation matches isShiftBlockedByEmployeePreference', () => {
  const prefsList = [
    null,
    {},
    { unwanted_shifts: ['N'] },
    { preferred_shifts: ['E1'] },
    { preferred_shifts: ['COLO'] },
    { preferred_shifts: ['E1'], unwanted_shifts: ['L1'] },
  ];
  for (const prefs of prefsList) {
    for (const code of ['E1', 'E1SA', 'L1', 'N', 'NK', 'DBS']) {
      for (const respect of [true, false]) {
        const { unwanted, notPreferred } = classifyPreferenceViolation(prefs, code, respect);
        assert.equal(unwanted || notPreferred, isShiftBlockedByEmployeePreference(prefs, code, respect));
      }
    }
  }
  assert.deepEqual(classifyPreferenceViolation({ preferred_shifts: ['E1'] }, 'L1', true), { unwanted: false, notPreferred: true });
  assert.deepEqual(classifyPreferenceViolation({ preferred_shifts: ['E1'] }, 'L1', false), { unwanted: false, notPreferred: false });
  assert.deepEqual(classifyPreferenceViolation({ unwanted_shifts: ['L1'] }, 'L1', false), { unwanted: true, notPreferred: false });
});

test('evaluateShiftWishViolations at 100 % is hard for every violated wish', () => {
  const strengths = parsePreferenceStrengths([]);
  const prefs = { unwanted_shifts: ['L1'], preferred_shifts: ['E1'], preferred_holidays: ['Ostersonntag'], max_nights_per_month: 2 };
  assert.equal(evaluateShiftWishViolations({ strengths, prefs, code: 'L1', respectWishes: true }).hardBlocked, true);
  assert.equal(evaluateShiftWishViolations({ strengths, prefs, code: 'E1', respectWishes: true }).hardBlocked, false);
  assert.equal(evaluateShiftWishViolations({ strengths, prefs, code: 'E1', respectWishes: true, holidayName: 'Ostersonntag' }).hardBlocked, true);
  assert.equal(evaluateShiftWishViolations({ strengths, prefs, code: 'E1', respectWishes: false, holidayName: 'Ostersonntag' }).hardBlocked, false);
  assert.equal(evaluateShiftWishViolations({ strengths, prefs: { max_nights_per_month: 2 }, code: 'N', nightCount: 2 }).hardBlocked, true);
  assert.equal(evaluateShiftWishViolations({ strengths, prefs: { max_nights_per_month: 2 }, code: 'N', nightCount: 1 }).hardBlocked, false);
  assert.equal(evaluateShiftWishViolations({ strengths, prefs: { unwanted_shifts: ['NIGHT'] }, code: 'N2', shiftType: 'night' }).hardBlocked, true);
});

test('evaluateShiftWishViolations soft strengths add penalties instead of blocking', () => {
  const strengths = { ...DEFAULT_STRENGTHS, unwanted_shifts: 50, preferred_shifts: 20 };
  const prefs = { unwanted_shifts: ['L1'], preferred_shifts: ['E1'] };
  const result = evaluateShiftWishViolations({ strengths, prefs, code: 'L1', respectWishes: true });
  assert.equal(result.hardBlocked, false);
  assert.equal(result.penalty, softPenalty(50) + softPenalty(20));
  assert.deepEqual(result.violations.map((entry) => entry.type), ['unwanted', 'not_preferred']);
});

test('evaluateShiftWishViolations ignores preferences at 0 %', () => {
  const strengths = { ...DEFAULT_STRENGTHS, unwanted_shifts: 0, holidays: 0 };
  const prefs = { unwanted_shifts: ['L1'], preferred_holidays: ['Neujahr'] };
  const result = evaluateShiftWishViolations({ strengths, prefs, code: 'L1', respectWishes: true, holidayName: 'Neujahr' });
  assert.equal(result.hardBlocked, false);
  assert.equal(result.penalty, 0);
  assert.equal(result.violations.length, 0);
});
