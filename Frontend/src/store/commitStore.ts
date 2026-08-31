/* ------------------------------------------------ */
/* COMMIT STORE – LIVE COUNTDOWN + FILTERS (FINAL)  */
/* ------------------------------------------------ */

import { create } from "zustand";
import { EnrichedCommitTicket } from "../components/commit/commit.types";
import { calcCommitHours } from "../components/commit/commit.logic";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

type FilterRule = {
  field: string;
  values: string[];
};

type SavedFilter = {
  id: string;
  label: string;
  rules: FilterRule[];
};

type CommitRegistry = Record<
  string,
  { value: string; count: number }[]
>;

interface CommitState {
  /* DATA */
  rawTickets: EnrichedCommitTicket[];
  tickets: EnrichedCommitTicket[];

  /* FILTER */
  filters: SavedFilter[];
  activeFilter: SavedFilter | null;

  /* REGISTRY */
  registry: CommitRegistry;

  /* LIVE TIMER */
  now: Date;

  /* ACTIONS */
  setTickets: (rows: EnrichedCommitTicket[]) => void;
  setFilters: (filters: SavedFilter[]) => void;
  applyFilter: (filter: SavedFilter | null) => void;
  startLiveTicker: () => void;
}

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function buildRegistry(
  rows: EnrichedCommitTicket[]
): CommitRegistry {
  const reg: CommitRegistry = {};

  for (const row of rows) {
    Object.entries(row).forEach(([key, value]) => {
      if (value == null || value === "") return;

      const str = String(value);
      if (!reg[key]) reg[key] = [];

      const existing = reg[key].find((v) => v.value === str);
      if (existing) existing.count++;
      else reg[key].push({ value: str, count: 1 });
    });
  }

  return reg;
}

function applyFilterRules(
  rows: EnrichedCommitTicket[],
  filter: SavedFilter
): EnrichedCommitTicket[] {
  return rows.filter((row) =>
    filter.rules.every((rule) => {
      const value = (row as any)[rule.field];
      if (value == null || value === "") return false;
      return rule.values.includes(String(value));
    })
  );
}

function sortTickets(
  rows: EnrichedCommitTicket[],
  now: Date
): EnrichedCommitTicket[] {
  return [...rows].sort((a, b) => {
    const isATT = a.activityType === "TroubleTicket" || String(a.activityType).toLowerCase().includes("trouble");
    const isBTT = b.activityType === "TroubleTicket" || String(b.activityType).toLowerCase().includes("trouble");

    if (isATT && !isBTT) return -1;
    if (!isATT && isBTT) return 1;

    const aH = calcCommitHours(a.commitDate, now);
    const bH = calcCommitHours(b.commitDate, now);

    if (aH === null && bH === null) return 0;
    if (aH === null) return 1;
    if (bH === null) return -1;

    const aExpired = aH < 0;
    const bExpired = bH < 0;

    if (aExpired !== bExpired) return aExpired ? 1 : -1;

    if (!aExpired && !bExpired) return aH - bH;

    return bH - aH;
  });
}

/* ------------------------------------------------ */
/* STORE                                            */
/* ------------------------------------------------ */

let liveTimerStarted = false;

export const useCommitStore = create<CommitState>((set, get) => ({
  rawTickets: [],
  tickets: [],
  filters: [],
  activeFilter: null,
  registry: {},
  now: new Date(),

  /* ------------------------------------------------ */
  /* SET TICKETS                                     */
  /* ------------------------------------------------ */

  setTickets: (rows) => {
    const validRows = rows.filter((r: any) => {
      // Must have some form of ticket ID (not just the internal auto-increment integer ID)
      const hasId = !!(r.external_id || r.ticketNumber || r.ticket || r.Ticket || r.ticketNo);
      // Must have some form of context like Activity or System Name
      const hasContext = !!(r.activity || r.activityType || r.subtype || r.system_name || r.systemName);

      return hasId || hasContext;
    });

    const now = get().now;
    const sorted = sortTickets(validRows, now);

    set({
      rawTickets: sorted,
      tickets: sorted,
      registry: buildRegistry(sorted),
      activeFilter: null,
    });

    get().startLiveTicker();
  },

  /* ------------------------------------------------ */
  /* SET FILTERS                                     */
  /* ------------------------------------------------ */

  setFilters: (filters) => {
    set({ filters });
  },

  /* ------------------------------------------------ */
  /* APPLY FILTER                                    */
  /* ------------------------------------------------ */

  applyFilter: (filter) => {
    const { rawTickets, now } = get();

    if (!filter) {
      set({
        tickets: sortTickets(rawTickets, now),
        activeFilter: null,
      });
      return;
    }

    const filtered = applyFilterRules(rawTickets, filter);

    set({
      tickets: sortTickets(filtered, now),
      activeFilter: filter,
    });
  },

  /* ------------------------------------------------ */
  /* LIVE TICKER                                     */
  /* ------------------------------------------------ */

  startLiveTicker: () => {
    if (liveTimerStarted) return;
    liveTimerStarted = true;

    setInterval(() => {
      const { rawTickets, activeFilter } = get();
      const now = new Date();

      const base = activeFilter
        ? applyFilterRules(rawTickets, activeFilter)
        : rawTickets;

      set({
        now,
        tickets: sortTickets(base, now),
      });
    }, 60_000);
  },
}));
