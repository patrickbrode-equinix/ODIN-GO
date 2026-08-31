/* ------------------------------------------------ */
/* COMMIT FILTERS STORE                             */
/* ------------------------------------------------ */

import { create } from "zustand";
import { useCommitStore } from "./commitStore";

export type SavedFilter = {
  id: string;
  label: string;
  field: string;
  operator: "IN" | "NOT_IN";
  values: string[];
  enabled: boolean;
};

type CommitFiltersState = {
  filters: SavedFilter[];
  activeIds: string[];

  setFilters: (filters: SavedFilter[]) => void;
  toggleFilter: (id: string) => void;
  clearActive: () => void;
};

export const useCommitFiltersStore = create<CommitFiltersState>((set, get) => ({
  filters: [],
  activeIds: [],

  setFilters: (filters) => set({ filters }),

  toggleFilter: (id) => {
    const active = get().activeIds;
    const next = active.includes(id)
      ? active.filter((x) => x !== id)
      : [...active, id];

    set({ activeIds: next });

    // 🔥 Recalculate visibleTickets
    const { tickets, registry } = useCommitStore.getState();
    useCommitStore.getState().setTickets(tickets);
  },

  clearActive: () => {
    set({ activeIds: [] });
    const { tickets } = useCommitStore.getState();
    useCommitStore.getState().setTickets(tickets);
  },
}));
