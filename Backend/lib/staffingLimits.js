/* ================================================ */
/* Global staffing limits per day context           */
/*                                                  */
/* Weekday (Mon-Fri) early/late and night live in   */
/* staffing_rules. Saturday, Sunday and holidays    */
/* (early/late) live in staffing_day_limits.        */
/* Each limit is the cumulative sum of all shifts   */
/* of that type on that day (early = E1+E2, late =  */
/* L1+L2; Sunday has only L1WE).                    */
/* ================================================ */

export const STAFFING_DAY_CONTEXTS = Object.freeze(['weekday', 'saturday', 'sunday', 'holiday']);
export const STAFFING_DAY_LIMIT_CONTEXTS = Object.freeze(['saturday', 'sunday', 'holiday']);
export const STAFFING_DAY_LIMIT_TYPES = Object.freeze(['early', 'late']);

export const DEFAULT_STAFFING_DAY_LIMITS = Object.freeze({
  saturday: Object.freeze({ early: Object.freeze({ min_count: 4, max_count: 6 }), late: Object.freeze({ min_count: 1, max_count: 3 }) }),
  sunday: Object.freeze({ early: Object.freeze({ min_count: 4, max_count: 6 }), late: Object.freeze({ min_count: 1, max_count: 3 }) }),
  holiday: Object.freeze({ early: Object.freeze({ min_count: 4, max_count: 6 }), late: Object.freeze({ min_count: 1, max_count: 3 }) }),
});

/** A public holiday wins over the weekday of the date. */
export function resolveStaffingDayContext({ dayOfWeek, holidayName = null } = {}) {
  if (holidayName) return 'holiday';
  if (Number(dayOfWeek) === 6) return 'saturday';
  if (Number(dayOfWeek) === 0) return 'sunday';
  return 'weekday';
}

function toCount(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Rows of staffing_day_limits -> { saturday: { early: {min_count,max_count}, late }, ... } (defaults fill gaps). */
export function buildDayLimitMap(rows = []) {
  const map = {};
  for (const context of STAFFING_DAY_LIMIT_CONTEXTS) {
    map[context] = {};
    for (const type of STAFFING_DAY_LIMIT_TYPES) map[context][type] = { ...DEFAULT_STAFFING_DAY_LIMITS[context][type] };
  }
  for (const row of Array.isArray(rows) ? rows : []) {
    const context = String(row?.day_context || '').trim().toLowerCase();
    const type = String(row?.shift_type || '').trim().toLowerCase();
    if (!map[context] || !STAFFING_DAY_LIMIT_TYPES.includes(type)) continue;
    const min = toCount(row.min_count);
    if (min === null) continue;
    map[context][type] = { min_count: min, max_count: toCount(row.max_count) };
  }
  return map;
}

/**
 * Staffing rules/maximums for one day in the shape buildShiftSlots expects
 * ({ early: min, ... } and { early: max, ... }; a missing maximum = unlimited).
 * weekdayRules/weekdayMaximums come from staffing_rules; night always uses them.
 */
export function buildStaffingForContext({ context, weekdayRules = {}, weekdayMaximums = {}, dayLimitMap = null } = {}) {
  const rules = { ...weekdayRules };
  const maximums = { ...weekdayMaximums };
  if (context && context !== 'weekday' && dayLimitMap?.[context]) {
    for (const type of STAFFING_DAY_LIMIT_TYPES) {
      const limit = dayLimitMap[context][type];
      if (!limit) continue;
      rules[type] = limit.min_count;
      if (limit.max_count === null || limit.max_count === undefined) delete maximums[type];
      else maximums[type] = limit.max_count;
    }
  }
  return { rules, maximums };
}
