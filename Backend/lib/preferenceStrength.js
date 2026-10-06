/* ================================================ */
/* Preference strength (Gewichtung der Wuensche)    */
/* ================================================ */
// Admin-configurable strength (0-100 %) per employee preference type.
//   100 % = absolute / hard constraint (classic behaviour)
//   1-99  = soft: penalty in the candidate score instead of a hard block
//     0   = preference is ignored entirely
// Vacation / absences and admin exclusions are NOT configurable and stay
// absolute in the generator.

import {
  getPreferenceShiftCode,
  isNightShiftRefused,
  isShiftPreferredByEmployeePreference,
  isShiftUnwantedByEmployeePreference,
} from './shiftplanGeneration.js';

export const PREFERENCE_STRENGTH_KEY_PREFIX = 'shiftplan.pref_strength.';

export const PREFERENCE_STRENGTH_TYPES = [
  'unwanted_shifts',
  'preferred_shifts',
  'holidays',
  'blocked_days',
  'max_nights',
  'max_weekends',
  'colleagues',
];

export const PREFERENCE_STRENGTH_KEYS = Object.fromEntries(
  PREFERENCE_STRENGTH_TYPES.map((type) => [type, `${PREFERENCE_STRENGTH_KEY_PREFIX}${type}`])
);

export const DEFAULT_STRENGTHS = {
  unwanted_shifts: 100,
  preferred_shifts: 100,
  holidays: 100,
  blocked_days: 100,
  max_nights: 100,
  max_weekends: 100,
  colleagues: 50,
};

// Above the work-life-balance penalties (-5000/-3000), below the forced
// follow-up bonus (+1,000,000) and late-before-night bonus (+250,000).
export const SOFT_PENALTY_BASE = 50000;

export function clampStrength(value, fallback = 100) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(typeof value === 'string' ? value.trim() : value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

// Accepts app_settings rows ([{key, value}]) or a plain map ({key: value}).
// Map keys may be full keys (shiftplan.pref_strength.x) or bare type names.
export function parsePreferenceStrengths(source) {
  const raw = new Map();
  if (Array.isArray(source)) {
    for (const row of source) {
      if (row && typeof row.key === 'string') raw.set(row.key, row.value);
    }
  } else if (source && typeof source === 'object') {
    for (const [key, value] of Object.entries(source)) raw.set(key, value);
  }

  const result = {};
  for (const type of PREFERENCE_STRENGTH_TYPES) {
    const value = raw.has(PREFERENCE_STRENGTH_KEYS[type]) ? raw.get(PREFERENCE_STRENGTH_KEYS[type]) : raw.get(type);
    result[type] = clampStrength(value, DEFAULT_STRENGTHS[type]);
  }
  return result;
}

export function isHardStrength(strength) {
  return Number(strength) >= 100;
}

export function isIgnoredStrength(strength) {
  return Number(strength) <= 0;
}

export function softPenalty(strength, base = SOFT_PENALTY_BASE) {
  const clamped = clampStrength(strength, 0);
  return Math.round((base * clamped) / 100);
}

// scaleBonus(strength, base, defaultStrength): `base` is the bonus that applies
// at `defaultStrength`; the bonus scales linearly with the strength.
// Example: scaleBonus(50, 300, 50) = 300, scaleBonus(100, 300, 50) = 600, 0 -> 0.
export function scaleBonus(strength, base, defaultStrength = 100) {
  const clamped = clampStrength(strength, defaultStrength);
  if (!(Number(defaultStrength) > 0)) return 0;
  return Math.round((base * clamped) / defaultStrength);
}

// Multiplier for existing soft scores (1 at 100 %, 0 at 0 %).
export function strengthFactor(strength) {
  return clampStrength(strength, 100) / 100;
}

// Splits the single boolean of isShiftBlockedByEmployeePreference into its two
// semantics. unwanted || notPreferred === isShiftBlockedByEmployeePreference().
export function classifyPreferenceViolation(prefs, code, respectWishes = true) {
  const unwanted = isShiftUnwantedByEmployeePreference(prefs, code);
  const preferred = (Array.isArray(prefs?.preferred_shifts) ? prefs.preferred_shifts : [])
    .map(getPreferenceShiftCode)
    .filter((entry) => entry && entry !== 'COLO');
  const notPreferred = Boolean(respectWishes) && preferred.length > 0
    && !isShiftPreferredByEmployeePreference(prefs, code);
  return { unwanted, notPreferred };
}

// Evaluates all shift-level wish violations of one employee/day/shift and
// resolves them against the configured strengths.
//  - hardBlocked: at least one violated wish has strength 100
//  - penalty:     sum of softPenalty() of violated wishes with 0 < strength < 100
//  - violations:  [{ type, strengthKey, hard, penalty }]
// `shiftType` (optional) enables the night refusal check (unwanted_shifts);
// `nightCount` (optional) enables the individual night limit check by code N.
export function evaluateShiftWishViolations({
  strengths,
  prefs,
  code,
  respectWishes = true,
  holidayName = null,
  shiftType = null,
  nightCount = null,
} = {}) {
  const s = strengths || DEFAULT_STRENGTHS;
  const violations = [];
  const add = (type, strengthKey) => {
    const strength = s[strengthKey] ?? DEFAULT_STRENGTHS[strengthKey];
    if (isIgnoredStrength(strength)) return;
    const hard = isHardStrength(strength);
    violations.push({ type, strengthKey, hard, penalty: hard ? 0 : softPenalty(strength) });
  };

  const { unwanted, notPreferred } = classifyPreferenceViolation(prefs, code, respectWishes);
  if (unwanted) add('unwanted', 'unwanted_shifts');
  else if (shiftType === 'night' && isNightShiftRefused(prefs)) add('night_refused', 'unwanted_shifts');
  if (notPreferred) add('not_preferred', 'preferred_shifts');

  if (respectWishes && holidayName && prefs?.preferred_holidays?.includes(holidayName)) {
    add('holiday', 'holidays');
  }

  if (nightCount !== null && nightCount !== undefined && getPreferenceShiftCode(code) === 'N') {
    const nightLimit = Number.parseInt(String(prefs?.max_nights_per_month ?? ''), 10);
    if (Number.isInteger(nightLimit) && Number(nightCount) >= nightLimit) add('night_limit', 'max_nights');
  }

  return {
    hardBlocked: violations.some((violation) => violation.hard),
    penalty: violations.reduce((sum, violation) => sum + violation.penalty, 0),
    violations,
  };
}

// Strength resolution for a single boolean wish (blocked weekday, individual
// night/weekend limit): returns { hard, penalty } for a violated wish.
export function resolveSingleWish(strength) {
  if (isIgnoredStrength(strength)) return { hard: false, penalty: 0, ignored: true };
  if (isHardStrength(strength)) return { hard: true, penalty: 0, ignored: false };
  return { hard: false, penalty: softPenalty(strength), ignored: false };
}
