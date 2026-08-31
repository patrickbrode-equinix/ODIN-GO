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

export function buildShiftHoursLookup(shiftDefinitions) {
  const lookup = new Map();
  for (const definition of Array.isArray(shiftDefinitions) ? shiftDefinitions : []) {
    const code = String(definition?.code || '').trim().toUpperCase();
    if (!code) continue;
    lookup.set(code, normalizeTargetHours(definition?.duration_hours, 0));
  }
  return lookup;
}

export function getDailyCreditedHours({ shiftCode, shiftHours = 0, absenceType = null, isWeekend = false, isHoliday = false }) {
  const normalizedCode = String(shiftCode || '').trim().toUpperCase();
  const normalizedAbsenceType = String(absenceType || '').trim().toUpperCase();

  if (normalizedCode === 'FS') return 0;
  if (normalizedCode) {
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
  monthlyTargetHours = DEFAULT_MONTHLY_TARGET_HOURS,
  annualTargetHours,
}) {
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
    const hours = getDailyCreditedHours({
      shiftCode,
      shiftHours: hoursLookup.get(shiftCode) ?? 0,
      isWeekend: isWeekend(date),
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
        const monthDiff = Number((monthActualHours - normalizedMonthlyTargetHours).toFixed(2));
        return {
          month,
          key: monthLabelForYearMonth(year, month),
          actual_hours: monthActualHours,
          target_hours: normalizedMonthlyTargetHours,
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
