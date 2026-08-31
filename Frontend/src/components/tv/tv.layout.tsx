/* ------------------------------------------------ */
/* TV LAYOUT – SLIDE ROTATOR                       */
/* Slide 1: Schichten Heute + Tickets               */
/* Slide 2: Informationen & Anweisungen             */
/* Slide 3: Nächste 72 Stunden                      */
/* Slide 4: Handover                                */
/* Slide 5: Projekte                                */
/* Slide 6: Events                                  */
/* Slide 7: Assignment Decision Flow (Hero)         */
/* ------------------------------------------------ */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TvLayoutProps } from "./tv.types";
import { TvShiftplan } from "./tv.shiftplan";
import { TVHandoverMirror } from "./TVHandoverMirror";
import { TVPollsSlide } from "./TVPollsSlide";
import { TVCriticalWorkloadSlide } from "../critical-workload/TVCriticalWorkloadSlide";
import type { DashboardInfoEntry } from "../../api/dashboard";
import { ChevronLeft, ChevronRight, Clock, ArrowRightLeft, Users, AlertTriangle, Megaphone, FolderKanban, CheckCircle2, Calendar, User, Camera, Vote, TrendingUp, TrendingDown } from "lucide-react";
import { api } from "../../api/api";
import { fetchEqixQuote, type MarketQuote } from "../../api/market";
import { getRemainingMs } from "../../utils/ticketColors";
import { findBestMatch, normalizeName } from "../../utils/fuzzyName";
import { useLanguage } from "../../context/LanguageContext";
import { formatDate, formatTime } from "../../utils/dateFormat";

const AUTO_ROTATE_MS = 10_000; // 10 seconds – default for most slides
const PAUSE_AFTER_MANUAL_MS = 60_000;

/* Per-slide rotation durations (ms) – defaults, overridden by API config */
const DEFAULT_SLIDE_DURATION_MS: Partial<Record<string, number>> = {
  "72h":        20_000, // 20 seconds for next-72h-tickets slide
  "handover":   20_000, // 20 seconds for handover slide
};

/** Fetches slide config from backend, falls back to hardcoded defaults */
async function loadSlideConfig(): Promise<Record<string, { enabled: boolean; duration_ms: number; sort_order: number; only_if_data: boolean }>> {
  try {
    const res = await api.get("/tv/config");
    const rows = res.data;
    if (!Array.isArray(rows) || rows.length === 0) return {};
    return Object.fromEntries(rows.map((r: any) => [r.slide_id, r]));
  } catch {
    return {};
  }
}

function getSlideRotationMs(slideId: string, configMap: Record<string, { duration_ms: number }>): number {
  if (configMap[slideId]) return configMap[slideId].duration_ms;
  return DEFAULT_SLIDE_DURATION_MS[slideId] ?? AUTO_ROTATE_MS;
}

function normalizeOwnerKey(value: string) {
  return normalizeName(value).replace(/\s+/g, "");
}

function buildPersonOwnerKeys(name: string) {
  const tokens = normalizeName(name).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];

  const keys = new Set<string>();
  keys.add(tokens.join(""));
  keys.add([...tokens].reverse().join(""));

  if (tokens.length >= 2) {
    const firstToken = tokens[0];
    const secondToken = tokens[1];
    const lastToken = tokens[tokens.length - 1];

    if (secondToken) keys.add(`${secondToken.charAt(0)}${firstToken}`);
    if (lastToken) {
      keys.add(`${lastToken.charAt(0)}${firstToken}`);
      keys.add(`${firstToken.charAt(0)}${lastToken}`);
      keys.add(`${lastToken}${firstToken.charAt(0)}`);
    }
  }

  return [...keys].filter(Boolean);
}

function buildEmployeeOwnerKeys(employee: { name?: string; jarvisDisplayName?: string | null; jarvisOwnerCode?: string | null; jarvisInitials?: string | null }) {
  const keys = new Set<string>();

  for (const key of buildPersonOwnerKeys(employee.name || "")) {
    keys.add(key);
  }

  for (const value of [employee.name, employee.jarvisDisplayName, employee.jarvisOwnerCode, employee.jarvisInitials]) {
    const normalized = normalizeOwnerKey(String(value || ""));
    if (normalized) keys.add(normalized);
  }

  return [...keys].filter(Boolean);
}

function readTicketOwnerCandidates(ticket: any) {
  return [
    ticket?.owner,
    ticket?.Owner,
    ticket?.current_owner,
    ticket?.currentOwner,
    ticket?.assigned_to,
    ticket?.assignedTo,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

const CRAWLER_STALE_THRESHOLD_MS = 10 * 60 * 1000;

/* Static slide definitions – filtering happens at runtime */
const ALL_SLIDES = [
  { id: "shifts",     title: "Schichten Heute",              icon: Users         },
  { id: "info",       title: "Informationen & Anweisungen",  icon: Megaphone     },
  { id: "72h",        title: "Critical Workload",            icon: AlertTriangle },
  { id: "handover",   title: "Handover",                     icon: ArrowRightLeft },
  { id: "projects",   title: "Projekte",                     icon: FolderKanban  },
  { id: "events",     title: "Events",                       icon: Camera        },
  { id: "polls",      title: "Umfragen",                     icon: Vote          },
] as const;

type SlideId = typeof ALL_SLIDES[number]["id"];

/* ------------------------------------------------ */
/* SHIFT WINDOW CALCULATION                         */
/* ------------------------------------------------ */
type ShiftName = "E1" | "E2" | "L1" | "L2" | "N";
interface ShiftWindow { name: ShiftName; start: number; end: number; }
type ShiftKind = "early" | "late" | "night";

function getTodayShiftWindows(now: Date): ShiftWindow[] {
  const base = (h: number, m: number, extra = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + extra);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };

  const todayShifts: ShiftWindow[] = [
    { name: "E1", start: base(6, 30), end: base(15, 30) },
    { name: "E2", start: base(7, 0), end: base(16, 0) },
    { name: "L1", start: base(13, 0), end: base(22, 0) },
    { name: "L2", start: base(15, 0), end: base(0, 0, 1) },
    { name: "N", start: base(21, 15), end: base(6, 45, 1) },
  ];

  // Before 07:00, also include yesterday's overnight shifts (L2, N)
  // so a night shift that started yesterday at 21:15 and ends today at 06:45
  // is correctly detected as "running".
  const hour = now.getHours();
  if (hour < 7) {
    todayShifts.push(
      { name: "L2", start: base(15, 0, -1), end: base(0, 0) },
      { name: "N", start: base(21, 15, -1), end: base(6, 45) },
    );
  }

  return todayShifts;
}

function buildShiftTiming(now: Date): Array<{ key: ShiftKind; label: string; detail: string; hex: string; active: boolean; upcoming: boolean }> {
  const nowMs = now.getTime();
  const windows = getTodayShiftWindows(now);
  const meta: Record<ShiftKind, { label: string; hex: string }> = {
    early: { label: "Früh", hex: "#fb923c" },
    late: { label: "Spät", hex: "#facc15" },
    night: { label: "Nacht", hex: "#38bdf8" },
  };

  const byKind = new Map<ShiftKind, ShiftWindow[]>();
  for (const window of windows) {
    const kind: ShiftKind = window.name.startsWith("E") ? "early" : window.name.startsWith("L") ? "late" : "night";
    const current = byKind.get(kind) ?? [];
    current.push(window);
    byKind.set(kind, current);
  }

  return (["early", "late", "night"] as ShiftKind[]).map((kind) => {
    const relevant = byKind.get(kind) ?? [];
    const active = relevant
      .filter((window) => nowMs >= window.start && nowMs < window.end)
      .sort((left, right) => right.end - left.end)[0];

    if (active) {
      const remaining = active.end - nowMs;
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      return {
        key: kind,
        label: meta[kind].label,
        detail: `läuft noch ${h}h ${m}m`,
        hex: meta[kind].hex,
        active: true,
        upcoming: false,
      };
    }

    const upcoming = relevant
      .filter((window) => nowMs < window.start)
      .sort((left, right) => left.start - right.start)[0];

    if (upcoming) {
      const until = upcoming.start - nowMs;
      const h = Math.floor(until / 3600000);
      const m = Math.floor((until % 3600000) / 60000);
      return {
        key: kind,
        label: meta[kind].label,
        detail: `beginnt in ${h}h ${m}m`,
        hex: meta[kind].hex,
        active: false,
        upcoming: true,
      };
    }

    return {
      key: kind,
      label: meta[kind].label,
      detail: "beendet",
      hex: meta[kind].hex,
      active: false,
      upcoming: false,
    };
  });
}

function getActiveShiftKinds(now: Date): Set<ShiftKind> {
  const nowMs = now.getTime();
  const windows = getTodayShiftWindows(now);
  const activeNames = windows.filter((window) => nowMs >= window.start && nowMs < window.end).map((window) => window.name);

  // Keep TV readable during overlap windows: early+late or late+night.
  const activeKinds = new Set<ShiftKind>();
  for (const shiftName of activeNames) {
    if (shiftName.startsWith("E")) activeKinds.add("early");
    if (shiftName.startsWith("L")) activeKinds.add("late");
    if (shiftName === "N") activeKinds.add("night");
  }

  if (activeKinds.size > 0) return activeKinds;

  // Small gap handling (e.g. 06:45-07:00): show next upcoming shift instead of an empty slide.
  const nextWindow = windows
    .filter((window) => nowMs < window.start)
    .sort((left, right) => left.start - right.start)[0];

  if (!nextWindow) {
    activeKinds.add("night");
    return activeKinds;
  }

  if (nextWindow.name.startsWith("E")) activeKinds.add("early");
  else if (nextWindow.name.startsWith("L")) activeKinds.add("late");
  else activeKinds.add("night");

  return activeKinds;
}

/* ------------------------------------------------ */
/* SLIDE HEADER                                     */
/* ------------------------------------------------ */
interface TeamsStatus { configured: boolean; active: boolean; sentToday: number }
interface AutomationStatus { enabled: boolean; mode: string }

/* ------------------------------------------------ */
/* TV STOCK BADGE (Equinix Aktienkurs)              */
/* ------------------------------------------------ */

function TvStockBadge() {
  const [quote, setQuote] = useState<MarketQuote | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const q = await fetchEqixQuote();
        if (alive) setQuote(q);
      } catch { /* silent */ }
    };
    load();
    const iv = setInterval(load, 300_000); // 5 min
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const available = quote?.available === true && Number.isFinite(quote?.price);
  const positive = (quote?.changePercent ?? 0) >= 0;
  const priceStr = available
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: quote?.currency || "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(quote!.price!)
    : "--";
  const deltaStr = available && Number.isFinite(quote?.changePercent)
    ? `${positive ? "+" : ""}${quote!.changePercent!.toFixed(2)}%`
    : null;

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg shrink-0"
      style={{
        background: "linear-gradient(135deg, rgba(56,189,248,0.1), rgba(56,189,248,0.04))",
        border: "1px solid rgba(56,189,248,0.25)",
        boxShadow: available ? "0 0 16px rgba(56,189,248,0.12)" : "none",
      }}
      title={available ? `Equinix-Aktie · ${quote?.stale ? "zwischengespeichert" : "live"}` : "Equinix-Aktie nicht verfügbar"}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${
        available
          ? quote?.stale ? "bg-amber-400" : positive ? "bg-emerald-400" : "bg-rose-400"
          : "bg-slate-500"
      }`} />
      <span className="text-sm font-black tracking-wider text-cyan-200">EQIX</span>
      <span className="text-sm font-semibold text-slate-100 tabular-nums">{priceStr}</span>
      {available && deltaStr && (
        <span className={`flex items-center gap-0.5 text-sm font-bold tabular-nums ${positive ? "text-emerald-300" : "text-rose-300"}`}>
          {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {deltaStr}
        </span>
      )}
    </div>
  );
}

function SlideHeader({ now, title, icon: Icon, crawlerLastUpdate, shiftplanLastUpload, crawlerStale, teamsStatus, automationStatus }: {
  now: Date; title: string; icon: React.FC<any>;
  crawlerLastUpdate?: string | null; shiftplanLastUpload?: string | null; crawlerStale?: boolean;
  teamsStatus?: TeamsStatus | null; automationStatus?: AutomationStatus | null;
}) {
  /* Own 1-second clock for display only — does NOT trigger parent re-renders */
  const [displayTime, setDisplayTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setDisplayTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const shiftInfo = useMemo(() => buildShiftTiming(now), [now]);

  const formatUpdateTime = (iso: string | null | undefined): string => {
    if (!iso) return "–";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "–";
    return d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  /* Mode label for automation */
  const modeLabel = (mode: string): string => {
    if (mode === "live") return "Live";
    if (mode === "shadow") return "Shadow";
    if (mode === "dry-run") return "Dry-Run";
    return mode;
  };

  return (
    <div className="relative shrink-0 overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(4,17,37,0.98) 0%, rgba(2,11,30,0.98) 58%, rgba(2,8,20,0.99) 100%)",
        borderBottom: "1px solid rgba(56,189,248,0.22)",
        boxShadow: "0 1px 0 rgba(56,189,248,0.1), 0 12px 50px rgba(0,0,0,0.52), 0 0 90px rgba(56,189,248,0.08)",
      }}>
      <div className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(115deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 14%, transparent 28%), radial-gradient(circle at 78% 18%, rgba(56,189,248,0.16), transparent 30%)",
        }}
      />
      {/* Neon bottom edge */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent 5%, rgba(56,189,248,0.5) 30%, rgba(56,189,248,0.9) 50%, rgba(56,189,248,0.5) 70%, transparent 95%)",
          boxShadow: "0 0 12px 2px rgba(56,189,248,0.3)",
        }} />
      {/* Center bloom */}
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-full opacity-60"
        style={{ width: 640, height: 150, background: "radial-gradient(ellipse, rgba(56,189,248,0.28), transparent 70%)", filter: "blur(90px)" }} />
      <div className="pointer-events-none absolute -left-12 top-2 h-24 w-56 rotate-6 blur-3xl"
        style={{ background: "linear-gradient(90deg, transparent, rgba(56,189,248,0.12), transparent)", opacity: 0.85 }} />
      <div className="pointer-events-none absolute -right-16 top-5 h-24 w-64 -rotate-6 blur-3xl"
        style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.1), transparent)", opacity: 0.75 }} />

      <div className="relative flex items-center justify-between px-7 py-4 gap-5">
        {/* ODIN BRANDING – matches global header look */}
        <div className="flex items-center gap-5 text-slate-100 shrink-0">
          <div className="relative flex min-w-0 items-stretch">
            <div
              className="relative flex w-full min-w-0 items-center justify-center overflow-hidden rounded-[34px] border px-6 py-4 xl:rounded-[36px]"
              style={{
                width: "min(40vw, 700px)",
                minHeight: "128px",
                background: "radial-gradient(ellipse 96% 88% at 12% 50%, rgba(0,229,255,0.22), transparent 42%), radial-gradient(ellipse 88% 76% at 88% 18%, rgba(37,99,235,0.22), transparent 34%), linear-gradient(145deg, rgba(10,21,44,0.92), rgba(3,9,24,0.88))",
                borderColor: "rgba(0,229,255,0.28)",
                boxShadow: "0 28px 80px rgba(0,0,0,0.50), 0 0 64px rgba(0,229,255,0.22), 0 0 120px rgba(0,180,255,0.10), inset 0 1px 0 rgba(0,229,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.42)",
              }}
            >
              <img
                src="/odin-assets/odin_brand_banner_reference.png"
                alt="ODIN Brand"
                className="keep-brand-banner pointer-events-none absolute inset-0 h-full w-full"
                style={{
                  objectFit: "contain",
                  objectPosition: "center center",
                  transform: "scale(0.96)",
                  filter: "saturate(1.4) contrast(1.15) brightness(1.18)",
                }}
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: "radial-gradient(ellipse 130% 120% at 50% 50%, transparent 68%, rgba(2,7,20,0.42) 100%)",
                }}
              />
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,229,255,0.28),transparent_56%),radial-gradient(ellipse_at_left,rgba(37,99,235,0.22),transparent_44%)]"
              />
            </div>
          </div>
          <div className="h-12 w-px mx-1" style={{ background: "linear-gradient(180deg, rgba(56,189,248,0.06), rgba(56,189,248,0.32), rgba(56,189,248,0.06))" }} />
          <div className="flex items-center gap-3 rounded-2xl px-4 py-2"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015) 22%, rgba(6,13,30,0.72) 100%)",
              border: "1px solid rgba(56,189,248,0.16)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 0 34px rgba(56,189,248,0.1)",
            }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl"
              style={{
                background: "linear-gradient(135deg, rgba(56,189,248,0.26), rgba(56,189,248,0.08))",
                border: "1px solid rgba(56,189,248,0.45)",
                boxShadow: "0 0 24px rgba(56,189,248,0.32), 0 0 56px rgba(56,189,248,0.12)",
              }}>
              <Icon className="w-5 h-5 text-cyan-300" />
            </span>
            <span className="text-[17px] font-black uppercase tracking-[0.2em] text-white"
              style={{ textShadow: "0 0 26px rgba(56,189,248,0.46), 0 0 58px rgba(56,189,248,0.16)" }}>{title}</span>
          </div>
        </div>

        {/* Center: Shift timers + Status info */}
        <div className="flex flex-col items-end gap-1 overflow-hidden">
          <div className="flex items-center gap-2.5 text-base flex-wrap justify-end">
            {shiftInfo.map((shift) => (
              <div
                key={shift.key}
                className="flex items-center gap-2.5 rounded-2xl px-4 py-2 whitespace-nowrap"
                style={{
                  background: shift.active
                    ? `linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015) 18%, rgba(3,9,24,0.95) 70%), radial-gradient(ellipse at 50% 0%, ${shift.hex}26, rgba(3,9,24,0.95) 85%)`
                    : shift.upcoming
                      ? `${shift.hex}12`
                      : "rgba(255,255,255,0.04)",
                  border: `1px solid ${shift.active ? `${shift.hex}55` : shift.upcoming ? `${shift.hex}30` : "rgba(255,255,255,0.08)"}`,
                  boxShadow: shift.active ? `0 0 24px ${shift.hex}36, 0 0 58px ${shift.hex}16` : "none",
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    background: shift.hex,
                    boxShadow: shift.active ? `0 0 14px ${shift.hex}, 0 0 26px ${shift.hex}80` : "none",
                    opacity: shift.active ? 1 : 0.7,
                  }}
                />
                <span className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: shift.hex }}>
                  {shift.label}
                </span>
                <span className="text-[12px] font-semibold" style={{ color: shift.active ? "#f8fafc" : "rgba(226,232,240,0.72)" }}>
                  {shift.detail}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap justify-end">
            {/* Teams status badge */}
            {teamsStatus && (
              <span
                className="whitespace-nowrap px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-[0.15em]"
                style={{
                  background: teamsStatus.active ? "rgba(16,185,129,0.12)" : "rgba(100,116,139,0.12)",
                  border: `1px solid ${teamsStatus.active ? "rgba(16,185,129,0.30)" : "rgba(100,116,139,0.20)"}`,
                  color: teamsStatus.active ? "#34d399" : "#94a3b8",
                  boxShadow: teamsStatus.active ? "0 0 16px rgba(16,185,129,0.18)" : "none",
                }}
                title={teamsStatus.active
                  ? `Teams-Benachrichtigungen sind aktiv. Heute versendet: ${teamsStatus.sentToday}`
                  : "Teams-Benachrichtigungen sind nicht konfiguriert oder inaktiv."
                }
              >
                Teams: {teamsStatus.active ? "Aktiv" : "Inaktiv"}
              </span>
            )}
          {/* Automation status badge */}
          {automationStatus && (
            <span
              className="whitespace-nowrap px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-[0.15em]"
              style={{
                background: automationStatus.enabled
                  ? automationStatus.mode === "live" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)"
                  : "rgba(100,116,139,0.12)",
                border: `1px solid ${automationStatus.enabled
                  ? automationStatus.mode === "live" ? "rgba(16,185,129,0.30)" : "rgba(245,158,11,0.30)"
                  : "rgba(100,116,139,0.20)"}`,
                color: automationStatus.enabled
                  ? automationStatus.mode === "live" ? "#34d399" : "#fbbf24"
                  : "#94a3b8",
                boxShadow: automationStatus.enabled ? "0 0 16px rgba(16,185,129,0.18)" : "none",
              }}
              title={automationStatus.enabled
                ? `Automatische Zuweisungslogik ist im Modus „${modeLabel(automationStatus.mode)}" aktiv.`
                : "Automatische Zuweisungslogik ist deaktiviert. Nur manuelle Runs möglich."
              }
            >
              Automatisierung: {automationStatus.enabled ? `${modeLabel(automationStatus.mode)} aktiv` : "Inaktiv"}
            </span>
          )}
          <span className="h-4 w-px" style={{ background: "rgba(56,189,248,0.18)" }} />
          <span className={`whitespace-nowrap ${crawlerStale ? "text-red-400 font-bold" : ""}`}>Crawler: {formatUpdateTime(crawlerLastUpdate)}</span>
          {crawlerStale && (
            <span className="whitespace-nowrap px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] animate-pulse"
              style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.35)", color: "#f87171", boxShadow: "0 0 14px rgba(244,63,94,0.2)" }}>
              Keine aktuellen Crawler-Daten
            </span>
          )}
          <span className="whitespace-nowrap">Dienstplan: {formatUpdateTime(shiftplanLastUpload)}</span>
        </div>
      </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* Clock badge */}
          <div className="flex items-center gap-3 rounded-2xl px-4 py-2"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015) 18%, rgba(4,10,25,0.86) 100%)",
              border: "1px solid rgba(56,189,248,0.30)",
              boxShadow: "0 0 34px rgba(56,189,248,0.22), inset 0 1px 0 rgba(56,189,248,0.25)",
            }}>
            <span className="text-[15px] text-slate-300">{formatDate(displayTime)}</span>
            <span
              className="font-mono font-black text-[24px] text-white"
              style={{ textShadow: "0 0 20px rgba(56,189,248,0.74), 0 0 8px rgba(56,189,248,0.42)" }}
            >
              {formatTime(displayTime)}
            </span>
          </div>
          <TvStockBadge />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------ */
/* HELPER: project glow by progress %               */
/* ------------------------------------------------ */
function getProjectGlow(progress: number): string {
  const p = Math.min(100, Math.max(0, progress));
  if (p <= 25) return "shadow-[0_0_20px_3px_rgba(239,68,68,0.45)] border-red-500/40";
  if (p <= 50) return "shadow-[0_0_20px_3px_rgba(249,115,22,0.45)] border-orange-500/40";
  if (p <= 75) return "shadow-[0_0_20px_3px_rgba(21,128,61,0.5)] border-green-700/40";
  return "shadow-[0_0_20px_3px_rgba(134,239,172,0.45)] border-green-400/40";
}

/* ------------------------------------------------ */
/* PROJEKTE SLIDE (read-only, TV-optimiert)          */
/* ------------------------------------------------ */

interface TvProject {
  id: number;
  name: string;
  responsible?: string | null;
  expected_done?: string | null;
  progress: number;
  description?: string | null;
  status: string;
  creator: string;
  created_at: string;
}

function ProjekteSlide({ projects }: { projects: TvProject[] }) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
        <FolderKanban className="w-16 h-16 opacity-20" />
        <p className="text-2xl font-semibold">Keine Projekte angelegt</p>
      </div>
    );
  }

  const active = projects.filter(p => p.status !== "completed");
  const done = projects.filter(p => p.status === "completed");

  const getProgressColor = (pct: number) => {
    if (pct <= 25) return { hex: "#f43f5e", bg: "rgba(244,63,94,0.14)", border: "rgba(244,63,94,0.35)" };
    if (pct <= 50) return { hex: "#fb923c", bg: "rgba(251,146,60,0.14)", border: "rgba(251,146,60,0.35)" };
    if (pct <= 75) return { hex: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.30)" };
    return { hex: "#34d399", bg: "rgba(52,211,153,0.14)", border: "rgba(52,211,153,0.35)" };
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="w-full space-y-4">
        {active.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.06))", border: "1px solid rgba(56,189,248,0.40)", boxShadow: "0 0 16px rgba(56,189,248,0.2)" }}>
                <FolderKanban className="w-3.5 h-3.5 text-cyan-400" />
              </span>
              <h2 className="text-[13px] font-black tracking-[0.22em] uppercase text-white"
                style={{ textShadow: "0 0 20px rgba(56,189,248,0.5)" }}>
                Aktive Projekte
              </h2>
            </div>
            {active.map(p => {
              const daysLeft = p.expected_done
                ? Math.ceil((new Date(p.expected_done).getTime() - Date.now()) / 86400000)
                : null;
              const daysColor =
                daysLeft === null ? "text-slate-500"
                : daysLeft < 0 ? "text-red-400"
                : daysLeft < 7 ? "text-orange-400"
                : "text-slate-300";
              const pc = getProgressColor(p.progress);
              return (
                <div
                  key={p.id}
                  className="relative w-full flex items-start gap-5 overflow-hidden rounded-2xl px-6 py-5"
                  style={{
                    background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${pc.bg}, rgba(3,9,24,0.98) 65%)`,
                    border: `1px solid ${pc.border}`,
                    boxShadow: `0 0 0 1px ${pc.hex}20, 0 0 50px ${pc.hex}18, 0 16px 48px ${pc.hex}12, inset 0 1px 0 ${pc.hex}25`,
                  }}
                >
                  {/* Neon top edge */}
                  <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: 2, background: `linear-gradient(90deg, transparent 3%, ${pc.hex}70 25%, ${pc.hex} 50%, ${pc.hex}70 75%, transparent 97%)`, boxShadow: `0 0 12px 2px ${pc.hex}50` }} />

                  {/* Progress badge */}
                  <span className="shrink-0 mt-0.5 flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-16 text-center"
                    style={{ background: `${pc.hex}14`, border: `1px solid ${pc.hex}35`, boxShadow: `0 0 14px ${pc.hex}20` }}>
                    <span className="text-lg font-black tabular-nums" style={{ color: pc.hex, textShadow: `0 0 10px ${pc.hex}70` }}>{p.progress}%</span>
                  </span>

                  <div className="flex-1 min-w-0 space-y-2">
                    <h3 className="font-bold text-2xl text-white leading-snug tracking-wide">{p.name}</h3>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, p.progress))}%`, background: pc.hex, boxShadow: `0 0 8px ${pc.hex}60` }} />
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-base text-slate-400">
                      {p.responsible && (
                        <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-slate-500" />{p.responsible}</span>
                      )}
                      {p.expected_done && (
                        <span className={`flex items-center gap-1.5 ${daysColor}`}>
                          <Calendar className="w-4 h-4" />
                          {new Date(p.expected_done).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
                          {daysLeft !== null && (
                            <span className="text-sm">({daysLeft < 0 ? `${Math.abs(daysLeft)}d überfällig` : daysLeft === 0 ? "heute" : `noch ${daysLeft}d`})</span>
                          )}
                        </span>
                      )}
                    </div>
                    {p.description && <p className="text-base text-slate-400 leading-relaxed">{p.description}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {done.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.06))", border: "1px solid rgba(16,185,129,0.40)", boxShadow: "0 0 16px rgba(16,185,129,0.2)" }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </span>
              <h2 className="text-[13px] font-black tracking-[0.22em] uppercase text-white"
                style={{ textShadow: "0 0 20px rgba(16,185,129,0.4)" }}>
                Abgeschlossen
              </h2>
            </div>
            {done.map(p => (
              <div
                key={p.id}
                className="w-full flex items-center gap-4 overflow-hidden rounded-2xl px-6 py-4"
                style={{
                  background: "rgba(4,10,26,0.96)",
                  border: "1px solid rgba(16,185,129,0.20)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <p className="font-semibold text-xl text-emerald-100">{p.name}</p>
                {p.responsible && <span className="text-base text-slate-400 ml-auto">{p.responsible}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------ */
/* INFO & ANWEISUNGEN SLIDE                         */
/* Full-width list, glow by type                    */
/* ------------------------------------------------ */
function InfoAnweisungenSlide({ entries }: { entries: DashboardInfoEntry[] }) {
  const anweisungen = entries.filter(e => e.type === "instruction");
  const infos = entries.filter(e => e.type !== "instruction");

  return (
    <div className="h-full overflow-auto p-6">
      <div className="w-full space-y-4">

        {/* ANWEISUNGEN – premium red glow */}
        {anweisungen.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: "linear-gradient(135deg, rgba(244,63,94,0.2), rgba(244,63,94,0.06))", border: "1px solid rgba(244,63,94,0.45)", boxShadow: "0 0 16px rgba(244,63,94,0.3)" }}>
                <Megaphone className="w-3.5 h-3.5 text-rose-400" />
              </span>
              <h2 className="text-[13px] font-black tracking-[0.22em] uppercase text-white animate-pulse"
                style={{ textShadow: "0 0 20px rgba(244,63,94,0.7), 0 0 8px rgba(244,63,94,0.4)" }}>Anweisungen</h2>
            </div>
            {anweisungen.map((e) => (
              <div
                key={e.id}
                className="relative w-full flex items-start gap-4 overflow-hidden rounded-2xl px-6 py-5"
                style={{
                  background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(244,63,94,0.16), rgba(3,9,24,0.98) 65%)",
                  border: "1px solid rgba(244,63,94,0.40)",
                  boxShadow: "0 0 0 1px rgba(244,63,94,0.15), 0 0 60px rgba(244,63,94,0.18), 0 16px 48px rgba(244,63,94,0.12), inset 0 1px 0 rgba(244,63,94,0.25)",
                }}
              >
                {/* Neon top edge */}
                <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: 2, background: "linear-gradient(90deg, transparent 3%, rgba(244,63,94,0.7) 25%, #f43f5e 50%, rgba(244,63,94,0.7) 75%, transparent 97%)", boxShadow: "0 0 16px 2px rgba(244,63,94,0.5)" }} />
                <span className="shrink-0 mt-0.5 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider relative z-10"
                  style={{ background: "rgba(244,63,94,0.14)", border: "1px solid rgba(244,63,94,0.35)", color: "#fda4af", boxShadow: "0 0 10px rgba(244,63,94,0.15)" }}>Anweisung</span>
                <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5 relative z-10" />
                <p className="font-extrabold text-2xl text-white leading-snug tracking-wide relative z-10" style={{ textShadow: "0 0 20px rgba(244,63,94,0.3)" }}>{e.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* INFORMATIONEN – premium cyan glow */}
        {infos.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.06))", border: "1px solid rgba(56,189,248,0.45)", boxShadow: "0 0 16px rgba(56,189,248,0.2)" }}>
                <Megaphone className="w-3.5 h-3.5 text-cyan-400" />
              </span>
              <h2 className="text-[13px] font-black tracking-[0.22em] uppercase text-white"
                style={{ textShadow: "0 0 20px rgba(56,189,248,0.5)" }}>Informationen</h2>
            </div>
            {infos.map((e) => (
              <div
                key={e.id}
                className="relative w-full flex items-start gap-4 overflow-hidden rounded-2xl px-6 py-5"
                style={{
                  background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(56,189,248,0.12), rgba(3,9,24,0.98) 65%)",
                  border: "1px solid rgba(56,189,248,0.25)",
                  boxShadow: "0 0 0 1px rgba(56,189,248,0.10), 0 0 50px rgba(56,189,248,0.10), 0 16px 48px rgba(56,189,248,0.08), inset 0 1px 0 rgba(56,189,248,0.20)",
                }}
              >
                {/* Neon top edge */}
                <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, rgba(56,189,248,0.5) 30%, rgba(56,189,248,0.9) 50%, rgba(56,189,248,0.5) 70%, transparent 95%)", boxShadow: "0 0 8px 1px rgba(56,189,248,0.3)" }} />
                <span className="shrink-0 mt-0.5 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider"
                  style={{ background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.30)", color: "#7dd3fc", boxShadow: "0 0 10px rgba(56,189,248,0.12)" }}>Info</span>
                <p className="text-2xl font-bold text-white leading-relaxed tracking-wide">{e.content}</p>
              </div>
            ))}
          </div>
        )}

        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Megaphone className="w-14 h-14 opacity-20" />
            <p className="text-xl font-semibold">Keine Anweisungen oder Informationen</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------ */
/* EVENTS SLIDE                                     */
/* Shows event photos full-screen with slideshow    */
/* ------------------------------------------------ */

interface EventImage {
  id: number;
  filename: string;
  original_name?: string;
  url_path: string;
  created_at: string;
  is_visible?: boolean;
}

function EventsSlide({ images }: { images: EventImage[] }) {
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => { setCurrentIdx(0); }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => setCurrentIdx(i => (i + 1) % images.length), 10_000);
    return () => clearInterval(id);
  }, [images.length]);

  if (images.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 text-muted-foreground">
        <Camera className="w-20 h-20 opacity-20" />
        <p className="text-2xl font-semibold">Keine Events vorhanden</p>
      </div>
    );
  }

  const idx = Math.min(currentIdx, images.length - 1);
  const img = images[idx];

  return (
    <div className="h-full relative flex items-center justify-center" style={{ background: "#020b1e" }}>
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute rounded-full" style={{ width: 400, height: 250, top: "10%", left: "5%", background: "radial-gradient(ellipse, rgba(56,189,248,0.06), transparent 70%)", filter: "blur(120px)" }} />
      <div className="pointer-events-none absolute rounded-full" style={{ width: 300, height: 200, bottom: "10%", right: "5%", background: "radial-gradient(ellipse, rgba(251,146,60,0.04), transparent 70%)", filter: "blur(100px)" }} />

      {/* Photo frame */}
      <div className="relative rounded-2xl overflow-hidden" style={{ maxWidth: "90%", maxHeight: "90%", border: "1px solid rgba(56,189,248,0.15)", boxShadow: "0 0 0 1px rgba(56,189,248,0.08), 0 20px 60px rgba(0,0,0,0.5), 0 0 80px rgba(56,189,248,0.08)" }}>
        <img
          key={img.id}
          src={img.url_path}
          alt={img.original_name ?? img.filename}
          className="max-h-[80vh] max-w-full object-contain animate-in fade-in duration-500"
        />
      </div>

      {/* Counter badge */}
      {images.length > 1 && (
        <div className="absolute top-4 right-4 rounded-xl px-3 py-1.5"
          style={{ background: "rgba(3,9,24,0.85)", border: "1px solid rgba(56,189,248,0.25)", boxShadow: "0 0 16px rgba(56,189,248,0.12)" }}>
          <span className="text-sm font-black tabular-nums text-white" style={{ textShadow: "0 0 10px rgba(56,189,248,0.5)" }}>{idx + 1}</span>
          <span className="text-sm text-slate-500 mx-1">/</span>
          <span className="text-sm text-slate-400">{images.length}</span>
        </div>
      )}

      {/* Dot navigation */}
      {images.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: "rgba(3,9,24,0.75)", border: "1px solid rgba(56,189,248,0.15)" }}>
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className="rounded-full transition-all"
              style={i === idx ? {
                width: 12, height: 12, background: "#38bdf8",
                boxShadow: "0 0 8px rgba(56,189,248,0.8)",
                transform: "scale(1.15)",
              } : {
                width: 10, height: 10, background: "rgba(255,255,255,0.2)",
              }}
              aria-label={`Bild ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------ */
/* SLIDE COUNTDOWN — isolated so only this tiny     */
/* component re-renders every second, not TvLayout  */
/* ------------------------------------------------ */
const SlideCountdown = memo(function SlideCountdown({
  slideDurationMs,
  isPaused,
  onExpiredRef,
}: {
  slideDurationMs: number;
  isPaused: React.MutableRefObject<boolean>;
  onExpiredRef: React.MutableRefObject<() => void>;
}) {
  const total = Math.max(1, Math.round(slideDurationMs / 1000));
  const [countdown, setCountdown] = useState(total);

  useEffect(() => {
    setCountdown(total);
  }, [total]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (!isPaused.current) onExpiredRef.current();
          return total;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [total]); // Only total in deps, refs don't go in deps

  const pct = ((total - countdown) / total) * 100;

  return (
    <>
      <div className="h-0.5 bg-blue-900/40 w-full">
        <div
          className="h-full bg-cyan-400/70 transition-all duration-1000 shadow-[0_0_6px_rgba(0,216,255,0.6)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-muted-foreground tabular-nums ml-2">
        {isPaused.current ? `Pausiert – weiter in ${countdown}s` : `Weiter in ${countdown}s`}
      </span>
    </>
  );
});

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export function TvLayout({
  now,
  early = [],
  late = [],
  night = [],
  crawlerStale = false,
}: TvLayoutProps) {
  const { language } = useLanguage();
  const criticalWorkloadTitle = language === 'de' ? 'Critical Workload Kommandozentrum' : 'Critical Workload Command Center';

  /* State */
  const [currentSlide, setCurrentSlide] = useState(0);
  /* No countdown state here — SlideCountdown manages it internally */
  const onExpiredRef = useRef<() => void>(() => {});
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPaused = useRef(false);
  const slidesCountRef = useRef(1);

  const [infoEntries,   setInfoEntries]   = useState<DashboardInfoEntry[]>([]);
  const [allTickets,    setAllTickets]    = useState<any[]>([]);
  const [projects,      setProjects]      = useState<TvProject[]>([]);
  const [handoverCount, setHandoverCount] = useState(0);
  const [eventImages,   setEventImages]   = useState<EventImage[]>([]);
  const [tvPolls,       setTvPolls]       = useState<any[]>([]);
  const [crawlerLastUpdate, setCrawlerLastUpdate] = useState<string | null>(null);
  const [shiftplanLastUpload, setShiftplanLastUpload] = useState<string | null>(null);
  const [slideConfigMap, setSlideConfigMap] = useState<Record<string, { enabled: boolean; duration_ms: number; sort_order: number; only_if_data: boolean }>>({});
  const [teamsStatus, setTeamsStatus] = useState<TeamsStatus | null>(null);
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);

  /* Load slide config from backend */
  useEffect(() => {
    loadSlideConfig().then(setSlideConfigMap).catch(() => {});
    const id = setInterval(() => loadSlideConfig().then(setSlideConfigMap).catch(() => {}), 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  /* Clock — updates every 30 s to avoid re-rendering entire layout every second.
     SlideHeader has its own internal 1-second ticker for the displayed time. */
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* Info Entries — public TV endpoint, no auth required */
  useEffect(() => {
    const load = () =>
      api.get("/tv/info-entries")
        .then(res => setInfoEntries(Array.isArray(res.data?.data) ? res.data.data : []))
        .catch(() => { });
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  /* Projects — public TV endpoint, no auth required */
  useEffect(() => {
    const load = () =>
      api.get("/tv/projects")
        .then(res => {
          const rows = Array.isArray(res.data) ? res.data : (res.data?.rows ?? []);
          setProjects(rows);
        })
        .catch(() => { });
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  /* Handover count – for empty-slide logic */
  useEffect(() => {
    const load = () =>
      fetch("/api/tv/handover")
        .then(r => r.ok ? r.json() : [])
        .then(data => setHandoverCount(Array.isArray(data) ? data.filter((h: any) => String(h.status ?? "").toLowerCase() !== "erledigt").length : 0))
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  /* Event images – for empty-slide logic and EventsSlide */
  useEffect(() => {
    const load = () =>
      fetch("/api/tv/events/images")
        .then(r => r.ok ? r.json() : [])
        .then(data => setEventImages(Array.isArray(data) ? data : []))
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  /* Polls – for Umfragen slide */
  useEffect(() => {
    const load = () =>
      api.get("/tv/polls")
        .then(res => setTvPolls(Array.isArray(res.data) ? res.data : []))
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  /* Crawler last update – for status display */
  useEffect(() => {
    const load = () =>
      fetch("/api/tv/crawler-meta")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.lastUpdate) setCrawlerLastUpdate(data.lastUpdate); })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  /* Shiftplan last upload – for status display */
  useEffect(() => {
    const load = () =>
      fetch("/api/tv/shiftplan-last-upload")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.uploaded_at) setShiftplanLastUpload(data.uploaded_at); })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  /* Teams notification status – for header display */
  useEffect(() => {
    const load = () =>
      fetch("/api/tv/teams-status")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setTeamsStatus(data); })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  /* Automation / engine status – for header display */
  useEffect(() => {
    const load = () =>
      fetch("/api/tv/automation-status")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setAutomationStatus(data); })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  /* All Tickets – use public TV endpoints (no auth required) */
  useEffect(() => {
    const load = async () => {
      try {
        const tvTicketsRes = await fetch("/api/tv/tickets").then(r => r.ok ? r.json() : []).catch(() => []);
        setAllTickets(Array.isArray(tvTicketsRes) ? tvTicketsRes : []);
      } catch (e) {
        console.error("Failed to load TV tickets", e);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  /* Group tickets by owner */
  const ticketsByOwner = useMemo(() => {
    const map = new Map<string, any[]>();
    const allEmployees = [...early, ...late, ...night];
    const employeeNames = allEmployees.map((employee) => employee.name);
    const ownerLookup = new Map<string, string>();
    const ownerAliases: string[] = [];

    for (const employee of allEmployees) {
      for (const ownerKey of buildEmployeeOwnerKeys(employee)) {
        if (!ownerLookup.has(ownerKey)) {
          ownerLookup.set(ownerKey, employee.name);
          ownerAliases.push(ownerKey);
        }
      }
      const directKey = normalizeOwnerKey(employee.name);
      if (directKey && !ownerLookup.has(directKey)) {
        ownerLookup.set(directKey, employee.name);
        ownerAliases.push(directKey);
      }
      map.set(employee.name, []);
    }

    for (const ticket of allTickets) {
      const ownerCandidates = readTicketOwnerCandidates(ticket);
      if (ownerCandidates.length === 0) continue;

      let employeeName: string | null = null;
      for (const ownerValue of ownerCandidates) {
        const ownerKey = normalizeOwnerKey(ownerValue).replace(/[0-9]+$/, "");
        const directMatch = ownerLookup.get(ownerKey);
        const aliasMatch = directMatch ? null : findBestMatch(ownerKey, ownerAliases, 0.84)?.match;
        const fuzzyNameMatch = directMatch || aliasMatch ? null : findBestMatch(ownerValue, employeeNames, 0.76)?.match;
        employeeName = directMatch || (aliasMatch ? ownerLookup.get(aliasMatch) : null) || fuzzyNameMatch || null;
        if (employeeName) break;
      }

      if (!employeeName) continue;
      const current = map.get(employeeName) ?? [];
      current.push(ticket);
      map.set(employeeName, current);
    }

    for (const [employeeName, matches] of map.entries()) {
      matches.sort((a, b) => {
        const ah = getRemainingMs(a);
        const bh = getRemainingMs(b);
        if (ah === null && bh === null) return 0;
        if (ah === null) return 1;
        if (bh === null) return -1;
        return ah - bh;
      });
      map.set(employeeName, matches);
    }

    return map;
  }, [allTickets, early, late, night]);

  /* goToSlide – uses slidesCountRef for stale-closure safety */
  const activeSlidesRef = useRef<typeof ALL_SLIDES[number][]>([]);
  const goToSlide = useCallback((idx: number, manual = false) => {
    const count = slidesCountRef.current;
    if (count === 0) return;
    const nextIdx = ((idx % count) + count) % count;
    setCurrentSlide(nextIdx);
    if (manual) {
      isPaused.current = true;
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      pauseTimer.current = setTimeout(() => { isPaused.current = false; }, PAUSE_AFTER_MANUAL_MS);
    }
  }, []);

  /* Auto-rotate — wired through onExpiredRef so SlideCountdown calls it */
  useEffect(() => {
    onExpiredRef.current = () => {
      setCurrentSlide(s => {
        const count = slidesCountRef.current;
        return count > 0 ? (s + 1) % count : 0;
      });
    };
  });

  /* Active slides — skip empty ones */
  const activeSlides = useMemo(() => {
    const activeProjects = projects.filter(p => String(p.status ?? "").toLowerCase() !== "completed");
    return ALL_SLIDES.filter(s => {
      if (slideConfigMap[s.id]?.enabled === false) return false;
      if (s.id === "shifts")     return true;
      if (s.id === "info")       return infoEntries.length > 0;
      if (s.id === "72h")        return true;
      if (s.id === "handover")   return handoverCount > 0;
      if (s.id === "projects")   return activeProjects.length > 0;
      if (s.id === "events")     return eventImages.length > 0;
      if (s.id === "polls")      return tvPolls.length > 0;
      return true;
    });
  }, [eventImages.length, handoverCount, infoEntries.length, projects, slideConfigMap, tvPolls.length]);

  /* Keep ref in sync for stale-closure-safe auto-rotate */
  useEffect(() => {
    slidesCountRef.current = activeSlides.length;
    activeSlidesRef.current = activeSlides;
  }, [activeSlides]);

  /* Clamp current index when active slides shrink */
  useEffect(() => {
    if (activeSlides.length > 0 && currentSlide >= activeSlides.length) {
      setCurrentSlide(0);
    }
  }, [activeSlides.length, currentSlide]);

  const currentSlideId = activeSlides[currentSlide]?.id ?? "shifts";
  const currentSlideContent = currentSlideId === "shifts"
    ? <div className="relative h-full overflow-auto p-4"><TvShiftplan early={early} late={late} night={night} ticketsByOwner={ticketsByOwner} crawlerStale={crawlerStale} /></div>
    : currentSlideId === "info"
      ? <InfoAnweisungenSlide entries={infoEntries} />
      : currentSlideId === "72h"
        ? <TVCriticalWorkloadSlide />
        : currentSlideId === "handover"
          ? <div className="relative h-full overflow-auto p-4"><TVHandoverMirror /></div>
          : currentSlideId === "projects"
            ? <ProjekteSlide projects={projects} />
            : currentSlideId === "events"
              ? <EventsSlide images={eventImages} />
              : currentSlideId === "polls"
                ? <TVPollsSlide />
                : null;

  return (
    <div
      className="tv-mode flex flex-col h-full min-h-0 relative overflow-hidden"
      style={{
        background: "radial-gradient(circle at 20% 12%, rgba(56,189,248,0.12), transparent 20%), radial-gradient(circle at 82% 18%, rgba(251,146,60,0.10), transparent 22%), linear-gradient(180deg, #041124 0%, #020b1e 32%, #010816 100%)",
      }}
    >
      {/* Ambient background orbs */}
      <div className="pointer-events-none absolute rounded-full" style={{ width: 640, height: 380, top: "4%", left: "8%", background: "radial-gradient(ellipse, rgba(56,189,248,0.12), transparent 70%)", filter: "blur(150px)" }} />
      <div className="pointer-events-none absolute rounded-full" style={{ width: 520, height: 300, top: "22%", right: "6%", background: "radial-gradient(ellipse, rgba(251,146,60,0.10), transparent 72%)", filter: "blur(120px)" }} />
      <div className="pointer-events-none absolute rounded-full" style={{ width: 460, height: 240, bottom: "8%", left: "30%", background: "radial-gradient(ellipse, rgba(250,204,21,0.08), transparent 72%)", filter: "blur(150px)" }} />
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)", backgroundSize: "38px 38px", maskImage: "radial-gradient(circle at center, black, transparent 92%)", opacity: 0.22 }} />

      {/* SLIDE HEADER */}
      <SlideHeader
        now={clock}
        title={currentSlideId === '72h' ? criticalWorkloadTitle : activeSlides[currentSlide]?.title ?? ""}
        icon={activeSlides[currentSlide]?.icon ?? Users}
        crawlerLastUpdate={crawlerLastUpdate}
        shiftplanLastUpload={shiftplanLastUpload}
        crawlerStale={crawlerStale}
        teamsStatus={teamsStatus}
        automationStatus={automationStatus}
      />

      {/* SLIDE CONTENT */}
      <div className="flex-1 min-h-0 overflow-hidden relative px-4 pb-4">
        <div
          className="pointer-events-none absolute inset-x-4 top-1 bottom-4 rounded-[30px]"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01) 18%, rgba(4,10,24,0.4) 42%, rgba(3,8,19,0.72) 100%)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 60px rgba(0,0,0,0.35), 0 0 100px rgba(56,189,248,0.08)",
          }}
        />
        <div className="pointer-events-none absolute inset-x-28 top-1 h-14 rounded-full blur-3xl" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)", opacity: 0.65 }} />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentSlideId}
            className="relative h-full"
            initial={{ opacity: 0, y: 18, scale: 0.992 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 1.008 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="pointer-events-none absolute inset-y-4 left-[-20%] w-[38%] rounded-full blur-3xl"
              style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.24) 46%, rgba(56,189,248,0.14) 68%, transparent 100%)", opacity: 0.85 }}
              initial={{ x: "-12%", opacity: 0 }}
              animate={{ x: "240%", opacity: [0, 0.92, 0] }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.div
              className="pointer-events-none absolute inset-x-16 top-0 h-10 rounded-full blur-2xl"
              style={{ background: "linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.16) 50%, transparent 100%)", opacity: 0.75 }}
              initial={{ opacity: 0, scaleX: 0.9 }}
              animate={{ opacity: [0, 0.85, 0.45], scaleX: [0.92, 1.04, 1] }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
            {currentSlideContent}
          </motion.div>
        </AnimatePresence>

      </div>

      {/* SLIDE NAVIGATION */}
      <div className="relative shrink-0 flex flex-col overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #020b1e 0%, #010d28 100%)",
          borderTop: "1px solid rgba(56,189,248,0.18)",
          boxShadow: "0 -1px 0 rgba(56,189,248,0.08), 0 -4px 24px rgba(0,0,0,0.4)",
        }}>
        {/* Neon top edge */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 5%, rgba(56,189,248,0.4) 30%, rgba(56,189,248,0.7) 50%, rgba(56,189,248,0.4) 70%, transparent 95%)", boxShadow: "0 0 8px 1px rgba(56,189,248,0.2)" }} />
        {/* Progress bar + countdown — isolated in SlideCountdown so only it re-renders per second */}
        <SlideCountdown
          key={currentSlide}
          slideDurationMs={getSlideRotationMs(currentSlideId, slideConfigMap)}
          isPaused={isPaused}
          onExpiredRef={onExpiredRef}
        />
        <div className="flex items-center justify-center gap-4 py-2.5">
          <button
            onClick={() => goToSlide(currentSlide - 1, true)}
            className="p-2 rounded-lg hover:bg-accent transition text-muted-foreground hover:text-foreground"
            aria-label="Vorheriger Slide"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {activeSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i, true)}
              className="rounded-full transition-all"
              style={i === currentSlide ? {
                width: 16, height: 16, background: "#38bdf8",
                boxShadow: "0 0 10px rgba(56,189,248,0.8), 0 0 20px rgba(56,189,248,0.4)",
                transform: "scale(1.2)",
              } : {
                width: 14, height: 14, background: "rgba(255,255,255,0.15)",
              }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}

          <button
            onClick={() => goToSlide(currentSlide + 1, true)}
            className="p-2 rounded-lg hover:bg-accent transition text-muted-foreground hover:text-foreground"
            aria-label="Nächster Slide"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
