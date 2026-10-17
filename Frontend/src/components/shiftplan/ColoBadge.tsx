import { coloMarkTitle, type ColoMark } from "../../utils/coloMarks";

interface ColoBadgeProps {
  mark: ColoMark;
  isGerman: boolean;
  className?: string;
}

/** Small "CO" marker shown next to the shift code of a cell that is planned for Colo. */
export function ColoBadge({ mark, isGerman, className = "" }: ColoBadgeProps) {
  return (
    <span
      title={coloMarkTitle(mark, isGerman)}
      aria-label={coloMarkTitle(mark, isGerman)}
      className={`inline-flex items-center justify-center rounded border border-cyan-400/60 bg-cyan-500/25 px-1 text-[9px] font-black leading-[13px] text-cyan-100 ${className}`}
    >
      CO
    </span>
  );
}

/** Legend chip "CO = Colo". */
export function ColoLegend({ isGerman }: { isGerman: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-xs font-bold text-cyan-100">
      <strong>CO</strong>
      {isGerman ? "= Colo-Einsatz" : "= Colo assignment"}
    </span>
  );
}
