/**
 * frontend/src/hooks/useDashboardData.ts
 *
 * Encapsulates all data-fetching, polling, and derived state
 * that was previously inline in Dashboard.tsx.
 *
 * Returns stable refs/state to be consumed by the Dashboard page.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "../api/api";
import { queueApi } from "../api/queue";
import { useCommitStore } from "../store/commitStore";
import { fetchActiveKioskMessages, acknowledgeMessage, type KioskMessage } from "../api/kiosk";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

export interface CrawlerStatus {
  lastUpdate: string;
  count: number | null;
}

export interface DashboardDataState {
  /** Map of ticketNumber → true for tickets with active handover */
  handoverMap:    Map<string, boolean>;
  crawlerStatus:  CrawlerStatus;
  kioskMessages:  KioskMessage[];
  /** Manually trigger a commit data refresh */
  refreshCommit:  () => Promise<void>;
  /** Dismiss a kiosk message and acknowledge it on the server */
  dismissKioskMessage: (id: number) => Promise<void>;
}

/* ------------------------------------------------ */
/* HOOK                                             */
/* ------------------------------------------------ */

export function useDashboardData(): DashboardDataState {
  const [handoverMap, setHandoverMap] = useState<Map<string, boolean>>(new Map());
  const [crawlerStatus, setCrawlerStatus] = useState<CrawlerStatus>({ lastUpdate: "", count: null });
  const [kioskMessages, setKioskMessages] = useState<KioskMessage[]>([]);

  /* ---- Commit Data ---- */
  const loadCommitData = useCallback(async () => {
    try {
      const [rows, metaRes] = await Promise.all([
        queueApi.getTickets(),
        api.get("/commit/meta").catch(() => ({ data: null })),
      ]);

      useCommitStore.getState().setTickets(rows as any);
      setCrawlerStatus({
        lastUpdate: metaRes.data?.lastUpdate || "",
        count: metaRes.data?.count ?? rows.length,
      });
    } catch (e) {
      console.error("[useDashboardData] Live ticket refresh failed", e);
    }
  }, []);

  /* ---- Handover Map ---- */
  useEffect(() => {
    api
      .get("/handover")
      .then((res) => {
        const map = new Map<string, boolean>();
        if (Array.isArray(res.data)) {
          res.data.forEach((h: { ticketNumber?: string }) => {
            if (h.ticketNumber) map.set(h.ticketNumber, true);
          });
        }
        setHandoverMap(map);
      })
      .catch((e) => console.error("[useDashboardData] Handover load failed", e));
  }, []);

  /* ---- Initial Commit Load + Polling ---- */
  useEffect(() => {
    loadCommitData();

    // Poll every 30s: check meta first, only reload if lastUpdate changed
    const interval = setInterval(async () => {
      try {
        const res = await api.get("/commit/meta");
        const meta = res.data;
        if (meta?.lastUpdate) {
          setCrawlerStatus((prev) => {
            if (prev.lastUpdate && prev.lastUpdate !== meta.lastUpdate) {
              console.log("[useDashboardData] Crawler update detected, reloading...");
              loadCommitData();
            }
            return prev;
          });
        }
      } catch {
        /* ignore polling errors */
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [loadCommitData]);

  /* ---- Kiosk Messages ---- */
  useEffect(() => {
    fetchActiveKioskMessages("ALL").then(setKioskMessages);
    const interval = setInterval(
      () => fetchActiveKioskMessages("ALL").then(setKioskMessages),
      60_000
    );
    return () => clearInterval(interval);
  }, []);

  const dismissKioskMessage = useCallback(async (id: number) => {
    setKioskMessages((prev) => prev.filter((m) => m.id !== id));
    await acknowledgeMessage(id, "ALL");
  }, []);

  return {
    handoverMap,
    crawlerStatus,
    kioskMessages,
    refreshCommit:       loadCommitData,
    dismissKioskMessage,
  };
}
