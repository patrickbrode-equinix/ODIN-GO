import { getShiftColorStyle } from "./shiftColors";
import type { ShiftTimeMap } from "../../utils/shiftTimes";

const CORE_SHIFT_CODES = ["E1", "E2", "L1", "L2", "N", "NK"] as const;

const DEFAULT_SHIFT_TIMES: Record<(typeof CORE_SHIFT_CODES)[number], string> = {
  E1: "06:30-15:30",
  E2: "07:00-16:00",
  L1: "13:00-22:00",
  L2: "15:00-00:00",
  N: "21:45-06:45",
  NK: "21:45-06:45",
};

type ShiftTimeLegendProps = {
  shiftTimes?: ShiftTimeMap;
  className?: string;
  compact?: boolean;
};

export function ShiftTimeLegend({ shiftTimes = {}, className = "", compact = false }: ShiftTimeLegendProps) {
  const visibleCodes = shiftTimes.NK ? CORE_SHIFT_CODES : CORE_SHIFT_CODES.filter((code) => code !== "NK");
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Schichtzeiten">
      {visibleCodes.map((code) => (
        <span
          key={code}
          style={getShiftColorStyle(code)}
          className={`inline-flex items-center gap-1 rounded-md border font-bold ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"}`}
        >
          <strong>{code}</strong>
          <span className="whitespace-nowrap opacity-90">{shiftTimes[code] || DEFAULT_SHIFT_TIMES[code]}</span>
        </span>
      ))}
    </div>
  );
}
