/* ================================================ */
/* "Nicht planen" (do-not-plan) employees            */
/*                                                   */
/* Employees on the exception list with the button   */
/* "Nicht planen" switched on disappear from the     */
/* whole shift plan: generator, drafts, live plan    */
/* and Excel. Matching is by name variant            */
/* ("Brode, Patrick" = "Patrick Brode").             */
/* ================================================ */

import { buildEmployeeAliasKeys } from './employeeNameResolution.js';

/** Alias keys of every active exception entry with do_not_plan = TRUE. Empty set on any error. */
export async function loadDoNotPlanKeys(queryFn) {
  try {
    const { rows } = await queryFn('SELECT employee_name, do_not_plan FROM shiftplan_exclusions WHERE is_active = TRUE');
    const keys = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row.do_not_plan !== true) continue;
      for (const key of buildEmployeeAliasKeys(row.employee_name)) keys.add(key);
    }
    return keys;
  } catch {
    return new Set();
  }
}

export function isDoNotPlan(name, keys) {
  if (!keys || keys.size === 0) return false;
  return buildEmployeeAliasKeys(name).some((key) => keys.has(key));
}

/** Removes the hidden employees from a draft-like object (shifts, fairness, absences, manual rows, wish status). */
export function stripDoNotPlan(draft, keys) {
  if (!keys || keys.size === 0 || !draft) return draft;
  const keep = (name) => !isDoNotPlan(name, keys);
  const next = { ...draft };
  if (Array.isArray(draft.shifts_json)) next.shifts_json = draft.shifts_json.filter((entry) => keep(entry?.employee_name));
  if (draft.fairness && typeof draft.fairness === 'object') next.fairness = Object.fromEntries(Object.entries(draft.fairness).filter(([name]) => keep(name)));
  if (Array.isArray(draft.absences)) next.absences = draft.absences.filter((entry) => keep(entry?.employee_name));
  if (Array.isArray(draft.manual_employees)) next.manual_employees = draft.manual_employees.filter((entry) => keep(entry?.employee_name));
  if (Array.isArray(draft.wish_status)) next.wish_status = draft.wish_status.filter((entry) => keep(entry?.employee_name));
  if (Array.isArray(draft.explanations)) next.explanations = draft.explanations;
  return next;
}
