import { parseMonthLabel } from "./monthParser.js";

const MONTH_NAMES_DE = [
  "",
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function parseDraftMonthId(monthId) {
  const normalized = String(monthId || "").trim();
  const match = normalized.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

export function formatShiftMonthLabel(year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return `${MONTH_NAMES_DE[month]} ${year}`;
}

export function monthLabelMatchesYear(label, year) {
  const parsed = parseMonthLabel(label);
  return Boolean(parsed && parsed.year === Number(year));
}

export function monthLabelMatchesMonthId(label, monthId) {
  const parsedLabel = parseMonthLabel(label);
  const parsedMonthId = parseDraftMonthId(monthId);

  return Boolean(
    parsedLabel
    && parsedMonthId
    && parsedLabel.year === parsedMonthId.year
    && parsedLabel.month === parsedMonthId.month
  );
}