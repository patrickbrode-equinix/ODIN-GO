/* ─────────────────────────────────────────────────────────────────────────── */
/*  TAGESPLANUNG – Premium WOW daily shift command view  v2                    */
/* ─────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronRight,
  RefreshCw,
  Users,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { LANGUAGE_TO_LOCALE, useLanguage } from "../../context/LanguageContext";
import { fetchSchedule } from "../shiftplan/shiftplan.api";
import { formatMonthLabel } from "../../utils/dateFormat";
import { getRoleDef, getRoleVisualStyle, useWeekplanRoleStore } from "../../store/weekplanRoleStore";
import { isColoEmployee, parseColoPool } from "../../utils/colo";
import { api } from "../../api/api";
import { ShiftTimeLegend } from "../shiftplan/ShiftTimeLegend";
import { ShiftplanUploadStatus } from "../shiftplan/ShiftplanUploadStatus";
import { buildShiftTimeMap, type ShiftTimeMap } from "../../utils/shiftTimes";
import { isPanelVisible } from "../../hooks/usePanelVisible";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type ShiftCat   = "early" | "late" | "night" | "dbs" | "special";
type ShiftStatus = "active" | "upcoming" | "ended" | "unknown";

interface ParsedWindow {
  startMin: number;
  endMin: number;
  crossesMidnight?: boolean;
}

interface CategoryMeta {
  label:     string;
  hex:       string;
  bgGrad:    string;
  timeLabel: string;
  window:    ParsedWindow | null;
}

interface SubGroup {
  code:    string;
  label:   string;
  time:    string;
  window:  ParsedWindow | null;
}

interface EmployeeRow {
  name:      string;
  shiftCode: string;
  cat:       ShiftCat;
  roleKey?:  string;
  roleComment?: string | null;
  isNewcomer?: boolean;
  isColo?: boolean;
  isDispatcher?: boolean;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const SHIFT_CAT: Record<string, ShiftCat> = {
  E1: "early", E2: "early", E1SA: "early", E1WE: "early", E2SA: "early", E2WE: "early",
  HE1: "early", HE2: "early",
  L1: "late",  L2: "late",  L1WE: "late",
  HL1: "late", HL2: "late",
  N:  "night",
  DBS: "dbs",
};

const CAT_META: Record<ShiftCat, CategoryMeta> = {
  early: {
    label:     "FRÜHSCHICHT",
    hex:       "#fb923c",
    bgGrad:    "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(251,146,60,0.18) 0%, rgba(3,9,24,0.98) 65%)",
    timeLabel: "06:30 – 16:00",
    window:    { startMin: 6 * 60 + 30, endMin: 16 * 60 },
  },
  late: {
    label:     "SPÄTSCHICHT",
    hex:       "#facc15",
    bgGrad:    "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(250,204,21,0.17) 0%, rgba(3,9,24,0.98) 65%)",
    timeLabel: "13:00 – 22:00",
    window:    { startMin: 13 * 60, endMin: 22 * 60 },
  },
  night: {
    label:     "NACHTSCHICHT",
    hex:       "#38bdf8",
    bgGrad:    "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(56,189,248,0.17) 0%, rgba(3,9,24,0.98) 65%)",
    timeLabel: "21:15 – 06:45",
    window:    { startMin: 21 * 60 + 15, endMin: 6 * 60 + 45, crossesMidnight: true },
  },
  dbs: {
    label:     "DBS",
    hex:       "#e879f9",
    bgGrad:    "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(232,121,249,0.15) 0%, rgba(3,9,24,0.98) 65%)",
    timeLabel: "—",
    window:    null,
  },
  special: {
    label:     "SONDER",
    hex:       "#64748b",
    bgGrad:    "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(100,116,139,0.09) 0%, rgba(3,9,24,0.98) 65%)",
    timeLabel: "—",
    window:    null,
  },
};

const EARLY_SUB_GROUPS: SubGroup[] = [
  { code: "E1",  label: "E1",         time: "06:30 – 15:30", window: { startMin: 6 * 60 + 30, endMin: 15 * 60 + 30 } },
  { code: "E1SA",label: "E1 SA",      time: "06:30 – 15:30", window: { startMin: 6 * 60 + 30,  endMin: 15 * 60 + 30 } },
  { code: "E1WE",label: "E1 SA/SO",   time: "06:30 – 15:30", window: { startMin: 6 * 60 + 30,  endMin: 15 * 60 + 30 } },
  { code: "HE1", label: "Halbe Früh", time: "06:30 – 10:30", window: { startMin: 6 * 60 + 30,  endMin: 10 * 60 + 30 } },
  { code: "E2",  label: "E2",         time: "07:00 – 16:00", window: { startMin: 7 * 60,        endMin: 16 * 60 } },
  { code: "E2SA",label: "E2 SA",      time: "07:00 – 16:00", window: { startMin: 7 * 60,        endMin: 16 * 60 } },
  { code: "E2WE",label: "E2 SA/SO",   time: "07:00 – 16:00", window: { startMin: 7 * 60,        endMin: 16 * 60 } },
  { code: "HE2", label: "Halbe Früh", time: "07:00 – 11:00", window: { startMin: 7 * 60,        endMin: 11 * 60 } },
];

const LATE_SUB_GROUPS: SubGroup[] = [
  { code: "L1",   label: "L1",         time: "13:00 – 22:00", window: { startMin: 13 * 60,       endMin: 22 * 60 } },
  { code: "L1WE", label: "L1 SA/SO",   time: "13:00 – 22:00", window: { startMin: 13 * 60,       endMin: 22 * 60 } },
  { code: "HL1",  label: "Halbe Spät", time: "13:00 – 17:00", window: { startMin: 13 * 60,       endMin: 17 * 60 } },
  { code: "L2",   label: "L2",         time: "15:00 – 00:00", window: { startMin: 15 * 60,       endMin: 24 * 60 } },
  { code: "HL2",  label: "Halbe Spät", time: "15:00 – 19:00", window: { startMin: 15 * 60,       endMin: 19 * 60 } },
];

const SHIFT_SUB_GROUPS: Partial<Record<ShiftCat, SubGroup[]>> = {
  early: EARLY_SUB_GROUPS,
  late:  LATE_SUB_GROUPS,
};

const CAT_ORDER: ShiftCat[] = ["early", "late", "night", "dbs", "special"];

const NIGHT_SHIFT_END_MINUTES = 6 * 60 + 45;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function normName(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[,.\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function resolveNightSourceDate(date: Date): Date {
  const source = new Date(date);
  const minutesSinceMidnight = source.getHours() * 60 + source.getMinutes();

  // The Monday morning night team belongs to the Sunday shift from the
  // previous planning week and remains active through 06:45.
  if (source.getDay() === 1 && minutesSinceMidnight < NIGHT_SHIFT_END_MINUTES) {
    source.setDate(source.getDate() - 1);
  }
  return source;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fmtMs(ms: number): string {
  const totalMin = Math.floor(Math.abs(ms) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function computeStatus(
  window: ParsedWindow | null,
  nowMs: number
): { status: ShiftStatus; remainingMs: number; elapsedMs: number; totalMs: number } {
  if (!window) return { status: "unknown", remainingMs: 0, elapsedMs: 0, totalMs: 0 };

  const date = new Date(nowMs);
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const nowMin = (nowMs - midnight) / 60_000;
  const { startMin, endMin, crossesMidnight } = window;

  if (crossesMidnight) {
    const durationMin = (24 * 60 - startMin) + endMin;
    const totalMs = durationMin * 60_000;
    if (nowMin >= startMin) {
      const elapsed = (nowMin - startMin) * 60_000;
      return { status: "active", elapsedMs: elapsed, remainingMs: totalMs - elapsed, totalMs };
    }
    if (nowMin <= endMin) {
      const elapsed = (24 * 60 - startMin + nowMin) * 60_000;
      return { status: "active", elapsedMs: elapsed, remainingMs: (endMin - nowMin) * 60_000, totalMs };
    }
    return { status: "upcoming", remainingMs: (startMin - nowMin) * 60_000, elapsedMs: 0, totalMs };
  }

  const durationMin = endMin - startMin;
  const totalMs = durationMin * 60_000;
  if (nowMin < startMin) return { status: "upcoming", remainingMs: (startMin - nowMin) * 60_000, elapsedMs: 0, totalMs };
  if (nowMin > endMin)   return { status: "ended",    remainingMs: 0, elapsedMs: totalMs, totalMs };
  const elapsed = (nowMin - startMin) * 60_000;
  return { status: "active", remainingMs: totalMs - elapsed, elapsedMs: elapsed, totalMs };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function getCategoryLabel(cat: ShiftCat, isGerman: boolean): string {
  const labels: Record<ShiftCat, { de: string; en: string }> = {
    early: { de: "FRUHSHICHT", en: "EARLY SHIFT" },
    late: { de: "SPATSCHICHT", en: "LATE SHIFT" },
    night: { de: "NACHTSCHICHT", en: "NIGHT SHIFT" },
    dbs: { de: "DBS", en: "DBS" },
    special: { de: "SONDER", en: "SPECIAL" },
  };

  return isGerman ? labels[cat].de : labels[cat].en;
}

function getSubGroupLabel(label: string, isGerman: boolean): string {
  if (label === "Halbe Früh") return isGerman ? "Halbe Früh" : "Half early";
  if (label === "Halbe Spät") return isGerman ? "Halbe Spät" : "Half late";
  return label;
}

function getSubGroupBadgeLabel(label: string): string {
  return label.replace("Halbe Früh", "½F").replace("Halbe Spät", "½S");
}

function getShiftStatusLabel(status: ShiftStatus, remainingMs: number, isGerman: boolean): string | null {
  if (status === "active") return isGerman ? `Läuft noch ${fmtMs(remainingMs)}` : `Runs for another ${fmtMs(remainingMs)}`;
  if (status === "upcoming") return isGerman ? `Beginnt in ${fmtMs(remainingMs)}` : `Starts in ${fmtMs(remainingMs)}`;
  if (status === "ended") return isGerman ? "Beendet" : "Ended";
  return null;
}

function getBandStateLabel(status: ShiftStatus, isGerman: boolean): string {
  if (status === "active") return isGerman ? "AKTIV" : "ACTIVE";
  if (status === "upcoming") return isGerman ? "DEMNACHST" : "UPCOMING";
  return isGerman ? "BEENDET" : "ENDED";
}

/* ── Role chip ──────────────────────────────────────────────────────────────── */

function RoleChip({ roleKey, comment }: { roleKey: string; comment?: string | null }) {
  const def = getRoleDef(roleKey);
  const visual = getRoleVisualStyle(roleKey);
  const label = def?.label ?? roleKey;
  const text = (comment ?? "").trim();
  const showText = roleKey === "projekt" && text.length > 0;
  return (
    <span
      title={showText ? `${label}: ${text}` : label}
      className="dp-chip"
      style={visual ? { color: visual.accent, background: visual.badge, borderColor: visual.border } : undefined}
    >
      {label}
      {showText ? <span className="dp-chip-text">{text}</span> : null}
    </span>
  );
}

/* ── One person ─────────────────────────────────────────────────────────────── */

function PersonRow({ employee }: { employee: EmployeeRow }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isGerman = language === "de";
  const isOwnShift = Boolean(user.displayName) && normName(employee.name) === normName(user.displayName);
  return (
    <li className={`dp-person ${isOwnShift ? "is-own" : ""}`}>
      <span className="dp-name">{employee.name}</span>
      <span className="dp-person-tags">
        {isOwnShift ? <span className="dp-chip dp-chip-own">{isGerman ? "Du" : "You"}</span> : null}
        {employee.isDispatcher ? <span className="dp-chip dp-chip-dp" title="Dispatcher">DP</span> : null}
        {employee.roleKey ? <RoleChip roleKey={employee.roleKey} comment={employee.roleComment} /> : null}
        {employee.isNewcomer ? <span className="dp-chip dp-chip-new">{isGerman ? "Neu" : "New"}</span> : null}
        <span className="dp-code">{employee.shiftCode}</span>
      </span>
    </li>
  );
}

/* ── Sub group (E1 / E2 / L1 ...) ───────────────────────────────────────────── */

function SubGroupSection({ subGroup, employees, now }: { subGroup: SubGroup; employees: EmployeeRow[]; now: number }) {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const { status, remainingMs } = computeStatus(subGroup.window, now);
  const statusStr = getShiftStatusLabel(status, remainingMs, isGerman);
  if (employees.length === 0) return null;
  return (
    <div className="dp-sub">
      <div className="dp-sub-head">
        <span className="dp-sub-title">{getSubGroupLabel(subGroup.label, isGerman)}</span>
        <span className="dp-sub-time">{subGroup.time}</span>
        <span className="dp-sub-count">{employees.length}</span>
        {statusStr && status === "active" ? <span className="dp-sub-status">{statusStr}</span> : null}
      </div>
      <ul className="dp-list">{employees.map((emp) => <PersonRow key={emp.name} employee={emp} />)}</ul>
    </div>
  );
}

/* ── Shift panel (Früh / Spät / Nacht / DBS) ────────────────────────────────── */

function ShiftBand({ cat, employees, now, nightCarryover }: { cat: ShiftCat; employees: EmployeeRow[]; now: number; nightCarryover: boolean }) {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const meta = CAT_META[cat];
  const { status, remainingMs, elapsedMs, totalMs } = computeStatus(meta.window, now);
  const progress = totalMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;
  const statusLabel = getShiftStatusLabel(status, remainingMs, isGerman);
  const catSubGroups = SHIFT_SUB_GROUPS[cat] ?? null;
  const activeSubGroups = useMemo(() => {
    if (!catSubGroups) return [];
    return catSubGroups
      .map((subGroup) => ({ subGroup, employees: employees.filter((e) => e.shiftCode === subGroup.code) }))
      .filter(({ employees: list }) => list.length > 0);
  }, [catSubGroups, employees]);

  return (
    <section className={`dp-panel is-${status}`} style={{ ["--kind" as string]: meta.hex }}>
      <header className="dp-panel-head">
        <div className="dp-panel-title">
          <span className="dp-dot" />
          <h2>{getCategoryLabel(cat, isGerman)}</h2>
          <span className="dp-panel-count">{employees.length}</span>
        </div>
        <div className="dp-panel-meta">
          <span className="dp-time">{meta.timeLabel}</span>
          {statusLabel ? <span className={`dp-status is-${status}`}>{statusLabel}</span> : null}
          {cat === "night" && nightCarryover ? <span className="dp-status">{isGerman ? "Nacht von gestern" : "Night from yesterday"}</span> : null}
        </div>
        {status === "active" ? <div className="dp-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div> : null}
      </header>
      <div className="dp-panel-body">
        {activeSubGroups.length > 0 ? (
          activeSubGroups.map(({ subGroup, employees: list }) => <SubGroupSection key={subGroup.code} subGroup={subGroup} employees={list} now={now} />)
        ) : (
          <ul className="dp-list">{employees.map((emp) => <PersonRow key={emp.name} employee={emp} />)}</ul>
        )}
      </div>
    </section>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */

export default function TagesplanungPage() {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const locale = LANGUAGE_TO_LOCALE[language];
  const isEmbedded = new URLSearchParams(window.location.search).get("embed") === "1";
  const [now, setNow]           = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [schedule, setSchedule] = useState<Record<string, Record<number, string>>>({});
  const [previousMonthSchedule, setPreviousMonthSchedule] = useState<Record<string, Record<number, string>>>({});
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");
  const [shiftTimes, setShiftTimes] = useState<ShiftTimeMap>({});
  const [coloPool, setColoPool] = useState<string[]>([]);
  const [dispatcherConfig, setDispatcherConfig] = useState<{ enabled: boolean; priorities: string[] }>({ enabled: true, priorities: [] });
  const fetchRoles = useWeekplanRoleStore((s) => s.fetchRoles);
  // Subscribe to the whole store state so role/newcomer updates recompute the lists.
  const roleStore = useWeekplanRoleStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.get("/app-settings").then(({ data }) => {
      setColoPool(parseColoPool(data?.["shiftplan.colo_pool"]));
      setDispatcherConfig({ enabled: false, priorities: [] });
    }).catch(() => { setColoPool([]); setDispatcherConfig({ enabled: true, priorities: [] }); });
  }, []);

  useEffect(() => {
    api.get("/shift-config/definitions")
      .then(({ data }) => setShiftTimes(buildShiftTimeMap(data?.definitions)))
      .catch(() => setShiftTimes({}));
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => { if (isPanelVisible()) setNow(Date.now()); }, 1_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const today = useMemo(() => new Date(now), [now]);
  const nightSourceDate = useMemo(() => resolveNightSourceDate(today), [today]);
  const scheduleMonth = useMemo(
    () => formatMonthLabel(today.getFullYear(), today.getMonth() + 1, "de-DE"),
    [today],
  );
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const nightSourceKey = useMemo(() => toDateKey(nightSourceDate), [nightSourceDate]);
  const nightSourceMonth = useMemo(
    () => formatMonthLabel(nightSourceDate.getFullYear(), nightSourceDate.getMonth() + 1, "de-DE"),
    [nightSourceDate],
  );
  const nightCarryover = nightSourceKey !== todayKey;
  const needsPreviousMonthSchedule = nightSourceMonth !== scheduleMonth;

  const loadTodaySchedule = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError("");
    try {
      const data = await fetchSchedule(scheduleMonth);
      const previousData = needsPreviousMonthSchedule
        ? await fetchSchedule(nightSourceMonth)
        : null;
      setSchedule(data?.schedule || {});
      setPreviousMonthSchedule(previousData?.schedule || {});
    } catch (error) {
      console.error("DAILY PLAN schedule load failed", error);
      setSchedule({});
      setPreviousMonthSchedule({});
      setScheduleError(isGerman ? "Die Tagesplanung konnte nicht geladen werden." : "The daily plan could not be loaded.");
    } finally {
      setScheduleLoading(false);
    }
  }, [isGerman, needsPreviousMonthSchedule, nightSourceMonth, scheduleMonth]);

  useEffect(() => { void loadTodaySchedule(); }, [loadTodaySchedule]);
  useEffect(() => { void fetchRoles(nightCarryover ? nightSourceKey : todayKey, todayKey); }, [fetchRoles, nightCarryover, nightSourceKey, todayKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTodaySchedule();
    setRefreshing(false);
  }, [loadTodaySchedule]);

  const allEmployees = useMemo((): EmployeeRow[] => {
    const day = today.getDate();
    const nightSchedule = needsPreviousMonthSchedule ? previousMonthSchedule : schedule;
    const daytimeEmployees = Object.entries(schedule)
      .map(([name, days]) => {
        const shiftCode = String(days?.[day] || "").trim().toUpperCase();
        if (!shiftCode || /^N/.test(shiftCode) || ["FS", "ABW", "OFF", "K", "U"].includes(shiftCode)) return null;
        return {
          name: name.replace(",", "").trim(),
          shiftCode,
          cat: SHIFT_CAT[shiftCode] ?? "special",
          roleKey: roleStore.getRole(name, todayKey),
          roleComment: roleStore.getRoleComment(name, todayKey),
          isNewcomer: roleStore.isNewcomer(name, todayKey),
          isColo: isColoEmployee(name, coloPool),
          isDispatcher: dispatcherConfig.enabled && dispatcherConfig.priorities[0] ? isColoEmployee(name, [dispatcherConfig.priorities[0]]) && shiftCode.startsWith("E") : false,
        };
      })
      .filter((employee): employee is EmployeeRow => employee !== null);
    const nightEmployees = Object.entries(nightSchedule)
      .map(([name, days]) => {
        const shiftCode = String(days?.[nightSourceDate.getDate()] || "").trim().toUpperCase();
        if (!/^N/.test(shiftCode)) return null;
        return {
          name: name.replace(",", "").trim(),
          shiftCode,
          cat: "night" as const,
          roleKey: roleStore.getRole(name, nightSourceKey),
          roleComment: roleStore.getRoleComment(name, nightSourceKey),
          isNewcomer: roleStore.isNewcomer(name, nightSourceKey),
          isColo: isColoEmployee(name, coloPool),
          isDispatcher: false,
        };
      })
      .filter((employee): employee is EmployeeRow => employee !== null);
    return [...daytimeEmployees, ...nightEmployees]
      .sort((left, right) => left.shiftCode.localeCompare(right.shiftCode) || left.name.localeCompare(right.name, "de"));
  }, [coloPool, dispatcherConfig, roleStore, needsPreviousMonthSchedule, nightSourceDate, nightSourceKey, previousMonthSchedule, schedule, today, todayKey]);

  const groups = useMemo(() => {
    const map = new Map<ShiftCat, EmployeeRow[]>();
    for (const cat of CAT_ORDER) map.set(cat, []);
    for (const emp of allEmployees) map.get(emp.cat)!.push(emp);
    return CAT_ORDER
      .filter((cat) => (map.get(cat)?.length ?? 0) > 0)
      .map((cat) => ({ cat, employees: map.get(cat)! }));
  }, [allEmployees]);

  const nowDate = today;
  const livePanels = groups.filter(({ cat }) => computeStatus(CAT_META[cat].window, now).status === "active");
  const onDutyNow = livePanels.reduce((sum, { employees }) => sum + employees.length, 0);

  return (
    <div className={`daily-plan-v2 daily-enterprise flex min-h-0 flex-col overflow-hidden ${isEmbedded ? "h-full" : "h-[calc(100vh-64px)]"}`}>
      <header className="dp-header">
        <div className="min-w-0">
          <div className="dp-eyebrow">{isGerman ? "Tagesplan" : "Day plan"}</div>
          <h1 className="dp-title">{nowDate.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1>
          <div className="dp-header-meta">
            <span className="dp-clock">{nowDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} {isGerman ? "Uhr" : ""}</span>
            {livePanels.length > 0 ? <span className="dp-live">{isGerman ? `${onDutyNow} Personen im Dienst` : `${onDutyNow} people on duty`}</span> : null}
            <ShiftplanUploadStatus />
          </div>
        </div>
        <div className="dp-header-actions">
          <ShiftTimeLegend shiftTimes={shiftTimes} compact />
          <button type="button" onClick={handleRefresh} className="dp-btn" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? (isGerman ? "Lädt…" : "Loading…") : (isGerman ? "Aktualisieren" : "Refresh")}
          </button>
        </div>
      </header>

      <div className="dp-body">
        {scheduleLoading ? (
          <div className="dp-state"><RefreshCw className="h-6 w-6 animate-spin" /><p>{isGerman ? "Tagesplan wird geladen…" : "Loading daily plan…"}</p></div>
        ) : scheduleError ? (
          <div className="dp-state" role="alert">
            <p className="text-red-300">{scheduleError}</p>
            <button type="button" onClick={() => void handleRefresh()} className="dp-btn">{isGerman ? "Erneut laden" : "Retry"}</button>
          </div>
        ) : groups.length === 0 ? (
          <div className="dp-state">
            <Calendar className="h-8 w-8" />
            <p>{isGerman ? "Keine Schichtdaten für heute" : "No shift data for today"}</p>
            <p className="dp-muted">{isGerman ? "Bitte lade zunächst den Schichtplan für diesen Monat." : "Please load the shift plan for this month first."}</p>
            <a href={`/odin-go/shiftplan${window.location.search}`} className="dp-link">{isGerman ? "Zum Schichtplan" : "Open shift plan"} <ChevronRight className="inline h-3 w-3" /></a>
          </div>
        ) : (
          <div className="dp-grid" style={{ gridTemplateColumns: `repeat(${Math.min(groups.length, 3)}, minmax(0, 1fr))` }}>
            {groups.map(({ cat, employees }) => (
              <ShiftBand key={cat} cat={cat} employees={employees} now={now} nightCarryover={cat === "night" && nightCarryover} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
