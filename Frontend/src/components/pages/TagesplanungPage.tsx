/* ─────────────────────────────────────────────────────────────────────────── */
/*  TAGESPLANUNG – Premium WOW daily shift command view  v2                    */
/* ─────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  ChevronRight,
  RefreshCw,
  Users,
} from "lucide-react";

import { shiftTypes } from "../../store/shiftStore";
import { useAuth } from "../../context/AuthContext";
import { LANGUAGE_TO_LOCALE, useLanguage } from "../../context/LanguageContext";
import { fetchSchedule } from "../shiftplan/shiftplan.api";
import { formatMonthLabel } from "../../utils/dateFormat";
import { getRemainingMs, formatRemainingTime } from "../../utils/ticketColors";
import { findBestMatch, normalizeName } from "../../utils/fuzzyName";
import { getRoleDef, useWeekplanRoleStore } from "../../store/weekplanRoleStore";
import { isColoEmployee, parseColoPool } from "../../utils/colo";
import { api } from "../../api/api";
import type { EnrichedCommitTicket } from "../commit/commit.types";

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
  shiftTime: string;
  cat:       ShiftCat;
  roleKey?:  string;
  isColo?: boolean;
  isDispatcher?: boolean;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const SHIFT_CAT: Record<string, ShiftCat> = {
  E1: "early", E2: "early", E1SA: "early", E1WE: "early",
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
  { code: "E1SA",label: "E1 SA",      time: "06:00 – 14:00", window: { startMin: 6 * 60,       endMin: 14 * 60 } },
  { code: "E1WE",label: "E1 WE",      time: "06:00 – 14:00", window: { startMin: 6 * 60,       endMin: 14 * 60 } },
  { code: "HE1", label: "Halbe Früh", time: "06:30 – 10:30", window: { startMin: 6 * 60 + 30,  endMin: 10 * 60 + 30 } },
  { code: "E2",  label: "E2",         time: "07:00 – 16:00", window: { startMin: 7 * 60,        endMin: 16 * 60 } },
  { code: "HE2", label: "Halbe Früh", time: "07:00 – 11:00", window: { startMin: 7 * 60,        endMin: 11 * 60 } },
];

const LATE_SUB_GROUPS: SubGroup[] = [
  { code: "L1",   label: "L1",         time: "13:00 – 22:00", window: { startMin: 13 * 60,       endMin: 22 * 60 } },
  { code: "L1WE", label: "L1 WE",      time: "13:00 – 21:00", window: { startMin: 13 * 60,       endMin: 21 * 60 } },
  { code: "HL1",  label: "Halbe Spät", time: "13:00 – 17:00", window: { startMin: 13 * 60,       endMin: 17 * 60 } },
  { code: "L2",   label: "L2",         time: "15:00 – 00:00", window: { startMin: 15 * 60,       endMin: 24 * 60 } },
  { code: "HL2",  label: "Halbe Spät", time: "15:00 – 19:00", window: { startMin: 15 * 60,       endMin: 19 * 60 } },
];

const SHIFT_SUB_GROUPS: Partial<Record<ShiftCat, SubGroup[]>> = {
  early: EARLY_SUB_GROUPS,
  late:  LATE_SUB_GROUPS,
};

const CAT_ORDER: ShiftCat[] = ["early", "late", "night", "dbs", "special"];

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

function normalizeOwnerKey(value: string): string {
  return normalizeName(value).replace(/\s+/g, "").replace(/[0-9]+$/g, "");
}

function buildEmployeeOwnerKeys(name: string): string[] {
  const tokens = normalizeName(name).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];

  const keys = new Set<string>();
  keys.add(tokens.join(""));
  keys.add([...tokens].reverse().join(""));
  if (tokens.length >= 2) {
    const first = tokens[0];
    const second = tokens[1];
    const last = tokens[tokens.length - 1];
    keys.add(`${first}${last}`);
    keys.add(`${last}${first}`);
    keys.add(`${first.charAt(0)}${last}`);
    keys.add(`${last.charAt(0)}${first}`);
    if (second) keys.add(`${second.charAt(0)}${first}`);
  }
  return [...keys].filter(Boolean);
}

function readTicketOwnerCandidates(ticket: EnrichedCommitTicket): string[] {
  return [
    (ticket as any)?.owner,
    (ticket as any)?.Owner,
    (ticket as any)?.current_owner,
    (ticket as any)?.currentOwner,
    (ticket as any)?.assigned_to,
    (ticket as any)?.assignedTo,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function mapTicketsByEmployee(employees: EmployeeRow[], tickets: EnrichedCommitTicket[]) {
  const map = new Map<string, EnrichedCommitTicket[]>();
  const ownerLookup = new Map<string, string>();
  const ownerAliases: string[] = [];
  const employeeNames = employees.map((employee) => employee.name);

  for (const employee of employees) {
    for (const key of buildEmployeeOwnerKeys(employee.name)) {
      if (!ownerLookup.has(key)) {
        ownerLookup.set(key, employee.name);
        ownerAliases.push(key);
      }
    }
    const directKey = normalizeOwnerKey(employee.name);
    if (directKey && !ownerLookup.has(directKey)) {
      ownerLookup.set(directKey, employee.name);
      ownerAliases.push(directKey);
    }
    map.set(employee.name, []);
  }

  for (const ticket of tickets) {
    const ownerCandidates = readTicketOwnerCandidates(ticket);
    if (ownerCandidates.length === 0) continue;

    let employeeName: string | null = null;
    for (const ownerValue of ownerCandidates) {
      const ownerKey = normalizeOwnerKey(ownerValue);
      const directMatch = ownerLookup.get(ownerKey);
      const aliasMatch = directMatch ? null : findBestMatch(ownerKey, ownerAliases, 0.84)?.match;
      const fuzzyNameMatch = directMatch || aliasMatch ? null : findBestMatch(ownerValue, employeeNames, 0.76)?.match;
      employeeName = directMatch || (aliasMatch ? ownerLookup.get(aliasMatch) ?? null : null) || fuzzyNameMatch || null;
      if (employeeName) break;
    }

    if (!employeeName) continue;
    const current = map.get(employeeName) ?? [];
    current.push(ticket);
    map.set(employeeName, current);
  }

  for (const [employeeName, matches] of map.entries()) {
    matches.sort((a, b) => {
      const ah = getRemainingMs(a as unknown as Record<string, unknown>);
      const bh = getRemainingMs(b as unknown as Record<string, unknown>);
      if (ah === null && bh === null) return 0;
      if (ah === null) return 1;
      if (bh === null) return -1;
      return ah - bh;
    });
    map.set(employeeName, matches);
  }

  return map;
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

/* ── TicketChip ─────────────────────────────────────────────────────────────── */

function TicketChip({ ticket, index }: { ticket: EnrichedCommitTicket; index: number }) {
  const rem = getRemainingMs(ticket as unknown as Record<string, unknown>);
  const isScheduled = (ticket.activityStatus ?? "").toLowerCase() === "scheduled";
  const isOverdue  = rem !== null && rem < 0;
  const isCritical = rem !== null && rem >= 0 && rem <= 72 * 60 * 60 * 1000;

  const dot = isOverdue ? "#f43f5e" : isCritical ? "#f59e0b" : "#475569";
  const timeStr = isScheduled ? null : rem !== null ? formatRemainingTime(rem) : null;

  const chipBg = isOverdue ? "rgba(244,63,94,0.07)" : isCritical ? "rgba(245,158,11,0.07)" : "rgba(255,255,255,0.03)";
  const chipBorder = isOverdue ? "rgba(244,63,94,0.20)" : isCritical ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.06)";
  const activity = String((ticket as any).activity ?? ticket.activityType ?? ticket.activitySubType ?? "—").trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="relative flex items-center gap-2 overflow-hidden rounded-lg py-1.5 pr-2"
      style={{ background: chipBg, border: `1px solid ${chipBorder}` }}
    >
      {/* left accent line */}
      <div
        className="absolute inset-y-0 left-0 w-[2.5px] rounded-l-lg"
        style={{
          background: isOverdue
            ? "linear-gradient(180deg, #f43f5e, #f43f5e80)"
            : isCritical
            ? "linear-gradient(180deg, #f59e0b, #f59e0b80)"
            : "linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.04))",
          boxShadow: (isOverdue || isCritical) ? `0 0 6px ${dot}` : "none",
        }}
      />
      <div className="pl-3 flex items-center gap-2 min-w-0 flex-1">
        <span
          className="font-mono text-[10.5px] font-black shrink-0 tracking-wider"
          style={{ color: (isOverdue || isCritical) ? dot : "#e2e8f0", textShadow: (isOverdue || isCritical) ? `0 0 10px ${dot}70` : "none" }}
        >
          {ticket.activityNumber || "—"}
        </span>
        <div className="min-w-0 flex flex-1 items-center gap-1.5 text-[8px]">
          {ticket.systemName && (
            <span className="shrink-0 font-semibold text-slate-300">{ticket.systemName}</span>
          )}
          <span className="truncate font-medium text-slate-500">{activity}</span>
        </div>
      </div>
      {timeStr && (
        <span
          className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black"
          style={{
            color: dot,
            background: `${dot}14`,
            textShadow: `0 0 8px ${dot}70`,
          }}
        >{timeStr}</span>
      )}
      {isScheduled && (
        <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em]" style={{ color: "rgba(100,116,139,0.7)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>SCHED</span>
      )}
    </motion.div>
  );
}

/* ── EmployeeCard ───────────────────────────────────────────────────────────── */

function EmployeeCard({
  employee,
  hex,
  delay,
}: {
  employee: EmployeeRow;
  hex:      string;
  delay:    number;
}) {
  const { user } = useAuth();
  const isOwnShift = Boolean(user.displayName) && normName(employee.name) === normName(user.displayName);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.022, y: -1 }}
      transition={{ duration: 0.3, delay, ease: [0.22, 1, 0.36, 1] }}
      className="cursor-default overflow-hidden rounded-xl"
      style={{
        background: "rgba(255,255,255,0.025)",
        border:     `1px solid ${isOwnShift ? `${hex}cc` : "rgba(255,255,255,0.08)"}`,
        backdropFilter: "blur(10px)",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 8px rgba(0,0,0,0.3)`,
      }}
    >
      {/* colored left accent strip */}
      <div className="flex">
        <div
          className="w-0.75 shrink-0 rounded-l-xl"
          style={{
            background: `linear-gradient(180deg, ${hex} 0%, ${hex}90 40%, ${hex}20 100%)`,
            boxShadow: `2px 0 10px ${hex}30`,
          }}
        />
        <div className="flex-1 p-2.5">
          {/* employee row */}
          <div className="flex items-center gap-2.5">
            {/* circle avatar */}
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
              style={{
                background: `conic-gradient(from 135deg, ${hex}50, ${hex}18, ${hex}40)`,
                color: hex,
                border: `1.5px solid ${hex}50`,
                boxShadow: `0 0 14px ${hex}35, inset 0 1px 0 ${hex}50`,
                textShadow: `0 0 8px ${hex}80`,
              }}
            >
              {employee.name.trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-bold leading-tight text-slate-100">
                {employee.name}
                {employee.isColo ? <span className="ml-1.5 inline-flex rounded border border-cyan-400/40 bg-cyan-500/15 px-1 py-px text-[8px] font-black text-cyan-200">COLO</span> : null}
                {employee.isDispatcher ? <span className="ml-1.5 inline-flex rounded border border-pink-400/40 bg-pink-500/15 px-1 py-px text-[8px] font-black text-pink-200">DP</span> : null}
              </div>
              <div className="mt-0.5 text-[7.5px] font-black uppercase tracking-[0.22em]" style={{ color: `${hex}70` }}>
                {employee.shiftCode} · {employee.shiftTime}
              </div>
              {employee.roleKey && getRoleDef(employee.roleKey) && (
                <div className="mt-1 text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: hex }}>
                  Rolle: {getRoleDef(employee.roleKey)?.label}
                </div>
              )}
              {isOwnShift && <div className="mt-1 text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: hex }}>Deine Schicht</div>}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── SubGroupSection (for Frühschicht E1/E2) ────────────────────────────────── */

function SubGroupSection({
  subGroup,
  employees,
  hex,
  now,
  baseDelay,
}: {
  subGroup:  SubGroup;
  employees: EmployeeRow[];
  hex:       string;
  now:       number;
  baseDelay: number;
}) {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const { status, remainingMs } = computeStatus(subGroup.window, now);
  const statusStr = getShiftStatusLabel(status, remainingMs, isGerman);

  if (employees.length === 0) return null;

  return (
    <div>
      {/* sub-group label row */}
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${hex}50, transparent)` }} />
        <div
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1"
          style={{
            background: `linear-gradient(135deg, ${hex}22, ${hex}0c)`,
            border: `1px solid ${hex}45`,
            boxShadow: status === "active" ? `0 0 18px ${hex}35, inset 0 1px 0 ${hex}30` : `0 0 0 1px ${hex}15`,
          }}
        >
          {status === "active" && (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: hex }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: hex, boxShadow: `0 0 5px ${hex}` }} />
            </span>
          )}
          <span
            className="text-[8.5px] font-black uppercase tracking-[0.22em]"
            style={{ color: hex, textShadow: status === "active" ? `0 0 10px ${hex}90` : "none" }}
          >
            {getSubGroupLabel(subGroup.label, isGerman)}
          </span>
          <span className="text-[7.5px] text-slate-700">·</span>
          <span className="text-[7.5px] text-slate-500">{subGroup.time}</span>
          {statusStr && (
            <span
              className="ml-0.5 rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.16em]"
              style={{
                color: status === "active" ? hex : "rgba(148,163,184,0.45)",
                background: status === "active" ? `${hex}14` : "transparent",
              }}
            >
              {statusStr}
            </span>
          )}
        </div>
        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${hex}20)` }} />
      </div>

      <div className="flex flex-col gap-1.5">
        {employees.map((emp, i) => (
          <EmployeeCard
            key={emp.name}
            employee={emp}
            hex={hex}
            delay={baseDelay + i * 0.04}
          />
        ))}
      </div>
    </div>
  );
}

/* ── ShiftBand ──────────────────────────────────────────────────────────────── */

function ShiftBand({
  cat,
  employees,
  now,
  bandIndex,
  totalBands,
}: {
  cat:        ShiftCat;
  employees:  EmployeeRow[];
  now:        number;
  bandIndex:  number;
  totalBands: number;
}) {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const meta = CAT_META[cat];
  const { status, remainingMs, elapsedMs, totalMs } = computeStatus(meta.window, now);
  const progress = totalMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;

  const isActive   = status === "active";
  const isUpcoming = status === "upcoming";

  const statusLabel = getShiftStatusLabel(status, remainingMs, isGerman) ?? "—";

  const statusHex = isActive ? meta.hex : isUpcoming ? "rgba(148,163,184,0.7)" : "rgba(71,85,105,0.7)";

  // Sub-group support for Früh + Spät
  const catSubGroups = SHIFT_SUB_GROUPS[cat] ?? null;
  const isSubGrouped = catSubGroups !== null;

  const activeSubGroups = useMemo(() => {
    if (!catSubGroups) return [];
    return catSubGroups
      .map((sg) => ({
        subGroup:  sg,
        employees: employees.filter((e) => e.shiftCode === sg.code),
      }))
      .filter(({ employees: emps }) => emps.length > 0);
  }, [catSubGroups, employees]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={{ scale: 1.008, y: -2 }}
      transition={{ duration: 0.5, delay: bandIndex * 0.09, ease: [0.22, 1, 0.36, 1] }}
      className="daily-shift-band relative flex flex-col overflow-hidden rounded-2xl"
      style={{
        background: isActive ? meta.bgGrad : "rgba(4,10,26,0.96)",
        border:     `1px solid ${isActive ? meta.hex + "50" : "rgba(255,255,255,0.08)"}`,
        boxShadow:  isActive
          ? `0 0 0 1px ${meta.hex}25, 0 0 80px ${meta.hex}35, 0 20px 60px ${meta.hex}20, 0 4px 16px ${meta.hex}18, inset 0 1px 0 ${meta.hex}30`
          : "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* neon top-edge glow line */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: isActive ? "2px" : "1px",
          background: isActive
            ? `linear-gradient(90deg, transparent 3%, ${meta.hex}70 25%, ${meta.hex} 50%, ${meta.hex}70 75%, transparent 97%)`
            : `linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.08) 50%, transparent 90%)`,
          boxShadow: isActive ? `0 0 16px 2px ${meta.hex}60` : "none",
        }}
      />

      {/* animated scan beam — active bands only */}
      {isActive && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-0 h-full"
          style={{
            background: `linear-gradient(180deg, ${meta.hex}08 0%, transparent 30%)`,
            maskImage: "linear-gradient(180deg, black 0%, transparent 100%)",
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* dot-grid watermark */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.025]" aria-hidden>
        <defs>
          <pattern id={`dots-${cat}`} x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill={meta.hex} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#dots-${cat})`} />
      </svg>

      {/* 4-corner bracket accents */}
      {isActive && (
        <>
          <svg className="pointer-events-none absolute top-0 left-0 h-5 w-5" style={{ opacity: 0.7 }} viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M0 8V0H8" stroke={meta.hex} strokeWidth="1.5" />
          </svg>
          <svg className="pointer-events-none absolute top-0 right-0 h-5 w-5" style={{ opacity: 0.7 }} viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M20 8V0H12" stroke={meta.hex} strokeWidth="1.5" />
          </svg>
          <svg className="pointer-events-none absolute bottom-0 left-0 h-5 w-5" style={{ opacity: 0.4 }} viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M0 12V20H8" stroke={meta.hex} strokeWidth="1.5" />
          </svg>
          <svg className="pointer-events-none absolute bottom-0 right-0 h-5 w-5" style={{ opacity: 0.4 }} viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M20 12V20H12" stroke={meta.hex} strokeWidth="1.5" />
          </svg>
        </>
      )}

      {/* ─── Band Header ─── */}
      <div
        className="relative shrink-0 px-4 pt-4 pb-3"
        style={{ borderBottom: `1px solid ${isActive ? meta.hex + "22" : "rgba(255,255,255,0.05)"}` }}
      >
        {/* title + pulse */}
        <div className="mb-2.5 flex items-center gap-2.5">
          {isActive ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: meta.hex }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ background: meta.hex, boxShadow: `0 0 12px 3px ${meta.hex}90` }} />
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full" style={{ background: "rgba(71,85,105,0.5)" }} />
          )}
          <span
            className="text-[12px] font-black uppercase tracking-[0.32em]"
            style={{
              color: isActive ? meta.hex : "rgba(148,163,184,0.6)",
              textShadow: isActive
                ? `0 0 30px ${meta.hex}90, 0 0 12px ${meta.hex}60, 0 0 4px ${meta.hex}40`
                : "none",
            }}
          >
            {getCategoryLabel(cat, isGerman)}
          </span>
          {/* premium employee count stat */}
          <div
            className="ml-auto flex flex-col items-end"
          >
            <span
              className="font-mono text-[20px] font-black leading-none"
              style={{
                color: isActive ? meta.hex : "rgba(148,163,184,0.5)",
                textShadow: isActive ? `0 0 20px ${meta.hex}80, 0 0 6px ${meta.hex}50` : "none",
              }}
            >
              {employees.length}
            </span>
            <span
              className="mt-0.5 text-[7px] font-black uppercase tracking-[0.3em]"
              style={{ color: isActive ? `${meta.hex}70` : "rgba(71,85,105,0.6)" }}
            >
              {isGerman ? "Besetzt" : "Staffed"}
            </span>
          </div>
        </div>

        {/* time range + status badge */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-medium" style={{ color: isActive ? `${meta.hex}99` : "rgba(100,116,139,0.7)" }}>{meta.timeLabel}</span>
          {status !== "unknown" && (
            <motion.span
              className="ml-auto rounded-full px-3 py-1 text-[8.5px] font-black uppercase tracking-[0.18em]"
              animate={isActive ? { opacity: [1, 0.75, 1] } : {}}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              style={{
                color:      statusHex,
                background: isActive ? `${meta.hex}16` : "rgba(255,255,255,0.04)",
                border:     `1px solid ${isActive ? meta.hex + "35" : "rgba(255,255,255,0.07)"}`,
                textShadow: isActive ? `0 0 12px ${meta.hex}80` : "none",
                boxShadow:  isActive ? `0 0 16px ${meta.hex}20, inset 0 1px 0 ${meta.hex}20` : "none",
              }}
            >
              {statusLabel}
            </motion.span>
          )}
        </div>

        {/* progress bar */}
        {isActive && totalMs > 0 && (
          <div className="mt-3.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span
                className="text-[7px] font-black uppercase tracking-[0.28em]"
                style={{ color: `${meta.hex}60` }}
              >
                {isGerman ? "Schichtfortschritt" : "Shift progress"}
              </span>
              <span
                className="font-mono text-[11px] font-black"
                style={{ color: meta.hex, textShadow: `0 0 14px ${meta.hex}90` }}
              >
                {Math.round(progress)}<span className="text-[8px]" style={{ color: `${meta.hex}80` }}>%</span>
              </span>
            </div>
            <div
              className="relative h-1.5 overflow-visible rounded-full"
              style={{ background: "rgba(255,255,255,0.04)", boxShadow: `inset 0 1px 3px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05)` }}
            >
              {/* tick marks at 25 / 50 / 75 */}
              {[25, 50, 75].map((pct) => (
                <div
                  key={pct}
                  className="absolute top-0 z-10 h-full w-px"
                  style={{ left: `${pct}%`, background: "rgba(255,255,255,0.10)" }}
                />
              ))}
              <motion.div
                className="relative h-full overflow-hidden rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${meta.hex}30, ${meta.hex}90, ${meta.hex})`,
                  boxShadow: `0 0 20px 3px ${meta.hex}99, 0 0 8px ${meta.hex}`,
                }}
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1.8, ease: "easeOut" }}
              >
                <motion.div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)", width: "38%" }}
                  animate={{ x: ["-115%", "320%"] }}
                  transition={{ duration: 1.9, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                />
              </motion.div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Employee List ─── */}
      {/* thin stats strip */}
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-1.5"
        style={{ borderBottom: `1px solid rgba(255,255,255,0.04)`, background: "rgba(0,0,0,0.15)" }}
      >
        <span className="text-[7px] font-black uppercase tracking-[0.3em]" style={{ color: `${meta.hex}55` }}>
          {getBandStateLabel(status, isGerman)}
        </span>
        <div className="h-3 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />
        <span className="text-[7px] text-slate-700">{meta.timeLabel}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {isSubGrouped && activeSubGroups.length > 0 && (
            <>
              {activeSubGroups.map(({ subGroup: sg }) => (
                <span
                  key={sg.code}
                  className="rounded px-1.5 py-0.5 text-[6.5px] font-black uppercase tracking-[0.2em]"
                  style={{ color: `${meta.hex}90`, background: `${meta.hex}0f`, border: `1px solid ${meta.hex}22` }}
                >
                  {getSubGroupBadgeLabel(sg.label)}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <Users className="h-6 w-6 text-slate-700" />
            <span className="text-[10px] text-slate-600">{isGerman ? "Keine Mitarbeiter" : "No employees"}</span>
          </div>
        ) : isSubGrouped ? (
          /* Sub-grouped Früh / Spät */
          <div className="flex flex-col gap-3">
            {activeSubGroups.map(({ subGroup, employees: subEmps }, si) => (
              <SubGroupSection
                key={subGroup.code}
                subGroup={subGroup}
                employees={subEmps}
                hex={meta.hex}
                now={now}
                baseDelay={bandIndex * 0.08 + si * 0.06}
              />
            ))}
          </div>
        ) : (
          /* Flat list for all other shifts */
          <div className="flex flex-col gap-1.5">
            {employees.map((emp, i) => (
              <EmployeeCard
                key={emp.name}
                employee={emp}
                hex={meta.hex}
                delay={bandIndex * 0.08 + i * 0.04}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
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
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");
  const [coloPool, setColoPool] = useState<string[]>([]);
  const [dispatcherConfig, setDispatcherConfig] = useState<{ enabled: boolean; priorities: string[] }>({ enabled: true, priorities: [] });
  const { fetchRoles, getRole } = useWeekplanRoleStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.get("/app-settings").then(({ data }) => {
      setColoPool(parseColoPool(data?.["shiftplan.colo_pool"]));
      setDispatcherConfig({ enabled: data?.["shiftplan.dispatcher_enabled"] !== "false", priorities: parseColoPool(data?.["shiftplan.dispatcher_pool"]) });
    }).catch(() => { setColoPool([]); setDispatcherConfig({ enabled: true, priorities: [] }); });
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const today = useMemo(() => new Date(now), [now]);
  const scheduleMonth = useMemo(
    () => formatMonthLabel(today.getFullYear(), today.getMonth() + 1, "de-DE"),
    [today],
  );
  const todayKey = useMemo(() => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`, [today]);

  const loadTodaySchedule = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError("");
    try {
      const data = await fetchSchedule(scheduleMonth);
      setSchedule(data?.schedule || {});
    } catch (error) {
      console.error("DAILY PLAN schedule load failed", error);
      setSchedule({});
      setScheduleError(isGerman ? "Die Tagesplanung konnte nicht geladen werden." : "The daily plan could not be loaded.");
    } finally {
      setScheduleLoading(false);
    }
  }, [isGerman, scheduleMonth]);

  useEffect(() => { void loadTodaySchedule(); }, [loadTodaySchedule]);
  useEffect(() => { void fetchRoles(todayKey, todayKey); }, [fetchRoles, todayKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTodaySchedule();
    setRefreshing(false);
  }, [loadTodaySchedule]);

  const allEmployees = useMemo((): EmployeeRow[] => {
    const day = today.getDate();
    return Object.entries(schedule)
      .map(([name, days]) => {
        const shiftCode = String(days?.[day] || "").trim().toUpperCase();
        if (!shiftCode || ["FS", "ABW", "OFF", "K", "U"].includes(shiftCode)) return null;
        return {
          name: name.replace(",", "").trim(),
          shiftCode,
          shiftTime: shiftTypes[shiftCode]?.time || "—",
          cat: SHIFT_CAT[shiftCode] ?? "special",
          roleKey: getRole(name, todayKey),
          isColo: isColoEmployee(name, coloPool),
          isDispatcher: dispatcherConfig.enabled && dispatcherConfig.priorities[0] ? isColoEmployee(name, [dispatcherConfig.priorities[0]]) && shiftCode.startsWith("E") : false,
        };
      })
      .filter((employee): employee is EmployeeRow => employee !== null)
      .sort((left, right) => left.shiftCode.localeCompare(right.shiftCode) || left.name.localeCompare(right.name, "de"));
  }, [coloPool, dispatcherConfig, schedule, today, todayKey, getRole]);

  const groups = useMemo(() => {
    const map = new Map<ShiftCat, EmployeeRow[]>();
    for (const cat of CAT_ORDER) map.set(cat, []);
    for (const emp of allEmployees) map.get(emp.cat)!.push(emp);
    return CAT_ORDER
      .filter((cat) => (map.get(cat)?.length ?? 0) > 0)
      .map((cat) => ({ cat, employees: map.get(cat)! }));
  }, [allEmployees]);

  const nowDate = today;
  const n = groups.length;

  // grid-template-columns as inline style based on band count
  const gridCols = n === 0 ? "1fr" : Array(n).fill("1fr").join(" ");

  return (
    <div
      className={`daily-enterprise relative flex min-h-0 flex-col overflow-hidden ${isEmbedded ? "h-full" : "h-[calc(100vh-64px)]"}`}
      style={{ background: "#0b1220" }}
    >
      {/* ambient background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <motion.div
          className="absolute rounded-full blur-[120px]"
          style={{ width: 500, height: 300, background: "radial-gradient(ellipse, rgba(56,189,248,0.07), transparent 70%)", top: "10%", left: "15%" }}
          animate={{ x: [0, 30, 0], y: [0, -15, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute rounded-full blur-[100px]"
          style={{ width: 400, height: 250, background: "radial-gradient(ellipse, rgba(251,146,60,0.05), transparent 70%)", top: "30%", right: "10%" }}
          animate={{ x: [0, -20, 0], y: [0, 20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        />
        <motion.div
          className="absolute rounded-full blur-[140px]"
          style={{ width: 300, height: 200, background: "radial-gradient(ellipse, rgba(250,204,21,0.04), transparent 70%)", bottom: "15%", left: "40%" }}
          animate={{ x: [0, 15, 0], y: [0, -10, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut", delay: 9 }}
        />
      </div>
      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
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
        {/* scan-line grid bg */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <radialGradient id="tpGridFade" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="white" stopOpacity="0.6" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <mask id="tpGridMask">
              <rect width="100%" height="100%" fill="url(#tpGridFade)" />
            </mask>
          </defs>
          <g mask="url(#tpGridMask)" opacity="0.07">
            {Array.from({ length: 24 }, (_, i) => (
              <line key={i}
                x1={`${(i / 23) * 100}%`} y1="0"
                x2={`${(i / 23) * 100}%`} y2="100%"
                stroke="#38bdf8" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 4 }, (_, i) => (
              <line key={`h${i}`}
                x1="0" y1={`${((i + 1) / 5) * 100}%`}
                x2="100%" y2={`${((i + 1) / 5) * 100}%`}
                stroke="#38bdf8" strokeWidth="0.4" />
            ))}
          </g>
        </svg>

        {/* strong center bloom */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 blur-[80px]"
            style={{ width: 500, height: 120, background: "radial-gradient(ellipse, rgba(56,189,248,0.22), transparent 70%)" }} />
        </div>
        {/* bottom edge neon line */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 5%, rgba(56,189,248,0.5) 30%, rgba(56,189,248,0.9) 50%, rgba(56,189,248,0.5) 70%, transparent 95%)", boxShadow: "0 0 12px 2px rgba(56,189,248,0.3)" }}
        />

        <div className="relative px-5 py-3.5">
          <div className="flex items-center justify-between gap-4">
            {/* LEFT: icon + title */}
            <div className="flex items-center gap-3.5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.06))",
                  border: "1px solid rgba(56,189,248,0.45)",
                  boxShadow: "0 0 32px rgba(56,189,248,0.35), inset 0 1px 0 rgba(56,189,248,0.4)",
                }}
              >
                <Calendar className="h-5 w-5" style={{ color: "#38bdf8", filter: "drop-shadow(0 0 6px #38bdf8)" }} />
              </div>
              <div>
                <div className="text-[7px] font-black uppercase tracking-[0.55em]" style={{ color: "rgba(56,189,248,0.38)" }}>
                  {isGerman ? "Schichtplanung · ODIN" : "Shift planning · ODIN"}
                </div>
                <h1
                  className="text-[17px] font-black uppercase tracking-[0.28em] text-white"
                  style={{ textShadow: "0 0 40px rgba(56,189,248,0.7), 0 0 14px rgba(56,189,248,0.5), 0 0 4px rgba(56,189,248,0.4)" }}
                >
                  {isGerman ? "Tagesplanung" : "Day planning"}
                </h1>
                <div className="mt-1 flex items-center gap-1.5">
                  {nowDate.toLocaleDateString(locale, { weekday: "long" }).toUpperCase().split("").map((char, i) => (
                    <span key={i} className="text-[7.5px] font-black tracking-[0.24em]" style={{ color: "rgba(148,163,184,0.45)" }}>{char}</span>
                  ))}
                  <span className="h-3 w-px" style={{ background: "rgba(56,189,248,0.3)" }} />
                  <span className="font-mono text-[8px] font-bold" style={{ color: "rgba(56,189,248,0.55)" }}>
                    {nowDate.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                </div>
              </div>
            </div>

            {/* RIGHT: stats + clock */}
            <div className="flex items-center gap-2.5">
              {/* LIVE badge */}
              {groups.some(({ cat }) => computeStatus(CAT_META[cat].window, now).status === "active") && (
                <motion.div
                  animate={{ opacity: [1, 0.55, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  className="hidden items-center gap-1.5 rounded-full px-3 py-1 xl:flex"
                  style={{
                    background: "rgba(244,63,94,0.1)",
                    border: "1px solid rgba(244,63,94,0.35)",
                    boxShadow: "0 0 14px rgba(244,63,94,0.2)",
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#f43f5e", boxShadow: "0 0 5px #f43f5e" }} />
                  <span className="text-[8px] font-black uppercase tracking-[0.28em]" style={{ color: "#f87171" }}>Live</span>
                </motion.div>
              )}
              {/* band status pills */}
              <div className="hidden items-center gap-2 xl:flex">
                {groups.map(({ cat, employees: catEmps }) => {
                  const meta = CAT_META[cat];
                  const { status } = computeStatus(meta.window, now);
                  const active = status === "active";
                  return (
                    <div
                      key={cat}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
                      style={{
                        background: active ? `${meta.hex}14` : `${meta.hex}07`,
                        border: `1px solid ${active ? meta.hex + "40" : meta.hex + "18"}`,
                        boxShadow: active ? `0 0 16px ${meta.hex}25` : "none",
                      }}
                    >
                      {active ? (
                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: meta.hex }} />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: meta.hex, boxShadow: `0 0 5px ${meta.hex}` }} />
                        </span>
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: `${meta.hex}40` }} />
                      )}
                      <span
                        className="text-[8.5px] font-black uppercase tracking-[0.2em]"
                        style={{ color: active ? meta.hex : `${meta.hex}80`, textShadow: active ? `0 0 8px ${meta.hex}70` : "none" }}
                      >{getCategoryLabel(cat, isGerman)}</span>
                      <span
                        className="rounded-full px-1.5 text-[9px] font-black"
                        style={{ color: active ? meta.hex : "rgba(100,116,139,0.7)", background: `${meta.hex}15` }}
                      >{catEmps.length}</span>
                    </div>
                  );
                })}
              </div>

              {/* refresh */}
              <button
                type="button"
                onClick={handleRefresh}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[8.5px] font-black uppercase tracking-[0.18em] transition-all hover:bg-cyan-400/10 active:scale-95"
                style={{ color: "#38bdf8", border: "1px solid rgba(56,189,248,0.22)" }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? (isGerman ? "Lädt…" : "Loading…") : "Refresh"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ══ BAND GRID ════════════════════════════════════════════════════════ */}
      <div className="min-h-0 flex-1">
        <AnimatePresence>
          {scheduleLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center gap-3 text-slate-400"
            >
              <RefreshCw className="h-8 w-8 animate-spin" />
              <p className="text-sm font-semibold">{isGerman ? "Tagesplanung wird geladen..." : "Loading daily plan..."}</p>
            </motion.div>
          ) : scheduleError ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
            >
              <p className="text-sm font-semibold text-red-300">{scheduleError}</p>
              <button type="button" onClick={() => void handleRefresh()} className="rounded-md border border-red-400/35 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-100 hover:bg-red-500/20">
                {isGerman ? "Erneut laden" : "Retry"}
              </button>
            </motion.div>
          ) : groups.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center gap-3"
            >
              <Calendar className="h-10 w-10 text-slate-700" />
              <p className="text-[13px] font-semibold text-slate-500">{isGerman ? "Keine Schichtdaten für heute" : "No shift data for today"}</p>
              <p className="text-[10px] text-slate-600">{isGerman ? "Bitte lade zunächst den Schichtplan für diesen Monat." : "Please load the shift plan for this month first."}</p>
              <a
                href={`/odin-go/shiftplan${window.location.search}`}
                className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:underline"
              >
                {isGerman ? "Zum Schichtplan" : "Open shift plan"} <ChevronRight className="h-3 w-3" />
              </a>
            </motion.div>
          ) : (
            <motion.div
              key="bands"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full p-4"
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: "12px",
              }}
            >
              {groups.map(({ cat, employees }, i) => (
                <ShiftBand
                  key={cat}
                  cat={cat}
                  employees={employees}
                  now={now}
                  bandIndex={i}
                  totalBands={n}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
