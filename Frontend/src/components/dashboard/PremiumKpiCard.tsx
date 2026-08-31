/**
 * PremiumKpiCard – Enterprise command center ticket category card.
 * Features category-specific glow, animated counter, trend indicator, and hover lift.
 */
import { motion } from "framer-motion";
import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { AnimatedCounter } from "./AnimatedCounter";
import { MiniSparkline } from "./MiniSparkline";

export type KpiTone = "red" | "amber" | "cyan" | "blue" | "violet";

export interface KpiTrendData {
  previousTotal: number;
  delta: number;
  percentChange: number; // positive = increase, negative = decrease
  direction: "up" | "down" | "flat";
}

interface PremiumKpiCardProps {
  label: string;
  total: number;
  critical: number;
  badgeLabel: string;
  to: string;
  tone: KpiTone;
  delay?: number;
  isLight?: boolean;
  language?: "de" | "en";
  ctaLabel?: string;
  trend?: KpiTrendData | null;
}

const TONE_CONFIG = {
  red: {
    border: "border-red-300/90",
    glow: "hover:shadow-[0_0_56px_rgba(255,60,70,0.5)]",
    toneOverlay: "linear-gradient(145deg, rgba(255,82,82,0.42) 0%, rgba(255,82,82,0.24) 22%, rgba(122,18,34,0.18) 50%, rgba(5,16,32,0.04) 100%)",
    badgeBg: "bg-red-500/42 text-red-50 border-red-300/85",
    sparkColor: "#f87171",
    pulseClass: "odin-pulse-subtle",
    lightBorder: "border-red-400",
    lightBadgeBg: "bg-red-200 text-red-900 border-red-400",
    lightBg: "bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(255,244,244,0.94)_38%,rgba(255,233,233,0.88)_100%)]",
    lightGlow: "shadow-[0_18px_36px_rgba(148,163,184,0.14),0_10px_26px_rgba(248,113,113,0.10)] hover:shadow-[0_28px_50px_rgba(15,23,42,0.08),0_18px_38px_rgba(248,113,113,0.18)]",
    topLine: "from-transparent via-red-200 to-transparent",
  },
  amber: {
    border: "border-amber-300/90",
    glow: "hover:shadow-[0_0_56px_rgba(255,170,40,0.48)]",
    toneOverlay: "linear-gradient(145deg, rgba(251,191,36,0.42) 0%, rgba(251,191,36,0.22) 22%, rgba(115,76,9,0.18) 50%, rgba(5,16,32,0.04) 100%)",
    badgeBg: "bg-amber-500/46 text-amber-50 border-amber-200/90",
    sparkColor: "#fbbf24",
    pulseClass: "",
    lightBorder: "border-amber-400",
    lightBadgeBg: "bg-amber-200 text-amber-950 border-amber-400",
    lightBg: "bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(255,250,235,0.94)_38%,rgba(254,243,199,0.88)_100%)]",
    lightGlow: "shadow-[0_18px_36px_rgba(148,163,184,0.14),0_10px_26px_rgba(245,158,11,0.10)] hover:shadow-[0_28px_50px_rgba(15,23,42,0.08),0_18px_38px_rgba(245,158,11,0.18)]",
    topLine: "from-transparent via-amber-200 to-transparent",
  },
  cyan: {
    border: "border-cyan-200/95",
    glow: "hover:shadow-[0_0_56px_rgba(0,210,255,0.5)]",
    toneOverlay: "linear-gradient(145deg, rgba(34,211,238,0.42) 0%, rgba(34,211,238,0.24) 22%, rgba(8,84,96,0.18) 50%, rgba(5,16,32,0.04) 100%)",
    badgeBg: "bg-cyan-500/42 text-cyan-50 border-cyan-200/90",
    sparkColor: "#22d3ee",
    pulseClass: "",
    lightBorder: "border-cyan-400",
    lightBadgeBg: "bg-cyan-200 text-cyan-950 border-cyan-400",
    lightBg: "bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(240,249,255,0.94)_38%,rgba(224,242,254,0.90)_100%)]",
    lightGlow: "shadow-[0_18px_36px_rgba(148,163,184,0.14),0_10px_26px_rgba(34,211,238,0.10)] hover:shadow-[0_28px_50px_rgba(15,23,42,0.08),0_18px_38px_rgba(34,211,238,0.16)]",
    topLine: "from-transparent via-cyan-100 to-transparent",
  },
  blue: {
    border: "border-blue-200/95",
    glow: "hover:shadow-[0_0_56px_rgba(59,130,246,0.5)]",
    toneOverlay: "linear-gradient(145deg, rgba(96,165,250,0.42) 0%, rgba(96,165,250,0.24) 22%, rgba(18,58,122,0.18) 50%, rgba(5,16,32,0.04) 100%)",
    badgeBg: "bg-blue-500/42 text-blue-50 border-blue-200/90",
    sparkColor: "#60a5fa",
    pulseClass: "",
    lightBorder: "border-blue-400",
    lightBadgeBg: "bg-blue-200 text-blue-950 border-blue-400",
    lightBg: "bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(239,246,255,0.94)_38%,rgba(219,234,254,0.90)_100%)]",
    lightGlow: "shadow-[0_18px_36px_rgba(148,163,184,0.14),0_10px_26px_rgba(96,165,250,0.10)] hover:shadow-[0_28px_50px_rgba(15,23,42,0.08),0_18px_38px_rgba(96,165,250,0.16)]",
    topLine: "from-transparent via-blue-100 to-transparent",
  },
  violet: {
    border: "border-violet-200/95",
    glow: "hover:shadow-[0_0_56px_rgba(168,85,247,0.5)]",
    toneOverlay: "linear-gradient(145deg, rgba(167,139,250,0.44) 0%, rgba(167,139,250,0.24) 22%, rgba(74,36,122,0.18) 50%, rgba(5,16,32,0.04) 100%)",
    badgeBg: "bg-violet-500/42 text-violet-50 border-violet-200/90",
    sparkColor: "#a78bfa",
    pulseClass: "",
    lightBorder: "border-violet-400",
    lightBadgeBg: "bg-violet-200 text-violet-950 border-violet-400",
    lightBg: "bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,243,255,0.94)_38%,rgba(233,213,255,0.90)_100%)]",
    lightGlow: "shadow-[0_18px_36px_rgba(148,163,184,0.14),0_10px_26px_rgba(168,85,247,0.10)] hover:shadow-[0_28px_50px_rgba(15,23,42,0.08),0_18px_38px_rgba(168,85,247,0.16)]",
    topLine: "from-transparent via-violet-100 to-transparent",
  },
};

export function PremiumKpiCard({
  label,
  total,
  critical,
  badgeLabel,
  to,
  tone,
  delay = 0,
  isLight = false,
  language = "de",
  ctaLabel = "Zur Ticketliste →",
  trend = null,
}: PremiumKpiCardProps) {
  const config = TONE_CONFIG[tone];
  const trendCopy = language === "de"
    ? { previous: "Vortag", label: "vs. Vortag", increased: "mehr", decreased: "weniger", unchanged: "gleich" }
    : { previous: "Previous day", label: "vs. previous day", increased: "more", decreased: "less", unchanged: "unchanged" };
  const deltaLabel = trend
    ? trend.delta > 0
      ? `+${trend.delta} ${trendCopy.increased}`
      : trend.delta < 0
        ? `${Math.abs(trend.delta)} ${trendCopy.decreased}`
        : trendCopy.unchanged
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.008, transition: { duration: 0.2 } }}
      className="relative z-0 isolate odin-hover-lift hover:z-30"
    >
      <Link
        to={to}
        className={`group relative flex h-full min-h-45 flex-col overflow-hidden rounded-[22px] border-[2.5px] p-5 backdrop-blur-2xl transition-all duration-300 ${
          isLight
            ? `${config.lightBorder} ${config.lightBg} ${config.lightGlow}`
            : `${config.border} ${config.glow}`
        }`}
        style={isLight ? { boxShadow: undefined } : {
          background: `${config.toneOverlay}, var(--odin-panel)`,
        }}
      >
        {/* Top highlight */}
        <div className={`pointer-events-none absolute inset-x-2 top-0 h-1 bg-linear-to-r ${config.topLine} ${isLight ? "opacity-90" : "opacity-100"}`} />
        {isLight && <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.34)_0%,transparent_36%,rgba(255,255,255,0.12)_100%)]" />}
        {isLight && <div className="pointer-events-none absolute inset-y-3 left-0 w-0.75 rounded-r-full bg-[linear-gradient(180deg,rgba(15,23,42,0.18),rgba(56,189,248,0.46),rgba(255,255,255,0.12))]" />}

        <div className="relative flex h-full flex-col justify-between gap-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <span className={isLight
              ? "text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700"
              : "text-[11px] font-bold uppercase tracking-[0.18em] text-white/70"
            }>
              {label}
            </span>
            {critical > 0 && (
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                isLight ? config.lightBadgeBg : config.badgeBg
              } ${tone === "red" ? config.pulseClass : ""}`}
              style={tone === "red" && !isLight ? { animation: "odinPulseSubtle 3s ease-in-out infinite" } : undefined}
              >
                {critical} {badgeLabel}
              </span>
            )}
          </div>

          {/* Big number + trend */}
          <div className="flex items-end justify-between">
            <AnimatedCounter
              value={total}
              className={isLight
                ? "text-[3rem] font-black leading-none tracking-tight text-slate-900"
                : "text-[3rem] font-black leading-none tracking-tight text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]"
              }
            />
            <div className="flex flex-col items-end gap-1">
              {trend && trend.direction !== "flat" ? (
                <div className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  trend.direction === "up"
                    ? (isLight ? "border border-red-200/80 bg-white/78 text-red-700 shadow-[0_8px_18px_rgba(248,113,113,0.10)]" : "bg-red-500/15 text-red-400")
                    : (isLight ? "border border-emerald-200/80 bg-white/78 text-emerald-700 shadow-[0_8px_18px_rgba(16,185,129,0.10)]" : "bg-emerald-500/15 text-emerald-400")
                }`}>
                  {trend.direction === "up"
                    ? <TrendingUp className="h-3 w-3" />
                    : <TrendingDown className="h-3 w-3" />
                  }
                  {trend.percentChange > 0 ? "+" : ""}{trend.percentChange.toFixed(0)}%
                </div>
              ) : trend ? (
                <div className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  isLight ? "border border-slate-200/80 bg-white/76 text-slate-500" : "bg-white/5 text-white/40"
                }`}>
                  <Minus className="h-3 w-3" />
                  0%
                </div>
              ) : null}
              <MiniSparkline value={total} color={config.sparkColor} className={isLight ? "opacity-80" : "opacity-60"} />
            </div>
          </div>

          {trend ? (
            <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${
              isLight
                ? "border-white/80 bg-white/76 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]"
                : "border-white/12 bg-black/12 text-white/72"
            }`}>
              <div className="flex items-center justify-between gap-3">
                <span className={isLight ? "font-semibold text-slate-500" : "font-semibold text-white/55"}>
                  {trendCopy.label}
                </span>
                <span className={isLight ? "font-black text-slate-900" : "font-black text-white"}>
                  {trend.previousTotal}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className={isLight ? "text-slate-500" : "text-white/50"}>
                  {trendCopy.previous}
                </span>
                <span className={`font-semibold ${
                  trend.direction === "up"
                    ? (isLight ? "text-red-600" : "text-red-300")
                    : trend.direction === "down"
                      ? (isLight ? "text-emerald-600" : "text-emerald-300")
                      : (isLight ? "text-slate-500" : "text-white/55")
                }`}>
                  {deltaLabel}
                </span>
              </div>
            </div>
          ) : null}

          {/* CTA */}
          <div className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${
            isLight
              ? "text-slate-600 group-hover:text-slate-900"
              : "text-white/50 group-hover:text-white/80"
          }`}>
            {ctaLabel}
            <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
