import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { MiniClockFace, RollingText } from "./widgets/MotionWidgets";

const WorldClockPanel = lazy(() => import("./WorldClockPanel"));

function isoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBeforeOpen: () => void;
};

export default function HeaderWorldClock({ open, onOpenChange, onBeforeOpen }: Props) {
  const [now, setNow] = useState(() => new Date());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onOpenChange, open]);

  const toggle = () => {
    const next = !open;
    if (next) onBeforeOpen();
    onOpenChange(next);
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
        className={`odin-chip flex h-11 items-center gap-2 rounded-lg border px-2.5 text-left transition ${open ? "border-blue-400 ring-2 ring-blue-500/20" : "border-slate-700 hover:border-slate-500"}`}
        title={`${now.toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · Weltzeiten öffnen`}
      >
        <MiniClockFace className="h-8 w-8" />
        <div className="leading-tight">
          <RollingText
            text={now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            className="font-mono text-[13px] font-bold text-slate-100"
          />
          <div className="whitespace-nowrap text-[9px] text-slate-400">{now.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })} · KW {isoWeek(now)}</div>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <Suspense fallback={<section role="dialog" aria-label="Weltzeiten und Zeitzonen" className="absolute right-0 top-[52px] z-50 flex h-80 w-[min(760px,calc(100vw-24px))] items-center justify-center rounded-xl border border-slate-600 bg-slate-950 text-sm text-slate-400 shadow-2xl"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Weltzeiten werden geladen...</section>}>
          <WorldClockPanel now={now} />
        </Suspense>
      ) : null}
    </div>
  );
}
