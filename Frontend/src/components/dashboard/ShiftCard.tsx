import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

interface ShiftCardProps {
  label: string;
  timeRange: string;
  employeeCount: number;
  footerLabel?: string;
  to: string;
  accent: string;
  delay?: number;
  isLight?: boolean;
}

export function ShiftCard({
  label,
  timeRange,
  employeeCount,
  footerLabel,
  to,
  accent,
  delay = 0,
  isLight = false,
}: ShiftCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.015 }}
    >
      <Link
        to={to}
        className={`group relative flex h-full min-h-34 flex-col overflow-hidden rounded-[24px] border p-5 backdrop-blur-xl transition-all duration-300 ${accent} ${isLight ? "text-slate-900" : ""}`}
      >
        <div className={isLight
          ? "pointer-events-none absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-slate-200/90 to-transparent"
          : "pointer-events-none absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-white/28 to-transparent"
        } />
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: isLight
              ? "radial-gradient(circle at top right, rgba(59,130,246,0.10), transparent 34%)"
              : "radial-gradient(circle at top right, rgba(255,255,255,0.10), transparent 34%)",
          }}
        />

        <div className="relative flex h-full flex-col justify-between gap-4">
          <div>
            <div className={isLight
              ? "text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500"
              : "text-[11px] font-bold uppercase tracking-[0.22em] text-[#C1EEFF]/74"
            }>{label}</div>
            <div className={isLight
              ? "mt-3 text-[13px] font-semibold text-slate-700"
              : "mt-3 text-[13px] font-semibold text-white/82"
            }>{timeRange}</div>
          </div>

          <div className="flex items-end justify-between gap-4">
            <div>
              <div className={isLight
                ? "text-[2rem] font-black leading-none tracking-[-0.06em] text-slate-950"
                : "text-[2rem] font-black leading-none tracking-[-0.06em] text-white"
              }>{employeeCount}</div>
              <div className={isLight
                ? "mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                : "mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/72"
              }>
                {footerLabel || " "}
              </div>
            </div>
            <ChevronRight className={isLight
              ? "h-5 w-5 text-sky-700 transition-transform duration-300 group-hover:translate-x-1"
              : "h-5 w-5 text-[#D7F8FF] transition-transform duration-300 group-hover:translate-x-1"
            } />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}