export const ANNUAL_VACATION_DAYS = 30;

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// UTC date arithmetic keeps calendar days stable across daylight-saving changes.
export function vacationSummary(entries, year) {
  const days = new Set();
  const monthlyDays = Array(12).fill(0);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  for (const entry of entries) {
    const start = entry.start_date.slice(0, 10);
    const end = entry.end_date.slice(0, 10);
    if (!isDateKey(start) || !isDateKey(end)) continue;
    const first = start > yearStart ? start : yearStart;
    const last = end < yearEnd ? end : yearEnd;
    for (const date = new Date(`${first}T00:00:00Z`); date.toISOString().slice(0, 10) <= last; date.setUTCDate(date.getUTCDate() + 1)) {
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
      const key = date.toISOString().slice(0, 10);
      if (days.has(key)) continue;
      days.add(key);
      monthlyDays[date.getUTCMonth()] += 1;
    }
  }
  return { allowance: ANNUAL_VACATION_DAYS, used: days.size, remaining: ANNUAL_VACATION_DAYS - days.size, monthlyDays };
}
