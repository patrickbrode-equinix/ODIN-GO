import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

interface TicketCardProps {
  label: string;
  total: number;
  critical: number;
  badgeLabel?: string;
  to: string;
  accent: string;
  delay?: number;
  isLight?: boolean;
}

export function TicketCard({
  label,
  total,
  critical,
  badgeLabel = "Kritisch",
  to,
  accent,
  delay = 0,
  isLight = false,
}: TicketCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.02 }}
    >
      <Link
        to={to}
        className={`group relative flex h-full min-h-44 flex-col overflow-hidden rounded-[26px] border p-6 backdrop-blur-xl transition-all duration-300 ${accent} ${isLight ? "text-slate-900" : ""}`}
      >
        <div className={isLight
          ? "pointer-events-none absolute inset-x-5 top-0 h-px bg-linear-to-r from-transparent via-slate-300/70 to-transparent"
          : "pointer-events-none absolute inset-x-5 top-0 h-px bg-linear-to-r from-transparent via-white/40 to-transparent"
        } />
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: isLight
              ? "radial-gradient(circle at top right, rgba(59,130,246,0.12), transparent 34%)"
              : "radial-gradient(circle at top right, rgba(255,255,255,0.12), transparent 34%)",
          }}
        />

        <div className="relative flex h-full flex-col justify-between gap-4">
          <div>
            <div className={isLight
              ? "text-[12px] font-black uppercase tracking-[0.22em] text-slate-600"
              : "text-[12px] font-black uppercase tracking-[0.22em] text-white/82"
            }>{label}</div>
            <div className={isLight
              ? "mt-4 text-[3.8rem] font-black leading-none tracking-[-0.08em] text-slate-950"
              : "mt-4 text-[3.8rem] font-black leading-none tracking-[-0.08em] text-white [text-shadow:0_0_20px_rgba(255,255,255,0.12)]"
            }>{total}</div>
            <div className={isLight
              ? "mt-3 inline-flex rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm"
              : "mt-3 inline-flex rounded-full border border-white/14 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/90 shadow-[0_0_12px_rgba(255,255,255,0.04)]"
            }>
              {critical} {badgeLabel}
            </div>
          </div>

          <div className={isLight
            ? "inline-flex items-center gap-2 text-[13px] font-semibold text-sky-700"
            : "inline-flex items-center gap-2 text-[13px] font-semibold text-cyan-100/90"
          }>
            <span>Zur Ticketliste</span>
            <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}