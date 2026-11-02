/**
 * planningDateStore.ts
 *
 * The date the user looks at "travels along" through all planning views (shift plan, week plan,
 * drafts, generator): whoever opens another view finds the same month / week there. The value is kept
 * for the browser session (sessionStorage), so a reload does not lose it either.
 */

import { create } from "zustand";

const STORAGE_KEY = "odin-go.planningDate";

export interface PlanningDateState {
  /** Local calendar date as ISO text (YYYY-MM-DD). */
  date: string;
  setDate: (date: Date | string) => void;
  /** Month only (keeps the day when it exists in that month, otherwise the last day). */
  setMonth: (year: number, month: number) => void;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function readStored(): string {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (isIsoDate(stored)) return stored;
  } catch { /* session storage can be blocked */ }
  return toIsoDate(new Date());
}

function writeStored(date: string) {
  try { window.sessionStorage.setItem(STORAGE_KEY, date); } catch { /* ignore */ }
}

export const usePlanningDateStore = create<PlanningDateState>((set, get) => ({
  date: readStored(),
  setDate: (value) => {
    const next = typeof value === "string" ? value : toIsoDate(value);
    if (!isIsoDate(next) || next === get().date) return;
    writeStored(next);
    set({ date: next });
  },
  setMonth: (year, month) => {
    const current = new Date(`${get().date}T12:00:00`);
    if (current.getFullYear() === year && current.getMonth() + 1 === month) return;
    const lastDay = new Date(year, month, 0).getDate();
    const next = `${year}-${pad2(month)}-${pad2(Math.min(current.getDate(), lastDay))}`;
    writeStored(next);
    set({ date: next });
  },
}));

/** The shared date as Date object (local noon, so no daylight-saving edge cases). */
export function getPlanningDate(): Date {
  return new Date(`${usePlanningDateStore.getState().date}T12:00:00`);
}

/** Shared month as { year, month (1-12) }. */
export function getPlanningMonth(): { year: number; month: number } {
  const date = getPlanningDate();
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}
