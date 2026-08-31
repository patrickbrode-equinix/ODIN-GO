/**
 * useCrawlerStaleness.ts
 *
 * Central hook for crawler staleness detection.
 * Crawler data is considered stale if the last successful
 * crawler update is older than 5 minutes.
 *
 * Used by: Header, Dashboard, TV Dashboard
 */

import { useEffect, useMemo, useState } from "react";

/** Crawler staleness threshold: 10 minutes (matches spec + DB setting) */
const CRAWLER_STALE_THRESHOLD_MS = 10 * 60 * 1000;

export interface CrawlerStalenessResult {
  /** Whether crawler data is stale (> 5 min old or no timestamp available) */
  isStale: boolean;
  /** Human-readable error message when stale */
  staleMessage: string | null;
  /** Milliseconds since last crawler update (null if no timestamp) */
  staleDurationMs: number | null;
}

/**
 * Determines if crawler data is stale based on the last update timestamp.
 *
 * @param lastUpdate ISO timestamp string of the last crawler update, or null/empty
 * @returns Staleness state
 */
export function computeCrawlerStaleness(lastUpdate: string | null | undefined): CrawlerStalenessResult {
  if (!lastUpdate) {
    return {
      isStale: true,
      staleMessage: "Keine aktuellen Crawler-Daten",
      staleDurationMs: null,
    };
  }

  const lastUpdateMs = new Date(lastUpdate).getTime();
  if (isNaN(lastUpdateMs)) {
    return {
      isStale: true,
      staleMessage: "Keine aktuellen Crawler-Daten",
      staleDurationMs: null,
    };
  }

  const nowMs = Date.now();
  const durationMs = nowMs - lastUpdateMs;

  if (durationMs > CRAWLER_STALE_THRESHOLD_MS) {
    return {
      isStale: true,
      staleMessage: "Keine aktuellen Crawler-Daten",
      staleDurationMs: durationMs,
    };
  }

  return {
    isStale: false,
    staleMessage: null,
    staleDurationMs: durationMs,
  };
}

/**
 * React hook that recomputes staleness every 30 seconds
 * based on the provided crawlerLastUpdate timestamp.
 */
export function useCrawlerStaleness(crawlerLastUpdate: string | null | undefined): CrawlerStalenessResult {
  const [tick, setTick] = useState(0);

  // Re-evaluate staleness every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  return useMemo(
    () => computeCrawlerStaleness(crawlerLastUpdate),
    [crawlerLastUpdate, tick]
  );
}
