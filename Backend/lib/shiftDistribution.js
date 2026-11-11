/* ================================================ */
/* Shift distribution per employee                   */
/*                                                   */
/* How the worked shifts of an employee split into   */
/* early / late / night on weekdays (Mon-Fri) and    */
/* the weekend (Saturday + Sunday, all shift types   */
/* together, shown as its own segment). Shared by    */
/* the Excel export and the statistics tab.          */
/* ================================================ */

import { CREDITED_SHIFT_CODES } from './shiftHours.js';

export const DISTRIBUTION_SEGMENTS = Object.freeze(['early', 'late', 'night', 'weekend', 'other']);

export const DISTRIBUTION_LABELS = Object.freeze({
  early: 'Früh',
  late: 'Spät',
  night: 'Nacht',
  weekend: 'Wochenende',
  other: 'Sonstige',
});

/** Segment of one worked shift: weekend wins over the shift type; shifts without early/late/night type are "other". */
export function distributionSegment(shiftType, weekday) {
  if (weekday === 0 || weekday === 6) return 'weekend';
  const type = String(shiftType || '').trim().toLowerCase();
  return type === 'early' || type === 'late' || type === 'night' ? type : 'other';
}

export function isWorkedShiftCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  return Boolean(normalized) && normalized !== 'FS' && normalized !== 'S' && !CREDITED_SHIFT_CODES.has(normalized);
}

export function emptyDistribution() {
  return { early: 0, late: 0, night: 0, weekend: 0, other: 0, total: 0 };
}

export function addToDistribution(distribution, segment) {
  distribution[segment] += 1;
  distribution.total += 1;
}

/** Adds the percentage share of every segment (0-100, one decimal) to a distribution. */
export function withPercentages(distribution) {
  const total = Math.max(distribution.total, 0);
  const percent = {};
  for (const segment of DISTRIBUTION_SEGMENTS) percent[segment] = total > 0 ? Number(((distribution[segment] / total) * 100).toFixed(1)) : 0;
  return { ...distribution, percent };
}

/**
 * rows: [{ employee_name, year, month (1-12), day, shift_code }]; typeByCode: Map CODE -> 'early' | 'late' | 'night' | ...
 * Returns [{ employee, early, late, night, weekend, other, total, percent: {...} }] sorted by name, plus the team total.
 */
export function buildShiftDistribution(rows = [], typeByCode = new Map()) {
  const byEmployee = new Map();
  const team = emptyDistribution();
  for (const row of rows) {
    const employee = String(row?.employee_name || '').trim();
    const code = String(row?.shift_code || '').trim().toUpperCase();
    const day = Number(row?.day);
    if (!employee || !isWorkedShiftCode(code) || !Number.isInteger(day)) continue;
    const weekday = new Date(Number(row.year), Number(row.month) - 1, day).getDay();
    const segment = distributionSegment(typeByCode.get(code), weekday);
    if (!byEmployee.has(employee)) byEmployee.set(employee, emptyDistribution());
    addToDistribution(byEmployee.get(employee), segment);
    addToDistribution(team, segment);
  }
  return {
    employees: [...byEmployee.entries()]
      .map(([employee, distribution]) => ({ employee, ...withPercentages(distribution) }))
      .sort((left, right) => left.employee.localeCompare(right.employee, 'de')),
    team: withPercentages(team),
  };
}
