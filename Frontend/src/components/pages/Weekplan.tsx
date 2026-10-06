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
import { getShiftColorStyle } from "../shiftplan/shiftColors";
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
  const [currentDate, setCurrentDate] = useState(new Date());

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
          className="inline-flex shrink-0 rounded border px-1 text-[10px] font-bold leading-[1.4]"
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

  const weekRangeLabel = `${weekdayAbbrev(weekDays[0])} ${weekDays[0].getDate()}.${pad2(weekDays[0].getMonth() + 1)}.${weekDays[0].getFullYear()} – ${weekdayAbbrev(weekDays[6])} ${weekDays[6].getDate()}.${pad2(weekDays[6].getMonth() + 1)}.${weekDays[6].getFullYear()}`;

  const navBtn =
    "inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-40";

  /* Popover content */
  const popEmployee = popover?.employee || "";
  const popDays = popover ? workingDates(popEmployee) : [];
  const popTargets = popover ? targetDates(popEmployee) : [];
  const popHasRole = popTargets.some((d) => getRole(popEmployee, d));
  const popAllNewcomer = popTargets.length > 0 && popTargets.every((d) => isNewcomer(popEmployee, d));

  return (
    <div
      className={`relative flex min-h-0 flex-col overflow-hidden ${isEmbedded ? "h-full" : "h-[calc(100vh-64px)]"}`}
      style={{ background: "#0b1220" }}
    >
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Calendar className="h-4 w-4 shrink-0 text-sky-400" />
          <h1 className="text-sm font-semibold text-white">{t("weekplan.title")}</h1>
          <span className="rounded bg-sky-400/10 px-2 py-0.5 text-[11px] font-bold text-sky-200">KW {weekNo}</span>
          <span className="hidden text-[11px] text-slate-400 sm:inline">{weekRangeLabel}</span>
          <span className="text-[11px] text-slate-500">
            {presentCount} {de ? "im Dienst" : "on duty"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className={navBtn} onClick={() => traverseWeek(-1)} aria-label={de ? "Vorherige Woche" : "Previous week"}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={navBtn} onClick={jumpToToday}>
            {t("weekplan.today")}
          </button>
          <button type="button" className={navBtn} onClick={() => traverseWeek(1)} aria-label={de ? "Nächste Woche" : "Next week"}>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={navBtn} onClick={() => void handleRefresh()} disabled={refreshing || loading} title="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <div className="shrink-0 px-4 pt-1">
        <ShiftplanUploadStatus />
      </div>

      {loadError ? (
        <div role="alert" className="mx-4 mt-2 flex shrink-0 items-center justify-between gap-3 rounded-md border border-red-500/35 bg-red-950/40 px-3 py-2 text-xs text-red-100">
          <span>{loadError}</span>
          <button type="button" onClick={() => void handleRefresh()} className="rounded border border-red-300/30 px-2 py-1 font-semibold hover:bg-red-500/15">
            {de ? "Erneut laden" : "Retry"}
          </button>
        </div>
      ) : null}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
        {canEdit ? (
          <p className="mb-2 text-[11px] text-slate-500">
            {de
              ? "Zeile anklicken, um Rolle oder Neueinsteiger zu setzen. Rollen gelten nur für diese KW."
              : "Click a row to set a role or newcomer. Roles only apply to this calendar week."}
          </p>
        ) : null}

        {loading && groups.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">{t("weekplan.loading")}</div>
        ) : null}

        {!loading && groups.length === 0 && !loadError ? (
          <div className="py-10 text-center text-xs text-slate-400">
            {de ? "Keine Mitarbeitenden mit Schicht in dieser Woche." : "No employees with a shift this week."}
          </div>
        ) : null}

        {groups.map((group) => (
          <section key={group.kind} className="mb-5">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: group.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: group.color }} />
              {group.label}
              <span className="font-normal text-slate-500">{group.employees.length}</span>
            </div>
            <table className="w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="w-[17%] py-1 pr-2 font-medium">{t("common.employee")}</th>
                  {weekDays.map((d, i) => {
                    const holiday = holidays[weekKeys[i]];
                    const isToday = weekKeys[i] === todayKey;
                    return (
                      <th
                        key={weekKeys[i]}
                        className={`px-1 py-1 text-center font-medium ${isToday ? "text-sky-300" : ""}`}
                        title={holiday ? `${t("weekplan.holiday")}: ${holiday}` : undefined}
                      >
                        {weekdayAbbrev(d)} {d.getDate()}.{pad2(d.getMonth() + 1)}.{holiday ? <span className="ml-0.5 text-rose-400">*</span> : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {group.employees.map((name) => {
                  const hasNewcomer = weekKeys.some((k) => isNewcomer(name, k));
                  return (
                    <tr
                      key={name}
                      className={`border-t border-white/5 transition-colors ${canEdit ? "cursor-pointer hover:bg-white/[0.04]" : ""} ${popover?.employee === name ? "bg-white/[0.06]" : ""}`}
                      data-weekplan-employee={name}
                      onClick={canEdit ? (e) => openPopover(name, e.currentTarget) : undefined}
                    >
                      <td className="py-1.5 pr-2 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium text-slate-100" title={name}>
                            {name}
                          </span>
                          {hasNewcomer ? (
                            <span className="shrink-0 rounded bg-fuchsia-500/15 px-1 text-[9px] font-bold text-fuchsia-200" title="Neueinsteiger">
                              NEU
                            </span>
                          ) : null}
                          {canEdit ? <Plus className="h-3 w-3 shrink-0 text-slate-600" aria-hidden /> : null}
                        </div>
                      </td>
                      {weekDays.map((d, i) => {
                        const key = weekKeys[i];
                        const code = getCode(name, d);
                        const role = getRole(name, key);
                        const comment = getRoleComment(name, key);
                        const newcomer = isNewcomer(name, key);
                        return (
                          <td key={key} className={`px-1 py-1.5 text-center align-middle ${key === todayKey ? "bg-sky-400/[0.05]" : ""}`}>
                            <div className="flex min-h-[22px] flex-col items-center justify-center gap-0.5">
                              {code ? (
                                <span
                                  className="inline-flex min-w-[26px] items-center justify-center rounded border px-1.5 text-[10px] font-bold leading-[1.5]"
                                  style={getShiftColorStyle(code)}
                                >
                                  {code}
                                </span>
                              ) : null}
                              {role ? renderRoleBadge(role, comment) : null}
                              {newcomer ? <span className="text-[9px] font-semibold text-fuchsia-300">NEU</span> : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
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
