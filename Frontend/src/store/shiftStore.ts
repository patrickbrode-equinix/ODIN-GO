/* ------------------------------------------------ */
/* SHIFT STORE – GLOBAL STATE (PERSISTED)           */
/* ------------------------------------------------ */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/* ------------------------------------------------ */
/* BASIC TYPES                                      */
/* ------------------------------------------------ */

// Ein Schedule:
// {
//   "Mustermann, Max": { 1: "E1", 2: "L1", 3: "FS", ... },
//   ...
// }
export type Schedule = Record<string, Record<number, string>>;

/* ------------------------------------------------ */
/* SHIFT TYPE INTERFACE (Schicht-Definition)        */
/* ------------------------------------------------ */

export interface ShiftTypeInfo {
  label: string;
  color: string;
  name: string;
  time: string;
}

/* ------------------------------------------------ */
/* EMPLOYEE TYPE (Mitarbeiter für TV Dashboard)     */
/* ------------------------------------------------ */

export interface Employee {
  name: string;
  shift: string;
  time: string;
  info: ShiftTypeInfo;
}

/* ------------------------------------------------ */
/* SHIFT TYPES (Synchron zum Shiftplan)             */
/* ------------------------------------------------ */

export const shiftTypes: Record<string, ShiftTypeInfo> = {
  E1: { label: "E1", color: "bg-orange-500", name: "Frühschicht", time: "06:30-15:30" },
  E2: { label: "E2", color: "bg-orange-600", name: "Frühschicht", time: "07:00-16:00" },
  E1SA: { label: "E1SA", color: "bg-sky-500", name: "Frühschicht mit Wochenende (Samstag)", time: "06:00-14:00" },
  E1WE: { label: "E1WE", color: "bg-sky-600", name: "Frühschicht mit Wochenende (Sa/So)", time: "06:00-14:00" },

  L1: { label: "L1", color: "bg-yellow-500", name: "Spätschicht", time: "13:00-22:00" },
  L2: { label: "L2", color: "bg-yellow-600", name: "Spätschicht", time: "15:00-00:00" },
  L1WE: { label: "L1WE", color: "bg-amber-500", name: "Spätschicht mit Wochenende (Sa/So)", time: "14:00-22:00" },

  N: { label: "N", color: "bg-blue-600", name: "Nachtschicht", time: "21:15-06:45" },

  /* Halbe Schichten */
  HE1: { label: "HE1", color: "bg-orange-400", name: "Halbe Frühschicht (E1)", time: "06:30-10:30" },
  HE2: { label: "HE2", color: "bg-orange-400", name: "Halbe Frühschicht (E2)", time: "07:00-11:00" },
  HL1: { label: "HL1", color: "bg-yellow-400", name: "Halbe Spätschicht (L1)", time: "13:00-17:30" },
  HL2: { label: "HL2", color: "bg-yellow-400", name: "Halbe Spätschicht (L2)", time: "15:00-19:30" },

  DBS: { label: "DBS", color: "bg-fuchsia-600", name: "DBS", time: "—" },

  FS: { label: "FS", color: "bg-cyan-500", name: "Freischicht", time: "—" },
  ABW: { label: "ABW", color: "bg-gray-500", name: "Abwesend", time: "—" },
  SEMINAR: { label: "S", color: "bg-purple-600", name: "Seminar", time: "08:00-16:00" },
};

export const EARLY_SHIFT_CODES = ["E1", "E2", "E1SA", "E1WE"] as const;
export const LATE_SHIFT_CODES = ["L1", "L2", "L1WE"] as const;

/* ------------------------------------------------ */
/* SHIFT STORE STATE                                */
/* ------------------------------------------------ */

interface ShiftStoreState {
  months: string[];
  selectedMonth: string | null;
  schedulesByMonth: Record<string, Schedule>;
  daysInMonth: number;

  /* ACTIONS */
  setMonths: (m: string[]) => void;
  setSelectedMonth: (m: string) => void;
  setSchedule: (month: string, schedule: Schedule) => void;
  setDaysInMonth: (n: number) => void;

  /* HELPERS */
  getActiveSchedule: () => Schedule;

  getEmployeesForToday: () => {
    early: Employee[];
    late: Employee[];
    night: Employee[];
  };

  // Alle Mitarbeitenden für heute (inkl. Sondercodes wie DBS)
  getEmployeesForTodayAll: () => Employee[];
}

/* ------------------------------------------------ */
/* STORE IMPLEMENTATION (WITH PERSIST)              */
/* ------------------------------------------------ */

export const useShiftStore = create<ShiftStoreState>()(
  persist(
    (set, get) => ({
      months: [],
      selectedMonth: null,
      schedulesByMonth: {},
      daysInMonth: 31,

      /* ACTIONS */
      setMonths: (months) => set({ months }),

      setSelectedMonth: (month) => set({ selectedMonth: month }),

      setSchedule: (month, schedule) =>
        set((state) => {
          const nextSchedules = {
            ...state.schedulesByMonth,
            [month]: schedule,
          };

          // months automatisch pflegen (damit TV nach Refresh direkt was hat)
          const nextMonths = state.months?.length
            ? Array.from(new Set([...state.months, month]))
            : Array.from(new Set([month, ...Object.keys(nextSchedules)]));

          // selectedMonth nur setzen, wenn noch keiner gewählt ist
          const nextSelected = state.selectedMonth ?? month;

          return {
            schedulesByMonth: nextSchedules,
            months: nextMonths,
            selectedMonth: nextSelected,
          };
        }),

      setDaysInMonth: (n) => set({ daysInMonth: n }),

      /* ------------------------------------------------ */
      /* ACTIVE SCHEDULE                                  */
      /* ------------------------------------------------ */
      getActiveSchedule: () => {
        const { selectedMonth, schedulesByMonth } = get();

        if (selectedMonth && schedulesByMonth[selectedMonth]) {
          return schedulesByMonth[selectedMonth];
        }

        // Fallback: erster vorhandener Monat
        const months = Object.keys(schedulesByMonth);
        if (months.length > 0) {
          return schedulesByMonth[months[0]];
        }

        return {};
      },

      /* ------------------------------------------------ */
      /* EMPLOYEES FOR TODAY                              */
      /* ------------------------------------------------ */
      getEmployeesForToday: () => {
        const schedule = get().getActiveSchedule();
        const today = new Date();
        const day = today.getDate();

        const early: Employee[] = [];
        const late: Employee[] = [];
        const night: Employee[] = [];

        Object.entries(schedule).forEach(([employeeRaw, days]) => {
          const shiftCode = days?.[day];
          if (!shiftCode) return;

          const info = shiftTypes[shiftCode];
          if (!info) return;

          // "Nachname, Vorname" zu "Vorname Nachname"
          const normalized = employeeRaw.replace(",", "").trim();

          const entry: Employee = {
            name: normalized,
            shift: shiftCode,
            time: info.time,
            info,
          };

          if (EARLY_SHIFT_CODES.includes(shiftCode as (typeof EARLY_SHIFT_CODES)[number])) early.push(entry);
          if (LATE_SHIFT_CODES.includes(shiftCode as (typeof LATE_SHIFT_CODES)[number])) late.push(entry);
          if (shiftCode === "N") night.push(entry);
        });

        return { early, late, night };
      },
      getEmployeesForTodayAll: () => {
        const schedule = get().getActiveSchedule();
        const today = new Date();
        const day = today.getDate();

        const out: Employee[] = [];

        Object.entries(schedule).forEach(([employeeRaw, days]) => {
          const shiftCode = days?.[day];
          if (!shiftCode) return;

          // keine Abwesenheit / Freischicht in Tagesliste
          if (shiftCode === "FS" || shiftCode === "ABW") return;

          const info = shiftTypes[shiftCode];
          if (!info) return;

          const normalized = employeeRaw.replace(",", "").trim();

          out.push({
            name: normalized,
            shift: shiftCode,
            time: info.time,
            info,
          });
        });

        // stabile Sortierung: Früh -> Spät -> Nacht -> DBS -> Rest
        const prio: Record<string, number> = { E1: 10, E2: 11, E1SA: 12, E1WE: 13, L1: 20, L2: 21, L1WE: 22, N: 30, DBS: 40 };
        return out.sort((a, b) => (prio[a.shift] ?? 99) - (prio[b.shift] ?? 99) || a.name.localeCompare(b.name));
      },

    }),
    {
      name: "shiftcontrol.shiftstore.v1",
      version: 1,

      // nur das persistieren, was wir brauchen
      partialize: (state) => ({
        months: state.months,
        selectedMonth: state.selectedMonth,
        schedulesByMonth: state.schedulesByMonth,
        daysInMonth: state.daysInMonth,
      }),
    }
  )
);
