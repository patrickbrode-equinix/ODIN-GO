/* ================================================ */
/* Payroll hours of one employee and month          */
/* Supplement hours (night 20-6, Sunday, holiday)   */
/* from the live shift plan, with the real shift    */
/* times. Pure function: rows are passed in.        */
/* ================================================ */

import { getSupplementHours } from './costControl.js';
import { CREDITED_SHIFT_CODES } from './shiftHours.js';

const SICK_CODES = new Set(['KRANK', 'S']);
const NON_WORK = new Set(['FS', 'S', 'KRANK', 'URLAUB', ...CREDITED_SHIFT_CODES]);

function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * year, month: calendar month. shifts: [{ day, shift_code }] of ONE employee. definitions: shift_definitions rows.
 * Returns { shifts: [{ date, code, hours, night, sunday, holiday }], totals }.
 * Hours that are Sunday AND holiday are kept in both fields; the payroll engine counts them as holiday only.
 */
export function buildEmployeeMonthHours({ year, month, shifts = [], definitions = [] }) {
  const byCode = new Map(definitions.map((definition) => [String(definition.code || '').trim().toUpperCase(), definition]));
  const rows = [];
  const totals = { workedShifts: 0, workedHours: 0, nightHours: 0, sundayHours: 0, holidayHours: 0, absenceDays: 0 };

  for (const entry of [...shifts].sort((left, right) => Number(left.day) - Number(right.day))) {
    const day = Number(entry.day);
    const code = String(entry.shift_code || '').trim().toUpperCase();
    if (!Number.isInteger(day) || !code) continue;
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    if (NON_WORK.has(code)) {
      // The payroll page shows the same neutral wording as the shift plan: sick leave reads "Abwesend".
      if (code !== 'FS') totals.absenceDays += 1;
      rows.push({ date, code: SICK_CODES.has(code) ? 'ABW' : code, hours: 0, night: 0, sunday: 0, holiday: 0, worked: false });
      continue;
    }
    const definition = byCode.get(code);
    const paid = Number(definition?.duration_hours);
    const hours = Number.isFinite(paid) ? paid : 0;
    const supplement = definition
      ? getSupplementHours({ year, month, day, definition, paidHours: hours })
      : null;
    rows.push({ date, code, hours, night: supplement?.night ?? 0, sunday: supplement?.sunday ?? 0, holiday: supplement?.holiday ?? 0, worked: true });
    totals.workedShifts += 1;
    totals.workedHours += hours;
    totals.nightHours += supplement?.night ?? 0;
    totals.sundayHours += supplement?.sunday ?? 0;
    totals.holidayHours += supplement?.holiday ?? 0;
  }

  const round = (value) => Number(value.toFixed(2));
  return {
    shifts: rows,
    totals: {
      ...totals,
      workedHours: round(totals.workedHours),
      nightHours: round(totals.nightHours),
      sundayHours: round(totals.sundayHours),
      holidayHours: round(totals.holidayHours),
    },
  };
}
