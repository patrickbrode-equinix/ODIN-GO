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
import {
  fetchMonths,
  importSchedule,
} from "../components/shiftplan/shiftplan.api";
import { api } from "../api/api";

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
  /** Whether an import is in progress */
  importing: boolean;
  /** Reload the available months list */
  refreshMonths: () => Promise<void>;
  /**
   * Save a single shift cell to the backend.
   * Returns the axios response so callers can handle errors.
   */
  saveCell: (label: string, employee: string, day: number, code: string) => Promise<void>;
  /**
   * Import a full plan payload for a given label, then refresh the month list.
   */
  importPlan: (label: string, plan: Record<string, any>) => Promise<void>;
}

/* ------------------------------------------------ */
/* HOOK                                             */
/* ------------------------------------------------ */

/**
 * useShiftplanActions
 *
 * Provides data-mutating actions (save, import) and the month list.
 * Schedule state itself is managed by Shiftplan.tsx because it has many
 * intertwined side-effects (Zustand store, selection reset, dirty tracking).
 */
export function useShiftplanActions(): ShiftplanActionsState {
  const [monthsWithData, setMonthsWithData] = useState<string[]>([]);
  const [importing, setImporting]           = useState(false);

  /* ---- Reload available months ---- */
  const refreshMonths = useCallback(async () => {
    try {
      const months = await fetchMonths();
      setMonthsWithData(Array.isArray(months) ? months : []);
    } catch (e) {
      console.error("[useShiftplanActions] fetchMonths failed", e);
    }
  }, []);

  /* ---- Save single cell ---- */
  const saveCell = useCallback(async (
    label: string,
    employee: string,
    day: number,
    code: string,
  ) => {
    await api.put(`/schedules/${encodeURIComponent(label)}`, { employee, day, code });
  }, []);

  /* ---- Import full plan ---- */
  const importPlan = useCallback(async (
    label: string,
    plan: Record<string, any>,
  ) => {
    setImporting(true);
    try {
      await importSchedule(label, plan);
      await refreshMonths();
    } catch (e) {
      console.error("[useShiftplanActions] importPlan failed", e);
      throw e;   // let caller show toast
    } finally {
      setImporting(false);
    }
  }, [refreshMonths]);

  return {
    monthsWithData,
    importing,
    refreshMonths,
    saveCell,
    importPlan,
  };
}
