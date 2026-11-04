/* ================================================ */
/* Employee statistics (user management tab)         */
/* Hours, shift types, nights, weekends, holidays    */
/* and absence days per employee and year.           */
/* ================================================ */

import { parseMonthLabel } from './monthParser.js';
import { buildHessenHolidayMap } from './hessenHolidays.js';
import { CREDITED_SHIFT_CODES } from './shiftHours.js';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toKey(value) {
  if (value instanceof Date) return dateKey(value);
  return String(value || '').slice(0, 10);
}

const ABSENCE_GROUPS = Object.freeze({
  VACATION: 'vacation',
  SICK: 'sick',
  TRAINING: 'training',
  OFFSITE: 'training',
});

function emptyEntry(name, year) {
  return {
    employee_name: name,
    year,
    months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, actual_hours: 0, target_hours: 0, diff_hours: 0 })),
    actual_hours: 0,
    target_hours: 0,
    diff_hours: 0,
    total_shifts: 0,
    early_shifts: 0,
    late_shifts: 0,
    night_shifts: 0,
    special_shifts: 0,
    weekend_days: 0,
    saturday_days: 0,
    sunday_days: 0,
    holiday_days: 0,
    absence_days: { vacation: 0, sick: 0, training: 0, other: 0, total: 0 },
  };
}

/**
 * @param summary   result of aggregateYearlyHours (employees[].months with actual/target hours)
 * @param shifts    rows { month, employee_name, day, shift_code } of the live plan
 * @param absences  rows { employee_name, start_date, end_date, type }
 * @param definitions rows { code, shift_type }
 */
export function buildEmployeeOverview({ year, summary, shifts = [], absences = [], definitions = [] } = {}) {
  const typeByCode = new Map(definitions.map((definition) => [String(definition.code || '').trim().toUpperCase(), String(definition.shift_type || '').trim().toLowerCase()]));
  const holidays = buildHessenHolidayMap(year);
  const entries = new Map();
  const ensure = (name) => {
    const key = String(name || '').trim();
    if (!key) return null;
    if (!entries.has(key)) entries.set(key, emptyEntry(key, year));
    return entries.get(key);
  };

  for (const employee of Array.isArray(summary?.employees) ? summary.employees : []) {
    const entry = ensure(employee.employee_name);
    if (!entry) continue;
    entry.actual_hours = Number(employee.actual_hours) || 0;
    entry.target_hours = Number(employee.annual_target_hours) || 0;
    entry.diff_hours = Number((entry.actual_hours - entry.target_hours).toFixed(2));
    for (const month of Array.isArray(employee.months) ? employee.months : []) {
      const slot = entry.months[month.month - 1];
      if (!slot) continue;
      slot.actual_hours = Number(month.actual_hours) || 0;
      slot.target_hours = Number(month.target_hours) || 0;
      slot.diff_hours = Number(month.diff_hours) || 0;
    }
  }

  for (const row of shifts) {
    const parsed = parseMonthLabel(row?.month);
    if (!parsed || parsed.year !== year) continue;
    const entry = ensure(row.employee_name);
    if (!entry) continue;
    const day = Number.parseInt(String(row.day ?? ''), 10);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    const code = String(row.shift_code || '').trim().toUpperCase();
    // Credited absences (ABW, SEMINAR) and free markers are no worked shifts.
    if (!code || code === 'FS' || CREDITED_SHIFT_CODES.has(code)) continue;
    const date = new Date(year, parsed.month - 1, day);
    const type = typeByCode.get(code) || 'special';
    entry.total_shifts += 1;
    if (type === 'early') entry.early_shifts += 1;
    else if (type === 'late') entry.late_shifts += 1;
    else if (type === 'night') entry.night_shifts += 1;
    else entry.special_shifts += 1;
    if (date.getDay() === 6) { entry.saturday_days += 1; entry.weekend_days += 1; }
    if (date.getDay() === 0) { entry.sunday_days += 1; entry.weekend_days += 1; }
    if (holidays[dateKey(date)]) entry.holiday_days += 1;
  }

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  for (const absence of absences) {
    const entry = ensure(absence?.employee_name);
    if (!entry) continue;
    const start = toKey(absence.start_date);
    const end = toKey(absence.end_date);
    if (!start || !end) continue;
    const from = new Date(`${start > yearStart ? start : yearStart}T12:00:00`);
    const to = new Date(`${end < yearEnd ? end : yearEnd}T12:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) continue;
    const group = ABSENCE_GROUPS[String(absence.type || '').toUpperCase()] || 'other';
    for (const current = new Date(from); current <= to; current.setDate(current.getDate() + 1)) {
      const weekday = current.getDay();
      if (weekday === 0 || weekday === 6) continue; // only working days count as absence days
      entry.absence_days[group] += 1;
      entry.absence_days.total += 1;
    }
  }

  const employees = [...entries.values()].sort((left, right) => left.employee_name.localeCompare(right.employee_name, 'de'));
  const count = employees.length || 1;
  const sum = (pick) => employees.reduce((total, entry) => total + pick(entry), 0);
  const totals = {
    employees: employees.length,
    actual_hours: Number(sum((entry) => entry.actual_hours).toFixed(1)),
    target_hours: Number(sum((entry) => entry.target_hours).toFixed(1)),
    night_shifts: sum((entry) => entry.night_shifts),
    early_shifts: sum((entry) => entry.early_shifts),
    late_shifts: sum((entry) => entry.late_shifts),
    weekend_days: sum((entry) => entry.weekend_days),
    holiday_days: sum((entry) => entry.holiday_days),
    absence_days: sum((entry) => entry.absence_days.total),
    avg_actual_hours: Number((sum((entry) => entry.actual_hours) / count).toFixed(1)),
    avg_diff_hours: Number((sum((entry) => entry.diff_hours) / count).toFixed(1)),
  };
  return { year, employees, totals };
}
