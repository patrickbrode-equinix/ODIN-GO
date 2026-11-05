/* ================================================ */
/* Fixed planning rules for single employees        */
/* Kept in code on purpose: these people are never  */
/* planned on the given weekdays, whatever their    */
/* wishes or the admin settings say.                */
/* ================================================ */

import { normalizeName } from './nameNorm.js';

// Name tokens (order and "Last, First" notation do not matter; the spelling Hadzic/Hadic is accepted).
const WEEKDAY_ONLY_RULES = [
  { tokens: ['armin'], anyOf: ['hadzic', 'hadic'], label: 'Armin Hadzic' },
];

function nameTokens(name) {
  return String(normalizeName(name) || '').split(/[^a-z0-9]+/).filter(Boolean);
}

/** True for employees who must never work on Saturday or Sunday (only Monday to Friday). */
export function isWeekdayOnlyEmployee(name) {
  const tokens = nameTokens(name);
  return WEEKDAY_ONLY_RULES.some((rule) => rule.tokens.every((token) => tokens.includes(token))
    && rule.anyOf.some((token) => tokens.includes(token)));
}

export const WEEKEND_WEEKDAYS = Object.freeze([0, 6]);

/* ------------------------------------------------ */
/* Pairs who are never planned together              */
/* ------------------------------------------------ */

// Fixed in code, like the weekday-only rule: Patrick Brode and Godfrey Emanuel never work together on a
// night shift and never on the same weekend day (Saturday / Sunday, any shift).
const NEVER_TOGETHER_RULES = [
  {
    label: 'Patrick Brode / Godfrey Emanuel',
    members: [['patrick', 'brode'], ['godfrey', 'emanuel']],
    nightShifts: true,
    weekendDays: true,
  },
];

function matchesTokens(name, tokens) {
  const own = nameTokens(name);
  return tokens.every((token) => own.includes(token));
}

/** The rule that forbids these two people to work together, or null. */
export function getNeverTogetherRule(nameA, nameB) {
  if (!nameA || !nameB || nameA === nameB) return null;
  return NEVER_TOGETHER_RULES.find((rule) => (
    (matchesTokens(nameA, rule.members[0]) && matchesTokens(nameB, rule.members[1]))
    || (matchesTokens(nameA, rule.members[1]) && matchesTokens(nameB, rule.members[0]))
  )) || null;
}

/** True when both would work together in a forbidden way (typeA / typeB: early, late, night; weekday: 0 = Sunday). */
export function violatesNeverTogether(rule, typeA, typeB, weekday) {
  if (!rule) return false;
  if (rule.nightShifts && typeA === 'night' && typeB === 'night') return true;
  if (rule.weekendDays && (weekday === 0 || weekday === 6)) return true;
  return false;
}
