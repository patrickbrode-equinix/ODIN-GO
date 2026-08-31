/* ------------------------------------------------ */
/* ODIN STATUS – Crawler + Engine overview          */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Play, Loader2 } from "lucide-react";
import { useCrawlerStatus } from "../../hooks/useCrawlerStatus";
import { fetchEngineConfig, triggerEngineRun, type EngineConfig, type AssignmentRun } from "../../api/engine";
import { fetchEngineRuns } from "../../api/engine";

export default function OdinStatus() {
  const { status: crawlerStatus, stale, lastRunAt, minutesAgo, refresh: refreshCrawler } = useCrawlerStatus();
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [lastRun, setLastRun] = useState<AssignmentRun | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  useEffect(() => {
    fetchEngineConfig().then(setConfig).catch(() => {});
    fetchEngineRuns(1).then((runs) => setLastRun(runs[0] || null)).catch(() => {});
  }, []);

  const handleRun = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const result = await triggerEngineRun();
      setRunResult(`Run #${result.runId} abgeschlossen: ${result.summary?.assigned ?? 0} zugewiesen, ${result.summary?.skipped ?? 0} übersprungen`);
      fetchEngineRuns(1).then((runs) => setLastRun(runs[0] || null)).catch(() => {});
    } catch (e: any) {
      setRunResult(`Fehler: ${e?.response?.data?.error || e.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* CRAWLER STATUS */}
      <div className={`rounded-xl border p-4 ${stale ? "border-red-500/30 bg-red-500/5" : "border-green-500/20 bg-green-500/5"}`}>
        <div className="flex items-center gap-3 mb-3">
          {stale ? (
            <AlertTriangle className="w-5 h-5 text-red-500" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          )}
          <h3 className="font-semibold text-sm">
            Crawler Status: {stale ? "VERALTET" : "OK"}
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Letztes Update</span>
            <p className="font-medium">
              {lastRunAt ? new Date(lastRunAt).toLocaleString("de-DE", { timeZone: 'Europe/Berlin' }) : "Nie"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Alter</span>
            <p className={`font-medium ${stale ? "text-red-400" : ""}`}>
              {minutesAgo != null ? `${Math.round(minutesAgo)} Minuten` : "—"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Schwellwert</span>
            <p className="font-medium">
              {crawlerStatus?.thresholdMinutes ?? 10} Minuten
            </p>
          </div>
        </div>
        {stale && (
          <div className="mt-3 text-sm text-red-400 bg-red-500/10 rounded-lg p-2 border border-red-500/20">
            ⚠ Automatische Ticketzuweisung ist gesperrt, solange Crawler-Daten veraltet sind.
          </div>
        )}
      </div>

      {/* ENGINE STATUS */}
      <div className="rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-sm">Assignment Engine</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config?.enabled ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"}`}>
              {config?.enabled ? "Aktiviert" : "Deaktiviert"}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-400">
              {config?.engine_mode === "shadow" ? "Shadow Mode" : config?.engine_mode || "—"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm mb-4">
          <div>
            <span className="text-muted-foreground">Letzter Run</span>
            <p className="font-medium">
              {lastRun ? new Date(lastRun.started_at).toLocaleString("de-DE", { timeZone: 'Europe/Berlin' }) : "Kein Run"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Status</span>
            <p className="font-medium">{lastRun?.status || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Ergebnis</span>
            <p className="font-medium">
              {lastRun
                ? `${lastRun.assigned_count} zugewiesen, ${lastRun.skipped_count} übersprungen, ${lastRun.error_count} Fehler`
                : "—"}
            </p>
          </div>
        </div>

        {/* MANUAL TRIGGER */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRun}
            disabled={running || !config?.enabled}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Shadow Run starten
          </button>
          {runResult && (
            <span className="text-sm text-muted-foreground">{runResult}</span>
          )}
        </div>
      </div>
    </div>
  );
}
