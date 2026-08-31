import { lazy, Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { logActivityEventSafe } from "../api/activity";

const Header = lazy(() => import("./Header").then((module) => ({ default: module.Header })));

export function Layout() {
  const location = useLocation();
  const embedded = new URLSearchParams(location.search).get("embed") === "1";
  useEffect(() => {
    const routeKey = `${location.pathname}${location.search}${location.hash}`;

    try {
      const previousRouteKey = window.sessionStorage.getItem("odin:last-route-log");
      if (previousRouteKey === routeKey) return;
      window.sessionStorage.setItem("odin:last-route-log", routeKey);
    } catch {
      // Ignore storage errors and continue logging.
    }

    logActivityEventSafe({
      action: "PAGE_VIEW",
      module: "NAVIGATION",
      details: {
        path: location.pathname,
        search: location.search,
        hash: location.hash,
      },
    });
  }, [location.hash, location.pathname, location.search]);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background dark:bg-[#010410]">
      {/* Outer frame — invisible in light mode, subtle in dark mode */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-[10px] z-0 rounded-[34px] border border-cyan-300/8 ${embedded ? "hidden" : "hidden dark:block"}`}
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(255,255,255,0.02)" }}
      />

      {/* Light mode: clean Apple-style neutral background */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 dark:hidden ${embedded ? "hidden" : ""}`}
        style={{
          background: "#F5F5F7",
        }}
      />
      {/* Light mode: very subtle top-corner brand accents */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 dark:hidden ${embedded ? "hidden" : ""}`}
        style={{
          background:
            "radial-gradient(circle at 8% 0%, rgba(0,113,227,0.05), transparent 24%), radial-gradient(circle at 90% 4%, rgba(88,86,214,0.04), transparent 20%)",
        }}
      />
      {/* Light mode: very subtle grid texture — toned down opacity */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 opacity-40 dark:hidden ${embedded ? "hidden" : ""}`}
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.80), rgba(0,0,0,0.10) 60%, transparent)",
        }}
      />

      {/* Dark mode: deep layered background */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${embedded ? "hidden" : "hidden dark:block"}`}
        style={{
          background:
            "radial-gradient(circle at 16% 0%, rgba(37,99,235,0.18), transparent 24%), radial-gradient(circle at 84% 10%, rgba(14,165,233,0.16), transparent 22%), radial-gradient(circle at 82% 82%, rgba(79,70,229,0.12), transparent 20%), radial-gradient(circle at 40% 50%, rgba(0,229,255,0.04), transparent 30%), linear-gradient(180deg, rgba(1,4,16,0.99), rgba(2,6,20,0.96) 28%, rgba(1,4,14,1) 100%)",
        }}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${embedded ? "hidden" : "hidden dark:block"}`}
        style={{
          background: "linear-gradient(120deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.016) 14%, transparent 28%), linear-gradient(180deg, transparent 72%, rgba(0,0,0,0.20) 100%)",
          opacity: 0.94,
        }}
      />
      {!embedded ? <Suspense fallback={null}><Header /></Suspense> : null}

      <main className="relative z-10 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
