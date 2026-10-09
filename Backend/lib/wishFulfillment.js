/* ================================================ */
/* Wish fulfilment of one employee in one month     */
/*                                                  */
/* Pure function used by the management Excel       */
/* export: compares the saved employee wishes with  */
/* the shifts of a draft and returns one scored     */
/* item per wish (0..1) plus the overall percent.   */
/* ================================================ */

import {
  getPreferenceShiftCode,
  isDayBlockedByEmployeePreference,
  isShiftPreferredByEmployeePreference,
  isShiftUnwantedByEmployeePreference,
} from './shiftplanGeneration.js';
import { classifyShiftCodeToType, isWorkingShiftCode } from './understaffingSuggestions.js';

export const WISH_STATUS = Object.freeze({ MET: 'Erfüllt', PARTIAL: 'Teilweise erfüllt', NOT_MET: 'Nicht erfüllt' });

const WEEKDAY_LABELS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function statusFor(score) {
  if (score >= 0.999) return WISH_STATUS.MET;
  if (score <= 0.001) return WISH_STATUS.NOT_MET;
  return WISH_STATUS.PARTIAL;
}

function item(category, wish, score, detail) {
  const bounded = Math.min(1, Math.max(0, score));
  return { category, wish, score: bounded, percent: Math.round(bounded * 100), status: statusFor(bounded), detail };
}

function listDays(days, shiftsByDay, month) {
  return days.map((day) => `${pad2(day)}.${pad2(month)}. (${shiftsByDay[day]})`).join(', ');
}

/** Monday of the week of a day: the generator counts one weekend block per week. */
function weekendBlockKey(year, month, day) {
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * @param {object} input
 * @param {number} input.year
 * @param {number} input.month 1-12
 * @param {Record<number,string>} input.shiftsByDay day -> shift code (this month, this employee)
 * @param {object|null} input.preferences employee_preferences row (monthly overrides already merged)
 * @param {Record<string,string>} [input.holidays] 'YYYY-MM-DD' -> holiday name
 * @param {boolean} [input.blockedDaysEnabled] admin switch for "days I do not want to work"
 * @param {Array} [input.definitions] shift definitions ({ code, shift_type }) to recognise night shifts
 * @param {Array} [input.colleagueWishes] [{ colleague, sharedDays, employeeDays }]
 */
export function evaluateMonthWishes({
  year,
  month,
  shiftsByDay = {},
  preferences = null,
  holidays = {},
  blockedDaysEnabled = false,
  definitions = [],
  colleagueWishes = [],
} = {}) {
  const items = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const workedDays = Object.keys(shiftsByDay)
    .map(Number)
    .filter((day) => day >= 1 && day <= daysInMonth && isWorkingShiftCode(shiftsByDay[day]))
    .sort((left, right) => left - right);

  if (preferences) {
    // 1. Preferred shifts: share of worked shifts that match the wish.
    const preferred = (Array.isArray(preferences.preferred_shifts) ? preferences.preferred_shifts : [])
      .map(getPreferenceShiftCode)
      .filter((code) => code && code !== 'COLO');
    if (preferred.length > 0 && workedDays.length > 0) {
      const matching = workedDays.filter((day) => isShiftPreferredByEmployeePreference(preferences, shiftsByDay[day]));
      const other = workedDays.filter((day) => !matching.includes(day));
      items.push(item(
        'Schichtwunsch',
        `Bevorzugt: ${[...new Set(preferred)].join(', ')}`,
        matching.length / workedDays.length,
        `${matching.length} von ${workedDays.length} Schichten wie gewünscht${other.length ? `; abweichend: ${listDays(other, shiftsByDay, month)}` : ''}`,
      ));
    }

    // 2. Unwanted shifts: every worked day with such a shift counts against the wish.
    const unwanted = (Array.isArray(preferences.unwanted_shifts) ? preferences.unwanted_shifts : [])
      .map(getPreferenceShiftCode)
      .filter(Boolean);
    if (unwanted.length > 0 && workedDays.length > 0) {
      const violated = workedDays.filter((day) => isShiftUnwantedByEmployeePreference(preferences, shiftsByDay[day]));
      items.push(item(
        'Unerwünschte Schicht',
        `Nicht gewünscht: ${[...new Set(unwanted)].join(', ')}`,
        1 - violated.length / workedDays.length,
        violated.length ? `Trotzdem eingeplant: ${listDays(violated, shiftsByDay, month)}` : 'Nie eingeplant',
      ));
    }

    // 3. Blocked weekdays (only while the admin switch is on).
    const blockedWeekdays = (Array.isArray(preferences.blocked_days) ? preferences.blocked_days : []);
    if (blockedDaysEnabled && blockedWeekdays.length > 0) {
      const occurrences = [];
      for (let day = 1; day <= daysInMonth; day++) {
        if (isDayBlockedByEmployeePreference(preferences, new Date(year, month - 1, day).getDay())) occurrences.push(day);
      }
      if (occurrences.length > 0) {
        const violated = occurrences.filter((day) => workedDays.includes(day));
        const names = [...new Set(occurrences.map((day) => WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()]))];
        items.push(item(
          'Gesperrter Wochentag',
          `Nicht an: ${names.join(', ')}`,
          1 - violated.length / occurrences.length,
          violated.length ? `Trotzdem eingeplant: ${listDays(violated, shiftsByDay, month)}` : 'Nie eingeplant',
        ));
      }
    }

    // 4. Holidays the employee does not want to work (one item per holiday in the month).
    const holidayWishes = new Set(Array.isArray(preferences.preferred_holidays) ? preferences.preferred_holidays : []);
    if (holidayWishes.size > 0) {
      for (let day = 1; day <= daysInMonth; day++) {
        const name = holidays[`${year}-${pad2(month)}-${pad2(day)}`];
        if (!name || !holidayWishes.has(name)) continue;
        const works = workedDays.includes(day);
        items.push(item(
          'Feiertag frei',
          `${name} (${pad2(day)}.${pad2(month)}.) nicht arbeiten`,
          works ? 0 : 1,
          works ? `Eingeplant mit ${shiftsByDay[day]}` : 'Frei',
        ));
      }
    }

    // 5. Maximum nights per month.
    const maxNights = Number.parseInt(String(preferences.max_nights_per_month ?? ''), 10);
    if (Number.isInteger(maxNights) && maxNights > 0) {
      const nights = workedDays.filter((day) => classifyShiftCodeToType(shiftsByDay[day], definitions) === 'night').length;
      items.push(item(
        'Nachtlimit',
        `Höchstens ${maxNights} Nächte`,
        nights <= maxNights ? 1 : 1 - (nights - maxNights) / maxNights,
        `${nights} Nächte eingeplant`,
      ));
    }

    // 6. Maximum weekend blocks per month.
    const maxWeekends = Number.parseInt(String(preferences.max_weekends_per_month ?? ''), 10);
    if (Number.isInteger(maxWeekends) && maxWeekends > 0) {
      const blocks = new Set(
        workedDays
          .filter((day) => [0, 6].includes(new Date(year, month - 1, day).getDay()))
          .map((day) => weekendBlockKey(year, month, day)),
      );
      items.push(item(
        'Wochenendlimit',
        `Höchstens ${maxWeekends} Wochenenden`,
        blocks.size <= maxWeekends ? 1 : 1 - (blocks.size - maxWeekends) / maxWeekends,
        `${blocks.size} Wochenenden eingeplant`,
      ));
    }
  }

  // 7. Preferred colleagues (taken from the plan report of the draft).
  for (const wish of colleagueWishes) {
    if (!wish?.colleague || !(wish.employeeDays > 0)) continue;
    items.push(item(
      'Wunschkollege',
      `Gemeinsam mit ${wish.colleague}`,
      Math.min(1, wish.sharedDays / wish.employeeDays),
      `${wish.sharedDays} von ${wish.employeeDays} Schichten in derselben Schichtart`,
    ));
  }

  const percent = items.length > 0
    ? Math.round((items.reduce((sum, entry) => sum + entry.score, 0) / items.length) * 100)
    : null;
  return { items, percent };
}
