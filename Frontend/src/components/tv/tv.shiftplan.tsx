/* ------------------------------------------------ */
/* TV SCHICHTEN HEUTE                               */
/* Dashboard-style – matches MyTicketsPanel / ShiftOverviewPanel */
/* ------------------------------------------------ */

import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, Users } from "lucide-react";
import type { TvShiftEmployee, TvShiftplanProps } from "./tv.types";
import { getRemainingMs, getColorTier, formatRemainingTime } from "../../utils/ticketColors";

const TV_WEEKPLAN_ROLE_BADGES: Record<string, { label: string; className: string }> = {
  dispatcher: { label: "Dispatcher", className: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  dbs_project: { label: "DBS Project", className: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30" },
  colo: { label: "COLO", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  largeorder: { label: "Largeorder", className: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  projekt: { label: "Projekt", className: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  lead: { label: "Lead", className: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  buddy: { label: "Buddy", className: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
  neueinsteiger: { label: "Neueinsteiger", className: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  cc: { label: "CC", className: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  support: { label: "Support", className: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
};

/* ------------------------------------------------ */
/* SHIFT REMAINING TIME                             */
/* ------------------------------------------------ */
const SHIFT_WINDOWS: Record<string, { startH: number; startM: number; endH: number; endM: number; overnight?: boolean }> = {
  E1: { startH: 6, startM: 30, endH: 15, endM: 30 },
  E2: { startH: 7, startM: 0, endH: 16, endM: 0 },
  L1: { startH: 13, startM: 0, endH: 22, endM: 0 },
  L2: { startH: 15, startM: 0, endH: 0, endM: 0, overnight: true },
  N:  { startH: 21, startM: 15, endH: 6, endM: 45, overnight: true },
};

const SHIFT_KIND_WINDOWS: Record<"early" | "late" | "night", { startH: number; startM: number; endH: number; endM: number; overnight?: boolean; timeLabel: string }> = {
  early: { startH: 6, startM: 30, endH: 16, endM: 0, timeLabel: "06:30 - 16:00" },
  late: { startH: 13, startM: 0, endH: 0, endM: 0, overnight: true, timeLabel: "13:00 - 00:00" },
  night: { startH: 21, startM: 15, endH: 6, endM: 45, overnight: true, timeLabel: "21:15 - 06:45" },
};

function formatShiftDistance(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function getShiftWindowBounds(window: { startH: number; startM: number; endH: number; endM: number; overnight?: boolean }, now: Date) {
  const startToday = new Date(now);
  startToday.setHours(window.startH, window.startM, 0, 0);

  const endToday = new Date(now);
  endToday.setHours(window.endH, window.endM, 0, 0);
  if (window.overnight && endToday <= startToday) endToday.setDate(endToday.getDate() + 1);

  const previousStart = new Date(startToday);
  previousStart.setDate(previousStart.getDate() - 1);

  const previousEnd = new Date(endToday);
  previousEnd.setDate(previousEnd.getDate() - 1);

  return { startToday, endToday, previousStart, previousEnd };
}

function getShiftStatus(window: { startH: number; startM: number; endH: number; endM: number; overnight?: boolean }, now = new Date()) {
  const nowMs = now.getTime();
  const { startToday, endToday, previousStart, previousEnd } = getShiftWindowBounds(window, now);

  if (nowMs >= previousStart.getTime() && nowMs < previousEnd.getTime()) {
    return { state: "active" as const, detail: `Läuft noch ${formatShiftDistance(previousEnd.getTime() - nowMs)}` };
  }

  if (nowMs >= startToday.getTime() && nowMs < endToday.getTime()) {
    return { state: "active" as const, detail: `Läuft noch ${formatShiftDistance(endToday.getTime() - nowMs)}` };
  }

  if (nowMs < startToday.getTime()) {
    return { state: "upcoming" as const, detail: `Beginnt in ${formatShiftDistance(startToday.getTime() - nowMs)}` };
  }

  return { state: "ended" as const, detail: "Beendet" };
}

function getShiftRemainingLabel(shiftCode: string): string | null {
  const w = SHIFT_WINDOWS[shiftCode];
  if (!w) return null;
  const status = getShiftStatus(w);
  if (status.state === "ended") return null;
  return status.detail;
}

/* ------------------------------------------------ */
/* SHIFT COLORS — Tagesplanung palette              */
/* ------------------------------------------------ */
const SHIFT_COLORS = {
  early: {
    hex: "#fb923c",
    bgRadial: "rgba(251,146,60,0.18)",
    borderAlpha: "rgba(251,146,60,0.35)",
    dot:   "bg-orange-400",
    label: "text-orange-300/90",
    strip: "#fb923c",
    badge: "bg-orange-400/20 text-orange-300 border-orange-400/30",
    code:  "bg-orange-400 text-black",
  },
  late: {
    hex: "#facc15",
    bgRadial: "rgba(250,204,21,0.17)",
    borderAlpha: "rgba(250,204,21,0.35)",
    dot:   "bg-amber-400",
    label: "text-amber-300/90",
    strip: "#facc15",
    badge: "bg-amber-400/20 text-amber-300 border-amber-400/30",
    code:  "bg-amber-400 text-black",
  },
  night: {
    hex: "#38bdf8",
    bgRadial: "rgba(56,189,248,0.17)",
    borderAlpha: "rgba(56,189,248,0.35)",
    dot:   "bg-sky-400",
    label: "text-sky-300/90",
    strip: "#38bdf8",
    badge: "bg-sky-400/20 text-sky-300 border-sky-400/30",
    code:  "bg-sky-500 text-white",
  },
};

const SHIFT_CODE_ORDER: Record<string, number> = {
  E1: 10,
  E1SA: 11,
  E1WE: 12,
  HE1: 13,
  E2: 20,
  HE2: 21,
  L1: 30,
  L1WE: 31,
  HL1: 32,
  L2: 40,
  HL2: 41,
  N: 50,
};

function getShiftSortRank(shiftCode: string): number {
  return SHIFT_CODE_ORDER[String(shiftCode || "").trim().toUpperCase()] ?? 999;
}

function compareEmployeesByShift(a: TvShiftEmployee, b: TvShiftEmployee): number {
  const rankDiff = getShiftSortRank(a.shift) - getShiftSortRank(b.shift);
  if (rankDiff !== 0) return rankDiff;
  return String(a.name || "").localeCompare(String(b.name || ""), "de", { sensitivity: "base" });
}

/* ------------------------------------------------ */
/* VERIFICATION BADGE                               */
/* ------------------------------------------------ */
const VERIFICATION_BADGES: Record<string, { label: string; className: string }> = {
  verified:    { label: "Verifiziert",     className: "text-green-400 bg-green-500/15 border-green-500/30" },
  pending:     { label: "Pending",         className: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30" },
  sick:        { label: "Krank",           className: "text-red-400 bg-red-500/15 border-red-500/30" },
  absent:      { label: "Abwesend",        className: "text-red-400 bg-red-500/15 border-red-500/30" },
  wrong_shift: { label: "Andere Schicht",  className: "text-orange-400 bg-orange-500/15 border-orange-500/30" },
  no_response: { label: "Keine Antwort",   className: "text-gray-400 bg-gray-500/15 border-gray-500/30" },
  failed:      { label: "Fehler",          className: "text-gray-400 bg-gray-500/15 border-gray-500/30" },
};

type TvShiftDensity = "roomy" | "balanced" | "compact" | "dense";

function resolveShiftDensity(totalEmployees: number, maxShiftEmployees: number): TvShiftDensity {
  if (totalEmployees >= 34 || maxShiftEmployees >= 16) return "dense";
  if (totalEmployees >= 25 || maxShiftEmployees >= 12) return "compact";
  if (totalEmployees >= 16 || maxShiftEmployees >= 8) return "balanced";
  return "roomy";
}

function getShiftGridMinWidth(density: TvShiftDensity, employeeCount: number): string {
  if (density === "dense" || employeeCount >= 16) return "172px";
  if (density === "compact" || employeeCount >= 12) return "205px";
  if (density === "balanced" || employeeCount >= 8) return "245px";
  return "285px";
}

function getShiftBlockFlex(employeeCount: number, totalEmployees: number): string {
  if (employeeCount <= 0) return "0.45 1 0";
  const share = employeeCount / Math.max(1, totalEmployees);
  const grow = Math.max(0.85, Math.min(1.65, 0.65 + share * 2.1));
  return `${grow.toFixed(2)} 1 0`;
}

/* ------------------------------------------------ */
/* EMPLOYEE CARD — matches MyTicketsPanel item style */
/* ------------------------------------------------ */
const EmployeeCard = memo(function EmployeeCard({
  shift,
  name,
  shiftLabel,
  time,
  category,
  weekplanRole,
  tickets,
  shiftKind,
  crawlerStale,
  verificationStatus,
  density,
}: {
  shift: string;
  name: string;
  shiftLabel: string;
  time: string;
  category?: string;
  weekplanRole?: string | null;
  tickets?: any[];
  shiftKind: "early" | "late" | "night";
  crawlerStale?: boolean;
  verificationStatus?: string | null;
  density: TvShiftDensity;
}) {
  const colors = SHIFT_COLORS[shiftKind];
  const displayedTickets = crawlerStale ? [] : (tickets ?? []).slice(0, 2);
  const extra = crawlerStale ? 0 : Math.max(0, (tickets?.length ?? 0) - 2);
  const shiftRemaining = getShiftRemainingLabel(shift);

  let parsedRoleKey = weekplanRole;
  let parsedComment: string | null = null;
  if (weekplanRole && weekplanRole.includes('|')) {
    const idx = weekplanRole.indexOf('|');
    parsedRoleKey = weekplanRole.slice(0, idx);
    parsedComment = weekplanRole.slice(idx + 1);
  }
  const roleBadge = parsedRoleKey
    ? TV_WEEKPLAN_ROLE_BADGES[parsedRoleKey] ?? { label: parsedRoleKey, className: "bg-white/10 text-white border-white/20" }
    : null;
  const vBadge = verificationStatus ? VERIFICATION_BADGES[verificationStatus] : null;

  return (
    <motion.div
      whileHover={{ scale: 1.028, y: -2 }}
      className={`tv-employee-card tv-employee-card--${density} relative flex overflow-hidden rounded-2xl cursor-default`}
      style={{
        background: `linear-gradient(145deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 14%, rgba(8,15,31,0.92) 48%, rgba(4,9,21,0.98) 100%)`,
        border: "1px solid rgba(255,255,255,0.11)",
        backdropFilter: "blur(18px)",
        boxShadow: `0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -18px 36px rgba(2,6,23,0.42), 0 28px 64px rgba(0,0,0,0.52), 0 0 64px ${colors.hex}28`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background: `linear-gradient(115deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 16%, transparent 34%), radial-gradient(circle at 88% 16%, ${colors.hex}20, transparent 38%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 12% 14%, ${colors.hex}18, transparent 24%), linear-gradient(180deg, transparent 62%, rgba(255,255,255,0.03) 100%)`,
          opacity: 0.9,
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-14"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.09), transparent)",
          opacity: 0.55,
        }}
      />
      <div
        className="pointer-events-none absolute -right-8 top-0 h-16 w-32 rotate-16 blur-2xl"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${colors.hex}26 55%, transparent 100%)`, opacity: 0.9 }}
      />
      {/* Left accent strip — shift-kind color */}
      <div className="w-0.75 shrink-0 rounded-l-xl"
        style={{
          background: `linear-gradient(180deg, ${colors.hex} 0%, ${colors.hex}90 40%, ${colors.hex}20 100%)`,
          boxShadow: `0 0 20px ${colors.hex}55, 2px 0 16px ${colors.hex}40`,
        }} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* NAME ROW */}
        <div className="flex flex-wrap items-center gap-2.5 px-3.5 pt-3.5 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {/* Avatar circle */}
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full overflow-hidden"
            style={{
              background: `conic-gradient(from 135deg, ${colors.hex}55, ${colors.hex}14, ${colors.hex}40)`,
              border: `1.5px solid ${colors.hex}50`,
              boxShadow: `0 0 24px ${colors.hex}60, 0 0 46px ${colors.hex}24, inset 0 1px 0 ${colors.hex}50`,
            }}>
            <span
              className="absolute inset-0.75 rounded-full"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02) 42%, rgba(2,6,23,0.3) 100%)" }}
            />
            <span
              className="absolute h-3 w-3 rounded-full"
              style={{ background: colors.hex, boxShadow: `0 0 12px ${colors.hex}, 0 0 26px ${colors.hex}80` }}
            />
            <span
              className="absolute left-2 top-2.25 h-1.5 w-1.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.92)", boxShadow: `0 0 10px rgba(255,255,255,0.95)` }}
            />
            <span
              className="absolute right-2 bottom-2 h-1 w-4 rounded-full"
              style={{ background: `linear-gradient(90deg, ${colors.hex}15, ${colors.hex}75, ${colors.hex}15)`, boxShadow: `0 0 10px ${colors.hex}60` }}
            />
          </span>
          <span className={`text-[12px] font-black px-2.5 py-1 rounded-lg uppercase tracking-[0.16em] shrink-0 border ${colors.badge}`}
            style={{ boxShadow: `0 0 18px ${colors.hex}16` }}>
            {shift}
          </span>
          <span className="flex-1 font-black text-[15px] text-white min-w-0 leading-tight tracking-[0.01em]" style={{ textShadow: "0 0 14px rgba(255,255,255,0.08)" }}>{name}</span>
          {roleBadge && (
            <span
              className={`text-[10px] font-black uppercase tracking-[0.12em] px-2 py-1 rounded-lg border shrink-0 ${roleBadge.className}`}
              title={parsedComment || undefined}
            >
              {roleBadge.label}{parsedComment ? ` · ${parsedComment}` : ''}
            </span>
          )}
          {vBadge && (
            <span className={`text-[10px] font-black uppercase tracking-[0.12em] px-2 py-1 rounded-lg border shrink-0 ${vBadge.className}`}>
              {vBadge.label}
            </span>
          )}
          {shiftRemaining && (
            <span className="text-[11px] font-black px-2 py-1 rounded-lg shrink-0 tracking-[0.08em]"
              style={{ background: "rgba(16,185,129,0.16)", border: "1px solid rgba(16,185,129,0.38)", color: "#34d399", boxShadow: "0 0 20px rgba(16,185,129,0.24), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
              {shiftRemaining}
            </span>
          )}
          {category && (
            <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold shrink-0"
              style={{ background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.25)", color: "#7dd3fc" }}>
              {category}
            </span>
          )}
          <span className="text-[12px] text-white/44 font-mono hidden xl:inline shrink-0">{time}</span>
        </div>

      {/* TICKETS */}
      {displayedTickets.length > 0 ? (
        <div className="flex flex-col gap-1.5 px-2.5 py-2.5">
          {displayedTickets.map((t, idx) => {
            const ms = getRemainingMs(t);
            const tier = getColorTier(ms);
            const rem = String(t.remaining_time_text ?? "").trim() || (ms !== null ? formatRemainingTime(ms) : "Nicht angegeben");
            const id = String(t.external_id ?? t.ticketNumber ?? t.id ?? "").trim();
            const customer = String(t.account_name ?? t.customer_name ?? t.customerName ?? "Nicht angegeben").trim();
            const isOdinAssigned = t.assignment_source === "odin" || t.assigned_worker_id != null;

            const isOverdue = ms !== null && ms < 0;
            const isCritical = tier === "red";
            const chipBg = isOverdue ? "rgba(244,63,94,0.07)" : isCritical ? "rgba(245,158,11,0.07)" : "rgba(255,255,255,0.03)";
            const chipBorder = isOverdue ? "rgba(244,63,94,0.20)" : isCritical ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.06)";
            const accentColor = isOverdue ? "#f43f5e" : isCritical ? "#f59e0b" : "rgba(255,255,255,0.15)";

            return (
              <div key={`${id}-${idx}`} className="relative flex items-center gap-2.5 overflow-hidden rounded-xl py-2 pr-2.5"
                style={{ background: `linear-gradient(145deg, rgba(255,255,255,0.055), ${chipBg} 28%, rgba(6,10,23,0.76) 100%)`, border: `1px solid ${chipBorder}`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 18px rgba(0,0,0,0.16)` }}>
                {/* Left accent line */}
                <div className="w-[2.5px] self-stretch rounded-l-lg shrink-0"
                  style={{
                    background: `linear-gradient(180deg, ${accentColor}, ${accentColor}80)`,
                    boxShadow: (isOverdue || isCritical) ? `0 0 12px ${accentColor}, 0 0 22px ${accentColor}80` : "none",
                  }} />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 text-[11px] leading-snug min-w-0">
                  <span className="font-mono font-black text-[12px] tracking-wider"
                    style={{ color: (isOverdue || isCritical) ? accentColor : "rgba(255,255,255,0.9)", textShadow: (isOverdue || isCritical) ? `0 0 10px ${accentColor}70` : "none" }}>Activity {id}</span>
                  <span className="text-white/20">·</span>
                  <span className="font-semibold text-white/74 truncate">Kunde: {customer}</span>
                  <span
                    className="rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em]"
                    style={isOdinAssigned
                      ? { background: "rgba(56,189,248,0.12)", borderColor: "rgba(56,189,248,0.3)", color: "#7dd3fc" }
                      : { background: "rgba(16,185,129,0.12)", borderColor: "rgba(16,185,129,0.3)", color: "#6ee7b7" }}
                  >
                    {isOdinAssigned ? "ODIN Auto" : "Selbst zugewiesen"}
                  </span>
                </div>
                {rem && (
                  <span className="font-mono font-black rounded-lg px-2 py-1 text-[10px] shrink-0"
                    style={{
                      background: `${accentColor}14`,
                      color: (isOverdue || isCritical) ? accentColor : "rgba(255,255,255,0.5)",
                      textShadow: (isOverdue || isCritical) ? `0 0 8px ${accentColor}70` : "none",
                    }}>Restzeit: {rem}</span>
                )}
              </div>
            );
          })}
          {extra > 0 && (
            <div className="text-[11px] font-semibold italic text-center py-1" style={{ color: "rgba(255,255,255,0.25)" }}>
              +{extra} weitere
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-3 text-[11px] font-semibold text-white/30">
          {crawlerStale ? "Ticketdaten werden aktualisiert" : "Keine Tickets als Owner"}
        </div>
      )}
      </div>
    </motion.div>
  );
});

/* ------------------------------------------------ */
/* SHIFT BLOCK — matches ShiftOverviewPanel header  */
/* ------------------------------------------------ */
const ShiftBlock = memo(function ShiftBlock({
  title,
  list,
  shiftKind,
  ticketsByOwner,
  crawlerStale,
  delay,
  density,
  totalEmployees,
}: {
  title: string;
  list: TvShiftEmployee[];
  shiftKind: "early" | "late" | "night";
  ticketsByOwner?: Map<string, any[]>;
  crawlerStale?: boolean;
  delay?: number;
  density: TvShiftDensity;
  totalEmployees: number;
}) {
  const colors = SHIFT_COLORS[shiftKind];
  const hex = colors.hex;
  const sortedList = useMemo(() => [...list].sort(compareEmployeesByShift), [list]);
  const gridMinWidth = getShiftGridMinWidth(density, list.length);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay ?? 0, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl"
      style={{
        flex: getShiftBlockFlex(list.length, totalEmployees),
        background: list.length > 0
          ? `linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012) 18%, transparent 26%), radial-gradient(ellipse 80% 60% at 50% 0%, ${colors.bgRadial}, rgba(3,9,24,0.98) 65%)`
          : "rgba(4,10,26,0.96)",
        border: list.length > 0 ? `1px solid ${colors.borderAlpha}` : "1px solid rgba(255,255,255,0.08)",
        boxShadow: list.length > 0
          ? `0 0 0 1px ${hex}35, 0 0 140px ${hex}55, 0 30px 90px ${hex}2f, 0 10px 36px ${hex}28, inset 0 1px 0 ${hex}38`
          : "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: `linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 22%, transparent 70%, rgba(255,255,255,0.03) 100%), radial-gradient(circle at 12% 16%, ${hex}1f, transparent 26%)`,
        }}
      />
      {/* Neon top-edge glow */}
      <div className="absolute inset-x-0 top-0 h-0.5 pointer-events-none"
        style={{
          background: list.length > 0
            ? `linear-gradient(90deg, transparent 3%, ${hex}70 25%, ${hex} 50%, ${hex}70 75%, transparent 97%)`
            : "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
          boxShadow: list.length > 0 ? `0 0 30px ${hex}90, 0 0 90px ${hex}55` : "none",
        }} />

      {list.length > 0 && (
        <div
          className="pointer-events-none absolute -right-12 top-8 h-28 w-28 rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, ${hex}55, transparent 70%)`, opacity: 0.7 }}
        />
      )}

      {list.length > 0 && (
        <div
          className="pointer-events-none absolute left-8 top-0 h-24 w-56 -translate-y-1/3 rotate-10 blur-2xl"
          style={{ background: `linear-gradient(90deg, transparent 0%, ${hex}2a 48%, transparent 100%)`, opacity: 0.8 }}
        />
      )}

      <div className="relative flex min-h-0 flex-1 flex-col px-4 pt-4 pb-4">
        {/* Section header */}
        <div className="mb-3 flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-md flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${hex}30, ${hex}0d)`,
              border: `1px solid ${hex}40`,
              boxShadow: `0 0 22px ${hex}50, 0 0 42px ${hex}18`,
            }}>
            <span className="h-2 w-2 rounded-full" style={{ background: hex, boxShadow: `0 0 12px ${hex}, 0 0 22px ${hex}70` }} />
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: hex, textShadow: `0 0 22px ${hex}80, 0 0 10px ${hex}60` }}>{title}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <Users className="h-3 w-3 text-white/30" />
            <span className="text-[11px] font-semibold text-slate-300">{list.length} MA</span>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl py-5 text-sm"
            style={{ background: "rgba(255,255,255,0.018)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)" }}>
            Keine Mitarbeiter in dieser Schicht
          </div>
        ) : (
          <div
            className="tv-shift-grid grid min-h-0 flex-1 content-start overflow-hidden"
            style={{
              gap: density === "dense" ? "7px" : density === "compact" ? "9px" : "12px",
              gridTemplateColumns: `repeat(auto-fit, minmax(${gridMinWidth}, 1fr))`,
            }}
          >
          {sortedList.map((e) => (
            <EmployeeCard
              key={`${e.shift}-${e.name}`}
              shift={e.shift}
              name={e.name}
              shiftLabel={title}
              time={e.time}
              category={e.category}
              weekplanRole={e.weekplanRole}
              tickets={ticketsByOwner?.get(e.name)}
              shiftKind={shiftKind}
              crawlerStale={crawlerStale}
              verificationStatus={(e as any).verificationStatus}
              density={density}
            />
          ))}
        </div>
        )}
      </div>
    </motion.div>
  );
});

/* ------------------------------------------------ */
/* MAIN COMPONENT — matches MyTicketsPanel panel    */
/* ------------------------------------------------ */

export const TvShiftplan = memo(function TvShiftplan({
  early = [],
  late = [],
  night = [],
  ticketsByOwner,
  crawlerStale,
}: TvShiftplanProps) {
  const totalEmployees = early.length + late.length + night.length;
  const maxShiftEmployees = Math.max(early.length, late.length, night.length);
  const density = resolveShiftDensity(totalEmployees, maxShiftEmployees);
  const shiftHeaderInfo = useMemo(() => ([
    { key: "early" as const, label: "Früh", count: early.length, ...getShiftStatus(SHIFT_KIND_WINDOWS.early), timeLabel: SHIFT_KIND_WINDOWS.early.timeLabel, hex: SHIFT_COLORS.early.hex },
    { key: "late" as const, label: "Spät", count: late.length, ...getShiftStatus(SHIFT_KIND_WINDOWS.late), timeLabel: SHIFT_KIND_WINDOWS.late.timeLabel, hex: SHIFT_COLORS.late.hex },
    { key: "night" as const, label: "Nacht", count: night.length, ...getShiftStatus(SHIFT_KIND_WINDOWS.night), timeLabel: SHIFT_KIND_WINDOWS.night.timeLabel, hex: SHIFT_COLORS.night.hex },
  ]), [early.length, late.length, night.length]);

  const headerBadges = useMemo(() => [
    { label: "Früh",  count: early.length,  style: { background: "radial-gradient(ellipse at 50% 0%, rgba(251,146,60,0.24), rgba(3,9,24,0.95) 80%)", border: "1px solid rgba(251,146,60,0.34)", color: "#fdba74", boxShadow: "0 0 22px rgba(251,146,60,0.20), 0 0 50px rgba(251,146,60,0.08)" } },
    { label: "Spät",  count: late.length,   style: { background: "radial-gradient(ellipse at 50% 0%, rgba(250,204,21,0.22), rgba(3,9,24,0.95) 80%)", border: "1px solid rgba(250,204,21,0.32)", color: "#fde68a", boxShadow: "0 0 22px rgba(250,204,21,0.18), 0 0 50px rgba(250,204,21,0.08)" } },
    { label: "Nacht", count: night.length,  style: { background: "radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.22), rgba(3,9,24,0.95) 80%)", border: "1px solid rgba(56,189,248,0.32)", color: "#7dd3fc", boxShadow: "0 0 22px rgba(56,189,248,0.18), 0 0 50px rgba(56,189,248,0.08)" } },
  ], [early.length, late.length, night.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
      className="tv-shift-fit relative flex h-full min-h-0 flex-col overflow-hidden p-5"
      data-density={density}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-24 top-0 h-56 w-56 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.18), transparent 70%)" }}
        />
        <div
          className="absolute -right-12 top-12 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(251,191,36,0.14), transparent 72%)" }}
        />
        <div
          className="absolute inset-x-0 top-0 h-28"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.06), transparent)" }}
        />
      </div>

      {/* HEADER — Tagesplanung section-header style */}
      <div
        className="relative mb-5 shrink-0 flex items-center justify-between gap-3 overflow-hidden rounded-3xl px-5 py-4"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.02) 18%, rgba(4,11,26,0.96) 65%, rgba(2,8,20,0.98) 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 42px rgba(0,0,0,0.3), 0 0 70px rgba(56,189,248,0.12)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "linear-gradient(115deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 14%, transparent 28%), radial-gradient(circle at 82% 20%, rgba(56,189,248,0.12), transparent 34%)",
          }}
        />
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgba(56,189,248,0.32), rgba(56,189,248,0.08))",
              border: "1px solid rgba(56,189,248,0.36)",
              boxShadow: "0 0 28px rgba(56,189,248,0.34), 0 0 72px rgba(56,189,248,0.12)",
            }}>
            <div
              className="pointer-events-none absolute inset-0.5 rounded-[10px]"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18), transparent 52%)" }}
            />
            <Clock className="h-4.5 w-4.5 text-cyan-300" />
          </div>
          <div>
            <span className="block text-[17px] font-black uppercase tracking-[0.24em] text-white"
              style={{ textShadow: "0 0 26px rgba(56,189,248,0.45), 0 0 60px rgba(56,189,248,0.14)" }}>Schichten Heute</span>
            <span className="block text-[12px] font-semibold tracking-[0.12em] text-white/52">Mitarbeiter, Tickets und Restzeiten im Premium Tagesplanung-Look</span>
          </div>
        </div>
        <div className="relative flex items-center gap-2">
          {headerBadges.map((b) => (
            <span key={b.label} className="rounded-xl px-4 py-2.5 text-[12px] font-black uppercase tracking-[0.12em]"
              style={b.style}>
              {b.label} {b.count}
            </span>
          ))}
          <span className="rounded-xl px-4 py-2.5 text-[12px] font-black uppercase tracking-[0.12em]"
            style={{
              background: "radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.24), rgba(3,9,24,0.95) 80%)",
              border: "1px solid rgba(56,189,248,0.3)",
              color: "#bae6fd",
              boxShadow: "0 0 28px rgba(56,189,248,0.24), 0 0 72px rgba(56,189,248,0.12)",
            }}>
            {totalEmployees} gesamt
          </span>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
        {shiftHeaderInfo.map((shift) => {
          const isActive = shift.state === "active";
          const isUpcoming = shift.state === "upcoming";
          return (
            <div
              key={shift.key}
              className="relative overflow-hidden rounded-xl px-4 py-3"
              style={{
                background: isActive
                  ? `radial-gradient(ellipse 80% 60% at 50% 0%, ${shift.hex}22, rgba(3,9,24,0.98) 75%)`
                  : isUpcoming
                    ? `${shift.hex}10`
                    : "rgba(255,255,255,0.03)",
                border: `1px solid ${isActive ? `${shift.hex}40` : isUpcoming ? `${shift.hex}26` : "rgba(255,255,255,0.08)"}`,
                boxShadow: isActive ? `0 0 34px ${shift.hex}35, 0 0 80px ${shift.hex}16` : "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
                style={{
                  background: isActive
                    ? `linear-gradient(90deg, transparent 3%, ${shift.hex}70 25%, ${shift.hex} 50%, ${shift.hex}70 75%, transparent 97%)`
                    : `linear-gradient(90deg, transparent 10%, ${shift.hex}35 50%, transparent 90%)`,
                  boxShadow: isActive ? `0 0 24px ${shift.hex}80, 0 0 64px ${shift.hex}45` : "none",
                }}
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: shift.hex, boxShadow: isActive ? `0 0 12px ${shift.hex}, 0 0 24px ${shift.hex}80` : "none" }} />
                    <span className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: shift.hex }}>{shift.label}</span>
                  </div>
                  <div className="mt-1 text-[13px] font-bold text-white">{shift.detail}</div>
                  <div className="mt-1 text-[10px] font-medium text-white/45">{shift.timeLabel}</div>
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-black" style={{ color: shift.hex, textShadow: isActive ? `0 0 16px ${shift.hex}80` : "none" }}>{shift.count}</div>
                  <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">MA</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CONTENT - all shift sections fit into the TV viewport without scrolling */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden">
        <ShiftBlock
          title="Frühschicht"
          list={early}
          shiftKind="early"
          ticketsByOwner={ticketsByOwner}
          crawlerStale={crawlerStale}
          delay={0.08}
          density={density}
          totalEmployees={totalEmployees}
        />
        <ShiftBlock
          title="Spätschicht"
          list={late}
          shiftKind="late"
          ticketsByOwner={ticketsByOwner}
          crawlerStale={crawlerStale}
          delay={0.14}
          density={density}
          totalEmployees={totalEmployees}
        />
        <ShiftBlock
          title="Nachtschicht"
          list={night}
          shiftKind="night"
          ticketsByOwner={ticketsByOwner}
          crawlerStale={crawlerStale}
          delay={0.20}
          density={density}
          totalEmployees={totalEmployees}
        />
      </div>
    </motion.div>
  );
});
