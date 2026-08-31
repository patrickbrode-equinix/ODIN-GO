import { motion } from "framer-motion";
import { AnimatedWorldMap } from "./AnimatedWorldMap";

export interface OdinHeroProps {
  totalQueueTickets: number;
  criticalCount: number;
  teamSize: number;
  activeShifts: number;
  onJumpDayView?: () => void;
}

const CSS = `
@keyframes odin-map-pan {
  0%,100% { transform: scale(1) translate3d(0, 0, 0); }
  50% { transform: scale(1.025) translate3d(0, -0.8%, 0); }
}
`;

export function OdinHero({
}: OdinHeroProps) {
  return (
    <section
      className="relative w-full overflow-hidden border-b border-cyan-400/8"
      style={{ height: "clamp(300px, 38vh, 430px)" }}
    >
      <style>{CSS}</style>

      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        <img
          src="/odin-assets/odin_worldmap.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            animation: "odin-map-pan 20s ease-in-out infinite",
            filter: "hue-rotate(188deg) saturate(1.12) brightness(0.72)",
            opacity: 0.44,
            mixBlendMode: "screen",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, rgba(2,8,24,0.82) 0%, rgba(3,9,18,0.34) 38%, rgba(3,9,18,0.9) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 12%, rgba(1,6,18,0.24) 60%, rgba(1,6,18,0.68) 100%)",
          }}
        />
      </div>


      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24"
        style={{ background: "linear-gradient(to right, rgba(3,9,18,0.9), transparent)" }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24"
        style={{ background: "linear-gradient(to left, rgba(3,9,18,0.9), transparent)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-14"
        style={{ background: "linear-gradient(to bottom, rgba(3,9,18,0.82), transparent)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20"
        style={{ background: "linear-gradient(to top, rgba(3,9,18,0.94), transparent)" }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 1.01 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative h-full w-full"
      >
        <AnimatedWorldMap className="h-full w-full opacity-95" />
      </motion.div>
    </section>
  );
}
