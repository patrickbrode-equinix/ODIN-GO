/* ------------------------------------------------ */
/* CRAWLER STALENESS HOOK                           */
/* Polls /engine/crawler-status every 30s.          */
/* Used in Header + TVDashboard for stale warning.  */
/* ------------------------------------------------ */

import { useEffect, useState, useCallback } from "react";
import { fetchCrawlerStatus, type CrawlerStatus } from "../api/engine";

const POLL_INTERVAL_MS = 30_000;

export function useCrawlerStatus() {
  const [status, setStatus] = useState<CrawlerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchCrawlerStatus();
      setStatus(data);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Crawler-Status nicht abrufbar");
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    status,
    error,
    stale: status?.stale ?? false,
    lastRunAt: status?.lastRunAt ?? null,
    minutesAgo: status?.minutesAgo ?? null,
    refresh,
  };
}
