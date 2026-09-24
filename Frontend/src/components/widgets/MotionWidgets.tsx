import { useEffect, useLayoutEffect, useRef } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion";

type AnimatedNumberProps = {
  value: number | null | undefined;
  format: (value: number | null) => string;
  className?: string;
  duration?: number;
  /** Relative start for the first animation, e.g. 0.9 starts at 90 % of the value. */
  initialRatio?: number;
};

/** Smoothly counts from the previous to the next value without re-rendering React on every frame. */
export function AnimatedNumber({ value, format, className, duration = 0.9, initialRatio = 0 }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      element.textContent = formatRef.current(null);
      previous.current = null;
      return undefined;
    }
    const from = previous.current ?? value * initialRatio;
    previous.current = value;
    if (reduceMotion || from === value) {
      element.textContent = formatRef.current(value);
      return undefined;
    }
    element.textContent = formatRef.current(from);
    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => { element.textContent = formatRef.current(latest); },
    });
    return () => controls.stop();
  }, [duration, initialRatio, reduceMotion, value]);

  return <span ref={ref} className={className} />;
}

/** Split-flap style rolling characters – every changed digit slides in. */
export function RollingText({ text, className = "", charClassName = "w-[0.62em]" }: { text: string; className?: string; charClassName?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <span className={`inline-flex items-center tabular-nums ${className}`} aria-label={text}>
      {text.split("").map((char, index) => {
        const isDigit = /\d/.test(char);
        if (!isDigit) return <span key={`sep-${index}`} aria-hidden="true" className="odin-clock-sep px-[0.04em]">{char}</span>;
        return (
          <span key={`slot-${index}`} aria-hidden="true" className={`relative inline-block h-[1.2em] overflow-hidden text-center ${charClassName}`}>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={char}
                className="absolute inset-0 flex items-center justify-center"
                initial={reduceMotion ? false : { y: "-85%", opacity: 0, filter: "blur(2px)" }}
                animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                exit={reduceMotion ? { opacity: 0 } : { y: "85%", opacity: 0, filter: "blur(2px)" }}
                transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
              >
                {char}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}

/** Small analog dial with a continuously sweeping second hand. */
export function MiniClockFace({ className = "h-8 w-8", timeZone }: { className?: string; timeZone?: string }) {
  const hourRef = useRef<SVGLineElement>(null);
  const minuteRef = useRef<SVGLineElement>(null);
  const secondRef = useRef<SVGGElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let frame = 0;
    let timer = 0;
    const offsetMs = () => {
      if (!timeZone) return 0;
      const now = new Date();
      const local = new Date(now.toLocaleString("en-US", { timeZone }));
      return local.getTime() - new Date(now.toLocaleString("en-US")).getTime();
    };
    const offset = offsetMs();
    const update = () => {
      const now = new Date(Date.now() + offset);
      const ms = reduceMotion ? 0 : now.getMilliseconds();
      const seconds = now.getSeconds() + ms / 1000;
      const minutes = now.getMinutes() + seconds / 60;
      const hours = (now.getHours() % 12) + minutes / 60;
      hourRef.current?.setAttribute("transform", `rotate(${hours * 30} 16 16)`);
      minuteRef.current?.setAttribute("transform", `rotate(${minutes * 6} 16 16)`);
      secondRef.current?.setAttribute("transform", `rotate(${seconds * 6} 16 16)`);
    };
    update();
    if (reduceMotion) {
      timer = window.setInterval(update, 1000);
    } else {
      const loop = () => { update(); frame = window.requestAnimationFrame(loop); };
      frame = window.requestAnimationFrame(loop);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [reduceMotion, timeZone]);

  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0`} aria-hidden="true">
      <defs>
        <radialGradient id="odin-clock-face" cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#odin-clock-face)" stroke="rgba(96,165,250,0.55)" strokeWidth="1" className="odin-clock-ring" />
      {Array.from({ length: 12 }, (_, index) => (
        <line
          key={index}
          x1="16"
          y1={index % 3 === 0 ? 2.8 : 3.4}
          x2="16"
          y2={index % 3 === 0 ? 5.4 : 4.6}
          stroke={index % 3 === 0 ? "#bfdbfe" : "#475569"}
          strokeWidth={index % 3 === 0 ? 1.2 : 0.8}
          strokeLinecap="round"
          transform={`rotate(${index * 30} 16 16)`}
        />
      ))}
      <line ref={hourRef} x1="16" y1="16" x2="16" y2="9.2" stroke="#e2e8f0" strokeWidth="1.9" strokeLinecap="round" />
      <line ref={minuteRef} x1="16" y1="16" x2="16" y2="6" stroke="#cbd5e1" strokeWidth="1.3" strokeLinecap="round" />
      <g ref={secondRef}>
        <line x1="16" y1="19" x2="16" y2="4.4" stroke="#38bdf8" strokeWidth="0.7" strokeLinecap="round" />
        <circle cx="16" cy="4.4" r="0.9" fill="#38bdf8" className="odin-clock-tip" />
      </g>
      <circle cx="16" cy="16" r="1.4" fill="#38bdf8" stroke="#020617" strokeWidth="0.6" />
    </svg>
  );
}

/** Minimal animated sparkline with a gradient area, a line draw-in and a live end marker. */
export function Sparkline({ values, positive, className = "h-7 w-20" }: { values: number[]; positive: boolean; className?: string }) {
  const clean = values.filter((value) => Number.isFinite(value));
  const width = 100;
  const height = 32;
  const gradientId = positive ? "odin-spark-up" : "odin-spark-down";
  const color = positive ? "#34d399" : "#f87171";

  if (clean.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#334155" strokeDasharray="3 4" />
      </svg>
    );
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const points = clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * width;
    const y = 3 + (1 - (value - min) / span) * (height - 6);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`${className} overflow-visible`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.38" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} className="odin-spark-area" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" className="odin-spark-line" />
      <circle cx={lastX} cy={lastY} r="5" fill={color} opacity="0.35" className="odin-spark-ping" />
      <circle cx={lastX} cy={lastY} r="2.2" fill={color} />
    </svg>
  );
}
