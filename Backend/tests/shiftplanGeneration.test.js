import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyFixedShiftSeriesPattern,
  buildDailyShiftSlots,
  buildShiftSlots,
  buildStaffingRulesByShiftType,
  canStartShiftSeries,
  getShiftContinuityAdjustment,
  getDeterministicRotationRank,
  getExclusivePreferredShiftType,
  getMonthBoundarySeriesRemaining,
  getPreferenceShiftCode,
  getTargetHoursScore,
  isDayBlockedByEmployeePreference,
  isNightShiftRefused,
  normalizePreferenceDayValues,
  normalizePlanningShiftTypeKey,
  rankSafeSubstituteCandidates,
} from '../lib/shiftplanGeneration.js';

describe('shiftplanGeneration helpers', () => {
  it('normalizes staffing rule keys from legacy E/L/N format', () => {
    assert.equal(normalizePlanningShiftTypeKey('E'), 'early');
    assert.equal(normalizePlanningShiftTypeKey('L'), 'late');
    assert.equal(normalizePlanningShiftTypeKey('N'), 'night');
  });

  it('builds staffing rules keyed by planning shift type', () => {
    const rules = buildStaffingRulesByShiftType([
      { shift_type: 'E', min_count: 4 },
      { shift_type: 'L', min_count: 3 },
      { shift_type: 'night', min_count: 2 },
    ]);

    assert.deepEqual(rules, {
      early: 4,
      late: 3,
      night: 2,
    });
  });

  it('distributes staffing headcount across shift definitions without duplicating whole-type minima', () => {
    const planned = buildShiftSlots([
      { code: 'E1', shift_type: 'early', min_staff: 1, max_staff: 3 },
      { code: 'E2', shift_type: 'early', min_staff: 1, max_staff: 3 },
      { code: 'L1', shift_type: 'late', min_staff: 1, max_staff: 3 },
      { code: 'L2', shift_type: 'late', min_staff: 1, max_staff: 3 },
      { code: 'N', shift_type: 'night', min_staff: 1, max_staff: 2 },
    ], {
      early: 4,
      late: 2,
      night: 1,
    });

    assert.deepEqual(
      planned.map((entry) => ({ code: entry.code, planned_slots: entry.planned_slots })),
      [
        { code: 'E1', planned_slots: 2 },
        { code: 'E2', planned_slots: 2 },
        { code: 'L1', planned_slots: 1 },
        { code: 'L2', planned_slots: 1 },
        { code: 'N', planned_slots: 1 },
      ]
    );
  });

  it('uses per-employee monthly target hours when sizing daily slots', () => {
    const planned = buildDailyShiftSlots({
      shiftDefinitions: [
        { code: 'E1', shift_type: 'early', min_staff: 0, max_staff: 3, duration_hours: 8 },
      ],
      staffingRules: {},
      activeEmployees: ['Alice', 'Bob'],
      employeeHours: { Alice: 0, Bob: 0 },
      employeeTargetHours: { Alice: 160, Bob: 0 },
      monthlyTargetHours: 174,
      day: 1,
      numDays: 20,
      dayOfWeek: 1,
    });

    assert.deepEqual(
      planned.map((entry) => ({ code: entry.code, planned_slots: entry.planned_slots })),
      [
        { code: 'E1', planned_slots: 1 },
      ]
    );
  });

  it('keeps a stable shift block preferable without overpowering employee wishes', () => {
    assert.deepEqual(
      getShiftContinuityAdjustment({
        previousCode: 'E1', previousType: 'early', previousDay: 5,
        nextCode: 'E1', nextType: 'early', day: 8,
      }),
      { score: 100, reason: 'Schichtkontinuität: E1 aus dem letzten Block fortgeführt' }
    );
    assert.equal(getShiftContinuityAdjustment({
      previousCode: 'E1', previousType: 'early', previousDay: 5,
      nextCode: 'L1', nextType: 'late', day: 8,
    }).score, -50);
    assert.equal(getShiftContinuityAdjustment({
      previousCode: 'E1', previousType: 'early', previousDay: 1,
      nextCode: 'L1', nextType: 'late', day: 10,
    }).score, 0);
  });

  it('maps weekend variants to the shift codes employees can select as wishes', () => {
    assert.equal(getPreferenceShiftCode('E1SA'), 'E1');
    assert.equal(getPreferenceShiftCode('E1WE'), 'E1');
    assert.equal(getPreferenceShiftCode('L1WE'), 'L1');
    assert.equal(getPreferenceShiftCode('N'), 'N');
  });

  it('recognizes an exclusive preferred shift type only when all alternatives are unwanted', () => {
    assert.equal(getExclusivePreferredShiftType({ preferred_shifts: ['N'], unwanted_shifts: ['E1', 'E2', 'L1', 'L2'] }), 'night');
    assert.equal(getExclusivePreferredShiftType({ preferred_shifts: ['E1', 'E2'], unwanted_shifts: ['L1', 'L2', 'N'] }), 'early');
    assert.equal(getExclusivePreferredShiftType({ preferred_shifts: ['N'], unwanted_shifts: ['E1'] }), null);
  });

  it('uses a reproducible weekly rotation instead of alphabetical tie breaking', () => {
    const first = getDeterministicRotationRank({ employee: 'Alpha', year: 2027, month: 1, weekKey: '2027-01-04', shiftCode: 'N' });
    const repeated = getDeterministicRotationRank({ employee: 'Alpha', year: 2027, month: 1, weekKey: '2027-01-04', shiftCode: 'N' });
    const nextWeek = getDeterministicRotationRank({ employee: 'Alpha', year: 2027, month: 1, weekKey: '2027-01-11', shiftCode: 'N' });
    assert.equal(first, repeated);
    assert.notEqual(first, nextWeek);
  });

  it('enforces the fixed Monday-to-weekend series patterns', () => {
    assert.deepEqual(applyFixedShiftSeriesPattern({ code: 'E1SA', series_days: 1 }).applicable_days, [1, 2, 3, 4, 5, 6]);
    assert.equal(applyFixedShiftSeriesPattern({ code: 'E1SA', series_days: 1 }).series_days, 6);
    assert.equal(applyFixedShiftSeriesPattern({ code: 'E1WE', series_days: 1 }).series_days, 7);
    assert.equal(applyFixedShiftSeriesPattern({ code: 'L1WE', series_days: 1 }).series_days, 7);
    assert.equal(canStartShiftSeries({ day: 3, dayOfWeek: 1, definition: { code: 'E1WE', series_days: 7 } }), true);
    assert.equal(canStartShiftSeries({ day: 4, dayOfWeek: 2, definition: { code: 'E1WE', series_days: 7 } }), false);
    assert.equal(canStartShiftSeries({ day: 1, dayOfWeek: 6, definition: { code: 'N', series_days: 7 } }), false);
    assert.equal(canStartShiftSeries({ day: 4, dayOfWeek: 2, definition: { code: 'E1', series_days: 5 } }), true);
  });

  it('treats blocked weekend wishes as hard day matches across stored formats', () => {
    assert.deepEqual(normalizePreferenceDayValues(['Samstag', 'Sonntag', '7', 'friday']), [0, 5, 6]);
    assert.equal(isDayBlockedByEmployeePreference({ blocked_days: ['Samstag', 'Sonntag'] }, 6), true);
    assert.equal(isDayBlockedByEmployeePreference({ blocked_days: ['Samstag', 'Sonntag'] }, 0), true);
    assert.equal(isDayBlockedByEmployeePreference({ blocked_days: ['Samstag', 'Sonntag'] }, 1), false);
  });

  it('continues a previous-year weekly block until the first Monday of January 2027', () => {
    assert.equal(
      getMonthBoundarySeriesRemaining({
        definition: applyFixedShiftSeriesPattern({ code: 'E1WE', series_days: 7 }),
        monthStartDayOfWeek: 5,
      }),
      3
    );
    assert.equal(
      getMonthBoundarySeriesRemaining({
        definition: applyFixedShiftSeriesPattern({ code: 'E1SA', series_days: 6 }),
        monthStartDayOfWeek: 5,
      }),
      2
    );
  });

  it('gives every employee below target priority over employees already at target', () => {
    assert.ok(
      getTargetHoursScore({ currentHours: 168, targetHours: 174 })
      > getTargetHoursScore({ currentHours: 176, targetHours: 174 })
    );
  });

  it('treats an explicit no-night wish as a hard exclusion', () => {
    assert.equal(isNightShiftRefused({ unwanted_shifts: ['N'] }), true);
    assert.equal(isNightShiftRefused({ unwanted_shifts: ['E1'] }), false);
  });

  it('never suggests an employee who is already assigned during the replacement block', () => {
    const suggestions = rankSafeSubstituteCandidates({
      shiftType: 'night',
      coverageDays: [4, 5, 6, 7],
      weekendDays: [6, 7],
      candidates: [
        { employee: 'Already Early', assignmentDays: [6], preferences: {}, wellbeingScore: 0 },
        { employee: 'Available', assignmentDays: [], preferences: {}, wellbeingScore: 2 },
      ],
    });

    assert.deepEqual(suggestions.map((entry) => entry.employee), ['Available']);
  });

  it('excludes night refusals and labels an allowed weekend exception', () => {
    const suggestions = rankSafeSubstituteCandidates({
      shiftType: 'night',
      coverageDays: [6, 7],
      weekendDays: [6, 7],
      candidates: [
        { employee: 'No Nights', preferences: { unwanted_shifts: ['N'] }, dayOfWeekByDay: { 6: 6, 7: 0 } },
        { employee: 'Weekend Wish', preferences: { blocked_days: [6, 0] }, dayOfWeekByDay: { 6: 6, 7: 0 }, wellbeingScore: 1 },
      ],
    });

    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].employee, 'Weekend Wish');
    assert.equal(suggestions[0].weekendException, true);
  });
});
