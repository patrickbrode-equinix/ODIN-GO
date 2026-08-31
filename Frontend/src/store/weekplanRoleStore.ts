/**
 * weekplanRoleStore.ts
 *
 * Zustand store for weekplan role assignments.
 * Central data source used by both Wochenplan and Dashboard.
 * Roles are persisted in the database via /api/weekplan-roles.
 */

import { create } from "zustand";
import { api } from "../api/api";

/* ---- Role definitions ---- */
export const WEEKPLAN_ROLES = [
  { key: "dp", label: "DP", symbol: "DP", icon: "route", shortText: "Dispatch Planning", color: "border-pink-400 bg-pink-500/20 text-pink-100" },
  { key: "sh", label: "SH", symbol: "SH", icon: "tool", shortText: "Smart Hands", color: "border-blue-400 bg-blue-500/20 text-blue-100" },
  { key: "cc", label: "CC", symbol: "CC", icon: "check", shortText: "Commit Compliance", color: "border-emerald-400 bg-emerald-500/20 text-emerald-100" },
  { key: "projekt", label: "Projekt", symbol: "PR", icon: "folder", shortText: "Projektarbeit", color: "border-amber-400 bg-amber-500/20 text-amber-100" },
  { key: "dbs_project", label: "DBS", symbol: "DBS", icon: "database", shortText: "DBS-Einsatz", color: "border-violet-400 bg-violet-500/20 text-violet-100" },
  { key: "colo", label: "COLO", symbol: "CO", icon: "building", shortText: "Colocation-Einsatz", color: "border-cyan-400 bg-cyan-500/20 text-cyan-100" },
] as const;

export type WeekplanRoleKey = typeof WEEKPLAN_ROLES[number]["key"];

export interface WeekplanRoleEntry {
  employee_name: string;
  date: string; // YYYY-MM-DD
  role_key: WeekplanRoleKey;
  comment?: string | null;
}

/** Lookup role definition by key */
export function getRoleDef(key: string) {
  return WEEKPLAN_ROLES.find((r) => r.key === key);
}

export function getRoleVisualStyle(key?: string) {
  const styles: Record<string, { accent: string; border: string; background: string; badge: string }> = {
    cc: { accent: "#34d399", border: "rgba(52,211,153,0.55)", background: "rgba(6,78,59,0.30)", badge: "rgba(5,150,105,0.28)" },
    sh: { accent: "#60a5fa", border: "rgba(96,165,250,0.55)", background: "rgba(30,64,175,0.26)", badge: "rgba(37,99,235,0.28)" },
    dbs_project: { accent: "#c084fc", border: "rgba(192,132,252,0.55)", background: "rgba(88,28,135,0.28)", badge: "rgba(147,51,234,0.28)" },
    dp: { accent: "#f472b6", border: "rgba(244,114,182,0.55)", background: "rgba(131,24,67,0.27)", badge: "rgba(219,39,119,0.26)" },
    projekt: { accent: "#fbbf24", border: "rgba(251,191,36,0.55)", background: "rgba(120,53,15,0.27)", badge: "rgba(217,119,6,0.27)" },
    colo: { accent: "#22d3ee", border: "rgba(34,211,238,0.50)", background: "rgba(14,116,144,0.23)", badge: "rgba(8,145,178,0.25)" },
  };
  return key ? styles[key] : undefined;
}

interface RoleValue {
  role_key: WeekplanRoleKey;
  comment?: string | null;
}

interface WeekplanRoleState {
  /** Map: "employeeName|YYYY-MM-DD" → { role_key, comment } */
  roles: Record<string, RoleValue>;
  /** Loading state */
  loading: boolean;

  /** Fetch roles for a date range */
  fetchRoles: (from: string, to: string) => Promise<void>;

  /** Fetch roles for today (used by Dashboard) */
  fetchTodayRoles: () => Promise<void>;

  /** Get role for employee on a specific date */
  getRole: (employeeName: string, date: string) => WeekplanRoleKey | undefined;

  /** Get comment for employee role on a specific date */
  getRoleComment: (employeeName: string, date: string) => string | null | undefined;

  /** Set role for employee on a specific date (persists to DB) */
  setRole: (employeeName: string, date: string, roleKey: WeekplanRoleKey, comment?: string | null) => Promise<void>;

  /** Set role for employee on multiple dates (persists to DB) */
  setBulkRoles: (employeeName: string, dates: string[], roleKey: WeekplanRoleKey, comment?: string | null) => Promise<void>;

  /** Update just the comment for an existing role assignment */
  updateComment: (employeeName: string, date: string, comment: string) => Promise<void>;

  /** Remove role for employee on a specific date */
  removeRole: (employeeName: string, date: string) => Promise<void>;
}

function makeKey(employeeName: string, date: string): string {
  return `${employeeName}|${date}`;
}

export const useWeekplanRoleStore = create<WeekplanRoleState>()((set, get) => ({
  roles: {},
  loading: false,

  fetchRoles: async (from: string, to: string) => {
    try {
      set({ loading: true });
      const res = await api.get("/weekplan-roles", { params: { from, to } });
      const rows: WeekplanRoleEntry[] = Array.isArray(res.data) ? res.data : [];
      const map: Record<string, RoleValue> = { ...get().roles };
      for (const r of rows) {
        const dateStr = typeof r.date === "string" ? r.date.split("T")[0] : r.date;
        map[makeKey(r.employee_name, dateStr)] = { role_key: r.role_key as WeekplanRoleKey, comment: r.comment };
      }
      set({ roles: map, loading: false });
    } catch (err) {
      console.error("[weekplanRoleStore] fetchRoles failed:", err);
      set({ loading: false });
    }
  },

  fetchTodayRoles: async () => {
    try {
      set({ loading: true });
      const res = await api.get("/weekplan-roles/today");
      const rows: WeekplanRoleEntry[] = Array.isArray(res.data) ? res.data : [];
      const map: Record<string, RoleValue> = { ...get().roles };
      for (const r of rows) {
        const dateStr = typeof r.date === "string" ? r.date.split("T")[0] : r.date;
        map[makeKey(r.employee_name, dateStr)] = { role_key: r.role_key as WeekplanRoleKey, comment: r.comment };
      }
      set({ roles: map, loading: false });
    } catch (err) {
      console.error("[weekplanRoleStore] fetchTodayRoles failed:", err);
      set({ loading: false });
    }
  },

  getRole: (employeeName: string, date: string) => {
    return get().roles[makeKey(employeeName, date)]?.role_key;
  },

  getRoleComment: (employeeName: string, date: string) => {
    return get().roles[makeKey(employeeName, date)]?.comment;
  },

  setRole: async (employeeName: string, date: string, roleKey: WeekplanRoleKey, comment?: string | null) => {
    const key = makeKey(employeeName, date);
    const previous = get().roles[key];

    // Optimistic update
    set((state) => ({
      roles: { ...state.roles, [key]: { role_key: roleKey, comment: comment ?? null } },
    }));

    try {
      await api.put("/weekplan-roles", {
        employee_name: employeeName,
        date,
        role_key: roleKey,
        comment: comment ?? null,
      });
    } catch (err) {
      console.error("[weekplanRoleStore] setRole failed:", err);
      // Revert on failure
      set((state) => {
        const next = { ...state.roles };
        if (previous) next[key] = previous;
        else delete next[key];
        return { roles: next };
      });
      throw err;
    }
  },

  updateComment: async (employeeName: string, date: string, comment: string) => {
    const existing = get().roles[makeKey(employeeName, date)];
    if (!existing) return;
    // Optimistic
    set((state) => ({
      roles: { ...state.roles, [makeKey(employeeName, date)]: { ...existing, comment } },
    }));
    try {
      await api.put("/weekplan-roles", {
        employee_name: employeeName,
        date,
        role_key: existing.role_key,
        comment,
      });
    } catch (err) {
      console.error("[weekplanRoleStore] updateComment failed:", err);
      set((state) => ({
        roles: { ...state.roles, [makeKey(employeeName, date)]: existing },
      }));
      throw err;
    }
  },

  setBulkRoles: async (employeeName: string, dates: string[], roleKey: WeekplanRoleKey, comment?: string | null) => {
    const previous = Object.fromEntries(
      dates.map((date) => [date, get().roles[makeKey(employeeName, date)]]),
    ) as Record<string, RoleValue | undefined>;

    // Optimistic update
    set((state) => {
      const next = { ...state.roles };
      for (const d of dates) {
        next[makeKey(employeeName, d)] = { role_key: roleKey, comment: comment ?? null };
      }
      return { roles: next };
    });

    try {
      await api.put("/weekplan-roles/bulk", {
        assignments: dates.map((d) => ({
          employee_name: employeeName,
          date: d,
          role_key: roleKey,
          comment: comment ?? null,
        })),
      });
    } catch (err) {
      console.error("[weekplanRoleStore] setBulkRoles failed:", err);
      // Revert on failure
      set((state) => {
        const next = { ...state.roles };
        for (const d of dates) {
          const key = makeKey(employeeName, d);
          if (previous[d]) next[key] = previous[d];
          else delete next[key];
        }
        return { roles: next };
      });
      throw err;
    }
  },

  removeRole: async (employeeName: string, date: string) => {
    const key = makeKey(employeeName, date);
    const prev = get().roles[key];

    // Optimistic update
    set((state) => {
      const next = { ...state.roles };
      delete next[key];
      return { roles: next };
    });

    try {
      await api.delete("/weekplan-roles", {
        data: { employee_name: employeeName, date },
      });
    } catch (err) {
      console.error("[weekplanRoleStore] removeRole failed:", err);
      // Revert on failure
      if (prev) {
        set((state) => ({
          roles: { ...state.roles, [key]: prev },
        }));
      }
      throw err;
    }
  },
}));
