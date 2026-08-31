/* ------------------------------------------------ */
/* TV CONTENT – ORCHESTRATOR ONLY                   */
/* Self-hydrating: loads employees directly from    */
/* /api/tv/schedules/today — no Shiftplan page      */
/* visit required.  ShiftStore is used as offline   */
/* fallback only.                                   */
/* ------------------------------------------------ */

import { useEffect, useMemo, useState } from "react";
import { useShiftStore } from "../../store/shiftStore";
import { TvLayout } from "./tv.layout";
import { useEmployeeMetaStore } from "../../store/employeeMetaStore";
import { computeCrawlerStaleness } from "../../hooks/useCrawlerStaleness";

interface TVContentProps {
  isFullscreen?: boolean;
}

export function TVContent({ isFullscreen = false }: TVContentProps) {
  const [now, setNow] = useState(new Date());

  // Secondary: localStorage/persisted store (populated only after Shiftplan visit)
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persistApi = (useShiftStore as any).persist;
    if (persistApi?.hasHydrated?.()) setHydrated(true);
    const unsub = persistApi?.onFinishHydration?.(() => setHydrated(true));
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const getEmployeesForToday = useShiftStore((s) => s.getEmployeesForToday);

  // Primary: live data from public TV API (self-hydrating, no auth)
  const [apiShifts, setApiShifts] = useState<{
    early: any[];
    late: any[];
    night: any[];
    dataFresh: boolean;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        // Use native fetch to bypass axios interceptors entirely
        const res = await fetch("/api/tv/schedules/today");
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.dataFresh === true) {
          setApiShifts({
            early: Array.isArray(data.early) ? data.early : [],
            late: Array.isArray(data.late) ? data.late : [],
            night: Array.isArray(data.night) ? data.night : [],
            dataFresh: true,
          });
        }
      } catch {
        // silent — fall back to store
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* CRAWLER STALENESS: poll public TV crawler-meta endpoint */
  const [crawlerLastUpdate, setCrawlerLastUpdate] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/tv/crawler-meta");
        if (!res.ok) return;
        const data = await res.json();
        setCrawlerLastUpdate(data?.lastUpdate ?? null);
      } catch {
        // silent
      }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const crawlerStaleness = useMemo(
    () => computeCrawlerStaleness(crawlerLastUpdate),
    [crawlerLastUpdate, now] // re-evaluate as clock ticks
  );

  const { getCategory } = useEmployeeMetaStore();

  const { early, late, night } = useMemo(() => {
    // Prefer API data (always fresh, no login needed)
    if (apiShifts?.dataFresh) {
      const mapEmp = (e: any) => ({ ...e, category: getCategory(e.name) });
      return {
        early: apiShifts.early.map(mapEmp),
        late:  apiShifts.late.map(mapEmp),
        night: apiShifts.night.map(mapEmp),
      };
    }

    // Fallback: persisted store (requires prior Shiftplan visit OR non-empty localStorage)
    if (!hydrated) return { early: [], late: [], night: [] };
    try {
      const raw = getEmployeesForToday?.() ?? { early: [], late: [], night: [] };
      const mapEmp = (e: any) => ({ ...e, category: getCategory(e.name) });
      return {
        early: raw.early.map(mapEmp),
        late:  raw.late.map(mapEmp),
        night: raw.night.map(mapEmp),
      };
    } catch {
      return { early: [], late: [], night: [] };
    }
  }, [apiShifts, hydrated, getEmployeesForToday, getCategory]);

  return (
    <TvLayout
      isFullscreen={isFullscreen}
      now={now}
      early={early}
      late={late}
      night={night}
      crawlerStale={crawlerStaleness.isStale}
    />
  );
}
