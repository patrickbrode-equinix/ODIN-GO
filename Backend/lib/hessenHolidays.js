/* ================================================ */
/* Hessen public holidays (shared by generator and  */
/* understaffing suggestions)                       */
/* ================================================ */

export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildHessenHolidayMap(year) {
  const easter = easterSunday(year);
  const map = {
    [toIsoDate(new Date(year, 0, 1))]: 'Neujahr',
    [toIsoDate(addDays(easter, -2))]: 'Karfreitag',
    [toIsoDate(addDays(easter, 1))]: 'Ostermontag',
    [toIsoDate(new Date(year, 4, 1))]: 'Tag der Arbeit',
    [toIsoDate(addDays(easter, 39))]: 'Christi Himmelfahrt',
    [toIsoDate(addDays(easter, 50))]: 'Pfingstmontag',
    [toIsoDate(addDays(easter, 60))]: 'Fronleichnam',
    [toIsoDate(new Date(year, 9, 3))]: 'Tag der Deutschen Einheit',
    [toIsoDate(new Date(year, 11, 25))]: '1. Weihnachtstag',
    [toIsoDate(new Date(year, 11, 26))]: '2. Weihnachtstag',
  };

  return map;
}
