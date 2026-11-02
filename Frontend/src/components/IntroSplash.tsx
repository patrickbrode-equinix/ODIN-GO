import { useEffect, useState } from "react";

/* One-time intro: ODIN logo + a shift-plan grid that builds itself.
 * Shown on the very first start only (localStorage); `?intro=1` replays it. */

const SEEN_KEY = "odin-go-intro-seen-v1";
const DURATION_MS = 3600;
const ROWS = 5;
const COLS = 7;
const KINDS = ["f", "s", "n", "f", "s", "free", "f", "n", "s", "f", "free", "s", "f", "n"];

function shouldShow(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("intro") === "1") return true;
    return window.localStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

export default function IntroSplash() {
  const [visible, setVisible] = useState(shouldShow);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* storage blocked: intro may repeat */ }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const leave = window.setTimeout(() => setLeaving(true), reduced ? 900 : DURATION_MS);
    const done = window.setTimeout(() => setVisible(false), (reduced ? 900 : DURATION_MS) + 500);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") setLeaving(true); };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(leave); window.clearTimeout(done); window.removeEventListener("keydown", onKey); };
  }, [visible]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setVisible(false), 500);
    return () => window.clearTimeout(t);
  }, [leaving]);

  if (!visible) return null;

  const cells = Array.from({ length: ROWS * COLS }, (_, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    return { key: i, kind: KINDS[(row * 3 + col * 2) % KINDS.length], delay: 900 + (row + col) * 70 };
  });

  return (
    <div className={`odin-intro ${leaving ? "is-leaving" : ""}`} role="presentation" onClick={() => setLeaving(true)}>
      <div className="odin-intro-glow" />
      <div className="odin-intro-stage">
        <img src="/odin-assets/odin-go-hero.png" alt="ODIN GO" className="odin-intro-logo" />
        <div className="odin-intro-grid" aria-hidden="true">
          {cells.map((c) => (
            <span key={c.key} className="odin-intro-cell" data-kind={c.kind} style={{ animationDelay: `${c.delay}ms` }} />
          ))}
        </div>
        <div className="odin-intro-title">Dein Schichtplan. Klar. Fair. Planbar.</div>
        <div className="odin-intro-bar"><span /></div>
        <div className="odin-intro-skip">Zum Überspringen klicken</div>
      </div>
    </div>
  );
}
