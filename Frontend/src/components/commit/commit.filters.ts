/* ------------------------------------------------ */
/* COMMIT – FILTER LOGIC (MULTI FILTER)             */
/* ------------------------------------------------ */

import { EnrichedCommitTicket } from "./commit.types";
import { CommitFilters } from "./commit.filterState";

/* placeholder – später ersetzen */
const DEINSTALL_SUBTYPES = ["Deinstall", "De-Install"];

export function applyCommitFilters(
  tickets: EnrichedCommitTicket[],
  filters: CommitFilters
) {
  return tickets.filter((t) => {
    if (filters.compliance && !t.isComplianceRelevant) return false;

    if (filters.missed && t.commitHours !== null) return false;

    if (filters.migration && !t.isMigration) return false;

    if (
      filters.deinstall &&
      !DEINSTALL_SUBTYPES.some((d) =>
        t.activitySubType?.toLowerCase().includes(d.toLowerCase())
      )
    )
      return false;

    if (filters.scheduled && !t.maintenanceStart) return false;

    if (filters.ibx.length > 0 && !filters.ibx.includes(t.ibx ?? ""))
      return false;

    return true;
  });
}
