/* ------------------------------------------------ */
/* DISPATCHER STORE – WEEK STATE (PERSISTED)        */
/* ------------------------------------------------ */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Employee } from "./shiftStore";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

export type DispatcherGroup = {
  id: string;
  name: string;
  employees: Employee[];
};

export type DispatcherWeek = {
  weekDate: string; // ISO string
  groups: DispatcherGroup[];
};

/* ------------------------------------------------ */
/* STORE STATE                                      */
/* ------------------------------------------------ */

interface DispatcherState {
  activeWeek: DispatcherWeek | null;

  /* ACTIONS */
  setWeek: (weekDate: Date) => void;
  setGroups: (groups: DispatcherGroup[]) => void;
  reset: () => void;
}

/* ------------------------------------------------ */
/* STORE IMPLEMENTATION                             */
/* ------------------------------------------------ */

export const useDispatcherStore = create<DispatcherState>()(
  persist(
    (set, get) => ({
      activeWeek: null,

      setWeek: (date) =>
        set((state) => ({
          activeWeek: {
            weekDate: date.toISOString(),
            groups: state.activeWeek?.groups ?? [],
          },
        })),

      setGroups: (groups) =>
        set((state) => ({
          activeWeek: {
            weekDate:
              state.activeWeek?.weekDate ??
              new Date().toISOString(),
            groups,
          },
        })),

      reset: () => set({ activeWeek: null }),
    }),
    {
      name: "dispatcher.week.v1",
      version: 1,
    }
  )
);
