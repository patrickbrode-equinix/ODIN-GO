/* ------------------------------------------------ */
/* COMMIT – TIME, DATE & SEVERITY LOGIC (FINAL)     */
/* ------------------------------------------------ */

export type CommitSubTypeStatus = "relevant" | "ignore" | "unknown";

export type CommitSubType = {
  id: number;
  key: string;
  status: CommitSubTypeStatus;
};

/* ------------------------------------------------ */
/* SUB-TYPE NORMALIZATION                           */
/* ------------------------------------------------ */

function normalizeSubType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "");
}

/* ------------------------------------------------ */
/* ACTIVITY ICON RESOLUTION (MIGRATION / EXPEDITE) */
/* ------------------------------------------------ */

export function getActivityIcon(
  activitySubType?: string | null
): string | null {
  if (!activitySubType) return null;

  const key = normalizeSubType(activitySubType);

  if (key.includes("migration")) {
    return "/Migration.png";
  }

  if (key.includes("expedite")) {
    return "/Expedite.png";
  }

  return null;
}

/* ------------------------------------------------ */
/* DATE PARSING – BULLETPROOF (DE + US + AM/PM)     */
/* ------------------------------------------------ */

export function parseExcelDate(value?: string): Date | null {
  if (!value) return null;
  const v = value.trim();

  /* ---------- DE: 12.01.2026, 23:59 ---------- */
  let m = v.match(
    /^(\d{2})\.(\d{2})\.(\d{4}),?\s*(\d{2}):(\d{2})$/
  );
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m;
    return new Date(+yyyy, +mm - 1, +dd, +hh, +min);
  }

  /* ---------- US: 1/13/2026 09:00:07 AM ---------- */
  m = v.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i
  );
  if (m) {
    let [, mm, dd, yyyy, hh, min, , ap] = m;
    let hour = +hh % 12;
    if (ap.toUpperCase() === "PM") hour += 12;
    return new Date(+yyyy, +mm - 1, +dd, hour, +min);
  }

  /* ---------- US: 1/13/2026 14:00 ---------- */
  m = v.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/
  );
  if (m) {
    const [, mm, dd, yyyy, hh, min] = m;
    return new Date(+yyyy, +mm - 1, +dd, +hh, +min);
  }

  return null;
}

/* ------------------------------------------------ */
/* DATE FORMAT – SAFE GERMAN DISPLAY                */
/* ------------------------------------------------ */

export function formatDateDE(value?: string | Date | null): string {
  if (!value) return "";

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (typeof value === "string") {
    const parsed = parseExcelDate(value);
    if (parsed) return formatDateDE(parsed);
    return value;
  }

  return "";
}

/* ------------------------------------------------ */
/* REMAINING TIME (SINGLE SOURCE OF TRUTH)          */
/* ------------------------------------------------ */

export function calcCommitHours(
  input?: unknown,
  now: Date = new Date()
): number | null {
  if (input == null) return null;

  /* ------------------------------------------------ */
  /* 1) OBJECT INPUT → COMMIT DATE FIRST (FIX)       */
  /* ------------------------------------------------ */

  if (typeof input === "object") {
    const t: any = input;

    const commitAt =
      t.commitAt ??
      t.commit_at ??
      t.commitDate ??
      t.commitdate ??
      t.commit_date ??
      null;

    if (typeof commitAt === "string") {
      const commitDate = parseExcelDate(commitAt);
      if (commitDate) {
        const diffMs = commitDate.getTime() - now.getTime();
        return diffMs / (1000 * 60 * 60);
      }
      // Fallback: ISO/native date parsing (DB returns ISO strings)
      const isoDate = new Date(commitAt);
      if (!isNaN(isoDate.getTime())) {
        return (isoDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      }
    }

    const remainingRaw =
      t.remainingRaw ??
      t.remaining ??
      t.remaining_time ??
      t.remainingTime ??
      null;

    if (typeof remainingRaw === "string") {
      return calcCommitHours(remainingRaw, now);
    }

    if (remainingRaw && typeof remainingRaw === "object" && typeof remainingRaw.open === "number") {
      return remainingRaw.open;
    }

    if (t.remaining && typeof t.remaining === "object" && typeof t.remaining.open === "number") {
      return t.remaining.open;
    }
  }

  /* ------------------------------------------------ */
  /* 2) STRING INPUT                                 */
  /* ------------------------------------------------ */

  if (typeof input === "string") {
    const v = input.trim();
    if (!v) return null;

    // 2a) Commit-Date (DE / US)
    const commitDate = parseExcelDate(v);
    if (commitDate) {
      const diffMs = commitDate.getTime() - now.getTime();
      return diffMs / (1000 * 60 * 60);
    }

    // 2b) Remaining (LEGACY FALLBACK)
    const m = v
      .toLowerCase()
      .match(/(-?\d+(?:\.\d+)?)\s*day[s]?,\s*(-?\d+(?:\.\d+)?)\s*hour/);

    if (m) {
      const days = parseFloat(m[1]);
      const hours = parseFloat(m[2]);
      return isNaN(days) || isNaN(hours) ? null : days * 24 + hours;
    }
  }

  return null;
}

/* ------------------------------------------------ */
/* FLAGS                                           */
/* ------------------------------------------------ */

export function toBoolFlag(value?: string): boolean {
  if (!value) return false;
  return ["y", "yes", "true", "1", "x", "expedite", "migration"]
    .includes(String(value).trim().toLowerCase());
}

/* ------------------------------------------------ */
/* SUB TYPE CLASSIFICATION                          */
/* ------------------------------------------------ */

type TicketWithSubType = {
  activitySubType?: string | null;
};

export function classifyTicketsBySubType<T extends TicketWithSubType>(
  tickets: T[],
  subTypes: CommitSubType[]
) {
  const relevant = new Set(
    subTypes
      .filter(s => s.status === "relevant")
      .map(s => normalizeSubType(s.key))
  );
  const ignored = new Set(
    subTypes
      .filter(s => s.status === "ignore")
      .map(s => normalizeSubType(s.key))
  );

  const res = { relevant: [] as T[], ignored: [] as T[], unknown: [] as T[] };

  for (const t of tickets) {
    const key = t.activitySubType
      ? normalizeSubType(t.activitySubType)
      : null;

    if (!key) res.unknown.push(t);
    else if (relevant.has(key)) res.relevant.push(t);
    else if (ignored.has(key)) res.ignored.push(t);
    else res.unknown.push(t);
  }

  return res;
}

/* ------------------------------------------------ */
/* SORTING – REMAINING TIME (FINAL)                 */
/* ------------------------------------------------ */

export function sortByRemainingTime(
  a: any,
  b: any
): number {
  const now = new Date();

  const aH = calcCommitHours(a, now);
  const bH = calcCommitHours(b, now);

  if (aH === null && bH === null) return 0;
  if (aH === null) return 1;
  if (bH === null) return -1;

  const aExpired = aH < 0;
  const bExpired = bH < 0;

  if (!aExpired && bExpired) return -1;
  if (aExpired && !bExpired) return 1;

  if (!aExpired && !bExpired) return aH - bH;

  return bH - aH;
}
