/**
 * CriticalTicketsPanel – Live list of critical/escalation tickets.
 * Shows status icon, ticket ID, issue title, location, and escalation countdown.
 */
import { motion } from "framer-motion";
import { AlertTriangle, Clock, MapPin, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

export interface CriticalTicketEntry {
  id: string;
  title: string;
  location?: string;
  escalationLabel: string;
  isCritical: boolean;
}

interface CriticalTicketsPanelProps {
  tickets: CriticalTicketEntry[];
  isLight?: boolean;
  language: "de" | "en";
}

const COPY = {
  de: {
    title: "AKTUELLE KRITISCHE TICKETS",
    empty: "Keine kritischen Tickets",
    viewAll: "Alle Tickets",
  },
  en: {
    title: "CURRENT CRITICAL TICKETS",
    empty: "No critical tickets",
    viewAll: "All tickets",
  },
} as const;

export function CriticalTicketsPanel({
  tickets,
  isLight = false,
  language,
}: CriticalTicketsPanelProps) {
  const copy = COPY[language];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={isLight
        ? "flex flex-col rounded-2xl border border-rose-200/75 bg-[linear-gradient(155deg,rgba(255,255,255,0.82),rgba(255,245,245,0.78)_48%,rgba(248,250,252,0.80))] p-5 shadow-[0_24px_54px_rgba(148,163,184,0.16),0_10px_26px_rgba(248,113,113,0.10)] backdrop-blur-xl"
        : "flex flex-col rounded-2xl border p-5 backdrop-blur-lg"
      }
      style={isLight ? undefined : {
        borderColor: "rgba(255, 60, 70, 0.14)",
        background: "var(--odin-panel-strong)",
        boxShadow: "inset 0 1px 0 rgba(255,60,70,0.03)",
      }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className={isLight ? "h-4 w-4 text-red-500" : "h-4 w-4 text-red-400"} />
          <span className={isLight
            ? "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500"
            : "text-[10px] font-bold uppercase tracking-[0.2em] text-red-300/80"
          }>
            {copy.title}
          </span>
        </div>
        <Link
          to="/tickets"
          className={isLight
            ? "text-[10px] font-semibold text-sky-600 hover:text-sky-800"
            : "text-[10px] font-semibold text-white/40 hover:text-white/70"
          }
        >
          {copy.viewAll} →
        </Link>
      </div>

      {/* Ticket list */}
      <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: "320px" }}>
        {tickets.map((ticket, index) => (
          <Link
            key={ticket.id}
            to={`/tickets?search=${encodeURIComponent(ticket.id)}`}
            className={`group flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all ${
              isLight
                ? ticket.isCritical
                  ? "border-rose-200/90 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(255,241,242,0.94))] shadow-[0_12px_26px_rgba(244,63,94,0.08)] hover:border-rose-300 hover:shadow-[0_16px_32px_rgba(244,63,94,0.12)]"
                  : "border-slate-200/80 bg-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] hover:border-slate-300 hover:bg-slate-50/90"
                : ticket.isCritical
                  ? "border-red-500/15 bg-red-500/5 hover:bg-red-500/10"
                  : "border-white/5 bg-white/2 hover:bg-white/5"
            }`}
          >
            {/* Status icon */}
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
              isLight
                ? ticket.isCritical ? "bg-red-100" : "bg-amber-100"
                : ticket.isCritical ? "bg-red-500/20" : "bg-amber-500/20"
            }`}>
              {ticket.isCritical
                ? <AlertTriangle className={isLight ? "h-3 w-3 text-red-600" : "h-3 w-3 text-red-400"} />
                : <Clock className={isLight ? "h-3 w-3 text-amber-600" : "h-3 w-3 text-amber-400"} />
              }
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold tabular-nums ${
                  isLight ? "text-slate-800" : "text-white/85"
                }`}>
                  {ticket.id}
                </span>
                {ticket.location && (
                  <span className={`flex items-center gap-0.5 text-[9px] ${
                    isLight ? "text-slate-400" : "text-white/30"
                  }`}>
                    <MapPin className="h-2.5 w-2.5" />
                    {ticket.location}
                  </span>
                )}
              </div>
              <div className={`truncate text-[10px] ${
                isLight ? "text-slate-500" : "text-white/50"
              }`}>
                {ticket.title}
              </div>
            </div>

            {/* Escalation */}
            <div className={`shrink-0 text-right`}>
              <div className={`text-[10px] font-bold tabular-nums ${
                ticket.isCritical
                  ? isLight ? "text-red-600" : "text-red-400"
                  : isLight ? "text-amber-600" : "text-amber-400"
              }`}>
                {ticket.escalationLabel}
              </div>
            </div>

            {isLight && ticket.isCritical && <span className="h-8 w-1 shrink-0 rounded-full bg-linear-to-b from-rose-500 to-rose-300" />}

            <ExternalLink className={`h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 ${
              isLight ? "text-slate-400" : "text-white/40"
            }`} />
          </Link>
        ))}

        {tickets.length === 0 && (
          <div className={isLight
            ? "py-8 text-center text-xs text-slate-400"
            : "py-8 text-center text-xs text-white/30"
          }>
            {copy.empty}
          </div>
        )}
      </div>
    </motion.div>
  );
}
