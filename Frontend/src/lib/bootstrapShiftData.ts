/**
 * frontend/src/lib/bootstrapShiftData.ts
 *
 * Global bootstrap for shift/schedule data.
 * Called after login and on app-start when a token already exists.
 *
 * WHY THIS EXISTS:
 *   Dashboard and TV-Content read employees/shifts from useShiftStore.
 *   Previously the store was only populated when Shiftplan.tsx mounted,
 *   so Dashboard/TV showed empty data until the user clicked "Schichtplan".
 *
 * DESIGN:
 *   - fetchSchedule for the current calendar month only.
 *   - inFlight flag prevents concurrent duplicate calls.
 *   - Guard: if store already has non-empty data for this month → skip (idempotent).
 *   - force=true bypasses the guard (e.g. explicit refresh).
 *   - 401 errors are re-thrown so the caller can handle logout.
 *   - All other errors are swallowed (app remains stable, Dashboard shows empty-state).
 */

import { fetchSchedule } from "../components/shiftplan/shiftplan.api";
import { useShiftStore } from "../store/shiftStore";
import { formatMonthLabel } from "../utils/dateFormat";

/* Module-level flag – survives re-renders but resets across page refreshes */
let inFlight = false;

export async function bootstrapShiftData(force = false): Promise<void> {
  // Prevent concurrent calls
  if (inFlight) return;

  const now = new Date();
  const currentMonthLabel = formatMonthLabel(now.getFullYear(), now.getMonth() + 1, "de-DE");

  if (!force) {
    const store = useShiftStore.getState();
    const cached = store.schedulesByMonth?.[currentMonthLabel];
    if (cached && Object.keys(cached).length > 0) {
      // Ensure selectedMonth points at the current month so getActiveSchedule() works
      if (!store.selectedMonth) {
        useShiftStore.getState().setSelectedMonth(currentMonthLabel);
      }
      return;
    }
  }

  inFlight = true;
  try {
    const data = await fetchSchedule(currentMonthLabel);
    const sched =
      data && typeof data === "object" && data.schedule ? data.schedule : {};

    useShiftStore.getState().setSchedule(currentMonthLabel, sched);
    useShiftStore.getState().setSelectedMonth(currentMonthLabel);

    if (data?.meta?.year && data?.meta?.month) {
      const days = new Date(data.meta.year, data.meta.month, 0).getDate();
      useShiftStore.getState().setDaysInMonth(days);
    }

    console.info("[bootstrapShiftData] Schedule loaded for", currentMonthLabel, "–", Object.keys(sched).length, "employees");
  } catch (err: any) {
    // 401 → invalid token; re-throw so AuthContext can logout
    if (err?.response?.status === 401) {
      throw err;
    }
    // Any other error: log, keep app stable
    console.error("[bootstrapShiftData] Failed – app continues with empty shift data:", err);
  } finally {
    inFlight = false;
  }
}
