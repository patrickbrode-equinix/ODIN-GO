/* ================================================ */
/* In-memory stand-in for the PostgreSQL pool        */
/* Answers exactly the queries generateShiftPlan()   */
/* sends, so the real generator can run against      */
/* generated employees without a database server.    */
/* Defaults mirror the shipped migrations/defaults.  */
/* ================================================ */

import { DEFAULT_SHIFT_DEFINITIONS, DEFAULT_STAFFING_RULES } from '../../lib/shiftDefaults.js';
import { DEFAULT_STAFFING_DAY_LIMITS } from '../../lib/staffingLimits.js';
import { formatShiftMonthLabel } from '../../lib/shiftplanMonth.js';

const DEFINITION_META = {
  E1: { name: 'Frühschicht 1', type: 'early', series: 5, days: [1, 2, 3, 4, 5], sort: 1 },
  E2: { name: 'Frühschicht 2', type: 'early', series: 5, days: [1, 2, 3, 4, 5], sort: 2 },
  L1: { name: 'Spätschicht 1', type: 'late', series: 5, days: [1, 2, 3, 4, 5], sort: 3 },
  L2: { name: 'Spätschicht 2', type: 'late', series: 5, days: [1, 2, 3, 4, 5], sort: 4 },
  N: { name: 'Nachtschicht', type: 'night', series: 7, days: [1, 2, 3, 4, 5, 6, 0], sort: 5 },
  E1SA: { name: 'Frühschicht SA', type: 'early', series: 6, days: [1, 2, 3, 4, 5, 6], sort: 6 },
  E1WE: { name: 'Frühschicht SA/SO', type: 'early', series: 7, days: [1, 2, 3, 4, 5, 6, 0], sort: 7 },
  E2SA: { name: 'Frühschicht 2 SA', type: 'early', series: 6, days: [1, 2, 3, 4, 5, 6], sort: 9 },
  E2WE: { name: 'Frühschicht 2 SA/SO', type: 'early', series: 7, days: [1, 2, 3, 4, 5, 6, 0], sort: 10 },
  L1WE: { name: 'Spätschicht SA/SO', type: 'late', series: 7, days: [1, 2, 3, 4, 5, 6, 0], sort: 8 },
};

export function buildDefaultDefinitions() {
  let id = 1;
  const rows = Object.entries(DEFINITION_META).map(([code, meta]) => ({
    id: id++,
    code,
    name: meta.name,
    short_name: code,
    shift_type: meta.type,
    ...DEFAULT_SHIFT_DEFINITIONS[code],
    series_days: meta.series,
    color_hex: '#3b82f6',
    is_active: true,
    sort_order: meta.sort,
    applicable_days: meta.days,
    free_days_after: null,
    modes: [],
    day_overrides: [],
  }));
  rows.push({
    id: id++, code: 'DBS', name: 'DBS', short_name: 'DBS', shift_type: 'special',
    start_time: '08:00', end_time: '16:00', start_day_offset: 0, end_day_offset: 0, duration_hours: 8,
    series_days: 7, min_staff: 1, max_staff: 1, color_hex: '#c026d3', is_active: true, sort_order: 11,
    applicable_days: [1, 2, 3, 4, 5, 6, 0], free_days_after: null, modes: [], day_overrides: [],
  });
  rows.push({
    id: id++, code: 'NK', name: 'Kurze Nachtschicht', short_name: 'NK', shift_type: 'night',
    start_time: '21:45', end_time: '06:45', start_day_offset: 0, end_day_offset: 1, duration_hours: 9,
    series_days: 3, min_staff: 1, max_staff: 3, color_hex: '#2563eb', is_active: false, sort_order: 999,
    applicable_days: [0, 1, 2, 3, 4, 5, 6], free_days_after: null, modes: [], day_overrides: [],
  });
  return rows;
}

export function buildDefaultRotation() {
  return {
    id: 1, max_consecutive_same: 5, max_consecutive_workdays: 6, min_free_after_streak: 1,
    night_to_early_forbidden: true, late_to_early_forbidden: true, min_hours_between_shifts: 11,
    max_nights_per_month: 7, max_weekends_per_month: 2, weekend_rule: 'balanced',
    free_days_after_night: 2, free_days_after_weekend: 2, night_next_workday: 4, night_next_shift_code: null,
    late_before_night_required: false, stability_priority: 70, max_shift_type_changes_per_month: 4,
    min_free_weekends_per_month: 2, min_recovery_days_after_shift_change: 1,
    short_night_mode_enabled: false, short_night_free_days_after: 2, night_planning_mode: 'MIXED',
  };
}

export function createFakePlanningDb(overrides = {}) {
  const db = {
    definitions: buildDefaultDefinitions(),
    rotation: buildDefaultRotation(),
    fairness: { id: 1, balance_nights: true, balance_weekends: true, balance_total_load: true, max_deviation_percent: 20, fairness_vs_preference: 'fairness' },
    planConfig: { id: 1, respect_employee_wishes: true, hard_rules_priority: 100, soft_wishes_priority: 50, fairness_priority: 80, admin_override_priority: 90, monthly_target_hours: 174, annual_target_hours: null },
    settings: new Map(),
    specialPools: [],
    employees: [],
    preferences: [],
    absences: [],
    exclusions: [],
    monthlyTargets: [],
    staffingRules: Object.entries(DEFAULT_STAFFING_RULES).map(([shift_type, rule]) => ({ shift_type, ...rule })),
    staffingDayLimits: Object.entries(DEFAULT_STAFFING_DAY_LIMITS).flatMap(([day_context, types]) => (
      Object.entries(types).map(([shift_type, limit]) => ({ day_context, shift_type, ...limit }))
    )),
    // month label -> [{ employee_name, day, shift_code }] (previous months feed the carry-over state)
    shiftHistory: new Map(),
    // 'YYYY-MM' -> [{ employee_name, day, shift_code }]: drafts of previous months (fallback of the carry-over)
    draftHistory: new Map(),
    queries: [],
    ...overrides,
  };

  const setting = (key) => (db.settings.has(key) ? [{ key, value: String(db.settings.get(key)) }] : []);

  async function query(text, params = []) {
    const sql = String(text).replace(/\s+/g, ' ').trim();
    db.queries.push(sql);
    const rows = (value) => ({ rows: value, rowCount: value.length });

    if (/FROM shift_definitions definition/.test(sql)) {
      return rows(db.definitions.filter((d) => d.is_active || String(d.code).toUpperCase() === 'NK').map((d) => ({ ...d })));
    }
    if (/FROM shift_rotation_rules/.test(sql)) return rows([db.rotation]);
    if (/FROM shift_fairness_rules/.test(sql)) return rows([db.fairness]);
    if (/FROM shift_planning_config/.test(sql)) return rows([db.planConfig]);
    if (/FROM shift_special_pools/.test(sql)) return rows(db.specialPools);
    if (/FROM year_plan_2027/.test(sql)) throw new Error('relation "year_plan_2027" does not exist');
    if (/SELECT DISTINCT month, employee_name FROM shifts/.test(sql)) {
      const label = formatShiftMonthLabel(2027, 1);
      return rows(db.employees.map((name) => ({ month: label, employee_name: name })));
    }
    if (/FROM manual_shiftplan_employees/.test(sql)) return rows([]);
    if (/FROM absences/.test(sql)) return rows(db.absences);
    if (/FROM users WHERE id = ANY/.test(sql)) {
      const ids = new Set((params[0] || []).map(Number));
      return rows(db.preferences.filter((p) => ids.has(p.user_id)).map((p) => ({ id: p.user_id, first_name: p.first_name, last_name: p.last_name, provisioned_employee_name: p.provisioned_employee_name })));
    }
    if (/FROM shiftplan_exclusions/.test(sql)) return rows(db.exclusions);
    if (/FROM assignment_employee_exclusions/.test(sql)) return rows([]);
    if (/FROM wellbeing_metrics/.test(sql)) return rows([]);
    if (/FROM employee_preferences ep JOIN users u/.test(sql)) return rows(db.preferences);
    if (/FROM staffing_rules/.test(sql)) return rows(db.staffingRules);
    if (/FROM staffing_day_limits/.test(sql)) return rows(db.staffingDayLimits);
    if (/FROM shiftplan_employee_monthly_targets/.test(sql)) return rows(db.monthlyTargets);
    if (/FROM shifts WHERE \(month = \$1 OR month = \$2\)/.test(sql)) {
      const [label, monthId, minDay] = params;
      const history = db.shiftHistory.get(label) || db.shiftHistory.get(monthId) || [];
      return rows(history.filter((row) => row.day >= minDay).map((row) => ({ month: label, ...row })));
    }
    if (/SELECT shifts_json FROM shiftplan_drafts WHERE month = \$1/.test(sql)) {
      const draft = db.draftHistory.get(params[0]);
      return rows(draft ? [{ shifts_json: draft }] : []);
    }
    if (/FROM app_settings/.test(sql)) {
      if (/key = ANY\(\$1::text\[\]\)/.test(sql)) return rows((params[0] || []).flatMap(setting));
      if (/key LIKE \$1/.test(sql)) {
        const prefix = String(params[0] || '').replace(/%$/, '');
        return rows([...db.settings.keys()].filter((key) => key.startsWith(prefix)).flatMap(setting));
      }
      if (/key = \$1/.test(sql)) return rows(setting(params[0]));
      const literal = /key = '([^']+)'/.exec(sql);
      if (literal) return rows(setting(literal[1]));
      return rows([]);
    }
    throw new Error(`fakePlanningDb: unhandled query: ${sql.slice(0, 160)}`);
  }

  return { db, query };
}

/** Deterministic pseudo random numbers so a failing run can be reproduced from its seed. */
export function createRandom(seed = 1) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (probability) => next() < probability,
    shuffle: (list) => {
      const copy = [...list];
      for (let index = copy.length - 1; index > 0; index--) {
        const swap = Math.floor(next() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
      }
      return copy;
    },
  };
}
