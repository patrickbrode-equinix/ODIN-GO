/* ================================================ */
/* Employee combinations (statistics)                */
/* How often groups of 2, 3 or 4 employees worked    */
/* the same shift type (early / late / night) on the */
/* same day.                                         */
/* ================================================ */

import { parseMonthLabel } from './monthParser.js';
import { CREDITED_SHIFT_CODES } from './shiftHours.js';

const TYPES = new Set(['early', 'late', 'night']);
const MAX_DATES_PER_COMBINATION = 40;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function combinations(items, size, visit, start = 0, chosen = []) {
  if (chosen.length === size) { visit(chosen); return; }
  for (let index = start; index <= items.length - (size - chosen.length); index += 1) {
    chosen.push(items[index]);
    combinations(items, size, visit, index + 1, chosen);
    chosen.pop();
  }
}

/**
 * @param shifts      rows { month, employee_name, day, shift_code } of the live plan
 * @param definitions rows { code, shift_type }
 * @param options     { year, size 2..4, shiftType 'all'|'early'|'late'|'night', days 'all'|'weekend'|'weekdays',
 *                      month 1..12 (optional), employee (optional: only groups containing this person), limit }
 */
export function buildCombinationStats({ shifts = [], definitions = [], year, size = 2, shiftType = 'all', days = 'all', month = null, employee = '', limit = 60 } = {}) {
  const groupSize = Math.min(4, Math.max(2, Number.parseInt(String(size), 10) || 2));
  const typeFilter = TYPES.has(shiftType) ? shiftType : 'all';
  const dayFilter = days === 'weekend' || days === 'weekdays' ? days : 'all';
  const monthFilter = Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
  const wanted = String(employee || '').trim();
  const typeByCode = new Map(definitions.map((definition) => [String(definition.code || '').trim().toUpperCase(), String(definition.shift_type || '').trim().toLowerCase()]));

  // One group per day and shift type: everybody who worked that shift type on that day.
  const groups = new Map();
  for (const row of shifts) {
    const parsed = parseMonthLabel(row?.month);
    if (!parsed || parsed.year !== year) continue;
    if (monthFilter && parsed.month !== monthFilter) continue;
    const day = Number.parseInt(String(row.day ?? ''), 10);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    const code = String(row.shift_code || '').trim().toUpperCase();
    const name = String(row.employee_name || '').trim();
    if (!code || !name || code === 'FS' || CREDITED_SHIFT_CODES.has(code)) continue;
    const type = typeByCode.get(code);
    if (!TYPES.has(type) || (typeFilter !== 'all' && type !== typeFilter)) continue;
    const weekday = new Date(year, parsed.month - 1, day).getDay();
    const weekend = weekday === 0 || weekday === 6;
    if ((dayFilter === 'weekend' && !weekend) || (dayFilter === 'weekdays' && weekend)) continue;
    const key = `${year}-${pad2(parsed.month)}-${pad2(day)}|${type}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(name);
  }

  const counts = new Map();
  let shiftDays = 0;
  for (const [key, members] of groups) {
    if (wanted && !members.has(wanted)) continue;
    shiftDays += 1;
    if (members.size < groupSize) continue;
    const [date, type] = key.split('|');
    const names = [...members].sort((left, right) => left.localeCompare(right, 'de'));
    combinations(names, groupSize, (picked) => {
      if (wanted && !picked.includes(wanted)) return;
      const id = picked.join('\u0001');
      let entry = counts.get(id);
      if (!entry) { entry = { employees: [...picked], count: 0, byType: { early: 0, late: 0, night: 0 }, dates: [] }; counts.set(id, entry); }
      entry.count += 1;
      entry.byType[type] += 1;
      if (entry.dates.length < MAX_DATES_PER_COMBINATION) entry.dates.push({ date, type });
    });
  }

  const sorted = [...counts.values()]
    .sort((left, right) => right.count - left.count || left.employees.join().localeCompare(right.employees.join(), 'de'));
  return {
    year,
    size: groupSize,
    shiftType: typeFilter,
    days: dayFilter,
    month: monthFilter,
    employee: wanted,
    shiftDays,
    totalCombinations: sorted.length,
    combinations: sorted.slice(0, Math.max(1, Math.min(200, Number(limit) || 60))),
  };
}
