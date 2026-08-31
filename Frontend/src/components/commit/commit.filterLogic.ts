/* ———————————————————————————————— */
/* COMMIT – APPLY SAVED FILTERS LOGIC               */
/* Single place for all table filtering             */
/* ———————————————————————————————— */

import { SavedFilter } from "../../store/commitFiltersStore";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

type Ticket = Record<string, any>;

/* ------------------------------------------------ */
/* APPLY FILTERS                                    */
/* ------------------------------------------------ */

export function applySavedFilters(
  tickets: Ticket[],
  filters: SavedFilter[],
  activeFilterIds: string[]
): Ticket[] {
  if (!activeFilterIds.length) return tickets;

  const activeFilters = filters.filter((f) =>
    activeFilterIds.includes(f.id)
  );

  if (!activeFilters.length) return tickets;

  return tickets.filter((ticket) => {
    return activeFilters.every((filter) => {
      const rawValue = ticket[filter.field];

      if (rawValue == null) return false;

      const ticketValue = String(rawValue).trim();

      if (filter.operator === "IN") {
        return filter.values.includes(ticketValue);
      }

      if (filter.operator === "NOT_IN") {
        return !filter.values.includes(ticketValue);
      }

      return true;
    });
  });
}
