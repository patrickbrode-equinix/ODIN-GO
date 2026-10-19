/* ================================================ */
/* Hints for manually edited draft cells             */
/* ================================================ */
// Non-blocking: the planner may deliberately break a rule, but sees it at once.

export interface DraftIssueAbsence {
  employee_name: string;
  start_date: string;
  end_date: string;
  type?: string | null;
}

export interface DraftIssueContext {
  /** employee -> day -> shift code */
  schedule: Record<string, Record<number, string>>;
  /** shift code -> shift type (early / late / night / special) */
  typeByCode: Record<string, string>;
  absences: DraftIssueAbsence[];
  /** YYYY-MM */
  month: string;
  lateToEarlyForbidden: boolean;
  nightToEarlyForbidden: boolean;
  maxConsecutiveWorkdays: number;
}

const FREE_MARKERS = new Set(["", "FS", "S", "ABW", "SEMINAR"]);

function typeOf(context: DraftIssueContext, code: string | undefined): string | null {
  const key = String(code || "").trim().toUpperCase();
  if (!key || FREE_MARKERS.has(key)) return null;
  return context.typeByCode[key] ?? null;
}

function isWork(context: DraftIssueContext, code: string | undefined): boolean {
  const key = String(code || "").trim().toUpperCase();
  return Boolean(key) && !FREE_MARKERS.has(key) && key in context.typeByCode;
}

/** Plain-language hints for one cell (empty when everything is fine). */
export function describeCellIssues(context: DraftIssueContext, employee: string, day: number, isGerman = true): string[] {
  const row = context.schedule[employee] || {};
  const code = row[day];
  if (!code) return [];
  const issues = new Set<string>();
  const t = (de: string, en: string) => (isGerman ? de : en);

  const date = `${context.month}-${String(day).padStart(2, "0")}`;
  const absence = context.absences.find((entry) => entry.employee_name === employee
    && String(entry.start_date).slice(0, 10) <= date && date <= String(entry.end_date).slice(0, 10));
  if (absence) issues.add(t("Abwesend (Urlaub/Abwesenheit) an diesem Tag", "Absent on this day"));

  const type = typeOf(context, code);
  const previousType = typeOf(context, row[day - 1]);
  const nextType = typeOf(context, row[day + 1]);
  if (type === "early" && previousType === "late" && context.lateToEarlyForbidden) issues.add(t("Frühschicht direkt nach Spätschicht (zu kurze Ruhezeit)", "Early shift right after a late shift (rest time too short)"));
  if (type === "early" && previousType === "night" && context.nightToEarlyForbidden) issues.add(t("Frühschicht direkt nach Nachtschicht", "Early shift right after a night shift"));
  if (type === "late" && nextType === "early" && context.lateToEarlyForbidden) issues.add(t("Folgetag Frühschicht nach dieser Spätschicht (zu kurze Ruhezeit)", "Early shift on the next day after this late shift"));
  if (type === "night" && nextType === "early" && context.nightToEarlyForbidden) issues.add(t("Folgetag Frühschicht nach dieser Nachtschicht", "Early shift on the next day after this night shift"));

  if (isWork(context, code)) {
    let first = day;
    while (isWork(context, row[first - 1])) first--;
    let last = day;
    while (isWork(context, row[last + 1])) last++;
    const run = last - first + 1;
    if (run > Math.max(context.maxConsecutiveWorkdays, 7)) issues.add(t(`${run} Arbeitstage am Stück`, `${run} working days in a row`));
  }
  return [...issues];
}
