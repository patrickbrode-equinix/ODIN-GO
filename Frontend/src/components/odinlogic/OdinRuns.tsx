/* ------------------------------------------------ */
/* ODIN RUNS – Run History Table                    */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchEngineRuns, type AssignmentRun } from "../../api/engine";

export default function OdinRuns() {
  const [runs, setRuns] = useState<AssignmentRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchEngineRuns(50)
      .then(setRuns)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Run-Historie</h3>
        <button onClick={load} className="p-1.5 hover:bg-white/5 rounded-lg transition">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2">#</th>
              <th className="text-left px-4 py-2">Modus</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Gestartet</th>
              <th className="text-right px-4 py-2">Tickets</th>
              <th className="text-right px-4 py-2">Zugewiesen</th>
              <th className="text-right px-4 py-2">Übersprungen</th>
              <th className="text-right px-4 py-2">Fehler</th>
              <th className="text-left px-4 py-2">Auslöser</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {runs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  {loading ? "Laden..." : "Keine Runs vorhanden"}
                </td>
              </tr>
            )}
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-white/5 transition">
                <td className="px-4 py-2 font-mono text-xs">{run.id}</td>
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                    {run.mode}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    run.status === "completed" ? "bg-green-500/20 text-green-400" :
                    run.status === "failed" ? "bg-red-500/20 text-red-400" :
                    "bg-blue-500/20 text-blue-400"
                  }`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {new Date(run.started_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-4 py-2 text-right font-mono">{run.total_tickets}</td>
                <td className="px-4 py-2 text-right font-mono text-green-400">{run.assigned_count}</td>
                <td className="px-4 py-2 text-right font-mono text-amber-400">{run.skipped_count}</td>
                <td className="px-4 py-2 text-right font-mono text-red-400">{run.error_count}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{run.trigger_type} {run.created_by ? `(${run.created_by})` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {runs.length > 0 && runs[0].error_message && (
        <div className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
          <strong>Letzter Fehler:</strong> {runs[0].error_message}
        </div>
      )}
    </div>
  );
}
