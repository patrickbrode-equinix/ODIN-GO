/** Ramadan periods 2026-2030 (9th month of the Islamic calendar), shown in the admin menu. */
export interface RamadanPeriod { year: number; start: string; end: string }

const FALLBACK: RamadanPeriod[] = [
  { year: 2026, start: "2026-02-18", end: "2026-03-19" },
  { year: 2027, start: "2027-02-08", end: "2027-03-09" },
  { year: 2028, start: "2028-01-28", end: "2028-02-25" },
  { year: 2029, start: "2029-01-16", end: "2029-02-13" },
  { year: 2030, start: "2030-01-06", end: "2030-02-04" },
];

let cached: RamadanPeriod[] | null = null;

const pad = (value: number) => String(value).padStart(2, "0");

export function getRamadanPeriods(): RamadanPeriod[] {
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
    const periods: RamadanPeriod[] = [];
    let current: RamadanPeriod | null = null;
    for (let date = new Date(Date.UTC(2026, 0, 1)); date.getUTCFullYear() <= 2030; date = new Date(date.getTime() + 86400000)) {
      const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
      const iso = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
      if (Number(parts.month) === 9) {
        if (!current) current = { year: date.getUTCFullYear(), start: iso, end: iso };
        current.end = iso;
      } else if (current) {
        periods.push(current);
        current = null;
      }
    }
    if (current) periods.push(current);
    if (periods.length >= 4) {
      cached = periods;
      return cached;
    }
  } catch {
    /* no Islamic calendar data in this browser */
  }
  cached = FALLBACK;
  return cached;
}

export function formatRamadanPeriod(period: RamadanPeriod, locale: string): string {
  const format = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${format(period.start)} – ${format(period.end)}`;
}
