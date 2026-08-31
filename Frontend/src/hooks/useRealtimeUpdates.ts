/* ------------------------------------------------ */
/* useRealtimeUpdates – SSE Client Hook             */
/* Connects to /api/sse, listens for named events,  */
/* calls registered callbacks. Auto-reconnects with */
/* exponential backoff.                             */
/* ------------------------------------------------ */

import { useEffect, useRef, useCallback } from "react";

type EventCallback = (data: any) => void;

export interface RealtimeEventMap {
  handover_created?: EventCallback;
  info_created?: EventCallback;
  info_updated?: EventCallback;
  ingest_complete?: EventCallback;
  [key: string]: EventCallback | undefined;
}

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 30_000;
const MAX_RETRIES = 10;

/**
 * Hook to subscribe to ODIN real-time server-sent events.
 *
 * Usage:
 * ```ts
 * useRealtimeUpdates({
 *   handover_created: (data) => { console.log("New handover:", data); },
 *   ingest_complete: (data) => { refetchDashboard(); },
 * });
 * ```
 */
export function useRealtimeUpdates(handlers: RealtimeEventMap) {
  const esRef = useRef<EventSource | null>(null);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef<RealtimeEventMap>(handlers);

  // Keep handlers ref up to date without reconnecting
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource("/api/sse");
    esRef.current = es;

    es.onopen = () => {
      retryCount.current = 0;
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;

      if (retryCount.current >= MAX_RETRIES) return;

      const delay = Math.min(BASE_DELAY_MS * 2 ** retryCount.current, MAX_DELAY_MS);
      retryCount.current++;

      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(connect, delay);
    };

    // Listen for named events
    const boundListeners: Array<[string, EventListener]> = [];

    const attachListeners = () => {
      // Re-attach on every connect for current handlers snapshot
      const currentHandlers = handlersRef.current;
      for (const [event, _] of boundListeners) {
        es.removeEventListener(event, _);
      }
      boundListeners.length = 0;

      for (const eventName of Object.keys(currentHandlers)) {
        const listener: EventListener = (e: Event) => {
          const me = e as MessageEvent;
          try {
            const data = JSON.parse(me.data);
            handlersRef.current[eventName]?.(data);
          } catch {
            handlersRef.current[eventName]?.(me.data);
          }
        };
        es.addEventListener(eventName, listener);
        boundListeners.push([eventName, listener]);
      }
    };

    attachListeners();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}
