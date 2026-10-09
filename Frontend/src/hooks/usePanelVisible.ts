import { useSyncExternalStore } from "react";

/*
 * Inside the Jarvis extension the app lives in an iframe that stays loaded while the
 * panel is closed. The extension reports the panel state (ODIN_GO_PANEL_VISIBLE), so
 * clocks, polling and re-renders can pause while nobody sees the page.
 * Outside the extension (or with an older extension) the app counts as visible.
 */
let panelOpen = true;
const listeners = new Set<() => void>();
let attached = false;

function notify() {
  listeners.forEach((listener) => listener());
}

function ensureAttached() {
  if (attached || typeof window === "undefined") return;
  attached = true;
  window.addEventListener("message", (event: MessageEvent) => {
    if (window.parent === window || event.source !== window.parent) return;
    if (event.data?.type !== "ODIN_GO_PANEL_VISIBLE") return;
    const next = event.data.visible !== false;
    if (next === panelOpen) return;
    panelOpen = next;
    notify();
  });
  document.addEventListener("visibilitychange", notify);
}

function subscribe(listener: () => void) {
  ensureAttached();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Synchronous read for timers: is anybody looking at the page right now? */
export function isPanelVisible(): boolean {
  ensureAttached();
  return panelOpen && (typeof document === "undefined" || document.visibilityState !== "hidden");
}

export function usePanelVisible(): boolean {
  return useSyncExternalStore(subscribe, isPanelVisible, () => true);
}
