import { useId } from "react";

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder";

export function weatherKind(code?: number | null): WeatherKind {
  const value = Number(code);
  if (value === 0 || value === 1) return "clear";
  if (value === 2) return "partly";
  if (value === 3) return "cloudy";
  if ([45, 48].includes(value)) return "fog";
  if ([51, 53, 55, 56, 57].includes(value)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(value)) return "snow";
  if ([95, 96, 99].includes(value)) return "thunder";
  return "cloudy";
}

type Props = {
  code?: number | null;
  isDay?: boolean;
  className?: string;
  /** Adds halo glow; intended for large hero icons. */
  detailed?: boolean;
};

const CLOUD_PATH = "M17 47h29a10 10 0 0 0 .8-19.97A14 14 0 0 0 19.7 27.2 10 10 0 0 0 17 47z";

function Sun({ id, detailed }: { id: string; detailed: boolean }) {
  return (
    <g>
      {detailed ? <circle cx="32" cy="32" r="22" fill={`url(#${id}-halo)`} className="odin-wx-halo" /> : null}
      <g className="odin-wx-spin" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (index * Math.PI) / 4;
          return (
            <line
              key={index}
              x1={32 + Math.cos(angle) * 15}
              y1={32 + Math.sin(angle) * 15}
              x2={32 + Math.cos(angle) * 21}
              y2={32 + Math.sin(angle) * 21}
            />
          );
        })}
      </g>
      <circle cx="32" cy="32" r="10.5" fill={`url(#${id}-sun)`} className="odin-wx-core" />
    </g>
  );
}

function Moon({ id, detailed }: { id: string; detailed: boolean }) {
  return (
    <g>
      {detailed ? <circle cx="30" cy="32" r="22" fill={`url(#${id}-moonhalo)`} className="odin-wx-halo" /> : null}
      <mask id={`${id}-crescent`}>
        <rect x="0" y="0" width="64" height="64" fill="black" />
        <circle cx="30" cy="32" r="14" fill="white" />
        <circle cx="39" cy="25" r="12" fill="black" />
      </mask>
      <g className="odin-wx-bob">
        <circle cx="30" cy="32" r="14" fill={`url(#${id}-moon)`} mask={`url(#${id}-crescent)`} />
      </g>
      <g fill="#e0f2fe">
        <circle cx="47" cy="16" r="1.5" className="odin-wx-twinkle" />
        <circle cx="54" cy="30" r="1.1" className="odin-wx-twinkle" style={{ animationDelay: "0.8s" }} />
        <circle cx="42" cy="46" r="1.2" className="odin-wx-twinkle" style={{ animationDelay: "1.6s" }} />
      </g>
    </g>
  );
}

function CloudShape({ id, className = "", dark = false, transform }: { id: string; className?: string; dark?: boolean; transform?: string }) {
  return (
    <g transform={transform}>
      <path d={CLOUD_PATH} fill={dark ? `url(#${id}-cloud-dark)` : `url(#${id}-cloud)`} stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" className={className} />
    </g>
  );
}

const KIND_LABEL: Record<WeatherKind, string> = {
  clear: "Klar",
  partly: "Leicht bewölkt",
  cloudy: "Bewölkt",
  fog: "Nebel",
  drizzle: "Nieselregen",
  rain: "Regen",
  snow: "Schnee",
  thunder: "Gewitter",
};

/** Animated SVG weather scene for WMO weather codes (Open-Meteo). */
export function AnimatedWeatherIcon({ code, isDay = true, className = "h-6 w-6", detailed = false }: Props) {
  const rawId = useId();
  const id = `wx${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const kind = weatherKind(code);
  const rainy = kind === "drizzle" || kind === "rain" || kind === "thunder";

  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0 overflow-visible`} role="img" aria-label={KIND_LABEL[kind]}>
      <defs>
        <radialGradient id={`${id}-sun`} cx="40%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#fff7c2" />
          <stop offset="55%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-moon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#93c5fd" />
        </linearGradient>
        <radialGradient id={`${id}-moonhalo`}>
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-cloud`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id={`${id}-cloud-dark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
      </defs>

      {kind === "clear" ? (isDay ? <Sun id={id} detailed={detailed} /> : <Moon id={id} detailed={detailed} />) : null}

      {kind === "partly" ? (
        <>
          <g transform="translate(-6 -8) scale(0.85)">{isDay ? <Sun id={id} detailed={detailed} /> : <Moon id={id} detailed={detailed} />}</g>
          <CloudShape id={id} className="odin-wx-drift" transform="translate(4 5)" />
        </>
      ) : null}

      {kind === "cloudy" || kind === "fog" ? (
        <>
          <CloudShape id={id} dark className="odin-wx-drift-slow" transform="translate(-4 -10) scale(0.8)" />
          <CloudShape id={id} className="odin-wx-drift" transform={kind === "fog" ? "translate(0 -7)" : "translate(2 2)"} />
        </>
      ) : null}

      {kind === "fog" ? (
        <g stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" opacity="0.85">
          <line x1="12" y1="48" x2="46" y2="48" className="odin-wx-fog" />
          <line x1="20" y1="55" x2="54" y2="55" className="odin-wx-fog" style={{ animationDelay: "-2s" }} />
        </g>
      ) : null}

      {rainy ? (
        <>
          <CloudShape id={id} dark={kind !== "drizzle"} className="odin-wx-drift" transform="translate(0 -8)" />
          <g stroke="#60a5fa" strokeWidth={kind === "drizzle" ? 2 : 2.6} strokeLinecap="round">
            {(kind === "drizzle" ? [23, 33, 43] : [20, 28, 36, 44]).map((x, index) => (
              <line
                key={x}
                x1={x}
                y1="43"
                x2={x - 2}
                y2={kind === "drizzle" ? 47 : 50}
                className="odin-wx-drop"
                style={{ animationDelay: `${index * 0.23}s`, animationDuration: kind === "drizzle" ? "1.4s" : "0.9s" }}
              />
            ))}
          </g>
        </>
      ) : null}

      {kind === "thunder" ? (
        <path d="M35 38l-8 12h6l-3 10 11-14h-6.5l4-8z" fill="#fde047" stroke="#facc15" strokeWidth="0.8" strokeLinejoin="round" className="odin-wx-bolt" />
      ) : null}

      {kind === "snow" ? (
        <>
          <CloudShape id={id} className="odin-wx-drift" transform="translate(0 -8)" />
          <g fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="0.4">
            {[20, 30, 40, 25, 35].map((x, index) => (
              <circle
                key={`${x}-${index}`}
                cx={x}
                cy={index > 2 ? 45 : 43}
                r={index > 2 ? 1.6 : 2.1}
                className="odin-wx-flake"
                style={{ animationDelay: `${index * 0.45}s` }}
              />
            ))}
          </g>
        </>
      ) : null}
    </svg>
  );
}

export function weatherBackdropClass(code?: number | null, isDay = true) {
  const kind = weatherKind(code);
  if (!isDay && (kind === "clear" || kind === "partly")) return "odin-wx-backdrop odin-wx-backdrop-night";
  return `odin-wx-backdrop odin-wx-backdrop-${kind}`;
}
