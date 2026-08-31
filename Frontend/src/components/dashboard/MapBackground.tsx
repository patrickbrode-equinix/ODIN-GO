const MAP_BACKGROUND_CSS = `
@keyframes dashboardMapReveal {
  from { opacity: 0; transform: scale(1.02); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes dashboardMapDrift {
  0%, 100% { transform: scale(1) translate3d(0, 0, 0); }
  50% { transform: scale(1.04) translate3d(-1.4%, 1.1%, 0); }
}

@keyframes dashboardSignalFlow {
  0% { stroke-dashoffset: 0; opacity: 0.16; }
  45% { opacity: 0.92; }
  100% { stroke-dashoffset: -180; opacity: 0.16; }
}

@keyframes dashboardNodePulse {
  0%, 100% { opacity: 0.35; transform: scale(1); }
  50% { opacity: 0.95; transform: scale(1.18); }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-map-reveal,
  .dashboard-map-drift,
  .dashboard-network-flow,
  .dashboard-node-pulse {
    animation: none !important;
  }
}
`;

const NETWORK_PATHS = [
  "M 82 332 C 176 284 272 262 398 248 C 516 234 640 228 814 160",
  "M 140 188 C 282 152 426 166 570 152 C 704 138 804 124 914 98",
  "M 210 426 C 322 360 432 320 562 308 C 706 296 804 308 942 352",
  "M 320 116 C 406 176 486 222 598 236 C 710 250 822 234 934 196",
  "M 126 248 C 252 248 364 232 492 220 C 642 206 788 212 940 246",
];

const NETWORK_NODES = [
  { x: 82, y: 332 },
  { x: 214, y: 190 },
  { x: 398, y: 248 },
  { x: 570, y: 152 },
  { x: 648, y: 310 },
  { x: 814, y: 160 },
  { x: 940, y: 246 },
  { x: 942, y: 352 },
];

export function MapBackground({
  className,
  isLight = false,
}: {
  className?: string;
  isLight?: boolean;
}) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className || ""}`}>
      <style>{MAP_BACKGROUND_CSS}</style>

      {/* Base gradient overlay */}
      <div
        className={isLight
        ? "absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_24%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(148,163,184,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.20),rgba(241,245,249,0.42))]"
          : "absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.02),transparent_26%),radial-gradient(circle_at_top_right,rgba(0,180,255,0.015),transparent_24%),linear-gradient(180deg,rgba(4,11,24,0.02),rgba(4,11,24,0.14))]"
        }
      />

      {/* World map background */}
      <img
        src="/odin-assets/odin_worldmap.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{
            opacity: isLight ? 0.42 : 0.86,
            filter: isLight
              ? "grayscale(0.72) saturate(0.75) contrast(1.02) brightness(1.02)"
              : "saturate(0.88) contrast(1.14) brightness(0.9)",
          animation: "dashboardMapReveal 1.4s cubic-bezier(0.22, 1, 0.36, 1) both, dashboardMapDrift 28s ease-in-out infinite",
        }}
      />

      <svg
        aria-hidden
        viewBox="0 0 1000 520"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {NETWORK_PATHS.map((path, index) => (
          <g key={path}>
            <path
              d={path}
              fill="none"
              stroke={isLight ? "rgba(100,116,139,0.18)" : "rgba(125,211,252,0.16)"}
              strokeWidth="1"
            />
            <path
              d={path}
              fill="none"
                stroke={isLight ? "rgba(37,99,235,0.54)" : "rgba(56,189,248,0.50)"}
              strokeWidth={isLight ? "1.6" : "1.35"}
              strokeDasharray="22 18"
              style={{
                animation: `dashboardSignalFlow ${14 + index * 2}s linear infinite`,
                animationDelay: `${index * 0.9}s`,
                filter: isLight
                  ? "drop-shadow(0 0 6px rgba(37,99,235,0.16))"
                  : "drop-shadow(0 0 7px rgba(56,189,248,0.18))",
              }}
            />
          </g>
        ))}

        {NETWORK_NODES.map((node, index) => (
          <g key={`${node.x}-${node.y}`} transform={`translate(${node.x} ${node.y})`}>
            <circle
              r={isLight ? 7 : 7}
              fill="none"
              stroke={isLight ? "rgba(37,99,235,0.22)" : "rgba(56,189,248,0.16)"}
              strokeWidth="1"
            />
            <circle
              r={isLight ? 3.2 : 3.2}
                fill={isLight ? "rgba(37,99,235,0.74)" : "rgba(125,211,252,0.66)"}
              style={{
                animation: `dashboardNodePulse ${4 + index * 0.5}s ease-in-out infinite`,
                animationDelay: `${index * 0.35}s`,
              }}
            />
          </g>
        ))}
      </svg>

      {/* Vignette / fade edges */}
      <div
        className={isLight
        ? "absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_34%,rgba(226,232,240,0.16)_76%,rgba(203,213,225,0.34)_100%)]"
          : "absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_46%,rgba(4,11,24,0.10)_80%,rgba(4,11,24,0.28)_100%)]"
        }
      />
    </div>
  );
}