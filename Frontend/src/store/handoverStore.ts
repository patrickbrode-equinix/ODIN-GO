/* ------------------------------------------------ */
/* HANDOVER STORE – STABLE CACHE + SAFE MERGE        */
/* ------------------------------------------------ */

import { create } from "zustand";
import { HandoverItem } from "../components/handover/handover.types";
import { loadHandovers } from "../components/handover/handover.api";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

type LoadOptions = {
  force?: boolean;
};

type HandoverState = {
  handovers: HandoverItem[];
  isLoaded: boolean;

  load: (options?: LoadOptions) => Promise<void>;
  add: (h: HandoverItem) => void;
  update: (partial: Partial<HandoverItem> & { id: number }) => void;
  remove: (id: number) => void;
};

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function mergeHandovers(
  current: HandoverItem[],
  incoming: HandoverItem[],
  force: boolean
): HandoverItem[] {
  const map = new Map<number, HandoverItem>();

  // 1) On force reload: drop ALL optimistic entries
  if (!force) {
    for (const h of current) {
      if (h.id < 0) {
        map.set(h.id, h);
      }
    }
  }

  // 2) Backend always wins
  for (const h of incoming) {
    map.set(h.id, h);
  }

  // 3) Sort newest first
  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );
}

/* ------------------------------------------------ */
/* STORE                                            */
/* ------------------------------------------------ */

export const useHandoverStore = create<HandoverState>((set, get) => ({
  handovers: [],
  isLoaded: false,

  /* ------------------------------------------------ */
  /* LOAD (CACHE + CLEAN MERGE)                       */
  /* ------------------------------------------------ */

  load: async (options) => {
    if (get().isLoaded && !options?.force) return;

    const incoming = await loadHandovers();

    set((state) => ({
      handovers: mergeHandovers(
        state.handovers,
        incoming,
        !!options?.force
      ),
      isLoaded: true,
    }));
  },

  /* ------------------------------------------------ */
  /* ADD (OPTIMISTIC SAFE)                            */
  /* ------------------------------------------------ */

  add: (handover) =>
    set((state) => {
      if (state.handovers.some((h) => h.id === handover.id)) {
        return state;
      }

      return {
        handovers: [handover, ...state.handovers],
      };
    }),

  /* ------------------------------------------------ */
  /* UPDATE (REFERENCE SAFE)                          */
  /* ------------------------------------------------ */

  update: (partial) =>
    set((state) => {
      let changed = false;

      const next = state.handovers.map((h) => {
        if (h.id !== partial.id) return h;

        changed = true;
        return { ...h, ...partial };
      });

      return changed ? { handovers: next } : state;
    }),

  /* ------------------------------------------------ */
  /* REMOVE                                          */
  /* ------------------------------------------------ */

  remove: (id) =>
    set((state) => ({
      handovers: state.handovers.filter((h) => h.id !== id),
    })),
}));
