/**
 * OperationalStatePanel – Command-center hero block.
 * Shows operational readiness, critical metrics, next expiring ticket, and own tickets.
 */
import { motion } from "framer-motion";
import { ShieldCheck, AlertTriangle, Clock, CalendarClock, User } from "lucide-react";
import { Link } from "react-router-dom";
import { AnimatedCounter } from "./AnimatedCounter";

export interface OwnTicketEntry {
  id: string;
  title: string;
  timeLabel: string;
  isCritical: boolean;
}

interface OperationalStatePanelProps {
  openTickets: number;
  criticalTickets: number;
  nextEscalationLabel: string;
  nextScheduledLabel: string;
  nextScheduledId?: string;
  allSystemsOnline: boolean;
  isLight?: boolean;
  language: "de" | "en";
  greeting: string;
  ownTickets: OwnTicketEntry[];
}

const COPY = {
  de: {
    headline: "ALLE SYSTEME BEREIT.",
    subHeadline: "BEREIT FÜR ENTSCHEIDUNGEN.",
    subtitle: "ODIN analysiert, priorisiert und dispatcht automatisch.",
    openTickets: "Offene Tickets",
    critical: "Kritische Tickets",
    nextExpiry: "Nächstes Ticket läuft ab",
    nextScheduled: "Nächstes fälliges Ticket",
    allOnline: "Alle Systeme online und synchronisiert",
    myTickets: "Meine Tickets",
    noOwn: "Keine eigenen Tickets",
    viewAll: "Alle anzeigen →",
  },
  en: {
    headline: "ALL SYSTEMS READY.",
    subHeadline: "READY FOR DECISIONS.",
    subtitle: "ODIN analyzes, prioritizes and dispatches automatically.",
    openTickets: "Open Tickets",
    critical: "Critical Tickets",
    nextExpiry: "Next ticket expires",
    nextScheduled: "Next scheduled ticket",
    allOnline: "All systems online and synchronized",
    myTickets: "My Tickets",
    noOwn: "No own tickets",
    viewAll: "View all →",
  },
} as const;

export function OperationalStatePanel({
  openTickets,
  criticalTickets,
  nextEscalationLabel,
  nextScheduledLabel,
  nextScheduledId,
  allSystemsOnline,
  isLight = false,
  language,
  greeting,
  ownTickets,
}: OperationalStatePanelProps) {
  const copy = COPY[language];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={isLight
          ? "relative overflow-hidden rounded-[26px] border border-slate-300/80 bg-[linear-gradient(155deg,rgba(255,255,255,0.82),rgba(242,246,250,0.82)_50%,rgba(230,238,246,0.78))] p-6 shadow-[0_30px_70px_rgba(148,163,184,0.18),0_14px_34px_rgba(15,23,42,0.07),0_0_42px_rgba(56,189,248,0.08)] backdrop-blur-xl lg:p-8"
          : "relative overflow-hidden rounded-2xl border p-6 backdrop-blur-md lg:p-8"
      }
      style={isLight ? undefined : {
        borderColor: "var(--odin-border-cyan)",
          background: "rgba(5, 16, 32, 0.07)",
        boxShadow: "var(--odin-glow-cyan), inset 0 1px 0 rgba(0,210,255,0.06)",
      }}
    >
      {/* Top cyan highlight line */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px ${isLight ? "bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.92)_18%,rgba(148,163,184,0.44)_48%,rgba(56,189,248,0.34)_78%,transparent)]" : "bg-linear-to-r from-transparent via-cyan-400/60 to-transparent"}`} />
      {isLight && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.30),transparent_30%),radial-gradient(ellipse_at_bottom_right,rgba(148,163,184,0.10),transparent_36%)]" />}

      <div className="relative z-10">
        {/* Personalized greeting */}
        <div className="mb-4">
          <p className={isLight
            ? "text-sm font-semibold text-slate-600"
            : "text-sm font-semibold text-cyan-200/60"
          }>
            {greeting}
          </p>
        </div>

        {/* Headlines */}
        <div className="mb-6">
          <h1 className={isLight
            ? "text-[2rem] font-black uppercase tracking-[-0.03em] text-slate-950 lg:text-[2.6rem]"
            : "text-2xl font-black uppercase tracking-tight lg:text-3xl"
          } style={isLight ? undefined : { color: "var(--odin-text-primary)", textShadow: "0 0 30px rgba(0,210,255,0.15)" }}>
            {copy.headline}
          </h1>
          <h2 className={isLight
            ? "mt-1 text-lg font-bold uppercase tracking-[0.18em] text-slate-600"
            : "mt-1 text-lg font-bold uppercase tracking-wide text-cyan-300/90"
          }>
            {copy.subHeadline}
          </h2>
          <p className={isLight
            ? "mt-3 max-w-[50rem] text-sm font-medium leading-6 text-slate-600"
            : "mt-2 text-sm font-medium"
          } style={isLight ? undefined : { color: "var(--odin-text-secondary)" }}>
            {copy.subtitle}
          </p>
        </div>

        {/* Metric blocks */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricBlock
            icon={<AlertTriangle className="h-4 w-4" />}
            label={copy.openTickets}
            value={<AnimatedCounter value={openTickets} className="text-2xl font-black tabular-nums" />}
            tone="cyan"
            isLight={isLight}
          />
          <MetricBlock
            icon={<ShieldCheck className="h-4 w-4" />}
            label={copy.critical}
            value={<AnimatedCounter value={criticalTickets} className="text-2xl font-black tabular-nums" />}
            tone="red"
            isLight={isLight}
          />
          <MetricBlock
            icon={<Clock className="h-4 w-4" />}
            label={copy.nextExpiry}
            value={<span className="text-lg font-bold tabular-nums">{nextEscalationLabel}</span>}
            tone="amber"
            isLight={isLight}
          />
          <MetricBlock
            icon={<CalendarClock className="h-4 w-4" />}
            label={copy.nextScheduled}
            value={<span className="text-sm font-bold tabular-nums">{nextScheduledId ? `${nextScheduledId} — ` : ""}{nextScheduledLabel}</span>}
            tone="cyan"
            isLight={isLight}
          />
        </div>

        {/* Own tickets section – always visible */}
        <div className={isLight
          ? "mt-5 rounded-xl border border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(247,250,252,0.80))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_14px_30px_rgba(148,163,184,0.10)]"
          : "mt-5 rounded-xl border border-cyan-400/10 bg-cyan-400/3 p-4"
        }>
          <div className="mb-2 flex items-center justify-between">
            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${isLight ? "text-slate-500" : "text-cyan-300/70"}`}>
              <User className="h-3.5 w-3.5" />
              {copy.myTickets}
            </div>
            {ownTickets.length > 0 && (
              <Link to="/tickets" className={`text-[10px] font-semibold ${isLight ? "text-sky-600 hover:text-sky-800" : "text-cyan-300/50 hover:text-cyan-200"}`}>
                {copy.viewAll}
              </Link>
            )}
          </div>
          {ownTickets.length > 0 ? (
            <div className="space-y-1.5">
              {ownTickets.slice(0, 4).map((ticket) => (
                <Link
                  key={ticket.id}
                  to={`/tickets?search=${encodeURIComponent(ticket.id)}`}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition ${
                    isLight
                      ? ticket.isCritical ? "border border-rose-200/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.88),rgba(255,241,242,0.90))] shadow-[0_10px_22px_rgba(244,63,94,0.08)] hover:border-rose-300" : "border border-slate-200/80 bg-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] hover:border-slate-300"
                      : ticket.isCritical ? "bg-red-500/8 hover:bg-red-500/12" : "hover:bg-white/5"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ticket.isCritical ? "bg-red-400 shadow-[0_0_4px_rgba(239,68,68,0.6)]" : "bg-cyan-400/60"}`} />
                  <span className={`text-[11px] font-bold tabular-nums ${isLight ? "text-slate-700" : "text-white/80"}`}>{ticket.id}</span>
                  <span className={`min-w-0 flex-1 truncate text-[10px] ${isLight ? "text-slate-500" : "text-white/45"}`}>{ticket.title}</span>
                  <span className={`shrink-0 text-[10px] font-medium tabular-nums ${
                    ticket.isCritical ? (isLight ? "text-red-600" : "text-red-400") : (isLight ? "text-slate-400" : "text-white/35")
                  }`}>{ticket.timeLabel}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className={`text-[11px] ${isLight ? "text-slate-400" : "text-white/35"}`}>
              {copy.noOwn}
            </p>
          )}
        </div>

        {/* System status line */}
        {allSystemsOnline && (
          <div className={isLight
            ? "mt-4 flex items-center gap-2 text-xs font-medium text-emerald-700"
            : "mt-4 flex items-center gap-2 text-xs font-medium text-emerald-400/80"
          }>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            {copy.allOnline}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MetricBlock({
  icon,
  label,
  value,
  tone,
  isLight,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: "cyan" | "red" | "amber";
  isLight: boolean;
}) {
  const toneStyles = isLight
    ? {
        cyan: "border-slate-300/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.94),rgba(241,245,249,0.90))] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_16px_32px_rgba(148,163,184,0.10)]",
        red: "border-slate-300/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.94),rgba(255,242,242,0.90))] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_16px_32px_rgba(244,63,94,0.08)]",
        amber: "border-slate-300/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.94),rgba(255,249,235,0.90))] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_16px_32px_rgba(245,158,11,0.08)]",
      }
    : {
        cyan: "border-cyan-400/20 bg-cyan-400/8",
        red: "border-red-400/20 bg-red-400/8",
        amber: "border-amber-400/20 bg-amber-400/8",
      };

  const iconColor = isLight
    ? { cyan: "text-sky-600", red: "text-red-600", amber: "text-amber-600" }
    : { cyan: "text-cyan-300", red: "text-red-300", amber: "text-amber-300" };

  return (
    <div className={`rounded-xl border p-3 ${toneStyles[tone]}`}>
      <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${iconColor[tone]}`}>
        {icon}
        {label}
      </div>
      <div className={isLight ? "mt-2 text-slate-900" : "mt-2 text-white"}>
        {value}
      </div>
    </div>
  );
}
