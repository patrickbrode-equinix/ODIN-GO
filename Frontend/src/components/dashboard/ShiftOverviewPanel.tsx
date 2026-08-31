/**
 * ShiftOverviewPanel – Command center shift status panel.
 * Shows E1, E2, L1, L2, N shifts with time ranges, employee counts, and active highlight.
 */
import { motion } from "framer-motion";
import { Clock, Users } from "lucide-react";
import { Link } from "react-router-dom";

interface ShiftEntry {
  code: string;
  label: string;
  timeRange: string;
  employeeCount: number;
  maxCapacity?: number;
  isActive: boolean;
}

interface ShiftOverviewPanelProps {
  shifts: ShiftEntry[];
  isLight?: boolean;
  language: "de" | "en";
}

const COPY = {
  de: {
    title: "AKTUELLE SCHICHTEN",
    viewAll: "Zur Schichtplanung",
    active: "Aktiv",
  },
  en: {
    title: "CURRENT SHIFTS",
    viewAll: "Open shift planning",
    active: "Active",
  },
} as const;

function getShiftAccentColor(code: string): string {
  const upper = code.toUpperCase();
  if (upper.startsWith("E")) return "orange";
  if (upper.startsWith("L")) return "amber";
  if (upper === "N") return "sky";
  if (upper === "DBS") return "violet";
  return "slate";
}

export function ShiftOverviewPanel({
  shifts,
  isLight = false,
  language,
}: ShiftOverviewPanelProps) {
  const copy = COPY[language];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className={isLight
        ? "flex flex-col rounded-2xl border border-sky-200/75 bg-[linear-gradient(155deg,rgba(255,255,255,0.82),rgba(241,245,249,0.80)_52%,rgba(239,246,255,0.78))] p-5 shadow-[0_24px_54px_rgba(148,163,184,0.16),0_10px_26px_rgba(56,189,248,0.10)] backdrop-blur-xl"
        : "flex flex-col rounded-2xl border p-5 backdrop-blur-lg"
      }
      style={isLight ? undefined : {
        borderColor: "var(--odin-border-cyan)",
        background: "var(--odin-panel-strong)",
        boxShadow: "inset 0 1px 0 rgba(0,210,255,0.03)",
      }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className={isLight ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-cyan-400"} />
          <span className={isLight
            ? "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500"
            : "text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/80"
          }>
            {copy.title}
          </span>
        </div>
        <Link
          to="/shiftplan/week"
          className={isLight
            ? "text-[10px] font-semibold text-sky-600 hover:text-sky-800"
            : "text-[10px] font-semibold text-cyan-300/60 hover:text-cyan-200"
          }
        >
          {copy.viewAll} →
        </Link>
      </div>

      {/* Shift rows */}
      <div className="space-y-2">
        {shifts.map((shift) => {
          const accent = getShiftAccentColor(shift.code);
          return (
            <ShiftRow
              key={shift.code}
              shift={shift}
              accent={accent}
              isLight={isLight}
              activeLabel={copy.active}
            />
          );
        })}

        {shifts.length === 0 && (
          <div className={isLight
            ? "py-6 text-center text-xs text-slate-400"
            : "py-6 text-center text-xs text-white/30"
          }>
            {language === "de" ? "Keine Schichten heute" : "No shifts today"}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ShiftRow({
  shift,
  accent,
  isLight,
  activeLabel,
}: {
  shift: ShiftEntry;
  accent: string;
  isLight: boolean;
  activeLabel: string;
}) {
  const accentColors: Record<string, { dot: string; activeBg: string; lightDot: string; lightActiveBg: string; lightStrip: string }> = {
    orange: { dot: "bg-orange-400", activeBg: "border-orange-400/20 bg-orange-400/8", lightDot: "bg-orange-500", lightActiveBg: "border-orange-200/90 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(255,247,237,0.96))] shadow-[0_12px_28px_rgba(245,158,11,0.10)]", lightStrip: "from-orange-500 to-orange-300" },
    amber: { dot: "bg-amber-400", activeBg: "border-amber-400/20 bg-amber-400/8", lightDot: "bg-amber-500", lightActiveBg: "border-amber-200/90 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(255,251,235,0.96))] shadow-[0_12px_28px_rgba(245,158,11,0.10)]", lightStrip: "from-amber-500 to-amber-300" },
    sky: { dot: "bg-sky-400", activeBg: "border-sky-400/20 bg-sky-400/8", lightDot: "bg-sky-500", lightActiveBg: "border-sky-200/90 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(240,249,255,0.96))] shadow-[0_12px_28px_rgba(56,189,248,0.10)]", lightStrip: "from-sky-600 to-sky-300" },
    violet: { dot: "bg-violet-400", activeBg: "border-violet-400/20 bg-violet-400/8", lightDot: "bg-violet-500", lightActiveBg: "border-violet-200/90 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(245,243,255,0.96))] shadow-[0_12px_28px_rgba(168,85,247,0.10)]", lightStrip: "from-violet-600 to-violet-300" },
    slate: { dot: "bg-slate-400", activeBg: "border-slate-400/20 bg-slate-400/8", lightDot: "bg-slate-500", lightActiveBg: "border-slate-200/90 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] shadow-[0_12px_28px_rgba(148,163,184,0.10)]", lightStrip: "from-slate-700 to-slate-300" },
  };

  const colors = accentColors[accent] || accentColors.slate;

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
      shift.isActive
        ? isLight ? colors.lightActiveBg : colors.activeBg
        : isLight ? "border-slate-200/80 bg-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]" : "border-transparent bg-white/2"
    }`}>
      {isLight && shift.isActive && <span className={`h-9 w-1 shrink-0 rounded-full bg-linear-to-b ${colors.lightStrip}`} />}
      {/* Status dot */}
      <span className={`h-2 w-2 shrink-0 rounded-full ${isLight ? colors.lightDot : colors.dot} ${
        shift.isActive ? "shadow-[0_0_6px_currentColor]" : "opacity-50"
      }`} />

      {/* Shift code */}
      <span className={`w-8 text-xs font-bold ${
        isLight ? "text-slate-800" : "text-white/90"
      }`}>
        {shift.code}
      </span>

      {/* Time range */}
      <span className={`flex-1 text-[11px] font-medium tabular-nums ${
        isLight ? "text-slate-500" : "text-white/50"
      }`}>
        {shift.timeRange}
      </span>

      {/* Employee count */}
      <div className="flex items-center gap-1">
        <Users className={`h-3 w-3 ${isLight ? "text-slate-400" : "text-white/30"}`} />
        <span className={`text-[11px] font-bold tabular-nums ${
          isLight ? "text-slate-700" : "text-white/70"
        }`}>
          {shift.employeeCount}{shift.maxCapacity ? `/${shift.maxCapacity}` : ""}
        </span>
      </div>

      {/* Active badge */}
      {shift.isActive && (
        <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
          isLight ? "border border-emerald-200/80 bg-white/88 text-emerald-700" : "bg-emerald-500/20 text-emerald-300"
        }`}>
          {activeLabel}
        </span>
      )}
    </div>
  );
}
