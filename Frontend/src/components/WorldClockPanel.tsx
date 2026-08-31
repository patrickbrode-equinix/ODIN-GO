import { Clock3, Globe2, Moon, Sun } from "lucide-react";

type Props = { now: Date };

const WORLD_ZONES = [
  { code: "LAX", city: "Los Angeles", timeZone: "America/Los_Angeles", x: 8.5, y: 29, label: "below" },
  { code: "NYC", city: "New York", timeZone: "America/New_York", x: 21.8, y: 30, label: "below" },
  { code: "GRU", city: "São Paulo", timeZone: "America/Sao_Paulo", x: 27.4, y: 83, label: "above" },
  { code: "LON", city: "London", timeZone: "Europe/London", x: 48.3, y: 22, label: "left" },
  { code: "FRA", city: "Frankfurt", timeZone: "Europe/Berlin", x: 50.2, y: 27, label: "right" },
  { code: "CPT", city: "Kapstadt", timeZone: "Africa/Johannesburg", x: 54.1, y: 87, label: "above" },
  { code: "DXB", city: "Dubai", timeZone: "Asia/Dubai", x: 63.8, y: 39, label: "below" },
  { code: "BOM", city: "Mumbai (Indien)", timeZone: "Asia/Kolkata", x: 70.7, y: 48, label: "below" },
  { code: "SIN", city: "Singapur", timeZone: "Asia/Singapore", x: 78, y: 64, label: "below" },
  { code: "TYO", city: "Tokio", timeZone: "Asia/Tokyo", x: 89.4, y: 34, label: "below" },
  { code: "SYD", city: "Sydney", timeZone: "Australia/Sydney", x: 92.1, y: 93, label: "above" },
] as const;

const MARKER_LABEL_CLASS = {
  above: "bottom-3 left-1/2 -translate-x-1/2",
  below: "left-1/2 top-3 -translate-x-1/2",
  left: "right-3 top-1/2 -translate-y-1/2",
  right: "left-3 top-1/2 -translate-y-1/2",
} as const;

function timeAt(now: Date, timeZone: string, seconds = true) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(now);
}

function dateAt(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(now).replace(",", " ·");
}

function offsetAt(now: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("de-DE", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value
      .replace("GMT", "UTC") || "UTC";
  } catch {
    return "UTC";
  }
}

function isDayAt(now: Date, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now));
  return hour >= 7 && hour < 19;
}

export default function WorldClockPanel({ now }: Props) {
  return (
    <section role="dialog" aria-label="Weltzeiten und Zeitzonen" className="absolute right-0 top-[52px] z-50 max-h-[calc(100vh-72px)] w-[min(760px,calc(100vw-24px))] animate-[odin-weather-panel-in_180ms_ease-out] overflow-y-auto rounded-xl border border-slate-600 bg-slate-950 shadow-2xl shadow-black/70">
      <div className="flex items-center justify-between border-b border-slate-700 bg-gradient-to-r from-slate-800 via-slate-900 to-slate-950 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-500/10 shadow-[0_0_24px_rgba(59,130,246,0.12)]">
            <Globe2 className="h-5 w-5 text-blue-300" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-wide text-white">Weltzeit</div>
            <div className="mt-0.5 text-[10px] text-slate-400">Aktuelle Ortszeiten an internationalen Standorten</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-bold tabular-nums text-white">{timeAt(now, "Europe/Berlin")}</div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-blue-300">Frankfurt · {offsetAt(now, "Europe/Berlin")}</div>
        </div>
      </div>

      <div className="relative h-[320px] overflow-hidden border-b border-slate-800 bg-slate-950">
        <img src="/odin-assets/odin_worldmap.png" alt="Weltkarte mit internationalen Standorten" className="absolute inset-0 h-full w-full object-cover object-[center_60%] opacity-70" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.22),rgba(2,6,23,0.04)_45%,rgba(2,6,23,0.68))]" />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_70px_rgba(2,6,23,0.9)]" />

        {WORLD_ZONES.map((zone) => (
          <div key={zone.code} className="absolute h-0 w-0" style={{ left: `${zone.x}%`, top: `${zone.y}%` }}>
            <span className="absolute -left-2 -top-2 h-4 w-4 animate-ping rounded-full bg-blue-400/35" />
            <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-blue-100 bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.95)]" />
            <div className={`absolute whitespace-nowrap rounded-md border border-blue-300/25 bg-slate-950/90 px-2 py-1 text-center shadow-lg backdrop-blur-sm ${MARKER_LABEL_CLASS[zone.label]}`}>
                <div className="text-[8px] font-bold tracking-[0.16em] text-blue-300">{zone.code}</div>
                <div className="font-mono text-[11px] font-bold tabular-nums text-white">{timeAt(now, zone.timeZone, false)}</div>
            </div>
          </div>
        ))}

        <div className="absolute bottom-2 left-3 flex items-center gap-1.5 rounded-md border border-slate-600/70 bg-slate-950/80 px-2 py-1 text-[9px] text-slate-400 backdrop-blur-sm">
          <Clock3 className="h-3 w-3 text-blue-300" /> Zeiten werden sekundengenau aktualisiert
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 p-3">
        {WORLD_ZONES.map((zone) => {
          const day = isDayAt(now, zone.timeZone);
          return (
            <div key={zone.timeZone} className={`rounded-lg border px-3 py-2.5 ${zone.code === "FRA" ? "border-blue-400/40 bg-blue-500/10" : "border-slate-800 bg-slate-900/70"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[10px] font-semibold text-slate-300">{zone.city}</div>
                {day ? <Sun className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : <Moon className="h-3.5 w-3.5 shrink-0 text-blue-200" />}
              </div>
              <div className="mt-1 font-mono text-base font-bold tabular-nums text-white">{timeAt(now, zone.timeZone)}</div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[9px] text-slate-500"><span>{dateAt(now, zone.timeZone)}</span><span>{offsetAt(now, zone.timeZone)}</span></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
