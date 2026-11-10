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

/* ------------------------------------------------ */
/* Personal "does not want to work with" list        */
/* ------------------------------------------------ */

// Only Patrick Brode has this menu (wish list). It is stored apart from the normal wishes (app setting per user),
// so it never shows up in the user management. Effect: never together on night shifts and on weekend days.
export const PERSONAL_AVOID_KEY_PREFIX = 'personal.avoid_colleagues.user_';
export const PERSONAL_AVOID_RULE = Object.freeze({ label: 'Persönliche Wunschliste (Patrick Brode)', nightShifts: true, weekendDays: true });

/** True when the name belongs to the one person who may keep a personal avoid list. */
export function mayKeepPersonalAvoidList(...names) {
  return names.some((name) => name && matchesTokens(name, ['patrick', 'brode']));
}

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

/* ------------------------------------------------ */
/* Groups who are planned together when possible     */
/* ------------------------------------------------ */

// Fixed in code (soft: "if it works"): the generator rewards every shift that puts these people into the
// same shift type as a partner who is already planned. Matching uses first and last name tokens
// (order and "Last, First" notation do not matter).
const TOGETHER_GROUPS = [
  {
    label: 'Marco / Mustafar',
    members: [[['marco', 'dessi']], [['mustafa', 'sherzai'], ['mustafar', 'sherzai']]],
    shiftTypes: ['early', 'late', 'night'],
    nightTeam: false,
  },
  {
    label: 'Nachtteam Noah Schauer / Marco Dessi / Mustafa Sherzai / Patrick Brode',
    members: [[['noah', 'schauer']], [['marco', 'dessi']], [['mustafa', 'sherzai'], ['mustafar', 'sherzai']], [['patrick', 'brode']]],
    shiftTypes: ['night'],
    nightTeam: true,
  },
];

function matchesMember(name, alternatives) {
  const own = nameTokens(name);
  return alternatives.some((tokens) => tokens.every((token) => own.includes(token)));
}

/** Partners of `name` (taken from `candidates`) with the shift types in which they should be together. */
export function getTogetherPartners(name, candidates) {
  const result = [];
  for (const group of TOGETHER_GROUPS) {
    if (!group.members.some((member) => matchesMember(name, member))) continue;
    for (const other of candidates) {
      if (other === name || !group.members.some((member) => matchesMember(other, member))) continue;
      result.push({ partner: other, shiftTypes: group.shiftTypes, label: group.label });
    }
  }
  return result;
}

/** True for the people of the preferred night team (Noah, Marco, Mustafar, Patrick Brode). */
export function isNightTeamMember(name) {
  return TOGETHER_GROUPS.some((group) => group.nightTeam && group.members.some((member) => matchesMember(name, member)));
}
