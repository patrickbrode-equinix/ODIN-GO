/**
 * frontend/src/hooks/useShiftplanActions.ts
 *
 * Encapsulates the CRUD data-fetching operations for shift plan management.
 * Called from Shiftplan.tsx; keeps the page component free of raw API calls.
 *
 * Design notes:
 * - loadSchedule accepts the formatted monthLabel string used throughout the app
 * - setSchedule is exposed so Shiftplan.tsx can apply optimistic UI updates inline
 * - No auto-load on mount — Shiftplan.tsx controls when loading triggers
 */

import { useCallback, useState } from "react";
import { fetchMonths } from "../components/shiftplan/shiftplan.api";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

export interface ScheduleData {
  schedule: Record<string, any>;
  meta: { year?: number; month?: number } | null;
}

export interface ShiftplanActionsState {
  /** Available months with data (string labels as returned by /api/schedules) */
  monthsWithData: string[];
  /** Reload the available months list */
  refreshMonths: () => Promise<void>;
}

/* ------------------------------------------------ */
/* HOOK                                             */
/* ------------------------------------------------ */

/**
 * useShiftplanActions
 *
 * Provides the month list (cell saving happens in Shiftplan.tsx).
 * Schedule state itself is managed by Shiftplan.tsx because it has many
 * intertwined side-effects (Zustand store, selection reset, dirty tracking).
 */
export function useShiftplanActions(): ShiftplanActionsState {
  const [monthsWithData, setMonthsWithData] = useState<string[]>([]);

  /* ---- Reload available months ---- */
  const refreshMonths = useCallback(async () => {
    try {
      const months = await fetchMonths();
      setMonthsWithData(Array.isArray(months) ? months : []);
    } catch (e) {
      console.error("[useShiftplanActions] fetchMonths failed", e);
    }
  }, []);

  return {
    monthsWithData,
    refreshMonths,
  };
}
