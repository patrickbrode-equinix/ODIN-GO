/* ================================================ */
/* Understaffing warnings + replacement candidates  */
/*                                                  */
/* Pure module (no DB access). The route loads the  */
/* data and hands it over as plain objects.         */
/* ================================================ */

import {
  NIGHT_MODELS,
  buildStaffingMaximumsByShiftType,
  buildStaffingRulesByShiftType,
  isDayBlockedByEmployeePreference,
  isNightShiftRefused,
  isShiftDefinitionApplicable,
  isShiftDefinitionDraftPlannable,
  normalizePlanningShiftTypeKey,
  resolveEmployeeNightModel,
} from './shiftplanGeneration.js';
import {
  classifyPreferenceViolation,
  parsePreferenceStrengths,
  resolveSingleWish,
} from './preferenceStrength.js';

export const WISH_VIOLATION_REASON = 'entgegen Wunsch (gewichtet)';
export const SUGGESTION_SHIFT_TYPES = Object.freeze(['night', 'late', 'early']);
export const MAX_CANDIDATES_PER_WARNING = 8;
const HISTORY_DAYS = 28;
const RUN_SCAN_LIMIT = 62;

const EARLY_CODES = new Set(['E1', 'E2', 'E1SA', 'E1WE', 'E2SA', 'E2WE']);
const LATE_CODES = new Set(['L1', 'L2', 'L1WE']);
const NIGHT_CODES = new Set(['N', 'NK']);
const FREE_CODES = new Set(['', 'FS', 'FREI']);
const ABSENCE_CODES = new Set(['ABW', 'K', 'U', 'S', 'SEMINAR', 'URLAUB', 'KRANK', 'VACATION', 'SICK', 'TRAINING']);
const TYPE_LABELS = { early: 'E', late: 'L', night: 'N' };
const DEFAULT_REPRESENTATIVE_CODE = { early: 'E1', late: 'L1', night: 'N' };

/* ------------------------------------------------ */
/* Small generic helpers                            */
/* ------------------------------------------------ */

function normalizeCode(code) {
  return String(code ?? '').trim().toUpperCase();
}

function intOr(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegativeInt(value) {
  return Math.max(intOr(value, 0), 0);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function entriesOf(source) {
  if (!source) return [];
  if (source instanceof Map) return [...source.entries()];
  if (typeof source === 'object') return Object.entries(source);
  return [];
}

function getFrom(source, key) {
  if (!source) return undefined;
  if (source instanceof Map) return source.get(key);
  if (typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  return undefined;
}

function toSet(source) {
  if (source instanceof Set) return source;
  if (Array.isArray(source)) return new Set(source);
  return new Set();
}

/* ------------------------------------------------ */
/* Date helpers (calendar math in UTC, no TZ drift) */
/* ------------------------------------------------ */

function toIso(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addDaysIso(iso, amount) {
  const [year, month, day] = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function dayOfWeekIso(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isWeekendIso(iso) {
  const dow = dayOfWeekIso(iso);
  return dow === 0 || dow === 6;
}

function weekendBlockKey(iso) {
  return addDaysIso(iso, -((dayOfWeekIso(iso) + 6) % 7));
}

function toDateKey(value) {
  // pg returns DATE columns as local-midnight Date objects; read local calendar parts.
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return String(value ?? '').slice(0, 10);
}

/* ------------------------------------------------ */
/* Shift code classification                        */
/* ------------------------------------------------ */

export function isFreeShiftCode(code) {
  return FREE_CODES.has(normalizeCode(code));
}

export function isAbsenceShiftCode(code) {
  return ABSENCE_CODES.has(normalizeCode(code));
}

// Any code that means "this person is at work" (including codes outside early/late/night).
export function isWorkingShiftCode(code) {
  const normalized = normalizeCode(code);
  return Boolean(normalized) && !FREE_CODES.has(normalized) && !ABSENCE_CODES.has(normalized);
}

/**
 * Maps a live shift code to 'early' | 'late' | 'night' or null.
 * Known codes win; unknown codes fall back to the (plannable) shift definition.
 */
export function classifyShiftCodeToType(code, definitions = []) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  if (EARLY_CODES.has(normalized)) return 'early';
  if (LATE_CODES.has(normalized)) return 'late';
  if (NIGHT_CODES.has(normalized)) return 'night';

  const definition = (Array.isArray(definitions) ? definitions : [])
    .find((entry) => normalizeCode(entry?.code) === normalized);
  if (!definition || definition.is_active === false || !isShiftDefinitionDraftPlannable(definition)) return null;
  const type = normalizePlanningShiftTypeKey(definition.shift_type);
  return SUGGESTION_SHIFT_TYPES.includes(type) ? type : null;
}

export function severityForMissing(missing) {
  const value = Number(missing);
  if (!Number.isFinite(value) || value < 1) return null;
  return value >= 2 ? 'critical' : 'warning';
}

/* ------------------------------------------------ */
/* Staffing maximum / minimum                       */
/* ------------------------------------------------ */

function getApplicableDefinitions(definitions, shiftType, dayOfWeek) {
  return (Array.isArray(definitions) ? definitions : []).filter((definition) => (
    definition
    && definition.is_active !== false
    && isShiftDefinitionDraftPlannable(definition)
    && normalizePlanningShiftTypeKey(definition.shift_type) === shiftType
    && isShiftDefinitionApplicable(definition, dayOfWeek)
  ));
}

/**
 * Maximum staffing of one shift type on a weekday:
 * sum of max_staff over the applicable active definitions, capped by
 * staffing_rules.max_count when set (> 0). For nights N and NK are the same
 * operational coverage: the max_staff of 'N' is used (else the largest night
 * definition) instead of the sum.
 */
export function getTypeMaximum({ definitions = [], staffingRules = [], shiftType, dayOfWeek } = {}) {
  const type = normalizePlanningShiftTypeKey(shiftType);
  const applicable = getApplicableDefinitions(definitions, type, dayOfWeek);
  const maxStaffOf = (definition) => nonNegativeInt(definition?.max_staff);

  let total = 0;
  if (type === 'night') {
    const baseNight = applicable.find((definition) => normalizeCode(definition.code) === 'N');
    if (baseNight) {
      total = maxStaffOf(baseNight);
    } else {
      const nonShort = applicable.filter((definition) => normalizeCode(definition.code) !== 'NK');
      const pool = nonShort.length > 0 ? nonShort : applicable;
      total = pool.reduce((largest, definition) => Math.max(largest, maxStaffOf(definition)), 0);
    }
  } else {
    total = applicable.reduce((sum, definition) => sum + maxStaffOf(definition), 0);
  }

  const rows = Array.isArray(staffingRules) ? staffingRules : [];
  const configuredCap = buildStaffingMaximumsByShiftType(rows)[type];
  if (Number.isFinite(configuredCap) && configuredCap > 0) total = Math.min(total, configuredCap);
  return total;
}

/**
 * Minimum staffing of one shift type on a weekday. Same rule as the generator's
 * understaffed audit: max(staffing_rules.min_count, sum of min_staff of the
 * applicable active definitions). NK is not added on top of N.
 */
export function getTypeMinimum({ definitions = [], staffingRules = [], shiftType, dayOfWeek } = {}) {
  const type = normalizePlanningShiftTypeKey(shiftType);
  const applicable = getApplicableDefinitions(definitions, type, dayOfWeek)
    .filter((definition) => !(type === 'night' && normalizeCode(definition.code) === 'NK'));
  const definitionMinimum = applicable.reduce((sum, definition) => sum + nonNegativeInt(definition?.min_staff), 0);
  const rows = Array.isArray(staffingRules) ? staffingRules : [];
  const configured = buildStaffingRulesByShiftType(rows)[type];
  return Math.max(Number.isFinite(configured) ? configured : 0, definitionMinimum);
}

/* ------------------------------------------------ */
/* Preferences                                      */
/* ------------------------------------------------ */

/**
 * Same merge as the generator's preferencesForDate closure: a month entry
 * (YYYY-MM) overrides preferred_shifts and extends unwanted_shifts.
 */
export function mergeMonthlyPreferences(base, monthKey) {
  if (!base || typeof base !== 'object') return base;
  const monthly = base.monthly_preferences && typeof base.monthly_preferences === 'object'
    ? base.monthly_preferences[monthKey]
    : null;
  if (!monthly || typeof monthly !== 'object') return base;
  return {
    ...base,
    preferred_shifts: Array.isArray(monthly.preferred_shifts) ? monthly.preferred_shifts : base.preferred_shifts,
    unwanted_shifts: [...new Set([
      ...(Array.isArray(base.unwanted_shifts) ? base.unwanted_shifts : []),
      ...(Array.isArray(monthly.unwanted_shifts) ? monthly.unwanted_shifts : []),
    ])],
  };
}

/* ------------------------------------------------ */
/* Config normalisation                              */
/* ------------------------------------------------ */

function normalizeRotationRules(rules) {
  const source = rules && typeof rules === 'object' ? rules : {};
  const positiveOrDefault = (value, fallback) => {
    const parsed = intOr(value, NaN);
    return Number.isFinite(parsed) ? Math.max(parsed, 0) : fallback;
  };
  return {
    nightToEarlyForbidden: source.night_to_early_forbidden !== false,
    lateToEarlyForbidden: source.late_to_early_forbidden !== false,
    freeDaysAfterNight: positiveOrDefault(source.free_days_after_night, 2),
    freeDaysAfterWeekend: positiveOrDefault(source.free_days_after_weekend, 2),
    maxConsecutiveWorkdays: positiveOrDefault(source.max_consecutive_workdays, 6),
    maxNightsPerMonth: positiveOrDefault(source.max_nights_per_month, 7),
    maxWeekendsPerMonth: Number.isInteger(intOr(source.max_weekends_per_month, NaN))
      ? intOr(source.max_weekends_per_month, NaN)
      : 2,
    nightPlanningMode: source.night_planning_mode,
  };
}

function normalizeWellbeingConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const threshold = (value, fallback) => {
    const parsed = intOr(value, NaN);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    nightThreshold: threshold(source.night_threshold, 4),
    weekendThreshold: threshold(source.weekend_threshold, 2),
    streakThreshold: threshold(source.streak_threshold, 7),
  };
}

function normalizeSchedule(source) {
  const normalized = new Map();
  for (const [employee, days] of entriesOf(source)) {
    if (!employee || !days || typeof days !== 'object') continue;
    normalized.set(employee, days);
  }
  return normalized;
}

function buildAbsenceIndex(absences) {
  const index = new Map();
  for (const absence of Array.isArray(absences) ? absences : []) {
    const name = absence?.employee_name;
    if (!name) continue;
    if (!index.has(name)) index.set(name, []);
    index.get(name).push({ start: toDateKey(absence.start_date), end: toDateKey(absence.end_date) });
  }
  return index;
}

function normalizeExclusions(exclusions) {
  if (Array.isArray(exclusions) || exclusions instanceof Set) {
    return { excluded: toSet(exclusions), blockedWeekdays: new Map() };
  }
  const source = exclusions && typeof exclusions === 'object' ? exclusions : {};
  const blockedWeekdays = new Map();
  for (const [employee, weekdays] of entriesOf(source.blockedWeekdaysByEmployee)) {
    const days = weekdays instanceof Set ? weekdays : new Set(Array.isArray(weekdays) ? weekdays.map(Number) : []);
    blockedWeekdays.set(employee, days);
  }
  return { excluded: toSet(source.excluded), blockedWeekdays };
}

/* ------------------------------------------------ */
/* Main entry point                                 */
/* ------------------------------------------------ */

/**
 * @param {object} input see the route for the data sources
 * @returns {Array} contract items (see API contract)
 */
export function computeUnderstaffingSuggestions(input = {}) {
  const year = Number.parseInt(String(input.year), 10);
  const month = Number.parseInt(String(input.month), 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return [];

  const today = String(input.today || '').slice(0, 10);
  const definitions = Array.isArray(input.definitions) ? input.definitions : [];
  const staffingRules = Array.isArray(input.staffingRules) ? input.staffingRules : [];
  const rules = normalizeRotationRules(input.rotationRules);
  const wellbeing = normalizeWellbeingConfig(input.wellbeingConfig);
  const respectWishes = input.respectWishes !== false;
  const blockedDaysEnabled = input.blockedDaysEnabled === true;
  const holidayMap = input.holidayMap && typeof input.holidayMap === 'object' ? input.holidayMap : {};
  const exclusions = normalizeExclusions(input.exclusions);
  const prefStrength = parsePreferenceStrengths(input.prefStrength);
  const shortNightSeriesDaysRaw = Number.parseInt(String(input.shortNightSeriesDays ?? 3), 10);
  const shortNightSeriesDays = Number.isInteger(shortNightSeriesDaysRaw) && shortNightSeriesDaysRaw > 0 ? shortNightSeriesDaysRaw : 3;

  const schedule = normalizeSchedule(input.schedule);
  const prevSchedule = normalizeSchedule(input.prevMonthSchedule);
  const nextSchedule = normalizeSchedule(input.nextMonthSchedule);
  const absenceIndex = buildAbsenceIndex(input.absences);

  const monthKey = `${year}-${pad2(month)}`;
  const prevMonthKey = month === 1 ? `${year - 1}-12` : `${year}-${pad2(month - 1)}`;
  const nextMonthKey = month === 12 ? `${year + 1}-01` : `${year}-${pad2(month + 1)}`;
  const numDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const employees = [...schedule.keys()].sort((left, right) => String(left).localeCompare(String(right), 'de'));

  const codeAt = (employee, iso) => {
    const key = iso.slice(0, 7);
    let source = null;
    if (key === monthKey) source = schedule;
    else if (key === prevMonthKey) source = prevSchedule;
    else if (key === nextMonthKey) source = nextSchedule;
    if (!source) return '';
    const days = source.get(employee);
    if (!days) return '';
    return normalizeCode(days[Number.parseInt(iso.slice(8, 10), 10)]);
  };
  const typeAt = (employee, iso) => classifyShiftCodeToType(codeAt(employee, iso), definitions);
  const worksAt = (employee, iso) => isWorkingShiftCode(codeAt(employee, iso));

  const preferencesFor = (employee, iso) => {
    const base = getFrom(input.preferencesByEmployee, employee);
    return mergeMonthlyPreferences(base, iso.slice(0, 7)) || {};
  };
  const fixedTypeFor = (employee) => normalizePlanningShiftTypeKey(getFrom(input.fixedShiftTypeByEmployee, employee));

  const isAbsentOn = (employee, iso) => (absenceIndex.get(employee) || [])
    .some((absence) => iso >= absence.start && iso <= absence.end);

  // Distinct employees per day and shift type in the live month.
  const countsByDay = new Map();
  for (let day = 1; day <= numDays; day++) countsByDay.set(day, { early: 0, late: 0, night: 0 });
  for (const employee of employees) {
    for (let day = 1; day <= numDays; day++) {
      const type = typeAt(employee, toIso(year, month, day));
      if (type) countsByDay.get(day)[type] += 1;
    }
  }

  const runLength = (employee, iso, step, predicate) => {
    let count = 0;
    for (let offset = 1; offset <= RUN_SCAN_LIMIT; offset++) {
      if (!predicate(employee, addDaysIso(iso, step * offset))) break;
      count += 1;
    }
    return count;
  };

  const monthNightCount = (employee) => {
    let count = 0;
    for (let day = 1; day <= numDays; day++) {
      if (typeAt(employee, toIso(year, month, day)) === 'night') count += 1;
    }
    return count;
  };
  const monthWorkdayCount = (employee) => {
    let count = 0;
    for (let day = 1; day <= numDays; day++) {
      if (worksAt(employee, toIso(year, month, day))) count += 1;
    }
    return count;
  };
  const monthWeekendBlocks = (employee) => {
    const blocks = new Set();
    for (let day = 1; day <= numDays; day++) {
      const iso = toIso(year, month, day);
      if (isWeekendIso(iso) && worksAt(employee, iso)) blocks.add(weekendBlockKey(iso));
    }
    return blocks;
  };

  const monthStats = new Map();
  const statsFor = (employee) => {
    if (!monthStats.has(employee)) {
      monthStats.set(employee, {
        nights: monthNightCount(employee),
        workdays: monthWorkdayCount(employee),
        weekendBlocks: monthWeekendBlocks(employee),
      });
    }
    return monthStats.get(employee);
  };

  /**
   * Returns null when the employee must not be proposed, otherwise the
   * (internal) candidate record.
   */
  const evaluateCandidate = ({ employee, iso, dow, day, type, typeCodes }) => {
    if (exclusions.excluded.has(employee)) return null;
    if (exclusions.blockedWeekdays.get(employee)?.has(dow)) return null;
    const fixedType = fixedTypeFor(employee);
    if (fixedType && fixedType !== type) return null;
    if (isAbsentOn(employee, iso)) return null;

    // (a) current state of the day
    const currentCode = codeAt(employee, iso);
    if (isAbsenceShiftCode(currentCode)) return null;
    const currentType = classifyShiftCodeToType(currentCode, definitions);
    if (currentType === type) return null;
    const freeToday = !isWorkingShiftCode(currentCode);
    if (!freeToday && !currentType) return null; // special/unclassified shift: never pulled away

    const reasons = [];
    if (freeToday) {
      reasons.push('Frei an diesem Tag');
    } else {
      const minimumOfOrigin = getTypeMinimum({ definitions, staffingRules, shiftType: currentType, dayOfWeek: dow });
      const remaining = (countsByDay.get(day)?.[currentType] || 0) - 1;
      if (remaining < minimumOfOrigin) return null;
      reasons.push(`Wird aus ${currentCode} umgesetzt, ${TYPE_LABELS[currentType]} bleibt besetzt (${remaining}/${minimumOfOrigin} Minimum)`);
    }

    // (b) preferences (never exposed in the output)
    const prefs = preferencesFor(employee, iso);
    // Strength 100 = hard exclusion, 1-99 = candidate stays but is flagged and ranked last, 0 = wish ignored.
    const codesToTest = typeCodes.length > 0 ? typeCodes : [DEFAULT_REPRESENTATIVE_CODE[type]];
    let wishViolated = false;
    const codeStates = codesToTest.map((code) => {
      const { unwanted, notPreferred } = classifyPreferenceViolation(prefs, code, respectWishes);
      const unwantedWish = unwanted ? resolveSingleWish(prefStrength.unwanted_shifts) : null;
      const preferredWish = notPreferred ? resolveSingleWish(prefStrength.preferred_shifts) : null;
      const wishes = [unwantedWish, preferredWish].filter((wish) => wish && !wish.ignored);
      return { hard: wishes.some((wish) => wish.hard), soft: wishes.length > 0 };
    });
    if (codeStates.every((state) => state.hard)) return null;
    if (codeStates.every((state) => state.soft)) wishViolated = true;
    if (type === 'night' && isNightShiftRefused(prefs)) {
      const refusal = resolveSingleWish(prefStrength.unwanted_shifts);
      if (refusal.hard) return null;
      if (!refusal.ignored) wishViolated = true;
    }
    if (blockedDaysEnabled && isDayBlockedByEmployeePreference(prefs, dow)) {
      const blockedDay = resolveSingleWish(prefStrength.blocked_days);
      if (blockedDay.hard) return null;
      if (!blockedDay.ignored) wishViolated = true;
    }
    const holidayName = holidayMap[iso];
    if (respectWishes && holidayName && Array.isArray(prefs.preferred_holidays) && prefs.preferred_holidays.includes(holidayName)) {
      const holidayWish = resolveSingleWish(prefStrength.holidays);
      if (holidayWish.hard) return null;
      if (!holidayWish.ignored) wishViolated = true;
    }

    const stats = statsFor(employee);
    const prevIso = addDaysIso(iso, -1);
    const nextIso = addDaysIso(iso, 1);
    const prevType = typeAt(employee, prevIso);
    const nextType = typeAt(employee, nextIso);

    if (type === 'night') {
      const nightModel = resolveEmployeeNightModel({
        planningMode: rules.nightPlanningMode,
        employeeNightModel: prefs.night_model,
      });
      if (nightModel === NIGHT_MODELS.SHORT) {
        const before = runLength(employee, iso, -1, (name, dateIso) => typeAt(name, dateIso) === 'night');
        const after = runLength(employee, iso, 1, (name, dateIso) => typeAt(name, dateIso) === 'night');
        if (before + 1 + after > shortNightSeriesDays) return null;
      }
      const nightLimits = [intOr(prefs.max_nights_per_month, NaN), rules.maxNightsPerMonth > 0 ? rules.maxNightsPerMonth : NaN]
        .filter(Number.isInteger);
      if (nightLimits.some((limit) => stats.nights + 1 > limit)) return null;
    }

    const weekendDate = isWeekendIso(iso);
    const blockKey = weekendDate ? weekendBlockKey(iso) : null;
    if (weekendDate && freeToday && !stats.weekendBlocks.has(blockKey)) {
      const weekendLimits = [intOr(prefs.max_weekends_per_month, NaN), rules.maxWeekendsPerMonth].filter(Number.isInteger);
      if (weekendLimits.some((limit) => stats.weekendBlocks.size + 1 > limit)) return null;
    }

    // (c) rest rules against the live neighbours (incl. neighbouring months)
    if (type === 'early' && prevType === 'night' && rules.nightToEarlyForbidden) return null;
    if (type === 'early' && prevType === 'late' && rules.lateToEarlyForbidden) return null;
    if (type === 'night' && nextType === 'early' && rules.nightToEarlyForbidden) return null;
    if (type === 'late' && nextType === 'early' && rules.lateToEarlyForbidden) return null;

    const workdayRun = 1 + runLength(employee, iso, -1, worksAt) + runLength(employee, iso, 1, worksAt);

    if (freeToday) {
      // Free days after a night block (before the target day).
      if (type !== 'night' || prevType !== 'night') {
        for (let offset = 1; offset <= rules.freeDaysAfterNight; offset++) {
          if (typeAt(employee, addDaysIso(iso, -offset)) === 'night') return null;
        }
      }
      // A night block extended/created by the target day needs its free days afterwards.
      if (type === 'night') {
        const trailingNights = runLength(employee, iso, 1, (name, dateIso) => typeAt(name, dateIso) === 'night');
        const blockEnd = addDaysIso(iso, trailingNights);
        for (let offset = 1; offset <= rules.freeDaysAfterNight; offset++) {
          if (worksAt(employee, addDaysIso(blockEnd, offset))) return null;
        }
      }
      // Free days after a weekend block.
      if (rules.freeDaysAfterWeekend > 0) {
        if (weekendDate) {
          const lastWeekendDay = dayOfWeekIso(iso) === 6 ? addDaysIso(iso, 1) : iso;
          for (let offset = 1; offset <= rules.freeDaysAfterWeekend; offset++) {
            if (worksAt(employee, addDaysIso(lastWeekendDay, offset))) return null;
          }
        } else {
          for (let offset = 1; offset <= rules.freeDaysAfterWeekend; offset++) {
            const sunday = addDaysIso(iso, -offset);
            if (dayOfWeekIso(sunday) === 0 && (worksAt(employee, sunday) || worksAt(employee, addDaysIso(sunday, -1)))) return null;
          }
        }
      }
      if (rules.maxConsecutiveWorkdays > 0 && workdayRun > rules.maxConsecutiveWorkdays) return null;
    }

    reasons.push('Ruhezeit- und Arbeitstage-Regeln eingehalten');
    if (wishViolated) reasons.push(WISH_VIOLATION_REASON);

    // (d) wellbeing (informative only, never a filter)
    let recentOfType = 0;
    for (let offset = 1; offset <= HISTORY_DAYS; offset++) {
      if (typeAt(employee, addDaysIso(iso, -offset)) === type) recentOfType += 1;
    }
    const findings = [];
    if (type === 'night') {
      if (recentOfType >= wellbeing.nightThreshold + 2) findings.push({ rank: 2, note: nightNote(recentOfType, wellbeing.nightThreshold) });
      else if (recentOfType >= wellbeing.nightThreshold) findings.push({ rank: 1, note: nightNote(recentOfType, wellbeing.nightThreshold) });
    }
    if (weekendDate) {
      const otherBlocks = [...stats.weekendBlocks].filter((key) => key !== blockKey).length;
      if (otherBlocks >= wellbeing.weekendThreshold + 2) findings.push({ rank: 2, note: weekendNote(otherBlocks, wellbeing.weekendThreshold) });
      else if (otherBlocks >= wellbeing.weekendThreshold) findings.push({ rank: 1, note: weekendNote(otherBlocks, wellbeing.weekendThreshold) });
    }
    if (workdayRun >= wellbeing.streakThreshold + 2) findings.push({ rank: 2, note: streakNote(workdayRun, wellbeing.streakThreshold) });
    else if (workdayRun >= wellbeing.streakThreshold) findings.push({ rank: 1, note: streakNote(workdayRun, wellbeing.streakThreshold) });

    const topRank = findings.reduce((best, finding) => Math.max(best, finding.rank), 0);
    const topFinding = findings.find((finding) => finding.rank === topRank);
    const level = topRank >= 2 ? 'high' : (topRank === 1 ? 'elevated' : 'ok');

    return {
      employee,
      fromShiftCode: freeToday ? null : currentCode,
      wellbeing: { level, note: topFinding ? topFinding.note : null },
      reasons,
      sort: {
        wishViolated: wishViolated ? 1 : 0,
        levelRank: topRank,
        recentOfType,
        moved: freeToday ? 0 : 1,
        monthWorkdays: stats.workdays,
      },
    };
  };

  const items = [];
  for (let day = 1; day <= numDays; day++) {
    const iso = toIso(year, month, day);
    if (today && iso < today) continue;
    const dow = dayOfWeekIso(iso);

    for (const type of SUGGESTION_SHIFT_TYPES) {
      const max = getTypeMaximum({ definitions, staffingRules, shiftType: type, dayOfWeek: dow });
      if (!(max > 0)) continue;
      const actual = countsByDay.get(day)[type];
      const missing = max - actual;
      const severity = severityForMissing(missing);
      if (!severity) continue;

      const min = getTypeMinimum({ definitions, staffingRules, shiftType: type, dayOfWeek: dow });
      const typeCodes = [...new Set(getApplicableDefinitions(definitions, type, dow)
        .map((definition) => normalizeCode(definition.code))
        .filter(Boolean))];

      const candidates = employees
        .map((employee) => evaluateCandidate({ employee, iso, dow, day, type, typeCodes }))
        .filter(Boolean)
        .sort((left, right) => (
          left.sort.wishViolated - right.sort.wishViolated
          || left.sort.levelRank - right.sort.levelRank
          || left.sort.recentOfType - right.sort.recentOfType
          || left.sort.moved - right.sort.moved
          || left.sort.monthWorkdays - right.sort.monthWorkdays
          || String(left.employee).localeCompare(String(right.employee), 'de')
        ))
        .slice(0, MAX_CANDIDATES_PER_WARNING)
        .map(({ employee, fromShiftCode, wellbeing: wellbeingInfo, reasons }) => ({
          employee,
          fromShiftCode,
          wellbeing: wellbeingInfo,
          reasons,
        }));

      items.push({
        date: iso,
        day,
        shiftType: type,
        max,
        min,
        actual,
        missing,
        severity,
        candidates,
      });
    }
  }

  return items;
}

/* ------------------------------------------------ */
/* German notes                                     */
/* ------------------------------------------------ */

function nightNote(count, threshold) {
  return `Hatte in den letzten ${HISTORY_DAYS} Tagen bereits ${count} ${count === 1 ? 'Nachtschicht' : 'Nachtschichten'} (Wellbeing-Schwelle: ${threshold})`;
}

function weekendNote(count, threshold) {
  return `Hat in diesem Monat bereits ${count} ${count === 1 ? 'Wochenende' : 'Wochenenden'} gearbeitet (Wellbeing-Schwelle: ${threshold})`;
}

function streakNote(count, threshold) {
  return `Würde ${count} Arbeitstage in Folge arbeiten (Wellbeing-Schwelle: ${threshold})`;
}
