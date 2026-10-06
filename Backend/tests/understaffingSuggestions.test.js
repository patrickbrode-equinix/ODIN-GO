import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyShiftCodeToType,
  computeUnderstaffingSuggestions,
  getTypeMaximum,
  getTypeMinimum,
  severityForMissing,
} from '../lib/understaffingSuggestions.js';

// March 2026: 1st is a Sunday, the 10th a Tuesday, the 20th a Friday.
const YEAR = 2026;
const MONTH = 3;
const DAY = 10;
const DATE = '2026-03-10';

const DEFINITIONS = [
  { code: 'E1', shift_type: 'early', min_staff: 1, max_staff: 2, is_active: true, applicable_days: [0, 1, 2, 3, 4, 5, 6] },
  { code: 'L1', shift_type: 'late', min_staff: 1, max_staff: 2, is_active: true, applicable_days: [0, 1, 2, 3, 4, 5, 6] },
  { code: 'N', shift_type: 'night', min_staff: 2, max_staff: 5, is_active: true, applicable_days: [0, 1, 2, 3, 4, 5, 6] },
  { code: 'NK', shift_type: 'night', min_staff: 0, max_staff: 3, is_active: true, applicable_days: [0, 1, 2, 3, 4, 5, 6] },
];

function buildInput(overrides = {}) {
  return {
    year: YEAR,
    month: MONTH,
    today: '2026-03-01',
    definitions: DEFINITIONS,
    staffingRules: [],
    schedule: {},
    prevMonthSchedule: {},
    nextMonthSchedule: {},
    preferencesByEmployee: {},
    absences: [],
    rotationRules: null,
    wellbeingConfig: { night_threshold: 4, weekend_threshold: 2, streak_threshold: 7 },
    holidayMap: {},
    respectWishes: true,
    blockedDaysEnabled: false,
    exclusions: { excluded: [], blockedWeekdaysByEmployee: {} },
    fixedShiftTypeByEmployee: {},
    ...overrides,
  };
}

function findItem(items, date, shiftType) {
  return items.find((item) => item.date === date && item.shiftType === shiftType);
}

function candidateNames(item) {
  return item.candidates.map((candidate) => candidate.employee);
}

function nightSchedule(nightWorkers, extraEmployees = {}) {
  const schedule = { ...extraEmployees };
  for (const [index, code] of nightWorkers.entries()) {
    schedule[`Nacht${index + 1}`] = { [DAY]: code };
  }
  return schedule;
}

describe('severityForMissing', () => {
  it('maps the missing count to a severity', () => {
    assert.equal(severityForMissing(0), null);
    assert.equal(severityForMissing(-2), null);
    assert.equal(severityForMissing(1), 'warning');
    assert.equal(severityForMissing(2), 'critical');
    assert.equal(severityForMissing(5), 'critical');
  });
});

describe('classifyShiftCodeToType', () => {
  it('classifies the live codes and ignores absences and free days', () => {
    for (const code of ['E1', 'E2', 'E1SA', 'E1WE', 'E2SA', 'E2WE']) assert.equal(classifyShiftCodeToType(code), 'early');
    for (const code of ['L1', 'L2', 'L1WE']) assert.equal(classifyShiftCodeToType(code), 'late');
    for (const code of ['N', 'NK', 'n']) assert.equal(classifyShiftCodeToType(code), 'night');
    for (const code of ['ABW', 'FS', 'K', 'U', '', null, undefined]) assert.equal(classifyShiftCodeToType(code), null);
  });
});

describe('getTypeMaximum / getTypeMinimum', () => {
  it('uses the N definition for nights (N and NK are not double counted)', () => {
    assert.equal(getTypeMaximum({ definitions: DEFINITIONS, shiftType: 'night', dayOfWeek: 2 }), 5);
    assert.equal(getTypeMinimum({ definitions: DEFINITIONS, shiftType: 'night', dayOfWeek: 2 }), 2);
  });

  it('falls back to the largest night definition without N', () => {
    const definitions = DEFINITIONS.filter((definition) => definition.code !== 'N');
    assert.equal(getTypeMaximum({ definitions, shiftType: 'night', dayOfWeek: 2 }), 3);
  });

  it('sums early definitions and caps by staffing_rules.max_count when > 0', () => {
    const definitions = [
      ...DEFINITIONS,
      { code: 'E2', shift_type: 'early', min_staff: 1, max_staff: 3, is_active: true, applicable_days: [0, 1, 2, 3, 4, 5, 6] },
    ];
    assert.equal(getTypeMaximum({ definitions, shiftType: 'early', dayOfWeek: 2 }), 5);
    assert.equal(getTypeMaximum({
      definitions,
      staffingRules: [{ shift_type: 'early', min_count: 1, max_count: 4 }],
      shiftType: 'early',
      dayOfWeek: 2,
    }), 4);
    assert.equal(getTypeMaximum({
      definitions,
      staffingRules: [{ shift_type: 'early', min_count: 1, max_count: 0 }],
      shiftType: 'early',
      dayOfWeek: 2,
    }), 5);
  });

  it('ignores inactive and non-applicable definitions; minimum honours staffing_rules', () => {
    const definitions = [
      { code: 'E1', shift_type: 'early', min_staff: 1, max_staff: 2, is_active: true, applicable_days: [1, 2, 3, 4, 5] },
      { code: 'E2', shift_type: 'early', min_staff: 1, max_staff: 2, is_active: false, applicable_days: [0, 1, 2, 3, 4, 5, 6] },
    ];
    assert.equal(getTypeMaximum({ definitions, shiftType: 'early', dayOfWeek: 2 }), 2);
    assert.equal(getTypeMaximum({ definitions, shiftType: 'early', dayOfWeek: 6 }), 0);
    assert.equal(getTypeMinimum({
      definitions,
      staffingRules: [{ shift_type: 'early', min_count: 3 }],
      shiftType: 'early',
      dayOfWeek: 2,
    }), 3);
  });
});

describe('computeUnderstaffingSuggestions - warnings', () => {
  it('night max 5: 4 present is a warning, 3 present is critical', () => {
    const warning = computeUnderstaffingSuggestions(buildInput({
      schedule: nightSchedule(['N', 'N', 'N', 'N']),
    }));
    const warningItem = findItem(warning, DATE, 'night');
    assert.equal(warningItem.max, 5);
    assert.equal(warningItem.min, 2);
    assert.equal(warningItem.actual, 4);
    assert.equal(warningItem.missing, 1);
    assert.equal(warningItem.severity, 'warning');
    assert.equal(warningItem.day, DAY);

    const critical = computeUnderstaffingSuggestions(buildInput({
      schedule: nightSchedule(['N', 'N', 'N']),
    }));
    const criticalItem = findItem(critical, DATE, 'night');
    assert.equal(criticalItem.actual, 3);
    assert.equal(criticalItem.missing, 2);
    assert.equal(criticalItem.severity, 'critical');
  });

  it('does not report a fully staffed type', () => {
    const items = computeUnderstaffingSuggestions(buildInput({
      schedule: nightSchedule(['N', 'N', 'N', 'N', 'N']),
    }));
    assert.equal(findItem(items, DATE, 'night'), undefined);
  });

  it('does not double count N and NK', () => {
    // 3 x N + 2 x NK = 5 distinct night workers = max 5 (not 8).
    const full = computeUnderstaffingSuggestions(buildInput({
      schedule: nightSchedule(['N', 'N', 'N', 'NK', 'NK']),
    }));
    assert.equal(findItem(full, DATE, 'night'), undefined);

    // 2 x N + 2 x NK = 4 -> still one missing against max 5.
    const partial = computeUnderstaffingSuggestions(buildInput({
      schedule: nightSchedule(['N', 'N', 'NK', 'NK']),
    }));
    const item = findItem(partial, DATE, 'night');
    assert.equal(item.max, 5);
    assert.equal(item.actual, 4);
    assert.equal(item.severity, 'warning');
  });

  it('ignores absence and free codes when counting', () => {
    const items = computeUnderstaffingSuggestions(buildInput({
      schedule: nightSchedule(['N', 'N', 'N', 'N'], { Abwesend: { [DAY]: 'ABW' }, Frei: { [DAY]: 'FS' }, Krank: { [DAY]: 'K' } }),
    }));
    assert.equal(findItem(items, DATE, 'night').actual, 4);
  });

  it('skips days before today (Europe/Berlin today is the first evaluated day)', () => {
    const items = computeUnderstaffingSuggestions(buildInput({ today: '2026-03-20' }));
    assert.ok(items.length > 0);
    assert.ok(items.every((item) => item.date >= '2026-03-20'));
    assert.ok(items.some((item) => item.date === '2026-03-20'));
    assert.equal(findItem(items, DATE, 'night'), undefined);
  });

  it('skips types whose maximum is 0', () => {
    const items = computeUnderstaffingSuggestions(buildInput({
      definitions: DEFINITIONS.filter((definition) => definition.shift_type === 'early'),
    }));
    assert.ok(items.every((item) => item.shiftType === 'early'));
  });
});

describe('computeUnderstaffingSuggestions - candidates', () => {
  it('never proposes someone who refuses night shifts for a night warning', () => {
    const items = computeUnderstaffingSuggestions(buildInput({
      schedule: { Verweigerer: {}, Bereit: {} },
      preferencesByEmployee: {
        Verweigerer: { unwanted_shifts: ['N'] },
        Bereit: { unwanted_shifts: [] },
      },
    }));
    const names = candidateNames(findItem(items, DATE, 'night'));
    assert.ok(names.includes('Bereit'));
    assert.ok(!names.includes('Verweigerer'));
    // ... but may be proposed for other types.
    assert.ok(candidateNames(findItem(items, DATE, 'early')).includes('Verweigerer'));
  });

  it('honours the monthly preference merge (monthly unwanted night)', () => {
    const items = computeUnderstaffingSuggestions(buildInput({
      schedule: { Monatlich: {}, Bereit: {} },
      preferencesByEmployee: {
        Monatlich: { unwanted_shifts: [], monthly_preferences: { '2026-03': { unwanted_shifts: ['N'] } } },
      },
    }));
    const names = candidateNames(findItem(items, DATE, 'night'));
    assert.deepEqual(names, ['Bereit']);
  });

  it('pulls someone from another shift only if that shift stays at its minimum', () => {
    // Late: min 1. Two late workers -> pulling one leaves 1 >= 1 (allowed).
    const enough = computeUnderstaffingSuggestions(buildInput({
      schedule: { SpaetA: { [DAY]: 'L1' }, SpaetB: { [DAY]: 'L1' } },
    }));
    const nightEnough = findItem(enough, DATE, 'night');
    const pulled = nightEnough.candidates.filter((candidate) => candidate.fromShiftCode === 'L1');
    assert.equal(pulled.length, 2);
    assert.ok(pulled[0].reasons.some((reason) => reason.includes('Wird aus L1 umgesetzt') && reason.includes('1/1 Minimum')));

    // Only one late worker -> pulling would leave 0 < 1 (forbidden).
    const tooFew = computeUnderstaffingSuggestions(buildInput({
      schedule: { SpaetA: { [DAY]: 'L1' }, Frei: {} },
    }));
    const nightTooFew = findItem(tooFew, DATE, 'night');
    assert.ok(!candidateNames(nightTooFew).includes('SpaetA'));
    assert.ok(candidateNames(nightTooFew).includes('Frei'));
  });

  it('excludes absent employees and never pulls someone with an absence code', () => {
    const items = computeUnderstaffingSuggestions(buildInput({
      schedule: { Urlaub: {}, Krank: { [DAY]: 'K' }, Abwesend: { [DAY]: 'ABW' }, Da: {} },
      absences: [{ employee_name: 'Urlaub', start_date: '2026-03-09', end_date: '2026-03-11', type: 'VACATION' }],
    }));
    const names = candidateNames(findItem(items, DATE, 'early'));
    assert.deepEqual(names, ['Da']);
  });

  it('excludes N -> early rest violations (previous day in the live schedule)', () => {
    const schedule = { NachtVorher: { [DAY - 1]: 'N' }, Ausgeruht: {} };
    const items = computeUnderstaffingSuggestions(buildInput({ schedule }));
    const names = candidateNames(findItem(items, DATE, 'early'));
    assert.ok(!names.includes('NachtVorher'));
    assert.ok(names.includes('Ausgeruht'));

    // With the rules switched off the same employee becomes eligible.
    const relaxed = computeUnderstaffingSuggestions(buildInput({
      schedule,
      rotationRules: {
        night_to_early_forbidden: false,
        late_to_early_forbidden: false,
        free_days_after_night: 0,
        free_days_after_weekend: 0,
        max_consecutive_workdays: 6,
      },
    }));
    assert.ok(candidateNames(findItem(relaxed, DATE, 'early')).includes('NachtVorher'));
  });

  it('checks rest rules across the month boundary', () => {
    // 2026-03-01 early target; night worker on 2026-02-28 would violate N -> E with free days.
    const items = computeUnderstaffingSuggestions(buildInput({
      today: '2026-03-01',
      schedule: { Grenze: {}, Frisch: {} },
      prevMonthSchedule: { Grenze: { 28: 'N' } },
    }));
    const names = candidateNames(findItem(items, '2026-03-01', 'early'));
    assert.ok(!names.includes('Grenze'));
    assert.ok(names.includes('Frisch'));
  });

  it('lists elevated wellbeing candidates, sorted after ok ones, with a German note', () => {
    const schedule = {
      Hanna: { 11: 'N', 12: 'N', 13: 'N', 14: 'N', 15: 'N' },
      Jonas: {},
    };
    const items = computeUnderstaffingSuggestions(buildInput({ today: '2026-03-20', schedule }));
    const item = findItem(items, '2026-03-20', 'night');
    const names = candidateNames(item);
    assert.deepEqual(names, ['Jonas', 'Hanna']);
    const hanna = item.candidates.find((candidate) => candidate.employee === 'Hanna');
    const jonas = item.candidates.find((candidate) => candidate.employee === 'Jonas');
    assert.equal(jonas.wellbeing.level, 'ok');
    assert.equal(jonas.wellbeing.note, null);
    assert.equal(hanna.wellbeing.level, 'elevated');
    assert.equal(
      hanna.wellbeing.note,
      'Hatte in den letzten 28 Tagen bereits 5 Nachtschichten (Wellbeing-Schwelle: 4)',
    );
  });

  it('marks very high recent load as high and sorts it last', () => {
    const schedule = {
      Anna: { 9: 'N', 10: 'N', 11: 'N', 12: 'N', 13: 'N', 14: 'N' },
      Berta: { 12: 'N', 13: 'N', 14: 'N', 15: 'N', 16: 'N' },
      Clara: {},
    };
    const items = computeUnderstaffingSuggestions(buildInput({
      today: '2026-03-20',
      schedule,
      rotationRules: { max_nights_per_month: 10 },
    }));
    const item = findItem(items, '2026-03-20', 'night');
    const levels = item.candidates.map((candidate) => `${candidate.employee}:${candidate.wellbeing.level}`);
    assert.deepEqual(levels, ['Clara:ok', 'Berta:elevated', 'Anna:high']);
  });

  it('respects admin exclusions, fixed shift types and the SHORT night model', () => {
    const items = computeUnderstaffingSuggestions(buildInput({
      schedule: {
        Ausgeschlossen: {},
        NurFrueh: {},
        Kurz: { [DAY - 3]: 'NK', [DAY - 2]: 'NK', [DAY - 1]: 'NK' },
        Normal: {},
      },
      exclusions: { excluded: ['Ausgeschlossen'], blockedWeekdaysByEmployee: {} },
      fixedShiftTypeByEmployee: { NurFrueh: 'early' },
      preferencesByEmployee: { Kurz: { night_model: 'SHORT' } },
      rotationRules: { free_days_after_night: 0, free_days_after_weekend: 0 },
    }));
    const names = candidateNames(findItem(items, DATE, 'night'));
    assert.deepEqual(names, ['Normal']);
    assert.ok(candidateNames(findItem(items, DATE, 'early')).includes('NurFrueh'));
    assert.ok(!candidateNames(findItem(items, DATE, 'early')).includes('Ausgeschlossen'));
  });

  it('uses the configurable short night series length', () => {
    const input = {
      schedule: { Kurz: { [DAY - 3]: 'NK', [DAY - 2]: 'NK', [DAY - 1]: 'NK' } },
      preferencesByEmployee: { Kurz: { night_model: 'SHORT' } },
      rotationRules: { free_days_after_night: 0, free_days_after_weekend: 0 },
    };
    const defaultItems = computeUnderstaffingSuggestions(buildInput(input));
    assert.ok(!candidateNames(findItem(defaultItems, DATE, 'night')).includes('Kurz'));
    const longer = computeUnderstaffingSuggestions(buildInput({ ...input, shortNightSeriesDays: 4 }));
    assert.ok(candidateNames(findItem(longer, DATE, 'night')).includes('Kurz'));
  });

  it('weights wishes: strength 100 excludes, below 100 keeps and ranks last with a reason, 0 ignores', () => {
    const base = {
      schedule: { Verweigerer: {}, Bereit: {} },
      preferencesByEmployee: { Verweigerer: { unwanted_shifts: ['N'] } },
    };
    const hard = computeUnderstaffingSuggestions(buildInput({ ...base, prefStrength: { unwanted_shifts: 100 } }));
    assert.deepEqual(candidateNames(findItem(hard, DATE, 'night')), ['Bereit']);

    const soft = computeUnderstaffingSuggestions(buildInput({ ...base, prefStrength: { unwanted_shifts: 50 } }));
    const softItem = findItem(soft, DATE, 'night');
    assert.deepEqual(candidateNames(softItem), ['Bereit', 'Verweigerer']);
    const flagged = softItem.candidates.find((candidate) => candidate.employee === 'Verweigerer');
    assert.ok(flagged.reasons.includes('entgegen Wunsch (gewichtet)'));
    assert.ok(!softItem.candidates[0].reasons.includes('entgegen Wunsch (gewichtet)'));

    const ignored = computeUnderstaffingSuggestions(buildInput({ ...base, prefStrength: { unwanted_shifts: 0 } }));
    const ignoredItem = findItem(ignored, DATE, 'night');
    assert.deepEqual(candidateNames(ignoredItem), ['Bereit', 'Verweigerer']);
    assert.ok(!ignoredItem.candidates.some((candidate) => candidate.reasons.includes('entgegen Wunsch (gewichtet)')));
  });

  it('limits the list to 8 candidates', () => {
    const schedule = {};
    for (let index = 1; index <= 12; index++) schedule[`Person${String(index).padStart(2, '0')}`] = {};
    const items = computeUnderstaffingSuggestions(buildInput({ schedule }));
    assert.equal(findItem(items, DATE, 'early').candidates.length, 8);
  });

  it('does not leak raw preference data', () => {
    const items = computeUnderstaffingSuggestions(buildInput({
      schedule: { Geheim: {}, Offen: {} },
      preferencesByEmployee: {
        Geheim: {
          preferred_shifts: ['E1'],
          unwanted_shifts: ['L1'],
          blocked_days: [6],
          preferred_holidays: ['Neujahr'],
          notes: 'GEHEIME-NOTIZ',
          max_nights_per_month: 3,
        },
      },
    }));
    assert.ok(items.length > 0);
    const serialized = JSON.stringify(items);
    for (const forbidden of ['preferred_shifts', 'unwanted_shifts', 'blocked_days', 'preferred_holidays', 'GEHEIME-NOTIZ', 'max_nights_per_month', 'notes']) {
      assert.ok(!serialized.includes(forbidden), `output must not contain ${forbidden}`);
    }
    for (const item of items) {
      assert.deepEqual(
        Object.keys(item).sort(),
        ['actual', 'candidates', 'date', 'day', 'max', 'min', 'missing', 'severity', 'shiftType'],
      );
      for (const candidate of item.candidates) {
        assert.deepEqual(Object.keys(candidate).sort(), ['employee', 'fromShiftCode', 'reasons', 'wellbeing']);
        assert.deepEqual(Object.keys(candidate.wellbeing).sort(), ['level', 'note']);
        assert.ok(candidate.reasons.every((reason) => typeof reason === 'string'));
      }
    }
  });
});
