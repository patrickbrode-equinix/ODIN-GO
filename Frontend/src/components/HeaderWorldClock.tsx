import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, Clock3, RefreshCw } from "lucide-react";

const WorldClockPanel = lazy(() => import("./WorldClockPanel"));

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
        className={`flex h-11 items-center gap-2 rounded-md border bg-slate-950 px-2.5 text-left transition ${open ? "border-blue-400 ring-2 ring-blue-500/20" : "border-slate-600 hover:border-slate-500 hover:bg-slate-900"}`}
        title={`${now.toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · Weltzeiten öffnen`}
      >
        <Clock3 className="h-4 w-4 text-blue-300" />
        <div className="leading-tight">
          <div className="whitespace-nowrap font-mono text-[12px] font-bold tabular-nums text-slate-100">{now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
          <div className="whitespace-nowrap text-[9px] text-slate-400">{now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
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
