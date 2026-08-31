/* ------------------------------------------------ */
/* ODIN DECISIONS – Per-ticket decision viewer      */
/* Answers: Why was this ticket assigned to whom?   */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { Search, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import {
  fetchEngineRuns,
  fetchRunDecisions,
  explainTicket,
  type AssignmentRun,
  type AssignmentDecision,
} from "../../api/engine";

export default function OdinDecisions() {
  const [runs, setRuns] = useState<AssignmentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<AssignmentDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Ticket search
  const [searchTicketId, setSearchTicketId] = useState("");
  const [searchResults, setSearchResults] = useState<AssignmentDecision[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Load runs for dropdown
  useEffect(() => {
    fetchEngineRuns(20).then((r) => {
      setRuns(r);
      if (r.length > 0) setSelectedRunId(r[0].id);
    }).catch(() => {});
  }, []);

  // Load decisions when run selected
  useEffect(() => {
    if (!selectedRunId) return;
    setLoading(true);
    setSearchResults(null);
    fetchRunDecisions(selectedRunId)
      .then(setDecisions)
      .catch(() => setDecisions([]))
      .finally(() => setLoading(false));
  }, [selectedRunId]);

  const handleSearch = async () => {
    if (!searchTicketId.trim()) return;
    setSearching(true);
    try {
      const results = await explainTicket(searchTicketId.trim());
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const displayDecisions = searchResults ?? decisions;

  const decisionColor = (type: string) => {
    if (type === "assigned") return "text-green-400 bg-green-500/20";
    if (type.startsWith("skipped")) return "text-amber-400 bg-amber-500/20";
    return "text-red-400 bg-red-500/20";
  };

  return (
    <div className="space-y-4">
      {/* SEARCH BAR */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Ticket-ID suchen (Erklärung)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchTicketId}
              onChange={(e) => setSearchTicketId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="z.B. ACT-123456"
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-indigo-500/50 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              <Search className="w-4 h-4" />
              Erklären
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Run auswählen</label>
          <select
            value={selectedRunId ?? ""}
            onChange={(e) => { setSelectedRunId(Number(e.target.value)); setSearchResults(null); }}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                Run #{r.id} – {new Date(r.started_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} ({r.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {searchResults && (
        <div className="text-sm text-indigo-400">
          Ergebnisse für Ticket "{searchTicketId}" ({searchResults.length} Entscheidungen gefunden)
          <button onClick={() => setSearchResults(null)} className="ml-2 underline text-xs">Zurück zur Run-Ansicht</button>
        </div>
      )}

      {/* DECISIONS TABLE */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="text-left px-3 py-2">Ticket</th>
              <th className="text-left px-3 py-2">Queue</th>
              <th className="text-left px-3 py-2">System</th>
              <th className="text-left px-3 py-2">Prio</th>
              <th className="text-left px-3 py-2">Entscheidung</th>
              <th className="text-left px-3 py-2">Zugewiesen an</th>
              <th className="text-left px-3 py-2">Regel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Laden...</td></tr>
            )}
            {!loading && displayDecisions.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Keine Entscheidungen</td></tr>
            )}
            {displayDecisions.map((d) => (
              <>
                <tr
                  key={d.id}
                  className="hover:bg-white/5 transition cursor-pointer"
                  onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                >
                  <td className="px-2 py-2 text-muted-foreground">
                    {expandedId === d.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{d.ticket_external_id}</td>
                  <td className="px-3 py-2 text-xs">{d.queue_type}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{d.system_name || "—"}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs font-mono">T{d.priority_score}</span>
                    <span className="text-xs text-muted-foreground ml-1">{d.priority_reason}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${decisionColor(d.decision_type)}`}>
                      {d.decision_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{d.assigned_to || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{d.deciding_rule || "—"}</td>
                </tr>

                {/* EXPANDED DETAIL */}
                {expandedId === d.id && (
                  <tr key={`${d.id}-detail`}>
                    <td colSpan={8} className="bg-white/[0.02] px-6 py-4">
                      <div className="space-y-3 text-sm">
                        {/* Explanation */}
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Erklärung</span>
                          <p className="mt-1">{d.explanation || "Keine Erklärung verfügbar"}</p>
                        </div>

                        {/* Candidates */}
                        {d.candidates_evaluated?.length > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Geprüfte Kandidaten</span>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {d.candidates_evaluated.map((c: any, i: number) => (
                                <span key={i} className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1">
                                  {c.name} ({c.shift}, {c.assignedCount} Tickets{c.roles?.length ? `, Rollen: ${c.roles.join("/")}` : ""})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Exclusion reasons */}
                        {d.exclusion_reasons?.length > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Ausschlüsse</span>
                            <ul className="mt-1 space-y-1">
                              {d.exclusion_reasons.map((ex: any, i: number) => (
                                <li key={i} className="text-xs text-amber-400">
                                  {ex.candidate}: {ex.reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
