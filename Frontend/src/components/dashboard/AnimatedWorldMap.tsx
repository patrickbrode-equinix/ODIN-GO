/**
 * AnimatedWorldMap – SVG world network visualization.
 * Frankfurt as central hub. Animated bezier connections to key
 * Equinix datacenters worldwide. Real geographic coordinates.
 */

/* ── Coordinate system: viewBox 0 0 1000 500 ── */
const W = 1000;
const H = 500;

function geo(lat: number, lon: number) {
  return { x: ((lon + 180) / 360) * W, y: ((90 - lat) / 180) * H };
}

const FRA = geo(50.1, 8.7); // Frankfurt — bright hub

const CITIES = [
  { id: "lon", name: "LON", ...geo(51.5, -0.1), delay: 0 },
  { id: "ams", name: "AMS", ...geo(52.4, 4.9), delay: 0.3 },
  { id: "nyc", name: "NYC", ...geo(40.7, -74.0), delay: 0.6 },
  { id: "iad", name: "IAD", ...geo(39.0, -77.5), delay: 0.9 },
  { id: "sjc", name: "SJC", ...geo(37.8, -122.4), delay: 1.2 },
  { id: "dxb", name: "DXB", ...geo(25.2, 55.3), delay: 1.5 },
  { id: "sin", name: "SIN", ...geo(1.4, 103.8), delay: 1.8 },
  { id: "tyo", name: "TYO", ...geo(35.7, 139.7), delay: 2.1 },
  { id: "syd", name: "SYD", ...geo(-33.9, 151.2), delay: 2.4 },
  { id: "gru", name: "GRU", ...geo(-23.5, -46.6), delay: 2.7 },
];

/* Arc bezier path from FRA to city (arcs upward / poleward) */
function arcPath(cx: number, cy: number) {
  const mx = (FRA.x + cx) / 2;
  const dist = Math.abs(cx - FRA.x);
  const lift = dist * 0.28 + 30;
  const my = Math.min(FRA.y, cy) - lift;
  return `M ${FRA.x.toFixed(1)} ${FRA.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
}

/* Approximate continent ellipses [cx, cy, rx, ry, rotation] */
const CONTINENTS: [number, number, number, number, number][] = [
  [200, 195, 105, 138, -12], // North America
  [295, 360, 58, 110, 0],   // South America
  [530, 143, 42, 55, 0],    // Europe
  [548, 335, 62, 125, 0],   // Africa
  [725, 165, 148, 128, 0],  // Asia
  [872, 390, 52, 46, 0],    // Australia
  [388, 72, 38, 34, 0],     // Greenland
];

const KEYFRAMES = `
@keyframes wm-draw { from { stroke-dashoffset: 2000; } to { stroke-dashoffset: 0; } }
@keyframes wm-packet { 0% { opacity: 0; } 5% { opacity: 1; } 90% { opacity: 1; } 100% { opacity: 0; } }
@keyframes wm-pulse-fra { 0%,100%{r:10;opacity:0.9;} 50%{r:18;opacity:0.3;} }
@keyframes wm-ring1 { 0%{r:20;opacity:0.6;} 100%{r:50;opacity:0;} }
@keyframes wm-ring2 { 0%{r:35;opacity:0.4;} 100%{r:70;opacity:0;} }
@keyframes wm-dot-pulse { 0%,100%{opacity:0.5;} 50%{opacity:1;} }
@keyframes wm-line-fade { 0%,100%{opacity:0.2;} 50%{opacity:0.48;} }
@keyframes wm-conn-pulse { 0%,100%{stroke-opacity:0.28;stroke-width:1.2;} 50%{stroke-opacity:0.9;stroke-width:2.1;} }
@keyframes wm-glow-pulse { 0%,100%{opacity:0.1;} 50%{opacity:0.42;} }
@keyframes wm-flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -180; } }
`;

export function AnimatedWorldMap({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <style>{KEYFRAMES}</style>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Continent fill gradient */}
          <radialGradient id="wm-cont-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
          </radialGradient>
          {/* Frankfurt glow */}
          <radialGradient id="wm-fra-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="1" />
            <stop offset="60%" stopColor="#009DFF" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
          </radialGradient>
          {/* City node glow */}
          <radialGradient id="wm-city-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
          </radialGradient>
          {/* Path glow filter */}
          <filter id="wm-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Frankfurt large glow */}
          <filter id="wm-fra-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Continent blur */}
          <filter id="wm-cont-blur">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          {/* Soft glow for cities */}
          <filter id="wm-city-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Background tint ── */}
        <rect width={W} height={H} fill="url(#wm-bg)" opacity="0" />

        {/* ── Graticule (lat/lon grid) ── */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const y = ((90 - lat) / 180) * H;
          return <line key={`lat${lat}`} x1={0} y1={y} x2={W} y2={y} stroke="#1E3A5F" strokeWidth="0.5" opacity="0.4" />;
        })}
        {[-120, -60, 0, 60, 120].map((lon) => {
          const x = ((lon + 180) / 360) * W;
          return <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={H} stroke="#1E3A5F" strokeWidth="0.5" opacity="0.4" />;
        })}

        {/* ── Continent silhouettes ── */}
        {CONTINENTS.map(([cx, cy, rx, ry, rot], i) => (
          <g key={i} filter="url(#wm-cont-blur)">
            <ellipse
              cx={cx} cy={cy} rx={rx} ry={ry}
              transform={`rotate(${rot}, ${cx}, ${cy})`}
              fill="url(#wm-cont-grad)"
              opacity="0.9"
            />
          </g>
        ))}

        {/* ── Second continent pass (sharper edges, lower opacity) ── */}
        {CONTINENTS.map(([cx, cy, rx, ry, rot], i) => (
          <ellipse
            key={`c2-${i}`}
            cx={cx} cy={cy}
            rx={rx * 0.85} ry={ry * 0.85}
            transform={`rotate(${rot}, ${cx}, ${cy})`}
            fill="none"
            stroke="#00E5FF"
            strokeWidth="0.5"
            opacity="0.08"
          />
        ))}

        {/* ── Animated connection paths ── */}
        {CITIES.map((city) => {
          const pathId = `wm-path-${city.id}`;
          const d = arcPath(city.x, city.y);
          return (
            <g key={city.id} filter="url(#wm-glow)">
              {/* Base line */}
              <path
                d={d}
                stroke="#009DFF"
                strokeWidth="0.8"
                fill="none"
                opacity="0.16"
                style={{ animation: `wm-line-fade ${3.2 + city.delay * 0.35}s ease-in-out infinite`, animationDelay: `${city.delay * 0.35}s` }}
              />
              {/* Visible connection that breathes */}
              <path
                id={pathId}
                d={d}
                stroke="#00E5FF"
                strokeWidth="1.2"
                fill="none"
                strokeDasharray="2000"
                strokeDashoffset="2000"
                style={{
                  animation: `wm-draw 2.4s ease-out forwards, wm-conn-pulse ${2.8 + city.delay * 0.4}s ease-in-out 2.6s infinite`,
                  animationDelay: `${0.3 + city.delay}s, ${0.3 + city.delay}s`,
                }}
              />
              {/* Moving highlight on the existing line */}
              <path
                d={d}
                stroke="#9be7ff"
                strokeWidth="1.05"
                fill="none"
                strokeDasharray="18 16"
                opacity="0.56"
                style={{
                  animation: `wm-flow ${2.4 + city.delay * 0.25}s linear infinite, wm-glow-pulse ${2.6 + city.delay * 0.25}s ease-in-out infinite`,
                  animationDelay: `${city.delay * 0.18}s`,
                }}
              />
              {/* Traveling data packet */}
              <circle r="3" fill="#00E5FF" style={{ animation: `wm-packet 4s linear infinite`, animationDelay: `${city.delay + 1}s` }}>
                <animateMotion
                  dur="4s"
                  repeatCount="indefinite"
                  begin={`${city.delay + 0.8}s`}
                >
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
            </g>
          );
        })}

        {/* ── City nodes ── */}
        {CITIES.map((city) => (
          <g key={`node-${city.id}`} filter="url(#wm-city-glow)">
            {/* Pulse ring */}
            <circle
              cx={city.x} cy={city.y} r="6"
              fill="none"
              stroke="#38BDF8"
              strokeWidth="0.8"
              opacity="0"
              style={{ animation: `wm-ring1 3s ease-out infinite`, animationDelay: `${city.delay + 1.2}s` }}
            />
            {/* Glow halo */}
            <circle cx={city.x} cy={city.y} r="10" fill="#009DFF" opacity="0.08" />
            {/* Core dot */}
            <circle cx={city.x} cy={city.y} r="3.5" fill="#38BDF8"
              style={{ animation: `wm-dot-pulse ${2 + city.delay * 0.15}s ease-in-out infinite`, animationDelay: `${city.delay * 0.2}s` }}
            />
            {/* City label */}
            <text
              x={city.x} y={city.y - 10}
              textAnchor="middle"
              fill="#7DD3FC"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="700"
              letterSpacing="1.5"
              opacity="0.75"
            >
              {city.name}
            </text>
          </g>
        ))}

        {/* ── Frankfurt – central hub ── */}
        <g filter="url(#wm-fra-glow)">
          {/* Expanding rings */}
          <circle cx={FRA.x} cy={FRA.y} r="20" fill="none" stroke="#00E5FF" strokeWidth="1.2"
            style={{ animation: "wm-ring1 2.8s ease-out infinite" }} />
          <circle cx={FRA.x} cy={FRA.y} r="35" fill="none" stroke="#00E5FF" strokeWidth="0.7"
            style={{ animation: "wm-ring2 2.8s ease-out infinite", animationDelay: "0.6s" }} />
          <circle cx={FRA.x} cy={FRA.y} r="50" fill="none" stroke="#009DFF" strokeWidth="0.5"
            style={{ animation: "wm-ring1 3.5s ease-out infinite", animationDelay: "1.2s" }} />
          {/* Large glow blob */}
          <circle cx={FRA.x} cy={FRA.y} r="30" fill="#00E5FF" opacity="0.06" />
          {/* Medium glow */}
          <circle cx={FRA.x} cy={FRA.y} r="14" fill="#00E5FF" opacity="0.15" />
          {/* Core */}
          <circle cx={FRA.x} cy={FRA.y} r="6" fill="#00E5FF"
            style={{ animation: "wm-pulse-fra 2.2s ease-in-out infinite" }} />
          {/* Inner point */}
          <circle cx={FRA.x} cy={FRA.y} r="2.5" fill="white" opacity="0.95" />
          {/* Label */}
          <text
            x={FRA.x} y={FRA.y - 22}
            textAnchor="middle"
            fill="#00E5FF"
            fontSize="11"
            fontFamily="monospace"
            fontWeight="700"
            letterSpacing="2"
          >
            FRA
          </text>
          <text
            x={FRA.x} y={FRA.y - 10}
            textAnchor="middle"
            fill="#7DD3FC"
            fontSize="7.5"
            fontFamily="monospace"
            letterSpacing="1"
            opacity="0.8"
          >
            HUB NODE
          </text>
        </g>
      </svg>

      {/* Vignette overlay to fade edges */}
      <div className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(2,6,23,0.5) 75%, rgba(2,6,23,0.85) 100%)" }}
      />
    </div>
  );
}
