import { parseMonthLabel } from './monthParser.js';

export const DEFAULT_MONTHLY_TARGET_HOURS = 174;
export const DEFAULT_ANNUAL_TARGET_HOURS = DEFAULT_MONTHLY_TARGET_HOURS * 12;
export const CREDITED_SHIFT_CODES = new Set(['ABW', 'SEMINAR']);
export const CREDITED_ABSENCE_TYPES = new Set(['VACATION', 'SICK', 'TRAINING', 'OFFSITE']);
export const CREDITED_ABSENCE_HOURS = 8;

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function normalizeTargetHours(value, fallback = DEFAULT_MONTHLY_TARGET_HOURS) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
}

export function normalizeAnnualTargetHours(value, monthlyTargetHours = DEFAULT_MONTHLY_TARGET_HOURS) {
  return normalizeTargetHours(value, normalizeTargetHours(monthlyTargetHours, DEFAULT_MONTHLY_TARGET_HOURS) * 12);
}

export function countWeekdaysInRange(year, month, startDay = 1, endDay = 31) {
  const lastDay = new Date(year, month, 0).getDate();
  const from = Math.max(1, startDay);
  const to = Math.min(lastDay, endDay);
  let count = 0;
  for (let day = from; day <= to; day++) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export function countWeekdaysInYear(year) {
  let count = 0;
  for (let month = 1; month <= 12; month++) count += countWeekdaysInRange(year, month);
  return count;
}

// Distributes the annual target across the months by their Mon-Fri working days,
// so a month with 21 weekdays gets ~168h and one with 23 weekdays ~184h while the
// year still sums up to the annual target (Ø 174h with the default 2088h).
export function getWorkdayBasedTargetHours({
  year,
  month,
  monthlyTargetHours = DEFAULT_MONTHLY_TARGET_HOURS,
  annualTargetHours,
  startDay = 1,
  endDay = 31,
}) {
  const normalizedMonthly = normalizeTargetHours(monthlyTargetHours, DEFAULT_MONTHLY_TARGET_HOURS);
  const normalizedAnnual = normalizeAnnualTargetHours(annualTargetHours, normalizedMonthly);
  const yearWeekdays = countWeekdaysInYear(year);
  if (!yearWeekdays) return normalizedMonthly;
  const weekdays = countWeekdaysInRange(year, month, startDay, endDay);
  return Number(((normalizedAnnual * weekdays) / yearWeekdays).toFixed(2));
}

/** code -> { startTime, endTime, startDayOffset, endDayOffset } for the double-pay days. */
export function buildShiftTimesLookup(shiftDefinitions) {
  const lookup = new Map();
  for (const definition of Array.isArray(shiftDefinitions) ? shiftDefinitions : []) {
    const code = String(definition?.code || '').trim().toUpperCase();
    if (!code || !definition?.start_time || !definition?.end_time) continue;
    lookup.set(code, {
      startTime: definition.start_time,
      endTime: definition.end_time,
      startDayOffset: definition.start_day_offset,
      endDayOffset: definition.end_day_offset,
    });
  }
  return lookup;
}

export function buildShiftHoursLookup(shiftDefinitions) {
  const lookup = new Map();
  for (const definition of Array.isArray(shiftDefinitions) ? shiftDefinitions : []) {
    const code = String(definition?.code || '').trim().toUpperCase();
    if (!code) continue;
    lookup.set(code, normalizeTargetHours(definition?.duration_hours, 0));
  }
  return lookup;
}

// Heiligabend (24.12.) and Silvester (31.12.) count as holidays whose hours from
// 12:00 onwards are paid twice. The break is only deducted from 6h presence.
export const DOUBLE_PAY_FROM_MINUTE = 12 * 60;
export const DOUBLE_PAY_BREAK_THRESHOLD_HOURS = 6;
export const DOUBLE_PAY_BREAK_HOURS = 1;

export function isDoublePayDay(date) {
  return date.getMonth() === 11 && (date.getDate() === 24 || date.getDate() === 31);
}

function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Paid hours of a shift on a double-pay day: presence - break (from 6h presence)
 * + presence between 12:00 and midnight of that day (paid twice).
 * Returns null when the shift has no usable times.
 */
export function getDoublePayDayHours({ startTime, endTime, startDayOffset = 0, endDayOffset = 0 }) {
  const startMin = timeToMinutes(startTime);
  const endClock = timeToMinutes(endTime);
  if (startMin === null || endClock === null) return null;

  const start = (Number(startDayOffset) || 0) * 1440 + startMin;
  let end = (Number(endDayOffset) || 0) * 1440 + endClock;
  if (end <= start) end += 1440;

  const presenceHours = (end - start) / 60;
  const breakHours = presenceHours >= DOUBLE_PAY_BREAK_THRESHOLD_HOURS ? DOUBLE_PAY_BREAK_HOURS : 0;
  const bonusMinutes = Math.max(0, Math.min(end, 1440) - Math.max(start, DOUBLE_PAY_FROM_MINUTE));
  return Number(Math.max(0, presenceHours - breakHours + bonusMinutes / 60).toFixed(2));
}

export function getDailyCreditedHours({ shiftCode, shiftHours = 0, absenceType = null, isWeekend = false, isHoliday = false, doublePayHours = null }) {
  const normalizedCode = String(shiftCode || '').trim().toUpperCase();
  const normalizedAbsenceType = String(absenceType || '').trim().toUpperCase();

  if (normalizedCode === 'FS') return 0;
  if (normalizedCode) {
    if (doublePayHours !== null && !CREDITED_SHIFT_CODES.has(normalizedCode)) return doublePayHours;
    if (isHoliday) return normalizeTargetHours(shiftHours, 0);
    if (!isWeekend && CREDITED_SHIFT_CODES.has(normalizedCode)) return CREDITED_ABSENCE_HOURS;
    return normalizeTargetHours(shiftHours, 0);
  }

  if (!isWeekend && CREDITED_ABSENCE_TYPES.has(normalizedAbsenceType)) {
    return CREDITED_ABSENCE_HOURS;
  }

  return 0;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function monthLabelForYearMonth(year, month) {
  return `${year}-${pad2(month)}`;
}

function clipDateRangeToYear(startDate, endDate, year) {
  const rangeStart = new Date(year, 0, 1);
  const rangeEnd = new Date(year, 11, 31);
  const start = startDate > rangeStart ? new Date(startDate) : rangeStart;
  const end = endDate < rangeEnd ? new Date(endDate) : rangeEnd;
  if (start > end) return null;
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function aggregateYearlyHours({
  year,
  shifts,
  absences,
  shiftHoursLookup,
  shiftTimesLookup = null,
  /** Map "employee__CODE" -> own paid hours (DBS pool members with individual times). */
  employeeShiftHours = null,
  monthlyTargetHours = DEFAULT_MONTHLY_TARGET_HOURS,
  annualTargetHours,
}) {
  const timesLookup = shiftTimesLookup instanceof Map ? shiftTimesLookup : new Map(Object.entries(shiftTimesLookup || {}));
  const normalizedMonthlyTargetHours = normalizeTargetHours(monthlyTargetHours, DEFAULT_MONTHLY_TARGET_HOURS);
  const normalizedAnnualTargetHours = normalizeAnnualTargetHours(annualTargetHours, normalizedMonthlyTargetHours);
  const hoursLookup = shiftHoursLookup instanceof Map ? shiftHoursLookup : new Map(Object.entries(shiftHoursLookup || {}));

  const employees = new Set();
  const shiftByEmployeeDate = new Map();
  const monthlyHoursByEmployee = new Map();
  const annualHoursByEmployee = new Map();

  const ensureEmployee = (employeeName) => {
    const normalizedEmployeeName = String(employeeName || '').trim();
    if (!normalizedEmployeeName) return null;
    employees.add(normalizedEmployeeName);
    if (!monthlyHoursByEmployee.has(normalizedEmployeeName)) {
      const monthMap = new Map();
      for (let month = 1; month <= 12; month++) {
        monthMap.set(month, 0);
      }
      monthlyHoursByEmployee.set(normalizedEmployeeName, monthMap);
    }
    if (!annualHoursByEmployee.has(normalizedEmployeeName)) {
      annualHoursByEmployee.set(normalizedEmployeeName, 0);
    }
    return normalizedEmployeeName;
  };

  for (const row of Array.isArray(shifts) ? shifts : []) {
    const parsedMonth = parseMonthLabel(row?.month);
    if (!parsedMonth || parsedMonth.year !== year) continue;

    const employeeName = ensureEmployee(row?.employee_name);
    if (!employeeName) continue;

    const day = Number.parseInt(String(row?.day ?? ''), 10);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;

    const date = new Date(year, parsedMonth.month - 1, day);
    if (date.getMonth() !== parsedMonth.month - 1 || date.getFullYear() !== year) continue;

    const shiftCode = String(row?.shift_code || '').trim().toUpperCase();
    const shiftTimes = isDoublePayDay(date) ? timesLookup.get(shiftCode) : null;
    const hours = getDailyCreditedHours({
      shiftCode,
      shiftHours: employeeShiftHours?.get(`${employeeName}__${shiftCode}`) ?? hoursLookup.get(shiftCode) ?? 0,
      isWeekend: isWeekend(date),
      doublePayHours: shiftTimes ? getDoublePayDayHours(shiftTimes) : null,
    });
    const dateKey = toDateKey(date);
    const employeeDateKey = `${employeeName}__${dateKey}`;

    shiftByEmployeeDate.set(employeeDateKey, shiftCode);

    const monthTotals = monthlyHoursByEmployee.get(employeeName);
    monthTotals.set(parsedMonth.month, Number((monthTotals.get(parsedMonth.month) + hours).toFixed(2)));
    annualHoursByEmployee.set(employeeName, Number((annualHoursByEmployee.get(employeeName) + hours).toFixed(2)));
  }

  for (const absence of Array.isArray(absences) ? absences : []) {
    const employeeName = ensureEmployee(absence?.employee_name);
    if (!employeeName) continue;

    const startDate = new Date(absence?.start_date);
    const endDate = new Date(absence?.end_date);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) continue;

    const clippedRange = clipDateRangeToYear(startDate, endDate, year);
    if (!clippedRange) continue;

    for (let current = new Date(clippedRange.start); current <= clippedRange.end; current.setDate(current.getDate() + 1)) {
      const currentDate = new Date(current);
      const dateKey = toDateKey(currentDate);
      const employeeDateKey = `${employeeName}__${dateKey}`;
      if (shiftByEmployeeDate.has(employeeDateKey)) continue;

      const hours = getDailyCreditedHours({
        absenceType: absence?.type,
        isWeekend: isWeekend(currentDate),
      });
      if (hours <= 0) continue;

      const month = currentDate.getMonth() + 1;
      const monthTotals = monthlyHoursByEmployee.get(employeeName);
      monthTotals.set(month, Number((monthTotals.get(month) + hours).toFixed(2)));
      annualHoursByEmployee.set(employeeName, Number((annualHoursByEmployee.get(employeeName) + hours).toFixed(2)));
    }
  }

  const employeeHours = Array.from(employees)
    .sort((left, right) => left.localeCompare(right, 'de'))
    .map((employeeName) => {
      const actualHours = Number((annualHoursByEmployee.get(employeeName) || 0).toFixed(2));
      const annualDiff = Number((actualHours - normalizedAnnualTargetHours).toFixed(2));
      const completionRate = normalizedAnnualTargetHours > 0
        ? Number(((actualHours / normalizedAnnualTargetHours) * 100).toFixed(2))
        : 0;
      const months = Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const monthActualHours = Number((monthlyHoursByEmployee.get(employeeName)?.get(month) || 0).toFixed(2));
        const monthTargetHours = getWorkdayBasedTargetHours({
          year,
          month,
          monthlyTargetHours: normalizedMonthlyTargetHours,
          annualTargetHours: normalizedAnnualTargetHours,
        });
        const monthDiff = Number((monthActualHours - monthTargetHours).toFixed(2));
        return {
          month,
          key: monthLabelForYearMonth(year, month),
          actual_hours: monthActualHours,
          target_hours: monthTargetHours,
          diff_hours: monthDiff,
        };
      });

      return {
        employee_name: employeeName,
        actual_hours: actualHours,
        annual_target_hours: normalizedAnnualTargetHours,
        monthly_target_hours: normalizedMonthlyTargetHours,
        annual_diff_hours: annualDiff,
        completion_rate: completionRate,
        months,
      };
    });

  const teamActualHours = Number(employeeHours.reduce((sum, entry) => sum + entry.actual_hours, 0).toFixed(2));
  const teamAnnualTargetHours = Number((employeeHours.length * normalizedAnnualTargetHours).toFixed(2));

  return {
    year,
    monthly_target_hours: normalizedMonthlyTargetHours,
    annual_target_hours: normalizedAnnualTargetHours,
    team_actual_hours: teamActualHours,
    team_annual_target_hours: teamAnnualTargetHours,
    employees: employeeHours,
  };
}
