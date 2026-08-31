/* ------------------------------------------------ */
/* ODIN STARTUP ANIMATION                           */
/* Plays once per browser session (localStorage)    */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";

const STORAGE_KEY = "odin_startup_played";

export function OdinStartupAnimation() {
  const [phase, setPhase] = useState<"idle" | "show" | "fadeout" | "done">(
    "idle"
  );

  useEffect(() => {
    const played = localStorage.getItem(STORAGE_KEY);
    if (played) {
      setPhase("done");
      return;
    }

    // Small delay before starting
    const t0 = setTimeout(() => setPhase("show"), 100);
    // Begin fade-out after 3.2s
    const t1 = setTimeout(() => setPhase("fadeout"), 3200);
    // Fully done after fade
    const t2 = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, "1");
      setPhase("done");
    }, 4000);

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center"
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(0,30,80,0.98) 0%, rgba(0,5,20,1) 100%)",
        transition: "opacity 0.8s ease",
        opacity: phase === "fadeout" ? 0 : phase === "show" ? 1 : 0,
        pointerEvents: "all",
      }}
    >
      {/* Animated background grid */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,216,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,216,255,0.3) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          animation: "gridScroll 4s linear",
        }}
      />

      {/* Glow rings */}
      <div
        className="absolute rounded-full"
        style={{
          width: 480,
          height: 480,
          background: "radial-gradient(circle, rgba(0,216,255,0.06) 0%, transparent 70%)",
          animation: "ringPulse 2s ease-out",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 320,
          height: 320,
          background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)",
          animation: "ringPulse 2s ease-out 0.3s both",
        }}
      />

      {/* Logo */}
      <div
        className="relative z-10 flex flex-col items-center gap-6"
        style={{
          animation: "logoAppear 0.9s cubic-bezier(.22,.68,0,1.2) 0.2s both",
        }}
      >
        <img
          src="/app/ODIN_Logo.png"
          alt="ODIN"
          style={{
            width: 120,
            height: 120,
            objectFit: "contain",
            filter: "drop-shadow(0 0 32px rgba(0,216,255,0.9)) drop-shadow(0 0 60px rgba(59,130,246,0.6))",
            animation: "logoGlow 2s ease-in-out 0.5s both",
          }}
        />

        {/* ODIN text */}
        <div className="flex flex-col items-center gap-2">
          <h1
            style={{
              fontSize: 72,
              fontWeight: 900,
              letterSpacing: "0.25em",
              color: "#00d8ff",
              textShadow:
                "0 0 20px rgba(0,216,255,0.9), 0 0 60px rgba(0,216,255,0.5), 0 0 100px rgba(59,130,246,0.4)",
              animation: "textReveal 0.8s ease-out 0.5s both",
              lineHeight: 1,
            }}
          >
            O.D.I.N
          </h1>

          {/* Subtitle with letter-by-letter reveal */}
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "0.35em",
              color: "rgba(0,216,255,0.7)",
              textTransform: "uppercase",
              textShadow: "0 0 12px rgba(0,216,255,0.4)",
              animation: "textReveal 0.8s ease-out 1s both",
            }}
          >
            Operations Dispatching and Intelligence Node
          </p>
        </div>

        {/* Loading bar */}
        <div
          className="mt-4"
          style={{
            width: 280,
            height: 2,
            background: "rgba(0,216,255,0.15)",
            borderRadius: 4,
            overflow: "hidden",
            animation: "textReveal 0.3s ease-out 1.2s both",
          }}
        >
          <div
            style={{
              height: "100%",
              background: "linear-gradient(90deg, #00d8ff, #3b82f6)",
              boxShadow: "0 0 12px rgba(0,216,255,0.8)",
              animation: "loadBar 1.6s ease-out 1.2s both",
              borderRadius: 4,
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes gridScroll {
          from { backgroundPosition: 0 0; }
          to   { backgroundPosition: 0 -80px; }
        }
        @keyframes ringPulse {
          from { transform: scale(0.4); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes logoAppear {
          from { transform: translateY(30px) scale(0.85); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes logoGlow {
          0%   { filter: drop-shadow(0 0 8px rgba(0,216,255,0.4)); }
          50%  { filter: drop-shadow(0 0 40px rgba(0,216,255,1)) drop-shadow(0 0 80px rgba(59,130,246,0.8)); }
          100% { filter: drop-shadow(0 0 32px rgba(0,216,255,0.9)) drop-shadow(0 0 60px rgba(59,130,246,0.6)); }
        }
        @keyframes textReveal {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loadBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
