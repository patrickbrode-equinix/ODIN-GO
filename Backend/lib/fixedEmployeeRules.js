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
