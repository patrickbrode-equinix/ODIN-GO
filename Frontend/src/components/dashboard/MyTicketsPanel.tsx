import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export type MyTicketPriorityTone = "critical" | "high" | "medium";

export interface MyTicketPanelItem {
  id: string;
  title: string;
  priorityLabel: string;
  priorityTone: MyTicketPriorityTone;
  timeLabel: string;
}

interface MyTicketsPanelProps {
  heading: string;
  ctaLabel: string;
  ctaTo: string;
  tickets: MyTicketPanelItem[];
  emptyLabel: string;
  delay?: number;
  isLight?: boolean;
}

const PRIORITY_CLASS_DARK: Record<MyTicketPriorityTone, string> = {
  critical: "border-red-400/35 bg-red-500/15 text-red-100 shadow-[0_0_20px_rgba(248,113,113,0.18)]",
  high: "border-amber-300/35 bg-amber-400/15 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.14)]",
  medium: "border-cyan-300/30 bg-cyan-400/10 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.14)]",
};

const PRIORITY_CLASS_LIGHT: Record<MyTicketPriorityTone, string> = {
  critical: "border-red-200 bg-red-50 text-red-700 shadow-[0_10px_24px_rgba(248,113,113,0.10)]",
  high: "border-amber-200 bg-amber-50 text-amber-700 shadow-[0_10px_24px_rgba(251,191,36,0.10)]",
  medium: "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_10px_24px_rgba(34,211,238,0.10)]",
};

export function MyTicketsPanel({
  heading,
  ctaLabel,
  ctaTo,
  tickets,
  emptyLabel,
  delay = 0,
  isLight = false,
}: MyTicketsPanelProps) {
  const priorityClass = isLight ? PRIORITY_CLASS_LIGHT : PRIORITY_CLASS_DARK;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.46, delay, ease: [0.22, 1, 0.36, 1] }}
      className={isLight
        ? "relative flex h-full flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.98))] p-5 shadow-[0_24px_80px_rgba(148,163,184,0.18)] backdrop-blur-xl"
        : "relative flex h-full flex-col overflow-hidden rounded-[28px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(11,23,46,0.86),rgba(6,14,30,0.92))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.36),0_0_42px_rgba(0,180,255,0.08)] backdrop-blur-xl"
      }
    >
      <div className={isLight
        ? "pointer-events-none absolute inset-x-5 top-0 h-px bg-linear-to-r from-transparent via-sky-200/90 to-transparent"
        : "pointer-events-none absolute inset-x-5 top-0 h-px bg-linear-to-r from-transparent via-white/28 to-transparent"
      } />

      <div className="flex items-center justify-between gap-3">
        <div className={isLight
          ? "text-[12px] font-bold uppercase tracking-[0.24em] text-slate-500"
          : "text-[12px] font-bold uppercase tracking-[0.24em] text-[#C6F0FF]"
        }>{heading}</div>
        <span className={isLight
          ? "rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700"
          : "rounded-full border border-cyan-300/18 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold text-cyan-100/88"
        }>
          {tickets.length}
        </span>
      </div>

      <div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1">
        {tickets.length === 0 ? (
          <div className={isLight
            ? "rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500"
            : "rounded-[20px] border border-dashed border-white/10 bg-white/3 px-4 py-8 text-center text-sm text-white/45"
          }>
            {emptyLabel}
          </div>
        ) : (
          tickets.map((ticket) => (
            <motion.div
              key={ticket.id}
              whileHover={{ scale: 1.02, y: -2 }}
              className={isLight
                ? "relative rounded-[22px] border border-slate-200/80 bg-white/90 px-4 py-4 shadow-[0_18px_40px_rgba(148,163,184,0.16)] transition-all duration-300"
                : "relative rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.26)] transition-all duration-300"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={isLight
                    ? "truncate text-[13px] font-semibold text-slate-900"
                    : "truncate text-[13px] font-semibold text-white"
                  }>{ticket.id}</div>
                  <div className={isLight
                    ? "mt-1 truncate text-[12px] text-slate-600"
                    : "mt-1 truncate text-[12px] text-white/74"
                  }>{ticket.title}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${priorityClass[ticket.priorityTone]}`}>
                  {ticket.priorityLabel}
                </span>
              </div>
              <div className={isLight
                ? "mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400"
                : "mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/58"
              }>{ticket.timeLabel}</div>
            </motion.div>
          ))
        )}
      </div>

      <Link
        to={ctaTo}
        className={isLight
          ? "mt-5 inline-flex items-center gap-2 text-[12px] font-semibold text-sky-700 transition-colors duration-300 hover:text-sky-900"
          : "mt-5 inline-flex items-center gap-2 text-[12px] font-semibold text-[#D9F7FF] transition-colors duration-300 hover:text-white"
        }
      >
        <span>{ctaLabel}</span>
        <ChevronRight className="h-4 w-4" />
      </Link>
    </motion.div>
  );
}