/* ================================================ */
/* Cost control: supplement hours                   */
/*                                                  */
/* Night, Sunday and public holiday work is paid    */
/* with supplements. Per shift the supplement hours */
/* are calculated from the real shift times:        */
/*  - night supplement: 20:00-06:00                 */
/*  - Sunday supplement: 00:00-24:00 of the Sunday  */
/*  - holiday supplement: 00:00-24:00 of the        */
/*    holiday, on 24.12. and 31.12. only from 12:00 */
/* The unpaid break (presence minus paid duration,  */
/* placed in the middle of the shift) is deducted   */
/* from every supplement it falls into. A night     */
/* shift on a Sunday earns the night and the Sunday */
/* supplement; a Sunday that is a holiday is shown  */
/* in both columns (the columns are not summed).    */
/* The hours are assigned to the week/month/quarter */
/* of the day the shift starts.                     */
/* Pure functions: the drafts are passed in.        */
/* ================================================ */

import { CREDITED_SHIFT_CODES } from './shiftHours.js';
import { buildHessenHolidayMap } from './hessenHolidays.js';

const NON_WORK_CODES = new Set(['FS', 'S', ...CREDITED_SHIFT_CODES]);
const DAY_MINUTES = 1440;
const NIGHT_WINDOWS = [[0, 360], [1200, 1440]]; // 20:00-06:00 expressed per calendar day
const HALF_DAY_HOLIDAY_FROM = 720; // 24.12. and 31.12.: supplement from 12:00

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Planned (paid) hours of one shift (definition duration, weekday override wins). 0 for unknown codes. */
export function getSnapshotShiftHours(snapshot, month, day, code) {
  const normalized = String(code || '').trim().toUpperCase();
  const definition = (Array.isArray(snapshot?.shiftDefinitions) ? snapshot.shiftDefinitions : [])
    .find((entry) => String(entry?.code || '').trim().toUpperCase() === normalized);
  if (!definition) return 0;
  const [year, mon] = String(month || '').split('-').map(Number);
  const weekday = new Date(year, (mon || 1) - 1, day).getDay();
  const override = (Array.isArray(definition.dayOverrides) ? definition.dayOverrides : [])
    .find((entry) => Number(entry?.weekday) === weekday && Number.isFinite(Number(entry?.duration_hours)));
  const hours = override ? Number(override.duration_hours) : Number(definition.durationHours);
  return Number.isFinite(hours) ? hours : 0;
}

/** ISO calendar week of a date: { year, week, monday: 'YYYY-MM-DD' }. */
export function getIsoWeek(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - weekday);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const weekYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  const firstMonday = new Date(firstThursday);
  firstMonday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7));
  const week = Math.round((monday - firstMonday) / (7 * 24 * 3600 * 1000)) + 1;
  return { year: weekYear, week, monday: `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}` };
}

export function getQuarterKey(month) {
  const [year, mon] = String(month).split('-').map(Number);
  return `${year}-Q${Math.floor((mon - 1) / 3) + 1}`;
}

function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function overlap(startA, endA, startB, endB) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

const holidayCache = new Map();
function holidaysOfYear(year) {
  if (!holidayCache.has(year)) holidayCache.set(year, buildHessenHolidayMap(year));
  return holidayCache.get(year);
}

/**
 * Supplement hours of ONE shift that starts on year-month-day.
 * definition: { type, durationHours, startTime, endTime, startDayOffset, endDayOffset }; paidHours already
 * includes weekday overrides. Returns { night, sunday, holiday } in hours, or null without usable times.
 */
export function getSupplementHours({ year, month, day, definition, paidHours }) {
  const startClock = toMinutes(definition?.startTime ?? definition?.start_time);
  const endClock = toMinutes(definition?.endTime ?? definition?.end_time);
  if (startClock === null || endClock === null) return null;
  const startOffset = Number(definition.startDayOffset ?? definition.start_day_offset) || 0;
  const endOffset = Number(definition.endDayOffset ?? definition.end_day_offset) || 0;

  const dayZero = Date.UTC(year, month - 1, day) / 60000; // minutes, only differences matter
  const start = dayZero + startOffset * DAY_MINUTES + startClock;
  let end = dayZero + endOffset * DAY_MINUTES + endClock;
  if (end <= start) end += DAY_MINUTES;

  // The unpaid break is the difference between presence and paid duration, in the middle of the shift.
  const breakMinutes = Math.min(Math.max((end - start) - paidHours * 60, 0), 120);
  const breakStart = start + ((end - start) - breakMinutes) / 2;
  const breakEnd = breakStart + breakMinutes;
  const paidMinutes = (from, to) => overlap(start, end, from, to) - overlap(breakStart, breakEnd, from, to);

  let night = 0;
  let sunday = 0;
  let holiday = 0;
  for (let offset = -1; offset <= 2; offset++) {
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    const dateStart = date.getTime() / 60000;
    for (const [from, to] of NIGHT_WINDOWS) night += paidMinutes(dateStart + from, dateStart + to);
    if (date.getUTCDay() === 0) sunday += paidMinutes(dateStart, dateStart + DAY_MINUTES);
    const iso = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
    if (holidaysOfYear(date.getUTCFullYear())[iso]) {
      const halfDay = date.getUTCMonth() === 11 && (date.getUTCDate() === 24 || date.getUTCDate() === 31);
      holiday += paidMinutes(dateStart + (halfDay ? HALF_DAY_HOLIDAY_FROM : 0), dateStart + DAY_MINUTES);
    }
  }
  const hours = (minutes) => Number((Math.max(minutes, 0) / 60).toFixed(2));
  return { night: hours(night), sunday: hours(sunday), holiday: hours(holiday) };
}

const TOTAL_KEYS = ['nightHours', 'sundayHours', 'holidayHours', 'nightShifts', 'sundayShifts', 'holidayShifts'];

function emptyTotals() {
  return { nightHours: 0, sundayHours: 0, holidayHours: 0, nightShifts: 0, sundayShifts: 0, holidayShifts: 0 };
}

function addTo(target, entry) {
  for (const key of TOTAL_KEYS) target[key] += entry[key];
}

function round(totals) {
  return {
    ...totals,
    nightHours: Number(totals.nightHours.toFixed(2)),
    sundayHours: Number(totals.sundayHours.toFixed(2)),
    holidayHours: Number(totals.holidayHours.toFixed(2)),
  };
}

/**
 * drafts: [{ month: 'YYYY-MM', shifts_json: [{ employee_name, day, shift_code }], config_snapshot }]
 * options.timesByCode: Map code -> { startTime, endTime, startDayOffset, endDayOffset } for drafts whose snapshot has no times.
 * Returns { weeks, months, quarters, employees, total }.
 *  - weeks: per ISO calendar week (a week that crosses into a month that is not part of the drafts: partial = true)
 *  - months / quarters: sums over the given drafts
 *  - employees: per employee and month, plus quarter totals
 */
export function buildCostControl(drafts = [], { timesByCode = new Map() } = {}) {
  const weeks = new Map();
  const months = new Map();
  const quarters = new Map();
  const employees = new Map();
  const total = emptyTotals();
  const coveredMonths = new Set(drafts.map((draft) => draft.month));

  for (const draft of drafts) {
    const [year, mon] = String(draft.month).split('-').map(Number);
    const snapshot = draft.config_snapshot && typeof draft.config_snapshot === 'object' ? draft.config_snapshot : {};
    const definitionByCode = new Map((Array.isArray(snapshot.shiftDefinitions) ? snapshot.shiftDefinitions : [])
      .map((definition) => [String(definition?.code || '').trim().toUpperCase(), definition]));
    const quarterKey = getQuarterKey(draft.month);
    if (!months.has(draft.month)) months.set(draft.month, emptyTotals());
    if (!quarters.has(quarterKey)) quarters.set(quarterKey, emptyTotals());

    for (const shift of Array.isArray(draft.shifts_json) ? draft.shifts_json : []) {
      const code = String(shift?.shift_code || '').trim().toUpperCase();
      const day = Number(shift?.day);
      if (!code || NON_WORK_CODES.has(code) || !Number.isInteger(day)) continue;
      const definition = definitionByCode.get(code);
      const paidHours = getSnapshotShiftHours(snapshot, draft.month, day, code);
      if (!definition || !(paidHours > 0)) continue;

      const times = (definition.startTime ?? definition.start_time) ? definition : (timesByCode.get(code) || definition);
      let supplement = getSupplementHours({ year, month: mon, day, definition: times, paidHours });
      if (!supplement) {
        // No shift times known (old draft without times): fall back to the whole paid duration for night shifts.
        const isNight = String(definition.type || definition.shift_type || '').toLowerCase() === 'night';
        const isSunday = new Date(year, mon - 1, day).getDay() === 0;
        supplement = { night: isNight ? paidHours : 0, sunday: isSunday ? paidHours : 0, holiday: 0 };
      }
      if (!(supplement.night > 0) && !(supplement.sunday > 0) && !(supplement.holiday > 0)) continue;

      const entry = {
        nightHours: supplement.night,
        sundayHours: supplement.sunday,
        holidayHours: supplement.holiday,
        nightShifts: supplement.night > 0 ? 1 : 0,
        sundayShifts: supplement.sunday > 0 ? 1 : 0,
        holidayShifts: supplement.holiday > 0 ? 1 : 0,
      };
      const iso = getIsoWeek(year, mon, day);
      const weekKey = `${iso.year}-W${pad2(iso.week)}`;
      if (!weeks.has(weekKey)) weeks.set(weekKey, { key: weekKey, week: iso.week, year: iso.year, monday: iso.monday, ...emptyTotals() });
      addTo(weeks.get(weekKey), entry);
      addTo(months.get(draft.month), entry);
      addTo(quarters.get(quarterKey), entry);
      addTo(total, entry);

      const name = String(shift.employee_name || '').trim();
      if (!employees.has(name)) employees.set(name, { employee: name, months: {}, quarters: {}, total: emptyTotals() });
      const employeeEntry = employees.get(name);
      if (!employeeEntry.months[draft.month]) employeeEntry.months[draft.month] = emptyTotals();
      if (!employeeEntry.quarters[quarterKey]) employeeEntry.quarters[quarterKey] = emptyTotals();
      addTo(employeeEntry.months[draft.month], entry);
      addTo(employeeEntry.quarters[quarterKey], entry);
      addTo(employeeEntry.total, entry);
    }
  }

  // Weeks that start in a month which is not part of the given drafts are incomplete.
  const weekList = [...weeks.values()].map((week) => {
    const monday = new Date(`${week.monday}T00:00:00Z`);
    let partial = false;
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + offset);
      if (!coveredMonths.has(`${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`)) partial = true;
    }
    return { ...round(week), partial };
  }).sort((left, right) => left.monday.localeCompare(right.monday));

  return {
    weeks: weekList,
    months: [...months.entries()].map(([month, totals]) => ({ month, ...round(totals) })).sort((left, right) => left.month.localeCompare(right.month)),
    quarters: [...quarters.entries()].map(([key, totals]) => ({ key, ...round(totals) })).sort((left, right) => left.key.localeCompare(right.key)),
    employees: [...employees.values()]
      .map((entry) => ({
        employee: entry.employee,
        months: Object.fromEntries(Object.entries(entry.months).map(([key, totals]) => [key, round(totals)])),
        quarters: Object.fromEntries(Object.entries(entry.quarters).map(([key, totals]) => [key, round(totals)])),
        total: round(entry.total),
      }))
      .sort((left, right) => left.employee.localeCompare(right.employee, 'de')),
    total: round(total),
  };
}

/**
 * Cost control as shown next to one draft: its calendar weeks (also those without supplement hours), its month
 * and its quarter.
 */
export function focusCostControl(full, month) {
  const [year, mon] = String(month).split('-').map(Number);
  const monthPrefix = `${year}-${pad2(mon)}`;
  const byKey = new Map(full.weeks.map((week) => [week.key, week]));
  const numDays = new Date(year, mon, 0).getDate();
  const weeks = [];
  for (let day = 1; day <= numDays; day++) {
    const iso = getIsoWeek(year, mon, day);
    const key = `${iso.year}-W${pad2(iso.week)}`;
    if (weeks.some((week) => week.key === key)) continue;
    const found = byKey.get(key);
    if (found) { weeks.push(found); continue; }
    const monday = new Date(`${iso.monday}T00:00:00Z`);
    const partial = [...Array(7).keys()].some((offset) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + offset);
      const dateMonth = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
      return dateMonth !== monthPrefix && !full.months.some((entry) => entry.month === dateMonth);
    });
    weeks.push({ key, week: iso.week, year: iso.year, monday: iso.monday, ...round(emptyTotals()), partial });
  }
  const quarterKey = getQuarterKey(month);
  const quarterMonths = [1, 2, 3].map((index) => `${year}-${pad2((Math.floor((mon - 1) / 3)) * 3 + index)}`);
  const monthsPresent = new Set(full.months.map((entry) => entry.month));
  return {
    month: monthPrefix,
    monthTotals: full.months.find((entry) => entry.month === monthPrefix) || { month: monthPrefix, ...round(emptyTotals()) },
    quarterKey,
    quarterTotals: full.quarters.find((entry) => entry.key === quarterKey) || { key: quarterKey, ...round(emptyTotals()) },
    quarterMonthsPlanned: quarterMonths.filter((entry) => monthsPresent.has(entry)).length,
    weeks,
  };
}
