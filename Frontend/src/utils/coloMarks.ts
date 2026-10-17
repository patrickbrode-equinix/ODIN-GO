/** Pure helpers for "CO" (Colo) marks on shift plan cells (drafts and live plan). */

export interface ColoMark {
  comment: string;
  manual: boolean;
}

export type ColoMarkLookup = Map<string, ColoMark>;

/** Lookup key: `${employee}|${YYYY-MM-DD}` (same format as the weekplan role store). */
export function coloMarkKey(employeeName: string, date: string): string {
  return `${employeeName}|${String(date).slice(0, 10)}`;
}

/** Builds a lookup from draft `config_snapshot.coloAssignments`. Invalid entries are ignored. */
export function buildColoMarkLookup(assignments: unknown): ColoMarkLookup {
  const lookup: ColoMarkLookup = new Map();
  if (!Array.isArray(assignments)) return lookup;
  for (const entry of assignments) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { employee_name?: unknown; date?: unknown; comment?: unknown; manual?: unknown; role_key?: unknown };
    if (typeof row.employee_name !== "string" || !row.employee_name) continue;
    if (typeof row.date !== "string" || row.date.length < 10) continue;
    if (row.role_key !== undefined && row.role_key !== "colo") continue;
    lookup.set(coloMarkKey(row.employee_name, row.date), {
      comment: typeof row.comment === "string" ? row.comment : "",
      manual: row.manual === true,
    });
  }
  return lookup;
}

/** Builds a lookup from the weekplan role store map ("employee|date" -> { role_key, comment }). */
export function buildColoMarkLookupFromRoles(
  roles: Record<string, { role_key?: string; comment?: string | null }>,
): ColoMarkLookup {
  const lookup: ColoMarkLookup = new Map();
  for (const [key, value] of Object.entries(roles || {})) {
    if (value?.role_key !== "colo") continue;
    lookup.set(key, { comment: value.comment ?? "", manual: false });
  }
  return lookup;
}

export function getColoMark(lookup: ColoMarkLookup | undefined, employeeName: string, date: string): ColoMark | undefined {
  return lookup?.get(coloMarkKey(employeeName, date));
}

export function isColoMarked(lookup: ColoMarkLookup | undefined, employeeName: string, date: string): boolean {
  return Boolean(lookup?.has(coloMarkKey(employeeName, date)));
}

/** Tooltip text for the CO badge. */
export function coloMarkTitle(mark: ColoMark, isGerman: boolean): string {
  const parts = [isGerman ? "Colo-Einsatz" : "Colo assignment"];
  if (mark.comment) parts.push(mark.comment);
  if (mark.manual) parts.push(isGerman ? "manuell" : "manual");
  return parts.join(" · ");
}
