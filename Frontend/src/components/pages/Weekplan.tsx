/* ------------------------------------------------ */
/* WEEKPLAN – PAGE (current KW)                      */
/* Compact view: only employees working this week,   */
/* grouped by main shift type (Früh / Spät / Nacht), */
/* sorted alphabetically by last name.               */
/* ------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Calendar, Plus, RefreshCw, UserPlus, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { fetchSchedule } from "../shiftplan/shiftplan.api";
import { ShiftplanUploadStatus } from "../shiftplan/ShiftplanUploadStatus";
import { ShiftTimeLegend } from "../shiftplan/ShiftTimeLegend";
import { buildShiftTimeMap, type ShiftTimeMap } from "../../utils/shiftTimes";
import { getShiftColorKind } from "../shiftplan/shiftColors";
import { formatMonthLabel } from "../../utils/dateFormat";
import { getGermanHolidaysNationwide } from "../../utils/deHolidays";
import { api } from "../../api/api";
import { useHiddenEmployees } from "../../hooks/useHiddenEmployees";
import {
  useWeekplanRoleStore,
  WEEKPLAN_ROLES,
  getRoleDef,
  getRoleVisualStyle,
  type WeekplanRoleKey,
} from "../../store/weekplanRoleStore";
import { getPlanningDate, usePlanningDateStore } from "../../store/planningDateStore";
import { useLanguage, getLanguageLocale } from "../../context/LanguageContext";

type Schedule = Record<string, Record<number, string>>;
type ShiftKind = "early" | "late" | "night";

const GROUPS: Array<{ kind: ShiftKind; color: string }> = [
  { kind: "early", color: "#fb923c" },
  { kind: "late", color: "#facc15" },
  { kind: "night", color: "#38bdf8" },
];

const PROJECT_MAX = 200;
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 470;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Real work shift: E1/E2/L1/L2/N and variants (HE/HL...). FS/ABW/K/U/DBS etc. do not count. */
function shiftKindOf(code: string): ShiftKind | null {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  if (/^(HE|E)(\d.*)?$/.test(c)) return "early";
  if (/^(HL|L)(\d.*)?$/.test(c)) return "late";
  if (/^N(K|\d.*)?$/.test(c)) return "night";
  return null;
}

/** Sort key by last name ("Nachname, Vorname" or "Vorname Nachname"). */
function nameSortKey(name: string) {
  const n = String(name || "").trim();
  if (n.includes(",")) {
    const [last, ...rest] = n.split(",");
    return `${last.trim()} ${rest.join(" ").trim()}`;
  }
  const parts = n.split(/\s+/);
  const last = parts.pop() || "";
  return `${last} ${parts.join(" ")}`.trim();
}

interface PopoverState {
  employee: string;
  x: number;
  y: number;
}

export default function Weekplan() {
  const { canWrite, user } = useAuth();
  const canEdit = user.isAdmin || canWrite("shiftplan");
  const { language, t } = useLanguage();
  const de = language === "de";
  const locale = getLanguageLocale(language) as "de-DE" | "en-US";
  const isEmbedded = new URLSearchParams(window.location.search).get("embed") === "1";

  const weekdayAbbrev = (date: Date) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date).replace(".", "");

  /* NAVIGATION STATE */
  // The shown week travels along between the planning views (see planningDateStore).
  const [currentDate, setCurrentDate] = useState(() => getPlanningDate());
  const setSharedPlanningDate = usePlanningDateStore((state) => state.setDate);
  useEffect(() => { setSharedPlanningDate(currentDate); }, [currentDate, setSharedPlanningDate]);

  const traverseWeek = (delta: number) => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + delta * 7);
    setCurrentDate(next);

    api
      .post("/activity/log", {
        action: "weekplan_navigate",
        module: "WEEKPLAN",
        details: { direction: delta > 0 ? "next" : "prev", targetDate: next.toISOString().split("T")[0] },
      })
      .catch(() => {});
  };

  const jumpToToday = () => setCurrentDate(new Date());

  const { weekNo } = isoWeek(currentDate);
  const weekStart = useMemo(() => startOfIsoWeek(currentDate), [currentDate]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart],
  );
  const weekKeys = useMemo(() => weekDays.map(dateKey), [weekDays]);
  const todayKey = dateKey(new Date());

  const monthLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const d of weekDays) labels.add(formatMonthLabel(d.getFullYear(), d.getMonth() + 1, locale));
    return Array.from(labels);
  }, [weekDays, locale]);

  const holidays = useMemo(() => {
    const combined: Record<string, string> = {};
    for (const y of new Set(weekDays.map((d) => d.getFullYear()))) {
      Object.assign(combined, getGermanHolidaysNationwide(y));
    }
    return combined;
  }, [weekDays]);

  /* DATA */
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [schedulesByMonth, setSchedulesByMonth] = useState<Record<string, Schedule>>({});

  const loadSchedules = useCallback(
    async (labels: string[], mode: "load" | "refresh" = "load") => {
      try {
        setLoadError("");
        if (mode === "refresh") setRefreshing(true);
        else setLoading(true);
        const entries = await Promise.all(
          labels.map(async (label) => {
            const data = await fetchSchedule(label);
            return [label, data?.schedule || {}] as const;
          }),
        );
        setSchedulesByMonth(Object.fromEntries(entries) as Record<string, Schedule>);
      } catch (e) {
        console.error("WEEKPLAN load error", e);
        setLoadError(de ? "Die Wochenplanung konnte nicht geladen werden." : "The weekly plan could not be loaded.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [de],
  );

  useEffect(() => {
    void loadSchedules(monthLabels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthLabels]);

  const { isHidden } = useHiddenEmployees();
  const { fetchRoles, getRole, getRoleComment, setRole, setBulkRoles, removeRole, removeRoles, isNewcomer, setNewcomerDates } =
    useWeekplanRoleStore();
  // (whole-store subscription above re-renders on roles/newcomers changes)

  useEffect(() => {
    void fetchRoles(weekKeys[0], weekKeys[6]);
  }, [weekKeys, fetchRoles]);

  const getCode = useCallback(
    (name: string, d: Date) => {
      const label = formatMonthLabel(d.getFullYear(), d.getMonth() + 1, locale);
      return String(schedulesByMonth?.[label]?.[name]?.[d.getDate()] || "").trim().toUpperCase();
    },
    [schedulesByMonth, locale],
  );

  /* Present employees, grouped by main shift type, sorted by last name */
  const groups = useMemo(() => {
    const names = new Set<string>();
    for (const sched of Object.values(schedulesByMonth || {})) Object.keys(sched || {}).forEach((n) => names.add(n));

    const byKind: Record<ShiftKind, string[]> = { early: [], late: [], night: [] };
    for (const name of names) {
      if (isHidden(name)) continue;
      const counts: Partial<Record<ShiftKind, number>> = {};
      const order: ShiftKind[] = [];
      for (const d of weekDays) {
        const kind = shiftKindOf(getCode(name, d));
        if (!kind) continue;
        if (!counts[kind]) order.push(kind);
        counts[kind] = (counts[kind] || 0) + 1;
      }
      if (order.length === 0) continue;
      let main = order[0];
      for (const k of order) if ((counts[k] || 0) > (counts[main] || 0)) main = k;
      byKind[main].push(name);
    }
    const collator = new Intl.Collator("de", { sensitivity: "base", numeric: true });
    return GROUPS.map((g) => ({
      ...g,
      label: g.kind === "early" ? (de ? "Früh" : "Early") : g.kind === "late" ? (de ? "Spät" : "Late") : de ? "Nacht" : "Night",
      employees: byKind[g.kind].sort((a, b) => collator.compare(nameSortKey(a), nameSortKey(b)) || collator.compare(a, b)),
    })).filter((g) => g.employees.length > 0);
  }, [schedulesByMonth, weekDays, getCode, isHidden, de]);

  const presentCount = groups.reduce((sum, g) => sum + g.employees.length, 0);

  const workingDates = useCallback(
    (name: string) => weekDays.filter((d) => shiftKindOf(getCode(name, d))).map(dateKey),
    [weekDays, getCode],
  );

  /* POPOVER */
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [formRole, setFormRole] = useState<string | null>(null);
  const [formProject, setFormProject] = useState("");
  const [scope, setScope] = useState<"day" | "week">("day");
  const [formDay, setFormDay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Close the popover when the week changes
  useEffect(() => {
    setPopover(null);
  }, [weekKeys]);

  const prefillFromDay = (name: string, day: string) => {
    const existing = getRole(name, day);
    setFormRole(existing && getRoleDef(existing) ? existing : null);
    setFormProject(existing === "projekt" ? getRoleComment(name, day) || "" : "");
  };

  const openPopover = (name: string, anchor: HTMLElement) => {
    if (!canEdit) return;
    const days = workingDates(name);
    if (days.length === 0) return;
    const defaultDay = days.includes(todayKey) ? todayKey : days[0];
    const rect = anchor.getBoundingClientRect();
    setScope("day");
    setFormDay(defaultDay);
    prefillFromDay(name, defaultDay);
    setError("");
    setPopover({
      employee: name,
      x: Math.max(8, Math.min(rect.left + 12, window.innerWidth - POPOVER_WIDTH - 8)),
      y: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - POPOVER_HEIGHT - 8)),
    });
  };

  const targetDates = (name: string) => (scope === "week" ? workingDates(name) : formDay ? [formDay] : []);

  const run = async (fn: () => Promise<void>, close = false) => {
    setSaving(true);
    setError("");
    try {
      await fn();
      if (close) setPopover(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || (de ? "Speichern fehlgeschlagen." : "Saving failed."));
    } finally {
      setSaving(false);
    }
  };

  const applyRole = (name: string) => {
    const dates = targetDates(name);
    if (!formRole || dates.length === 0) return;
    const comment = formRole === "projekt" ? formProject.trim().slice(0, PROJECT_MAX) || null : null;
    void run(async () => {
      if (dates.length === 1) await setRole(name, dates[0], formRole as WeekplanRoleKey, comment);
      else await setBulkRoles(name, dates, formRole as WeekplanRoleKey, comment);
    }, true);
  };

  const clearRole = (name: string) => {
    const dates = targetDates(name);
    if (dates.length === 0) return;
    void run(async () => {
      if (dates.length === 1) await removeRole(name, dates[0]);
      else await removeRoles(name, dates);
    }, true);
  };

  const toggleNewcomer = (name: string, value: boolean) => {
    const dates = targetDates(name);
    if (dates.length === 0) return;
    void run(() => setNewcomerDates(name, dates, value));
  };

  const handleRefresh = useCallback(async () => {
    await loadSchedules(monthLabels, "refresh");
    await fetchRoles(weekKeys[0], weekKeys[6]);
  }, [fetchRoles, loadSchedules, monthLabels, weekKeys]);

  /* RENDER HELPERS */
  const dayLabel = (key: string) => {
    const d = weekDays[weekKeys.indexOf(key)];
    return d ? `${weekdayAbbrev(d)} ${d.getDate()}.${pad2(d.getMonth() + 1)}.` : key;
  };

  const renderRoleBadge = (roleKey: string, comment?: string | null) => {
    const def = getRoleDef(roleKey);
    const visual = getRoleVisualStyle(roleKey);
    if (!def) {
      // legacy / unknown key: plain text badge
      return (
        <span className="inline-flex rounded border border-slate-600 px-1 text-[10px] font-semibold text-slate-400">
          {String(roleKey)}
        </span>
      );
    }
    return (
      <span className="inline-flex max-w-full items-center gap-1" title={comment ? `${def.label}: ${comment}` : def.shortText}>
        <span
          className="wk-role"
          style={visual ? { color: visual.accent, borderColor: visual.border, background: visual.badge } : undefined}
        >
          {def.label}
        </span>
        {roleKey === "projekt" && comment ? (
          <span className="max-w-[84px] truncate text-[10px] text-amber-100/80">{comment}</span>
        ) : null}
      </span>
    );
  };

  const weekRangeLabel = `${weekDays[0].getDate()}.${pad2(weekDays[0].getMonth() + 1)}. – ${weekDays[6].getDate()}.${pad2(weekDays[6].getMonth() + 1)}.${weekDays[6].getFullYear()}`;

  /* Popover content */
  const popEmployee = popover?.employee || "";
  const popDays = popover ? workingDates(popEmployee) : [];
  const popTargets = popover ? targetDates(popEmployee) : [];
  const popHasRole = popTargets.some((d) => getRole(popEmployee, d));
  const popAllNewcomer = popTargets.length > 0 && popTargets.every((d) => isNewcomer(popEmployee, d));

  /* Staffing per day and shift type (all employees), shown in the group rows */
  const dayCounts = useMemo(() => {
    const counts: Record<ShiftKind, number[]> = { early: Array(7).fill(0), late: Array(7).fill(0), night: Array(7).fill(0) };
    for (const group of groups) {
      for (const name of group.employees) {
        weekDays.forEach((d, i) => {
          const kind = shiftKindOf(getCode(name, d));
          if (kind) counts[kind][i] += 1;
        });
      }
    }
    return counts;
  }, [groups, weekDays, getCode]);

  const [shiftTimes, setShiftTimes] = useState<ShiftTimeMap>({});
  useEffect(() => {
    api.get("/shift-config/definitions")
      .then(({ data }) => setShiftTimes(buildShiftTimeMap(data?.definitions)))
      .catch(() => setShiftTimes({}));
  }, []);

  const groupLabel = (kind: ShiftKind) => (kind === "early" ? (de ? "Frühschicht" : "Early shift") : kind === "late" ? (de ? "Spätschicht" : "Late shift") : de ? "Nachtschicht" : "Night shift");

  return (
    <div className={`weekplan-v2 relative flex min-h-0 flex-col overflow-hidden ${isEmbedded ? "h-full" : "h-[calc(100vh-64px)]"}`}>
      {/* Header: what am I looking at, and how do I move */}
      <header className="wk-header">
        <div className="min-w-0">
          <div className="wk-eyebrow">{de ? "Wochenplan" : "Week plan"}</div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="wk-title">{de ? "Kalenderwoche" : "Week"} {weekNo}</h1>
            <span className="wk-range">{weekRangeLabel}</span>
            <span className="wk-count">{presentCount} {de ? "Mitarbeitende im Dienst" : "employees on duty"}</span>
          </div>
        </div>
        <div className="wk-actions">
          <div className="wk-seg" role="group" aria-label={de ? "Woche wechseln" : "Change week"}>
            <button type="button" onClick={() => traverseWeek(-1)} aria-label={de ? "Vorherige Woche" : "Previous week"}><ArrowLeft className="h-4 w-4" /></button>
            <button type="button" onClick={jumpToToday}>{t("weekplan.today")}</button>
            <button type="button" onClick={() => traverseWeek(1)} aria-label={de ? "Nächste Woche" : "Next week"}><ArrowRight className="h-4 w-4" /></button>
          </div>
          <button type="button" className="wk-icon-btn" onClick={() => void handleRefresh()} disabled={refreshing || loading} title={de ? "Aktualisieren" : "Refresh"} aria-label={de ? "Aktualisieren" : "Refresh"}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="wk-subbar">
        <ShiftTimeLegend shiftTimes={shiftTimes} compact />
        <ShiftplanUploadStatus />
      </div>

      {loadError ? (
        <div role="alert" className="mx-5 mt-3 flex shrink-0 items-center justify-between gap-3 rounded-md border border-red-500/35 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          <span>{loadError}</span>
          <button type="button" onClick={() => void handleRefresh()} className="rounded border border-red-300/30 px-2 py-1 font-semibold hover:bg-red-500/15">
            {de ? "Erneut laden" : "Retry"}
          </button>
        </div>
      ) : null}

      {/* Body */}
      <div className="wk-body">
        {loading && groups.length === 0 ? <div className="py-12 text-center text-sm text-slate-400">{t("weekplan.loading")}</div> : null}
        {!loading && groups.length === 0 && !loadError ? (
          <div className="py-12 text-center text-sm text-slate-400">{de ? "Keine Mitarbeitenden mit Schicht in dieser Woche." : "No employees with a shift this week."}</div>
        ) : null}

        {groups.length > 0 ? (
          <table className="wk-table">
            <colgroup>
              <col className="wk-col-name" />
              {weekDays.map((d, i) => <col key={weekKeys[i]} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="wk-th-name">{canEdit ? (de ? "Zeile anklicken: Rolle setzen" : "Click a row to set a role") : t("common.employee")}</th>
                {weekDays.map((d, i) => {
                  const key = weekKeys[i];
                  const holiday = holidays[key];
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = key === todayKey;
                  return (
                    <th key={key} className={`wk-th-day ${weekend ? "is-weekend" : ""} ${isToday ? "is-today" : ""}`} title={holiday ? `${t("weekplan.holiday")}: ${holiday}` : undefined}>
                      <span className="wk-dow">{weekdayAbbrev(d)}</span>
                      <span className="wk-date">{d.getDate()}.{pad2(d.getMonth() + 1)}.</span>
                      {holiday ? <span className="wk-holiday">{de ? "Feiertag" : "Holiday"}</span> : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.kind} className="wk-group" style={{ ["--kind" as string]: group.color }}>
                <tr className="wk-group-row">
                  <th scope="rowgroup" className="wk-group-name">
                    <span className="wk-dot" />
                    {groupLabel(group.kind)}
                    <span className="wk-group-total">{group.employees.length}</span>
                  </th>
                  {weekDays.map((d, i) => (
                    <td key={weekKeys[i]} className={`wk-group-count ${weekKeys[i] === todayKey ? "is-today" : ""}`} title={`${groupLabel(group.kind)}: ${dayCounts[group.kind][i]}`}>
                      {dayCounts[group.kind][i] || ""}
                    </td>
                  ))}
                </tr>
                {group.employees.map((name) => {
                  const hasNewcomer = weekKeys.some((k) => isNewcomer(name, k));
                  return (
                    <tr
                      key={name}
                      className={`wk-row ${canEdit ? "is-clickable" : ""} ${popover?.employee === name ? "is-open" : ""}`}
                      data-weekplan-employee={name}
                      onClick={canEdit ? (e) => openPopover(name, e.currentTarget) : undefined}
                    >
                      <th scope="row" className="wk-name">
                        <span className="truncate" title={name}>{name}</span>
                        {hasNewcomer ? <span className="wk-new" title={de ? "Neueinsteiger" : "Newcomer"}>NEU</span> : null}
                      </th>
                      {weekDays.map((d, i) => {
                        const key = weekKeys[i];
                        const code = getCode(name, d);
                        const role = getRole(name, key);
                        const comment = getRoleComment(name, key);
                        const newcomer = isNewcomer(name, key);
                        const weekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <td key={key} className={`wk-cell ${weekend ? "is-weekend" : ""} ${key === todayKey ? "is-today" : ""}`}>
                            {code ? (
                              <div className="wk-cell-inner">
                                <span className="wk-shift" data-kind={getShiftColorKind(code)}>{code}</span>
                                {role ? renderRoleBadge(role, comment) : null}
                                {newcomer && !hasNewcomer ? <span className="wk-new">NEU</span> : null}
                              </div>
                            ) : (
                              <span className="wk-free" aria-hidden="true">–</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        ) : null}
      </div>

      {/* Assignment popover */}
      {popover
        ? createPortal(
            <>
              <button
                type="button"
                aria-label={de ? "Schließen" : "Close"}
                className="fixed inset-0 z-[1398] cursor-default bg-transparent"
                onClick={() => setPopover(null)}
              />
              <div
                role="dialog"
                aria-label={`${de ? "Rolle für" : "Role for"} ${popEmployee}`}
                data-testid="weekplan-assign-popover"
                className="fixed z-[1399] rounded-lg border border-slate-600 bg-slate-950 p-3 text-slate-100 shadow-2xl"
                style={{ left: popover.x, top: popover.y, width: POPOVER_WIDTH }}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{popEmployee}</div>
                    <div className="text-[10px] text-slate-500">{de ? "Rollen gelten nur für diese KW" : "Roles only apply to this calendar week"}</div>
                  </div>
                  <button type="button" onClick={() => setPopover(null)} className="rounded p-1 text-slate-400 hover:bg-white/10" aria-label={de ? "Schließen" : "Close"}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Scope */}
                <div className="mb-3 space-y-1.5 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="wp-scope"
                      checked={scope === "day"}
                      onChange={() => {
                        setScope("day");
                        prefillFromDay(popEmployee, formDay);
                      }}
                    />
                    <span>{de ? "Nur dieser Tag" : "This day only"}</span>
                    <select
                      value={formDay}
                      disabled={scope !== "day"}
                      onChange={(e) => {
                        setFormDay(e.target.value);
                        prefillFromDay(popEmployee, e.target.value);
                      }}
                      className="ml-auto rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-xs disabled:opacity-40"
                    >
                      {popDays.map((k) => (
                        <option key={k} value={k}>
                          {dayLabel(k)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="wp-scope" checked={scope === "week"} onChange={() => setScope("week")} />
                    <span>{de ? "Alle Tage dieser Woche" : "All days this week"}</span>
                    <span className="ml-auto text-[10px] text-slate-500">
                      {popDays.length} {de ? "Diensttage" : "work days"}
                    </span>
                  </label>
                </div>

                {/* Roles */}
                <div className="mb-2 grid grid-cols-5 gap-1">
                  {WEEKPLAN_ROLES.map((role) => {
                    const visual = getRoleVisualStyle(role.key);
                    const active = formRole === role.key;
                    return (
                      <button
                        key={role.key}
                        type="button"
                        onClick={() => setFormRole(active ? null : role.key)}
                        title={role.shortText}
                        className="rounded border px-1 py-1 text-[11px] font-bold transition"
                        style={
                          active && visual
                            ? { color: visual.accent, borderColor: visual.accent, background: visual.badge }
                            : { color: "#cbd5e1", borderColor: "rgba(148,163,184,0.3)", background: "transparent" }
                        }
                      >
                        {role.label}
                      </button>
                    );
                  })}
                </div>

                {formRole === "projekt" ? (
                  <input
                    type="text"
                    value={formProject}
                    maxLength={PROJECT_MAX}
                    onChange={(e) => setFormProject(e.target.value)}
                    placeholder={de ? "Projekt" : "Project"}
                    aria-label={de ? "Projekt" : "Project"}
                    className="mb-2 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs placeholder:text-slate-500"
                  />
                ) : null}

                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    disabled={saving || !formRole || popTargets.length === 0}
                    onClick={() => applyRole(popEmployee)}
                    className="flex-1 rounded bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
                  >
                    {de ? "Rolle setzen" : "Set role"}
                  </button>
                  <button
                    type="button"
                    disabled={saving || !popHasRole}
                    onClick={() => clearRole(popEmployee)}
                    className="rounded border border-red-400/40 px-2 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                  >
                    {scope === "week" ? (de ? "Rolle entfernen (alle Tage)" : "Clear role (all days)") : de ? "Rolle entfernen" : "Clear role"}
                  </button>
                </div>

                {/* Newcomer (independent of role) */}
                <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                  <span className="flex items-center gap-1.5 text-xs">
                    <UserPlus className="h-3.5 w-3.5 text-fuchsia-300" />
                    Neueinsteiger
                  </span>
                  <button
                    type="button"
                    disabled={saving || popTargets.length === 0}
                    onClick={() => toggleNewcomer(popEmployee, !popAllNewcomer)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${
                      popAllNewcomer ? "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-100" : "border-slate-600 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {popAllNewcomer ? (de ? "Entfernen" : "Remove") : de ? "Markieren" : "Mark"}
                  </button>
                </div>

                {error ? (
                  <div role="alert" className="mt-2 rounded border border-red-500/40 bg-red-950/50 px-2 py-1 text-[11px] text-red-200">
                    {error}
                  </div>
                ) : null}
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
