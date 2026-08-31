/**
 * MetricCard â€“ Premium glass-morphism metric card with sparkline,
 * animated counter, hover lift/glow, and critical indicator.
 */
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { AnimatedCounter } from "./AnimatedCounter";
import { MiniSparkline } from "./MiniSparkline";

interface MetricCardProps {
  label: string;
  total: number;
  critical: number;
  criticalWindowHours: number;
  accent: string;
  glow: string;
  href: string;
  isCriticalVisible?: boolean;
  openLabel?: string;
  criticalLabel?: string;
  index?: number;
}

export function MetricCard({
  label,
  total,
  critical,
  criticalWindowHours,
  accent,
  glow,
  href,
  isCriticalVisible = true,
  openLabel = "offen",
  criticalLabel = "kritisch",
  index = 0,
}: MetricCardProps) {
  return (
    <motion.a
      href={href}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.15 + index * 0.08, duration: 0.55, ease: [0.22, 0.68, 0, 1.2] }}
      whileHover={{ y: -6, scale: 1.02 }}
      className={`group relative overflow-hidden rounded-3xl border p-5 transition-shadow duration-300 hover:shadow-[0_30px_100px_rgba(37,99,235,0.22)] ${accent} ${glow}`}
    >
      {/* Top highlight line */}
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />
      
      {/* Hover radial glow */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100" style={{ background: "radial-gradient(circle at 70% 20%, rgba(96,165,250,0.16), transparent 50%)" }} />

      {/* Corner accent orb */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-400/10 blur-2xl transition group-hover:bg-blue-400/20" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Label */}
          <div className="truncate text-[10px] font-bold uppercase tracking-[0.24em] text-blue-100/55">
            {label}
          </div>

          {/* Big number */}
          <AnimatedCounter
            value={total}
            className="mt-3 block text-4xl font-black leading-none tracking-tight text-white"
          />

          {/* Sparkline */}
          <div className="mt-3">
            <MiniSparkline value={total} />
          </div>

          {/* Critical badges */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">
            {isCriticalVisible ? (
              <>
                <span className="inline-flex items-center rounded-full border border-blue-200/20 bg-blue-500/10 px-2 py-0.5 text-blue-100">
                  {critical} {criticalLabel}
                </span>
                <span className="text-blue-50/35">&le; {criticalWindowHours}h</span>
              </>
            ) : (
              <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
                {total} {openLabel}
              </span>
            )}
          </div>
        </div>

        {/* Icon pill */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-200/16 bg-linear-to-b from-blue-400/16 to-blue-600/8 text-blue-50 shadow-[0_0_24px_rgba(37,99,235,0.14),inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-300 group-hover:scale-110">
          <Zap className="h-4 w-4" />
        </div>
      </div>
    </motion.a>
  );
}

