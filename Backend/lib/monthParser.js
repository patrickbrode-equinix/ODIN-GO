/**
 * backend/lib/monthParser.js
 *
 * Parses month label strings (e.g. "Januar 2026", "Feb 26", "march 2025")
 * into { year, month } objects.
 *
 * Handles:
 *   - German full & abbreviated names (auch mit Umlaut)
 *   - English full & abbreviated names
 *   - Mixed case, trailing punctuation/spaces
 *   - 2-digit years (e.g. "Jan 26" → 2026)
 *   - Locale-independent (no Date.toLocaleString())
 *
 * @param {string|null|undefined} label
 * @returns {{ year: number, month: number } | null}
 */
export function parseMonthLabel(label) {
  if (!label || typeof label !== "string") return null;

  // Normalize: trim, collapse whitespace, strip trailing punctuation
  const normalized = label.trim().replace(/\s+/g, " ");
  const parts = normalized.split(" ");
  if (parts.length < 2) return null;

  // Remove trailing punctuation from month name (e.g. "Jan." → "jan")
  const monthName = parts[0].replace(/[.,;:]+$/, "").toLowerCase();
  const yearPart = parts[1];

  const MONTH_MAP = {
    // German full
    januar: 1, februar: 2, "märz": 3, april: 4, mai: 5, juni: 6,
    juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
    // German abbreviated
    jan: 1, feb: 2, "mär": 3, mrz: 3, maerz: 3, apr: 4, jun: 6,
    jul: 7, aug: 8, sept: 9, sep: 9, okt: 10, nov: 11, dez: 12,
    // English full
    january: 1, february: 2, march: 3, may: 5, june: 6,
    july: 7, october: 10, december: 12,
    // English abbreviated
    mar: 3, oct: 10, dec: 12,
  };

  const month = MONTH_MAP[monthName];
  if (!month) return null;

  let year = Number(yearPart.replace(/[^0-9]/g, ""));
  // NaN check — but note: '00' → 0 which is valid (2000)
  if (Number.isNaN(year)) return null;

  // 2-digit year: 00-49 → 2000-2049, 50-99 → 2050-2099
  if (year < 100) year = 2000 + year;

  // Sanity range: 2000–2100
  if (year < 2000 || year > 2100) return null;

  return { year, month };
}

/**
 * Sort an array of month label strings chronologically.
 * Labels that can't be parsed are appended at the end.
 * @param {string[]} labels
 * @returns {string[]}
 */
export function sortMonthLabels(labels) {
  return [...labels].sort((a, b) => {
    const pa = parseMonthLabel(a);
    const pb = parseMonthLabel(b);
    if (!pa && !pb) return 0;
    if (!pa) return 1;
    if (!pb) return -1;
    if (pa.year !== pb.year) return pa.year - pb.year;
    return pa.month - pb.month;
  });
}
