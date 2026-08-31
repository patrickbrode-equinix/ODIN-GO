/* ------------------------------------------------ */
/* WEEKPLAN – PAGE (current KW)                      */
/* ------------------------------------------------ */

import { useEffect, useMemo, useState, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  BadgeCheck,
  Building2,
  Clock,
  Database,
  Eye,
  EyeOff,
  FolderKanban,
  PencilLine,
  RefreshCw,
  Route,
  Save,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Input } from "../ui/input";
import { useAuth } from "../../context/AuthContext";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";

import { fetchSchedule, importSchedule } from "../shiftplan/shiftplan.api";
import { formatMonthLabel } from "../../utils/dateFormat";
import { getGermanHolidaysNationwide } from "../../utils/deHolidays";
import { isColoEmployee, parseColoPool } from "../../utils/colo";
import { api } from "../../api/api";

import { useHiddenEmployees } from "../../hooks/useHiddenEmployees"; // [NEW] import
import { useWeekplanRoleStore, WEEKPLAN_ROLES, getRoleDef, getRoleVisualStyle } from "../../store/weekplanRoleStore";
import { useLanguage, getLanguageLocale } from "../../context/LanguageContext";
import { fetchAttendance, upsertAttendance, type AttendanceRecord } from "../../api/attendance";
import { useTheme } from "../ThemeProvider";

type Schedule = Record<string, Record<number, string>>;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { weekNo, weekYear: d.getUTCFullYear() };
}

function startOfIsoWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  // Monday as start
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function Weekplan() {
  const { canWrite, user } = useAuth();
  const canEdit = user.isAdmin || canWrite("shiftplan");
  const { language, t } = useLanguage();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const de = language === 'de';
  const locale = getLanguageLocale(language) as "de-DE" | "en-US";
  const isEmbedded = new URLSearchParams(window.location.search).get("embed") === "1";

  const weekdayAbbrev = (date: Date) => {
    const raw = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
    return raw.replace(".", "");
  };

  /* NAVIGATION STATE */
  const [currentDate, setCurrentDate] = useState(new Date());

  // Helper to jump weeks
  const traverseWeek = (delta: number) => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + (delta * 7));
    setCurrentDate(next);

    // Log navigation
    import("../../api/api").then(({ api }) => {
      api.post("/activity/log", {
        action: "weekplan_navigate",
        module: "WEEKPLAN",
        details: {
          direction: delta > 0 ? "next" : "prev",
          targetDate: next.toISOString().split("T")[0]
        }
      }).catch(() => { });
    });
  };

  const jumpToToday = () => {
    const now = new Date();
    setCurrentDate(now);
  };

  const { weekNo } = isoWeek(currentDate);

  const weekStart = useMemo(() => startOfIsoWeek(currentDate), [currentDate]);
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const monthLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const d of weekDays) {
      labels.add(formatMonthLabel(d.getFullYear(), d.getMonth() + 1, locale));
    }
    return Array.from(labels);
  }, [weekDays]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [dirtyMonths, setDirtyMonths] = useState<Set<string>>(new Set());
  const [schedulesByMonth, setSchedulesByMonth] = useState<Record<string, Schedule>>({});
  const [coloPool, setColoPool] = useState<string[]>([]);

  const [showActiveOnly, setShowActiveOnly] = useState(false);

  useEffect(() => {
    api.get("/app-settings").then(({ data }) => setColoPool(parseColoPool(data?.["shiftplan.colo_pool"]))).catch(() => setColoPool([]));
  }, []);

  // Employee highlight (click name to highlight row, click again or ESC to clear)
  const [highlightedEmployee, setHighlightedEmployee] = useState<string | null>(null);

  // Multi-day selection for role assignment (Shift+Click)
  const [selectedCells, setSelectedCells] = useState<{ employee: string; dayIndices: Set<number> } | null>(null);

  // Role store
  const { fetchRoles, getRole, getRoleComment, setRole, setBulkRoles, removeRole, updateComment } = useWeekplanRoleStore();

  // Edit dialog (set code)
  const EMPTY = "__EMPTY__";
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState<string>(EMPTY);
  const [editTarget, setEditTarget] = useState<null | { employeeName: string; date: Date; current: string }>(null);

  // Comment dialog for role annotations
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentValue, setCommentValue] = useState("");
  const [commentTarget, setCommentTarget] = useState<null | { employeeName: string; date: string; roleKey: string }>(null);
  const [roleScopeTarget, setRoleScopeTarget] = useState<null | { employeeName: string; dayIndex: number; roleKey: string }>(null);
  const [roleScopeDays, setRoleScopeDays] = useState<Set<number>>(new Set());
  const [roleProjectTitle, setRoleProjectTitle] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [roleMenuTarget, setRoleMenuTarget] = useState<null | {
    employeeName: string;
    dayIndex: number;
    date: string;
    assignedRole?: string;
    assignedComment?: string | null;
    x: number;
    y: number;
  }>(null);

  const openCommentDialog = useCallback((employeeName: string, dateStr: string, roleKey: string, currentComment?: string | null) => {
    setCommentTarget({ employeeName, date: dateStr, roleKey });
    setCommentValue(currentComment || "");
    setCommentOpen(true);
  }, []);

  const applyComment = useCallback(async () => {
    if (!commentTarget) return;
    await updateComment(commentTarget.employeeName, commentTarget.date, commentValue.trim());
    setCommentOpen(false);
  }, [commentTarget, commentValue, updateComment]);

  // ─── Attendance (Kommen/Gehen) ───
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({});
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceTarget, setAttendanceTarget] = useState<{ employeeName: string; date: string } | null>(null);
  const [attendanceArrival, setAttendanceArrival] = useState("");
  const [attendanceDeparture, setAttendanceDeparture] = useState("");
  const [attendanceNote, setAttendanceNote] = useState("");

  const attendanceKey = (emp: string, date: string) => `${emp}|${date}`;

  const loadAttendance = useCallback(async (from: string, to: string) => {
    try {
      const records = await fetchAttendance(from, to);
      const map: Record<string, AttendanceRecord> = {};
      for (const r of records) {
        map[attendanceKey(r.employee_name, r.date.split("T")[0])] = r;
      }
      setAttendanceMap(map);
    } catch { /* ignore */ }
  }, []);

  const openAttendanceDialog = useCallback((employeeName: string, dateStr: string) => {
    const existing = attendanceMap[attendanceKey(employeeName, dateStr)];
    setAttendanceTarget({ employeeName, date: dateStr });
    setAttendanceArrival(existing?.arrival_time?.substring(0, 5) || "");
    setAttendanceDeparture(existing?.departure_time?.substring(0, 5) || "");
    setAttendanceNote(existing?.note || "");
    setAttendanceOpen(true);
  }, [attendanceMap]);

  const applyAttendance = useCallback(async () => {
    if (!attendanceTarget) return;
    try {
      const result = await upsertAttendance({
        employee_name: attendanceTarget.employeeName,
        date: attendanceTarget.date,
        arrival_time: attendanceArrival || null,
        departure_time: attendanceDeparture || null,
        note: attendanceNote || null,
      });
      setAttendanceMap((prev) => ({
        ...prev,
        [attendanceKey(attendanceTarget.employeeName, attendanceTarget.date)]: result,
      }));
      setAttendanceOpen(false);
    } catch {
      alert(de ? "Speichern fehlgeschlagen" : "Save failed");
    }
  }, [attendanceTarget, attendanceArrival, attendanceDeparture, attendanceNote, de]);

  const holidays = useMemo(() => {
    // union of years (week can cross year)
    const years = new Set(weekDays.map((d) => d.getFullYear()));
    const combined: Record<string, string> = {};
    for (const y of years) {
      Object.assign(combined, getGermanHolidaysNationwide(y));
    }
    return combined;
  }, [weekDays]);

  const loadSchedules = useCallback(async (labels: string[], mode: "load" | "refresh" = "load") => {
    try {
      setLoadError("");
      if (mode === "refresh") {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const entries = await Promise.all(
        labels.map(async (label) => {
          const data = await fetchSchedule(label);
          return [label, data?.schedule || {}] as const;
        }),
      );
      const out = Object.fromEntries(entries) as Record<string, Schedule>;
      setSchedulesByMonth(out);
      setDirtyMonths(new Set());
    } catch (e) {
      console.error("WEEKPLAN load error", e);
      setLoadError(de ? "Die Wochenplanung konnte nicht geladen werden." : "The weekly plan could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedules(monthLabels);
  }, [loadSchedules, monthLabels]);

  const { isHidden } = useHiddenEmployees(); // [NEW] hook usage

  // Fetch weekplan roles for the current week range
  useEffect(() => {
    if (weekDays.length < 7) return;
    const from = dateKey(weekDays[0]);
    const to = dateKey(weekDays[6]);
    fetchRoles(from, to);
    loadAttendance(from, to);
  }, [weekDays, fetchRoles, loadAttendance]);

  // Helper to check if code is "working"
  const isWorkingShift = (code: string) => {
    if (!code) return false;
    const nonWorking = ["FS", "ABW", "OFF", "", "DBS"]; // DBS added per context? Requirement: FS, ABW, OFF, null, ""
    if (nonWorking.includes(code.toUpperCase())) return false;
    return true; // E1, E2, L1, N etc.
  };

  const allEmployees = useMemo(() => {
    const s = new Set<string>();
    // Collect all employees from loaded months
    for (const sched of Object.values(schedulesByMonth || {})) {
      Object.keys(sched || {}).forEach((n) => s.add(n));
    }

    return Array.from(s)
      .filter((n) => !isHidden(n))
      .sort();
  }, [schedulesByMonth, isHidden]);

  const activeEmployees = useMemo(() => {
    return allEmployees.filter((emp) => {
      return weekDays.some((d) => {
        const label = formatMonthLabel(d.getFullYear(), d.getMonth() + 1, locale);
        const day = d.getDate();
        const code = schedulesByMonth?.[label]?.[emp]?.[day] || "";
        return isWorkingShift(code);
      });
    });
  }, [allEmployees, weekDays, schedulesByMonth, locale]);

  const employees = useMemo(() => {
    if (!showActiveOnly) return allEmployees;
    if (activeEmployees.length > 0) return activeEmployees;
    return allEmployees;
  }, [activeEmployees, allEmployees, showActiveOnly]);

  const effectiveShowActiveOnly = showActiveOnly && activeEmployees.length > 0;

  const getMonthLabelForDate = (d: Date) => formatMonthLabel(d.getFullYear(), d.getMonth() + 1, locale);

  const getShift = (employeeName: string, d: Date) => {
    const label = getMonthLabelForDate(d);
    const day = d.getDate();
    return schedulesByMonth?.[label]?.[employeeName]?.[day] || "";
  };

  const setShift = (employeeName: string, d: Date, value: string) => {
    const label = getMonthLabelForDate(d);
    const day = d.getDate();
    setSchedulesByMonth((prev) => {
      const next = { ...(prev || {}) };
      const month = { ...(next[label] || {}) };
      const row = { ...(month[employeeName] || {}) };
      const v = String(value || "").trim().toUpperCase();
      if (!v || v === EMPTY) {
        delete row[day];
      } else {
        row[day] = v;
      }
      month[employeeName] = row;
      next[label] = month;
      return next;
    });
    setDirtyMonths((prev) => new Set([...(prev || new Set()), label]));
  };

  const openEditCell = (employeeName: string, d: Date) => {
    if (!canEdit) return;
    if (!isEditMode) return;
    const current = getShift(employeeName, d);
    setEditTarget({ employeeName, date: d, current });
    setEditValue(current ? current.toUpperCase() : EMPTY);
    setEditOpen(true);
  };

  const applyEdit = () => {
    if (!editTarget) return;
    setShift(editTarget.employeeName, editTarget.date, editValue);
    setEditOpen(false);
  };

  // ESC clears employee highlight + selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHighlightedEmployee(null);
        setSelectedCells(null);
        setRoleMenuTarget(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const saveChanges = async () => {
    if (!canEdit) return;
    if (dirtyMonths.size === 0) return;

    try {
      setLoading(true);
      for (const label of Array.from(dirtyMonths)) {
        await importSchedule(label, schedulesByMonth[label] || {});
      }
      setDirtyMonths(new Set());
    } catch (e) {
      console.error("WEEKPLAN save error", e);
      alert(t("weekplan.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const handleRefresh = useCallback(async () => {
    if (dirtyMonths.size > 0) return;
    await loadSchedules(monthLabels, "refresh");
    if (weekDays.length >= 7) {
      await fetchRoles(dateKey(weekDays[0]), dateKey(weekDays[6]));
    }
  }, [dirtyMonths.size, fetchRoles, loadSchedules, monthLabels, weekDays]);

  // Toggle cell selection (Shift+Click)
  const toggleCellSelect = useCallback((employeeName: string, dayIdx: number) => {
    setSelectedCells((prev) => {
      if (!prev || prev.employee !== employeeName) {
        // Start new selection for this employee
        return { employee: employeeName, dayIndices: new Set([dayIdx]) };
      }
      const next = new Set(prev.dayIndices);
      if (next.has(dayIdx)) {
        next.delete(dayIdx);
      } else {
        next.add(dayIdx);
      }
      // If empty, clear selection
      if (next.size === 0) return null;
      return { employee: employeeName, dayIndices: next };
    });
  }, []);

  // Apply role to selected cells or a single cell
  const applyRoleToSelection = useCallback(
    async (employeeName: string, dayIndices: number[], roleKey: string) => {
      const dates = dayIndices.map((i) => dateKey(weekDays[i]));
      if (dates.length === 1) {
        await setRole(employeeName, dates[0], roleKey as any);
      } else {
        await setBulkRoles(employeeName, dates, roleKey as any);
      }
      setSelectedCells(null);
    },
    [weekDays, setRole, setBulkRoles]
  );

  const openRoleScope = useCallback((employeeName: string, dayIndex: number, roleKey: string, currentComment?: string | null) => {
    setRoleMenuTarget(null);
    setRoleScopeTarget({ employeeName, dayIndex, roleKey });
    setRoleScopeDays(new Set([dayIndex]));
    setRoleProjectTitle(roleKey === "projekt" ? currentComment || "" : "");
    setRoleError("");
  }, [de]);

  const openRoleMenu = useCallback((
    event: ReactMouseEvent<HTMLElement>,
    employeeName: string,
    dayIndex: number,
    date: string,
    assignedRole?: string,
    assignedComment?: string | null,
  ) => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 288;
    const menuHeight = assignedRole ? 390 : 348;
    setRoleMenuTarget({
      employeeName,
      dayIndex,
      date,
      assignedRole,
      assignedComment,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  }, [canEdit]);

  const applyScopedRole = useCallback(async (scope: "day" | "week") => {
    if (!roleScopeTarget) return;
    const indices = scope === "day" ? [roleScopeTarget.dayIndex] : [...roleScopeDays].sort((a, b) => a - b);
    if (!indices.length) return;
    const dates = indices.map((index) => dateKey(weekDays[index]));
    const comment = roleScopeTarget.roleKey === "projekt" ? roleProjectTitle.trim() || null : null;
    setRoleSaving(true);
    setRoleError("");
    try {
      if (dates.length === 1) await setRole(roleScopeTarget.employeeName, dates[0], roleScopeTarget.roleKey as any, comment);
      else await setBulkRoles(roleScopeTarget.employeeName, dates, roleScopeTarget.roleKey as any, comment);
      setRoleScopeTarget(null);
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message;
      setRoleError(backendMessage || (de ? "Die Rolle konnte nicht gespeichert werden." : "The role could not be saved."));
    } finally {
      setRoleSaving(false);
    }
  }, [de, roleProjectTitle, roleScopeDays, roleScopeTarget, setBulkRoles, setRole, weekDays]);

  const roleIcon = (icon: string) => {
    const className = "h-3.5 w-3.5";
    if (icon === "route") return <Route className={className} />;
    if (icon === "tool") return <Wrench className={className} />;
    if (icon === "check") return <BadgeCheck className={className} />;
    if (icon === "folder") return <FolderKanban className={className} />;
    if (icon === "database") return <Database className={className} />;
    return <Building2 className={className} />;
  };

  // Remove role from a cell
  const removeRoleFromCell = useCallback(
    async (employeeName: string, dayIdx: number) => {
      const date = dateKey(weekDays[dayIdx]);
      await removeRole(employeeName, date);
      setSelectedCells(null);
    },
    [weekDays, removeRole]
  );

  // Remove role from multiple cells
  const removeRolesFromSelection = useCallback(
    async (employeeName: string, dayIndices: number[]) => {
      for (const idx of dayIndices) {
        const date = dateKey(weekDays[idx]);
        await removeRole(employeeName, date);
      }
      setSelectedCells(null);
    },
    [weekDays, removeRole]
  );

  // Check if a cell is selected
  const isCellSelected = useCallback(
    (employeeName: string, dayIdx: number) => {
      return selectedCells?.employee === employeeName && selectedCells.dayIndices.has(dayIdx);
    },
    [selectedCells]
  );

  // keyboard navigation (Shift + Arrows)
  const focusCell = (employeeIndex: number, dayIndex: number) => {
    const el = document.querySelector<HTMLElement>(
      `[data-week-emp-index="${employeeIndex}"][data-week-day-index="${dayIndex}"]`
    );
    el?.focus();
  };

  const weekRangeLabel = `${weekdayAbbrev(weekDays[0])} ${weekDays[0].getDate()}.${pad2(weekDays[0].getMonth() + 1)}.${weekDays[0].getFullYear()} – ${weekdayAbbrev(weekDays[6])} ${weekDays[6].getDate()}.${pad2(weekDays[6].getMonth() + 1)}.${weekDays[6].getFullYear()}`;
  const monthSummary = monthLabels.join(" · ");
  const hasPendingChanges = dirtyMonths.size > 0;
  const visibleEmployees = employees.length;
  const totalEmployees = allEmployees.length;

  const daySummaries = useMemo(() => {
    return weekDays.map((d) => {
      const key = dateKey(d);
      const activeCount = allEmployees.reduce((sum, employeeName) => {
        const label = formatMonthLabel(d.getFullYear(), d.getMonth() + 1, locale);
        const code = schedulesByMonth?.[label]?.[employeeName]?.[d.getDate()] || "";
        return sum + (isWorkingShift(code) ? 1 : 0);
      }, 0);

      return {
        key,
        shortLabel: weekdayAbbrev(d),
        dateLabel: `${d.getDate()}.${pad2(d.getMonth() + 1)}`,
        activeCount,
        holiday: holidays?.[key] || null,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      };
    });
  }, [allEmployees, holidays, locale, schedulesByMonth, weekDays]);

  const groupedWeekDays = useMemo(() => {
    const signedInKey = String(user.displayName || "").toLocaleLowerCase("de-DE").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean).sort().join(" ");
    const groups = [
      { key: "early", label: de ? "Früh" : "Early", color: "#fb923c" },
      { key: "late", label: de ? "Spät" : "Late", color: "#facc15" },
      { key: "night", label: de ? "Nacht" : "Night", color: "#38bdf8" },
      { key: "dbs", label: "DBS", color: "#e879f9" },
      { key: "special", label: de ? "Sonder" : "Special", color: "#a78bfa" },
    ];

    return weekDays.map((date) => {
      const label = formatMonthLabel(date.getFullYear(), date.getMonth() + 1, "de-DE");
      const byGroup = new Map(groups.map((group) => [group.key, [] as Array<{ name: string; code: string; own: boolean; dispatcher: boolean }> ]));

      for (const name of allEmployees) {
        const code = String(schedulesByMonth?.[label]?.[name]?.[date.getDate()] || "").trim().toUpperCase();
        if (!code || ["FS", "ABW", "OFF", "K", "U"].includes(code)) continue;
        const key = code.startsWith("E") || code.startsWith("HE")
          ? "early"
          : code.startsWith("L") || code.startsWith("HL")
          ? "late"
          : code === "N"
          ? "night"
          : code === "DBS"
          ? "dbs"
          : "special";
        const priorityIndex = dispatcherConfig.priorities.findIndex((entry) => isColoEmployee(name, [entry]));
        const dispatcher = dispatcherConfig.enabled && priorityIndex >= 0 && code.startsWith("E") && !allEmployees.some((otherName) => {
          const otherIndex = dispatcherConfig.priorities.findIndex((entry) => isColoEmployee(otherName, [entry]));
          return otherIndex >= 0 && otherIndex < priorityIndex && String(schedulesByMonth?.[label]?.[otherName]?.[date.getDate()] || "").toUpperCase().startsWith("E");
        });
        byGroup.get(key)?.push({ name, code, own: signedInKey === name.toLocaleLowerCase("de-DE").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean).sort().join(" "), dispatcher });
      }

      return { date, groups: groups.map((group) => ({ ...group, employees: byGroup.get(group.key) || [] })).filter((group) => group.employees.length > 0) };
    });
  }, [allEmployees, coloPool, de, dispatcherConfig, schedulesByMonth, user.displayName, weekDays]);

  // Dynamic sizing: compute row height so all employees fit without scrolling
  // Reserve ~120px for header, ~48px for table header row
  const fitMetrics = useMemo(() => {
    // Base sizes that scale with employee count to fit viewport
    const n = Math.max(visibleEmployees, 1);
    if (n >= 40) {
      return { nameFontSize: 10, headerDayFontSize: 9, headerDateFontSize: 10, codeFontSize: 9, roleFontSize: 8, rowPy: "1px", cellPx: "2px" };
    }
    if (n >= 30) {
      return { nameFontSize: 10.5, headerDayFontSize: 9.5, headerDateFontSize: 10.5, codeFontSize: 9.5, roleFontSize: 8.5, rowPy: "2px", cellPx: "3px" };
    }
    if (n >= 20) {
      return { nameFontSize: 11, headerDayFontSize: 10, headerDateFontSize: 11, codeFontSize: 10, roleFontSize: 9, rowPy: "3px", cellPx: "4px" };
    }
    return { nameFontSize: 12, headerDayFontSize: 10.5, headerDateFontSize: 11.5, codeFontSize: 10.5, roleFontSize: 9.5, rowPy: "4px", cellPx: "5px" };
  }, [visibleEmployees]);

  return (
    <div className={`weekplan-enterprise relative flex min-h-0 flex-col overflow-hidden ${isEmbedded ? "h-full" : "h-[calc(100vh-64px)]"}`} style={{ background: "#0b1220" }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <motion.div
          className="absolute rounded-full blur-[120px]"
          style={{ width: 520, height: 320, background: "radial-gradient(ellipse, rgba(56,189,248,0.08), transparent 70%)", top: "8%", left: "12%" }}
          animate={{ x: [0, 26, 0], y: [0, -18, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute rounded-full blur-[110px]"
          style={{ width: 420, height: 260, background: "radial-gradient(ellipse, rgba(59,130,246,0.06), transparent 70%)", top: "32%", right: "8%" }}
          animate={{ x: [0, -18, 0], y: [0, 16, 0] }}
          transition={{ duration: 24, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        />
        <motion.div
          className="absolute rounded-full blur-[130px]"
          style={{ width: 320, height: 210, background: "radial-gradient(ellipse, rgba(14,165,233,0.05), transparent 70%)", bottom: "10%", left: "38%" }}
          animate={{ x: [0, 18, 0], y: [0, -12, 0] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut", delay: 7 }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative shrink-0 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #010d28 0%, #020b1e 100%)",
          borderBottom: "1px solid rgba(56,189,248,0.18)",
          boxShadow: "0 1px 0 rgba(56,189,248,0.08), 0 4px 32px rgba(0,0,0,0.5)",
        }}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <radialGradient id="wpGridFade" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="white" stopOpacity="0.6" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <mask id="wpGridMask">
              <rect width="100%" height="100%" fill="url(#wpGridFade)" />
            </mask>
          </defs>
          <g mask="url(#wpGridMask)" opacity="0.07">
            {Array.from({ length: 28 }, (_, i) => (
              <line
                key={i}
                x1={`${(i / 27) * 100}%`}
                y1="0"
                x2={`${(i / 27) * 100}%`}
                y2="100%"
                stroke="#38bdf8"
                strokeWidth="0.5"
              />
            ))}
            {Array.from({ length: 5 }, (_, i) => (
              <line
                key={`h${i}`}
                x1="0"
                y1={`${((i + 1) / 6) * 100}%`}
                x2="100%"
                y2={`${((i + 1) / 6) * 100}%`}
                stroke="#38bdf8"
                strokeWidth="0.4"
              />
            ))}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 blur-[80px]"
            style={{ width: 520, height: 130, background: "radial-gradient(ellipse, rgba(56,189,248,0.22), transparent 70%)" }}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent 5%, rgba(56,189,248,0.5) 30%, rgba(56,189,248,0.9) 50%, rgba(56,189,248,0.5) 70%, transparent 95%)",
            boxShadow: "0 0 12px 2px rgba(56,189,248,0.3)",
          }}
        />

        <div className="relative px-3 py-2">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.06))",
                  border: "1px solid rgba(56,189,248,0.45)",
                  boxShadow: "0 0 32px rgba(56,189,248,0.35), inset 0 1px 0 rgba(56,189,248,0.4)",
                }}
              >
                <Calendar className="h-4 w-4" style={{ color: "#38bdf8", filter: "drop-shadow(0 0 6px #38bdf8)" }} />
              </div>
              <div className="min-w-0">
                <div className="text-[7px] font-black uppercase tracking-[0.55em]" style={{ color: "rgba(56,189,248,0.38)" }}>
                  Schichtplanung · ODIN
                </div>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
                  <h1
                    className="truncate text-[14px] font-black uppercase tracking-[0.2em] text-white"
                    style={{ textShadow: "0 0 40px rgba(56,189,248,0.7), 0 0 14px rgba(56,189,248,0.5), 0 0 4px rgba(56,189,248,0.4)" }}
                  >
                    {t("weekplan.title")}
                  </h1>
                  <span className="rounded-full border border-cyan-400/18 bg-cyan-400/10 px-2 py-0.5 text-[8px] font-black tracking-[0.18em] text-cyan-100">
                    KW {weekNo}
                  </span>
                  <span className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black tracking-[0.18em] text-emerald-100">
                    {visibleEmployees}/{totalEmployees} {de ? "Mitarbeiter" : "Employees"}
                  </span>
                  {hasPendingChanges ? (
                    <span className="rounded-full border border-amber-400/20 bg-amber-500/12 px-2 py-0.5 text-[8px] font-black tracking-[0.18em] text-amber-100">
                      {dirtyMonths.size} {de ? "offen" : "pending"}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
              <button
                type="button"
                onClick={() => traverseWeek(-1)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {de ? "Zurück" : "Back"}
              </button>
                <button
                  type="button"
                  onClick={jumpToToday}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/25"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  {t("weekplan.today")}
                </button>
                <button
                  type="button"
                  onClick={() => traverseWeek(1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10"
                >
                  {de ? "Weiter" : "Next"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-medium text-slate-200">
                  {weekRangeLabel}
                </div>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition ${effectiveShowActiveOnly ? "border-cyan-300/35 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
                  onClick={() => {
                    setShowActiveOnly(!showActiveOnly);
                    import("../../api/api").then(({ api }) => {
                      api.post("/activity/log", {
                        action: "weekplan_filter_nonworking",
                        module: "WEEKPLAN",
                        details: { active: !showActiveOnly }
                      }).catch(() => { });
                    });
                  }}
                >
                  {effectiveShowActiveOnly ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {effectiveShowActiveOnly ? t("weekplan.showActiveOnly") : (de ? "Alle Mitarbeitenden" : "All employees")}
                </button>

                {canEdit ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditMode((v) => !v)}
                      disabled={loading}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${isEditMode ? "border-indigo-300/35 bg-indigo-500/18 text-indigo-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      {isEditMode ? t("weekplan.editOn") : t("weekplan.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveChanges()}
                      disabled={loading || !hasPendingChanges}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/30 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {t("common.save")}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing || loading || hasPendingChanges}
                  className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all hover:bg-cyan-400/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: "#38bdf8", border: "1px solid rgba(56,189,248,0.22)" }}
                  title={hasPendingChanges ? (de ? "Bitte zuerst speichern" : "Please save first") : undefined}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? (de ? "Lädt..." : "Refreshing") : "Refresh"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="relative flex min-h-0 flex-1 flex-col px-3 pb-2">

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("weekplan.changeShift")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {editTarget ? (
                <>
                  <span className="font-semibold text-foreground">{editTarget.employeeName}</span> – {weekdayAbbrev(editTarget.date)} {editTarget.date.getDate()}.{pad2(editTarget.date.getMonth() + 1)}
                </>
              ) : null}
            </div>

            <Select value={editValue} onValueChange={setEditValue}>
              <SelectTrigger>
                <SelectValue placeholder={t("weekplan.selectShift")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY}>{t("weekplan.empty")}</SelectItem>
                <SelectItem value="E1">E1</SelectItem>
                <SelectItem value="E2">E2</SelectItem>
                <SelectItem value="L1">L1</SelectItem>
                <SelectItem value="L2">L2</SelectItem>
                <SelectItem value="N">N</SelectItem>
                <SelectItem value="FS">FS</SelectItem>
                <SelectItem value="ABW">ABW</SelectItem>
                <SelectItem value="DBS">DBS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={applyEdit}>{t("weekplan.apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* COMMENT DIALOG */}
      <Dialog open={commentOpen} onOpenChange={setCommentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{de ? 'Kommentar bearbeiten' : 'Edit Comment'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {commentTarget && (
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{commentTarget.employeeName}</span> — {commentTarget.roleKey}
              </div>
            )}
            <Input
              value={commentValue}
              onChange={(e) => setCommentValue(e.target.value)}
              maxLength={200}
              placeholder={de ? 'z.B. Projektname oder Buddy-Ziel...' : 'e.g. project name or buddy target...'}
            />
            <div className="text-[10px] text-muted-foreground text-right">{commentValue.length}/200</div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCommentOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={applyComment}>{t("weekplan.apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {roleMenuTarget ? createPortal(
        <>
          <button
            type="button"
            aria-label={de ? "Rollenmenü schließen" : "Close role menu"}
            className="fixed inset-0 z-[1398] cursor-default bg-transparent"
            onClick={() => setRoleMenuTarget(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setRoleMenuTarget(null);
            }}
          />
          <div
            role="menu"
            aria-label={`${de ? "Rolle für" : "Role for"} ${roleMenuTarget.employeeName}`}
            data-testid="weekplan-role-context-menu"
            className="fixed z-[1399] w-72 overflow-hidden rounded-xl border border-slate-600 bg-slate-950 text-slate-100 shadow-2xl"
            style={{ left: roleMenuTarget.x, top: roleMenuTarget.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <div className="border-b border-slate-700 bg-slate-900 px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                {de ? "Rolle zuweisen" : "Assign role"}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-white">{roleMenuTarget.employeeName}</div>
              <div className="text-[11px] text-slate-400">
                {weekdayAbbrev(weekDays[roleMenuTarget.dayIndex])} {weekDays[roleMenuTarget.dayIndex].toLocaleDateString(locale)}
              </div>
            </div>
            <div className="p-1.5">
              {WEEKPLAN_ROLES.map((role) => (
                <button
                  key={role.key}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-blue-600 focus:bg-blue-600 focus:outline-none"
                  onClick={() => openRoleScope(
                    roleMenuTarget.employeeName,
                    roleMenuTarget.dayIndex,
                    role.key,
                    role.key === "projekt" && roleMenuTarget.assignedRole === "projekt" ? roleMenuTarget.assignedComment : null,
                  )}
                >
                  <span className="inline-flex h-7 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-800 text-[10px] font-black text-slate-100">
                    {roleIcon(role.icon)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{role.label}</span>
                    <span className="block truncate text-[10px] text-slate-400 group-hover:text-blue-100">{role.shortText}</span>
                  </span>
                  {roleMenuTarget.assignedRole === role.key ? <BadgeCheck className="h-4 w-4 text-emerald-400" /> : null}
                </button>
              ))}
              {roleMenuTarget.assignedRole ? (
                <>
                  <div className="my-1 h-px bg-slate-700" />
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-red-300 transition hover:bg-red-950/70 focus:bg-red-950/70 focus:outline-none"
                    onClick={async () => {
                      const target = roleMenuTarget;
                      setRoleMenuTarget(null);
                      try {
                        await removeRole(target.employeeName, target.date);
                      } catch (error: any) {
                        alert(error?.response?.data?.message || (de ? "Die Rolle konnte nicht entfernt werden." : "The role could not be removed."));
                      }
                    }}
                  >
                    {de ? "Rolle entfernen" : "Remove role"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </>,
        document.body,
      ) : null}

      <Dialog open={Boolean(roleScopeTarget)} onOpenChange={(open) => { if (!open && !roleSaving) setRoleScopeTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rolle zuweisen</DialogTitle>
          </DialogHeader>
          {roleScopeTarget ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-sm">
                <span className="font-semibold text-slate-100">{roleScopeTarget.employeeName}</span>
                <span className="ml-2 text-slate-400">{getRoleDef(roleScopeTarget.roleKey)?.label}</span>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Rolle</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {WEEKPLAN_ROLES.map((role) => (
                    <button key={role.key} type="button" onClick={() => setRoleScopeTarget((current) => current ? { ...current, roleKey: role.key } : current)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${roleScopeTarget.roleKey === role.key ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"}`}>
                      {roleIcon(role.icon)}<span>{role.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {roleScopeTarget.roleKey === "projekt" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Projektbeschreibung</label>
                  <Input value={roleProjectTitle} onChange={(event) => setRoleProjectTitle(event.target.value)} placeholder="Kurze Projektbeschreibung" maxLength={200} />
                </div>
              ) : null}
              {roleError ? (
                <div role="alert" className="rounded-lg border border-red-500/50 bg-red-950/60 px-3 py-2 text-sm text-red-200">
                  {roleError}
                </div>
              ) : null}
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Tage für Mehrfachzuweisung</div>
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((date, index) => (
                    <button key={dateKey(date)} type="button" onClick={() => setRoleScopeDays((current) => {
                      const next = new Set(current);
                      if (next.has(index)) next.delete(index); else next.add(index);
                      return next;
                    })} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${roleScopeDays.has(index) ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-slate-900 text-slate-300"}`}>
                      {weekdayAbbrev(date)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRoleScopeTarget(null)} disabled={roleSaving}>Abbrechen</Button>
            <Button variant="outline" onClick={() => void applyScopedRole("day")} disabled={roleSaving}>{roleSaving ? "Speichert..." : "Nur dieser Tag"}</Button>
            <Button onClick={() => void applyScopedRole("week")} disabled={roleSaving || !roleScopeDays.size}>Ausgewählte Tage</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attendance (Kommen / Gehen) Dialog */}
      <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{de ? 'Kommen / Gehen' : 'Arrival / Departure'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {attendanceTarget && (
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{attendanceTarget.employeeName}</span> — {attendanceTarget.date}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{de ? 'Kommen' : 'Arrival'}</label>
                <Input
                  type="time"
                  value={attendanceArrival}
                  onChange={(e) => setAttendanceArrival(e.target.value)}
                  placeholder="08:00"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{de ? 'Gehen' : 'Departure'}</label>
                <Input
                  type="time"
                  value={attendanceDeparture}
                  onChange={(e) => setAttendanceDeparture(e.target.value)}
                  placeholder="16:30"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{de ? 'Notiz' : 'Note'}</label>
              <Input
                value={attendanceNote}
                onChange={(e) => setAttendanceNote(e.target.value)}
                maxLength={500}
                placeholder={de ? 'z.B. Arzttermin, früher gegangen...' : 'e.g. doctor appointment, left early...'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAttendanceOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={applyAttendance}>{de ? 'Speichern' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loadError ? (
        <div role="alert" className="mb-2 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-red-500/35 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          <span>{loadError}</span>
          <button type="button" onClick={() => void handleRefresh()} className="rounded-md border border-red-300/30 px-3 py-1.5 text-xs font-bold hover:bg-red-500/15">
            {de ? "Erneut laden" : "Retry"}
          </button>
        </div>
      ) : null}

      <div className="weekplan-grid grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto pb-3 sm:grid-cols-2 lg:grid-cols-7">
        {groupedWeekDays.map(({ date, groups }) => {
          const key = dateKey(date);
          const isToday = key === dateKey(new Date());
          return (
            <section key={key} className={`rounded-lg border p-2.5 ${isToday ? "border-blue-500 bg-blue-950/30" : "border-slate-700 bg-slate-950/70"}`}>
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{weekdayAbbrev(date)}</div>
                  <div className="text-lg font-black text-white">{date.getDate()}.{pad2(date.getMonth() + 1)}.</div>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">{groups.reduce((sum, group) => sum + group.employees.length, 0)}</span>
              </div>
              <div className="space-y-3">
                {groups.length === 0 ? (
                  <p className="text-xs text-slate-500">{de ? "Keine geplanten Dienste" : "No scheduled shifts"}</p>
                ) : groups.map((group) => (
                  <div key={group.key}>
                    <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: group.color }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: group.color }} />
                      {group.label} <span className="text-slate-500">{group.employees.length}</span>
                    </div>
                    <div className="space-y-1">
                      {group.employees.map((employee) => {
                        const dayIndex = weekDays.findIndex((item) => dateKey(item) === key);
                        const assignedRole = getRole(employee.name, key);
                        const roleComment = getRoleComment(employee.name, key);
                        const roleDef = assignedRole ? getRoleDef(assignedRole) : null;
                        const roleVisual = getRoleVisualStyle(assignedRole);
                        const row = <div
                          key={`${group.key}-${employee.name}`}
                          title={canEdit ? "Rechtsklick für Rollen oder Rolle anklicken" : undefined}
                          data-weekplan-employee={employee.name}
                          data-weekplan-date={key}
                          onContextMenu={canEdit ? (event) => openRoleMenu(event, employee.name, dayIndex, key, assignedRole, roleComment) : undefined}
                          className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs text-slate-200 transition-colors ${canEdit ? "cursor-context-menu" : ""} ${!roleVisual && employee.own ? "border-blue-400 bg-blue-500/15" : !roleVisual ? "border-slate-700/70 bg-slate-900/65" : ""}`}
                          style={roleVisual ? {
                            borderColor: roleVisual.border,
                            background: roleVisual.background,
                            boxShadow: `inset 3px 0 0 ${roleVisual.accent}`,
                          } : undefined}
                        >
                          <span className="min-w-0 flex-1 pr-2">
                            <span className="block truncate font-medium">
                              {employee.name}{employee.own ? ` · ${de ? "Du" : "You"}` : ""}
                              {isColoEmployee(employee.name, coloPool) ? <span className="ml-1.5 inline-flex rounded border border-cyan-400/40 bg-cyan-500/15 px-1 py-px text-[8px] font-black text-cyan-200">COLO</span> : null}
                              {employee.dispatcher ? <span className="ml-1.5 inline-flex rounded border border-pink-400/40 bg-pink-500/15 px-1 py-px text-[8px] font-black text-pink-200">DP</span> : null}
                            </span>
                            {(assignedRole === "projekt" || assignedRole === "colo") && roleComment ? (
                              <span className={`mt-0.5 block truncate text-[10px] leading-tight ${assignedRole === "colo" ? "text-cyan-100/80" : "text-amber-100/80"}`} title={roleComment}>
                                {roleComment}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {canEdit ? <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openRoleScope(employee.name, dayIndex, assignedRole || "dp", roleComment); }} className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-200 hover:border-blue-500 hover:bg-blue-600 hover:text-white">Rolle</button> : null}
                            {roleDef ? <span
                              title={roleDef.shortText}
                              className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold"
                              style={roleVisual ? { color: roleVisual.accent, borderColor: roleVisual.border, background: roleVisual.badge } : undefined}
                            >{roleIcon(roleDef.icon)}{roleDef.symbol}</span> : null}
                            <span className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] font-black" style={{ color: group.color }}>{employee.code}</span>
                          </span>
                        </div>;
                        return row;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Detail matrix remains available in the code for future editing enhancements. */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        className="hidden relative min-h-0 flex-1 flex-col overflow-hidden rounded-2xl"
        style={isLight ? {
          background: "#FFFFFF",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
        } : {
          background: "linear-gradient(180deg, rgba(7,14,34,0.97), rgba(3,8,22,0.99))",
          border: "1px solid rgba(56,189,248,0.14)",
          boxShadow: "0 0 0 1px rgba(56,189,248,0.06), 0 18px 60px rgba(2,6,23,0.5), inset 0 1px 0 rgba(56,189,248,0.08)",
        }}
      >
        {/* top glow line */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 10%, rgba(56,189,248,0.35) 40%, rgba(56,189,248,0.5) 50%, rgba(56,189,248,0.35) 60%, transparent 90%)" }}
        />

        {/* The table fills the entire container — no overflow/scroll */}
        <div className="flex h-full flex-col">
        <table className="w-full table-fixed border-collapse text-left" style={{ flex: "1 1 0%" }}>
          <thead>
            <tr className="border-b border-sky-400/15" style={{ background: isLight ? "rgba(248,249,252,1)" : "rgba(7,19,37,0.98)" }}>
              <th
                className="border-r border-sky-400/12 text-left font-black uppercase tracking-[0.22em] text-sky-100/80"
                style={{ width: "18%", padding: `6px 12px`, fontSize: fitMetrics.headerDayFontSize }}
              >
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-cyan-400/60" />
                  <span>{t("common.employee")}</span>
                  <span className="ml-1 text-[8px] font-medium text-cyan-400/40 tracking-wider">{de ? "Rolle" : "Role"}</span>
                </div>
              </th>
              {weekDays.map((d, idx) => {
                const key = dateKey(d);
                const holiday = holidays?.[key];
                const dow = d.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isToday = dateKey(new Date()) === key;
                const summary = daySummaries[idx];

                return (
                  <th
                    key={idx}
                    className={`border-r border-sky-400/8 text-center select-none transition-colors ${holiday ? "bg-rose-500/8" : ""} ${isWeekend && !holiday ? "bg-white/2" : ""} ${isToday ? "bg-cyan-400/8" : ""}`}
                    style={{ width: `${82 / 7}%`, padding: `6px 2px` }}
                    title={holiday ? `${t("weekplan.holiday")}: ${holiday}` : undefined}
                  >
                    <div className={`font-black tracking-[0.18em] uppercase ${isToday ? "text-cyan-300" : isWeekend ? "text-sky-200/80" : "text-slate-400"}`} style={{ fontSize: fitMetrics.headerDayFontSize }}>
                      {weekdayAbbrev(d)}
                    </div>
                    <div className="mt-0.5 flex items-center justify-center gap-0.5 font-semibold text-slate-100" style={{ fontSize: fitMetrics.headerDateFontSize }}>
                      {d.getDate()}.{pad2(d.getMonth() + 1)}.
                      {holiday && <span className="ml-0.5 text-red-400 drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]">✦</span>}
                    </div>
                    <div className="mt-0.5 flex justify-center">
                      <span
                        className={`rounded-full px-1.5 py-px font-black ${summary?.activeCount > 0 ? "text-emerald-300" : "text-slate-600"}`}
                        style={{ fontSize: fitMetrics.roleFontSize, background: summary?.activeCount > 0 ? "rgba(16,185,129,0.12)" : "transparent" }}
                      >
                        {summary?.activeCount || 0}
                      </span>
                    </div>
                    {isToday && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5" style={{ background: "linear-gradient(90deg, transparent, rgba(56,189,248,0.6), transparent)" }} />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="relative">
            {!loading && employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-14 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Calendar className="h-10 w-10 text-slate-600" />
                    <div className="text-sm font-semibold text-slate-300">{de ? "Keine Mitarbeitenden für diese Woche sichtbar" : "No employees visible for this week"}</div>
                    <div className="max-w-md text-xs text-slate-500">
                      {de ? "Prüfe den aktiven Filter oder lade den passenden Monatsplan für diese Kalenderwoche." : "Check the active filter or load the relevant monthly schedule for this calendar week."}
                    </div>
                  </div>
                </td>
              </tr>
            ) : null}
            {employees.map((name, empIdx) => {
              // Collect all unique roles for this employee in this week
              const weekRoles = weekDays.map((d) => getRole(name, dateKey(d))).filter(Boolean);
              const uniqueRoles = [...new Set(weekRoles)];

              return (
              <tr
                key={name}
                className={`group cursor-pointer transition-colors hover:bg-white/4 ${name === highlightedEmployee ? "bg-cyan-500/8" : ""}`}
                style={{ borderBottom: "1px solid rgba(56,189,248,0.06)" }}
              >
                <td
                  className={`border-r border-sky-400/8 transition-colors group-hover:bg-white/2 ${name === highlightedEmployee ? "bg-cyan-500/5" : ""}`}
                  style={{ padding: `${fitMetrics.rowPy} 10px` }}
                >
                  <button
                    className={`flex w-full items-center gap-2 text-left transition-colors ${name === highlightedEmployee ? "text-cyan-200" : "text-slate-100 group-hover:text-cyan-200"}`}
                    onClick={() => setHighlightedEmployee(prev => prev === name ? null : name)}
                    title={t("weekplan.highlightHint")}
                  >
                    {/* Compact avatar circle */}
                    <div
                      className="flex shrink-0 items-center justify-center rounded-full font-black"
                      style={{
                        width: 22, height: 22,
                        fontSize: fitMetrics.nameFontSize - 2,
                        background: name === highlightedEmployee
                          ? "linear-gradient(135deg, rgba(56,189,248,0.3), rgba(56,189,248,0.1))"
                          : "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
                        border: name === highlightedEmployee
                          ? "1px solid rgba(56,189,248,0.5)"
                          : "1px solid rgba(255,255,255,0.1)",
                        color: name === highlightedEmployee ? "#38bdf8" : "rgba(148,163,184,0.8)",
                      }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold leading-tight" style={{ fontSize: fitMetrics.nameFontSize }}>
                        {name}
                      </div>
                      {/* Show assigned roles as inline badges */}
                      {uniqueRoles.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-0.5">
                          {uniqueRoles.map((rk) => {
                            const rd = getRoleDef(rk!);
                            if (!rd) return null;
                            return (
                              <span
                                key={rk}
                                className={`inline-flex items-center rounded border px-1 py-px font-black ${rd.color}`}
                                style={{ fontSize: fitMetrics.roleFontSize, lineHeight: 1.1 }}
                                title={rd.label + (rd.shortText ? ` – ${rd.shortText}` : "")}
                              >
                                {rd.symbol}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </button>
                </td>

                {weekDays.map((d, dayIdx) => {
                  const code = getShift(name, d);
                  const cellDateStr = dateKey(d);
                  const cellRole = getRole(name, cellDateStr);
                  const cellRoleDef = cellRole ? getRoleDef(cellRole) : null;
                  const cellComment = getRoleComment(name, cellDateStr);
                  const isSelected = isCellSelected(name, dayIdx);
                  const isToday = dateKey(new Date()) === cellDateStr;

                  // Shift Badge Colors
                  let shiftBg = "transparent";
                  let shiftColor = "rgba(100,116,139,0.5)";
                  let shiftBorder = "rgba(255,255,255,0.06)";
                  if (code) {
                    const c = code.toUpperCase();
                    if (c.startsWith("E")) { shiftBg = "rgba(251,146,60,0.12)"; shiftColor = "#fb923c"; shiftBorder = "rgba(251,146,60,0.25)"; }
                    else if (c.startsWith("L")) { shiftBg = "rgba(250,204,21,0.10)"; shiftColor = "#facc15"; shiftBorder = "rgba(250,204,21,0.22)"; }
                    else if (c === "N") { shiftBg = "rgba(56,189,248,0.12)"; shiftColor = "#38bdf8"; shiftBorder = "rgba(56,189,248,0.25)"; }
                    else if (c === "FS") { shiftBg = "rgba(20,184,166,0.10)"; shiftColor = "#2dd4bf"; shiftBorder = "rgba(20,184,166,0.22)"; }
                    else if (c === "DBS") { shiftBg = "rgba(232,121,249,0.10)"; shiftColor = "#e879f9"; shiftBorder = "rgba(232,121,249,0.22)"; }
                    else if (c === "ABW" || c === "S" || c === "SEMINAR") { shiftBg = "rgba(168,85,247,0.10)"; shiftColor = "#a855f7"; shiftBorder = "rgba(168,85,247,0.22)"; }
                  }

                  const cellContent = (
                    <td
                      key={dayIdx}
                      tabIndex={canEdit ? 0 : -1}
                      data-week-emp-index={empIdx}
                      data-week-day-index={dayIdx}
                      className={`border-r border-sky-400/6 text-center transition-colors ${isEditMode ? "cursor-pointer hover:bg-cyan-500/8" : ""} ${isSelected ? "bg-cyan-400/12 ring-1 ring-inset ring-cyan-400/60" : ""} ${isToday && !isSelected ? "bg-cyan-400/4" : ""}`}
                      style={{ padding: `${fitMetrics.rowPy} ${fitMetrics.cellPx}` }}
                      onKeyDown={(e) => {
                        if (!canEdit) return;
                        if (!e.shiftKey) return;

                        const move = (nextEmp: number, nextDay: number) => {
                          e.preventDefault();
                          const boundedEmp = Math.max(0, Math.min(employees.length - 1, nextEmp));
                          const boundedDay = Math.max(0, Math.min(6, nextDay));
                          focusCell(boundedEmp, boundedDay);
                        };

                        switch (e.key) {
                          case "ArrowLeft":
                            move(empIdx, dayIdx - 1);
                            break;
                          case "ArrowRight":
                            move(empIdx, dayIdx + 1);
                            break;
                          case "ArrowUp":
                            move(empIdx - 1, dayIdx);
                            break;
                          case "ArrowDown":
                            move(empIdx + 1, dayIdx);
                            break;
                          default:
                            break;
                        }
                      }}
                      onClick={(e) => {
                        if (e.shiftKey && canEdit) {
                          e.preventDefault();
                          toggleCellSelect(name, dayIdx);
                          return;
                        }
                        openEditCell(name, d);
                      }}
                    >
                      <div className="flex flex-col items-center justify-center gap-px">
                        {code ? (
                          <span
                            className="inline-flex items-center justify-center rounded font-bold"
                            style={{
                              fontSize: fitMetrics.codeFontSize,
                              color: shiftColor,
                              background: shiftBg,
                              border: `1px solid ${shiftBorder}`,
                              padding: "1px 5px",
                              textShadow: `0 0 8px ${shiftColor}40`,
                              lineHeight: 1.4,
                            }}
                          >
                            {code}
                          </span>
                        ) : (
                          isEditMode ? <span className="text-slate-600" style={{ fontSize: fitMetrics.codeFontSize }}>—</span> : null
                        )}
                        {cellRoleDef && (
                          <span
                            className={`inline-flex items-center justify-center rounded border font-black ${cellRoleDef.color}`}
                            style={{ fontSize: fitMetrics.roleFontSize, padding: "0px 4px", lineHeight: 1.3 }}
                            title={cellComment || cellRoleDef.shortText || undefined}
                          >
                            {cellRoleDef.symbol}
                          </span>
                        )}
                        {(() => {
                          const att = attendanceMap[attendanceKey(name, cellDateStr)];
                          if (!att || (!att.arrival_time && !att.departure_time)) return null;
                          return (
                            <span
                              className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 border border-emerald-400/20 text-emerald-400 dark:text-emerald-300 px-1"
                              style={{ fontSize: "9px", lineHeight: 1.3 }}
                              title={`${att.arrival_time?.substring(0,5) || "?"} – ${att.departure_time?.substring(0,5) || "?"}`}
                            >
                              <Clock className="h-2.5 w-2.5" />
                              {att.arrival_time?.substring(0, 5) || "?"}-{att.departure_time?.substring(0, 5) || "?"}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                  );

                  // Wrap cell in ContextMenu for role assignment if user can edit
                  if (canEdit) {
                    const targetDayIndices = (isSelected && selectedCells?.employee === name)
                      ? Array.from(selectedCells.dayIndices)
                      : [dayIdx];

                    return (
                      <ContextMenu key={dayIdx}>
                        <ContextMenuTrigger asChild>
                          {cellContent}
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-56">
                          <ContextMenuLabel className="text-xs text-muted-foreground">
                            {targetDayIndices.length > 1
                              ? `${t("weekplan.roleFor")} ${name} (${targetDayIndices.length} ${t("weekplan.roleForDays")})`
                              : `${t("weekplan.roleFor")} ${name} – ${weekdayAbbrev(d)} ${d.getDate()}.${pad2(d.getMonth() + 1)}`}
                          </ContextMenuLabel>
                          <ContextMenuSeparator />
                          {WEEKPLAN_ROLES.map((r) => (
                            <ContextMenuItem
                              key={r.key}
                              onClick={() => applyRoleToSelection(name, targetDayIndices, r.key)}
                              className="flex items-center gap-2"
                            >
                              <span className={`inline-flex min-w-7 items-center justify-center rounded border px-1 py-px text-[9px] font-black ${r.color}`}>
                                {r.symbol}
                              </span>
                              <div className="flex flex-col">
                                <span className="font-medium">{r.label}</span>
                                <span className="text-[11px] text-muted-foreground">{r.shortText}</span>
                              </div>
                              {targetDayIndices.length === 1 && cellRole === r.key && (
                                <span className="ml-auto text-xs text-primary">✓</span>
                              )}
                            </ContextMenuItem>
                          ))}
                          {cellRole && targetDayIndices.length === 1 && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onClick={() => openCommentDialog(name, cellDateStr, cellRole, cellComment)}
                              >
                                {de ? 'Kommentar bearbeiten' : 'Edit Comment'}
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() => openAttendanceDialog(name, cellDateStr)}
                              >
                                <Clock className="h-3.5 w-3.5 mr-1.5" />
                                {de ? 'Kommen / Gehen' : 'Arrival / Departure'}
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() => removeRoleFromCell(name, dayIdx)}
                                className="text-red-400"
                              >
                                {t("weekplan.removeRole")}
                              </ContextMenuItem>
                            </>
                          )}
                          {!cellRole && targetDayIndices.length === 1 && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onClick={() => openAttendanceDialog(name, cellDateStr)}
                              >
                                <Clock className="h-3.5 w-3.5 mr-1.5" />
                                {de ? 'Kommen / Gehen' : 'Arrival / Departure'}
                              </ContextMenuItem>
                            </>
                          )}
                          {targetDayIndices.length > 1 && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onClick={() => removeRolesFromSelection(name, targetDayIndices)}
                                className="text-red-400"
                              >
                                {t("weekplan.removeRoles")} ({targetDayIndices.length} {t("weekplan.roleForDays")})
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  }

                  return cellContent;
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#020b1e]/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-xl border border-cyan-400/20 bg-[#071325] px-5 py-3">
              <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
              <span className="text-sm font-semibold text-slate-200">{t("weekplan.loading")}</span>
            </div>
          </div>
        ) : null}
      </motion.div>
    </div>
    </div>
  );
}
