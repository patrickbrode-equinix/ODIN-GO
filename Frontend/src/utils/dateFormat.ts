/* ------------------------------------------------ */
/* GLOBAL DATE & TIME FORMAT HELPERS                */
/* Timezone-safe: always displays in OPS_TZ         */
/* ------------------------------------------------ */

/** Operational timezone – all display times use this */
export const OPS_TIMEZONE = "Europe/Berlin";

const tsFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: OPS_TIMEZONE,
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
});

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: OPS_TIMEZONE,
  day: "2-digit", month: "2-digit", year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: OPS_TIMEZONE,
  hour: "2-digit", minute: "2-digit",
  hour12: false,
});

/**
 * Wandelt ISO- oder DB-Timestamp in deutsches Format um:
 * Ergebnis: "19.12.2025, 03:12:55"
 */
export const formatTimestamp = (ts: string | Date) => {
  if (!ts) return "";
  return tsFmt.format(new Date(ts));
};

/**
 * Nutzt commitDate ("2025-12-19") + commitTime ("03:12")
 * Ergebnis: "19.12.2025 – 03:12"
 */
export const formatCommit = (dateStr: string, timeStr: string) => {
  if (!dateStr || !timeStr) return "";

  const [year, month, day] = dateStr.split("-");

  return `${day}.${month}.${year} – ${timeStr}`;
};

/**
 * Reines deutsches Datum ohne Uhrzeit
 * Ergebnis: "19.12.2025"
 */
export const formatDate = (ts: string | Date) => {
  return dateFmt.format(new Date(ts));
};

/**
 * Reine Uhrzeit
 * Ergebnis: "03:12"
 */
export const formatTime = (ts: string | Date) => {
  return timeFmt.format(new Date(ts));
};
 
function formatForLocale(
  ts: string | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions
) {
  if (!ts) return "";
  const date = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone: OPS_TIMEZONE,
    ...options,
  }).format(date);
}

export function formatDateTimeForLocale(
  ts: string | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = {}
) {
  return formatForLocale(ts, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

export function formatDateForLocale(
  ts: string | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = {}
) {
  return formatForLocale(ts, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  });
}

export function formatTimeForLocale(
  ts: string | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = {}
) {
  return formatForLocale(ts, locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

/* ------------------------------------------------ */
/* DATE FORMAT – MONTH LABEL (I18N READY)           */
/* ------------------------------------------------ */

export function formatMonthLabel(
  year: number,
  month: number,
  locale: "de-DE" | "en-US" = "de-DE"
) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1));
}
