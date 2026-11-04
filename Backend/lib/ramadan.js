/* ================================================ */
/* Ramadan periods (2026 - 2030)                     */
/* Used by the generator (extra late staffing) and   */
/* shown in the admin menu.                          */
/* ================================================ */

// Fallback table (Umm al-Qura, +-1 day) in case the runtime has no Islamic calendar data.
const FALLBACK_PERIODS = Object.freeze([
  { year: 2026, start: '2026-02-18', end: '2026-03-19' },
  { year: 2027, start: '2027-02-08', end: '2027-03-09' },
  { year: 2028, start: '2028-01-28', end: '2028-02-25' },
  { year: 2029, start: '2029-01-16', end: '2029-02-13' },
  { year: 2030, start: '2030-01-06', end: '2030-02-04' },
]);

export const RAMADAN_FIRST_YEAR = 2026;
export const RAMADAN_LAST_YEAR = 2030;

function pad2(value) {
  return String(value).padStart(2, '0');
}

let cached = null;

/** [{ year, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }] for the years 2026 to 2030 (Ramadan is the 9th Islamic month). */
export function getRamadanPeriods() {
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const periods = [];
    let current = null;
    for (let date = new Date(Date.UTC(RAMADAN_FIRST_YEAR, 0, 1)); date.getUTCFullYear() <= RAMADAN_LAST_YEAR; date = new Date(date.getTime() + 86400000)) {
      const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
      const iso = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
      if (Number(parts.month) === 9) {
        if (!current) current = { year: date.getUTCFullYear(), start: iso, end: iso };
        current.end = iso;
      } else if (current) {
        periods.push(current);
        current = null;
      }
    }
    if (current) periods.push(current);
    if (periods.length >= 4 && periods.every((period) => /^\d{4}-\d{2}-\d{2}$/.test(period.start))) {
      cached = periods.filter((period) => period.year >= RAMADAN_FIRST_YEAR && period.year <= RAMADAN_LAST_YEAR);
      return cached;
    }
  } catch {
    // no Islamic calendar in this runtime: fall back to the table
  }
  cached = FALLBACK_PERIODS.map((period) => ({ ...period }));
  return cached;
}

export function isRamadanDate(dateKey) {
  const key = String(dateKey || '').slice(0, 10);
  return getRamadanPeriods().some((period) => key >= period.start && key <= period.end);
}
