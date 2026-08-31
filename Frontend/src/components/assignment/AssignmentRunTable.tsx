/* ================================================ */
/* ODIN-Logik — Run Table                           */
/* ================================================ */

import { Fragment, useState } from 'react';
import { useAssignmentStore } from '../../store/assignmentStore';
import { AssignmentApi } from '../../api/assignment';
import type { AssignmentRun } from '../../types/assignment';
import { ChevronDown, ChevronRight, AlertCircle, Loader2, Clock3, PlayCircle, UserRound, ShieldAlert } from 'lucide-react';
import { InfoTooltip } from '../ui/InfoTooltip';

/* ---- German failure reason mapping ---- */
const FAILURE_REASON_MAP: Record<string, string> = {
  crawler_stale: 'Crawler-Daten zu alt',
  no_eligible_workers: 'Keine gültigen Kandidaten gefunden',
  config_invalid: 'Engine-Konfiguration ungültig',
  config_missing: 'Pflichtkonfiguration fehlt',
  critical_error_stop: 'Run wegen kritischem Fehler gestoppt',
  ticket_data_incomplete: 'Ticketdaten unvollständig',
  no_workers_after_role_check: 'Kein zulässiger Mitarbeiter nach Rollenprüfung',
  all_candidates_excluded: 'Site-/Bereichsregeln schließen alle Kandidaten aus',
  technical_error: 'Technischer Fehler beim Laden der Run-Daten',
  live_not_enabled: 'Live-Modus nicht freigeschaltet',
};

const ERROR_CATEGORY_LABELS: Record<string, { label: string; className: string }> = {
  technical_error: { label: 'Technisch', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
  business_rule: { label: 'Fachlich', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  controlled_stop: { label: 'Kontrolliert', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  critical_error_stop: { label: 'Kritisch', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

function getFailureDisplay(run: AssignmentRun): string | null {
  if (run.status !== 'failed' && run.status !== 'cancelled') return null;
  if (run.failure_reason) return run.failure_reason;
  // Fallback: try to derive from summary
  const summary = run.summary as Record<string, unknown> | null;
  if (summary?.crawlerStale) return FAILURE_REASON_MAP.crawler_stale;
  return 'Unbekannter Fehler';
}

const statusBadge: Record<string, { className: string; label: string }> = {
  running: { className: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Läuft' },
  completed: { className: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Abgeschlossen' },
  failed: { className: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Fehlgeschlagen' },
  cancelled: { className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', label: 'Abgebrochen' },
};

const modeBadge: Record<string, { className: string }> = {
  shadow: { className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  live: { className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  'dry-run': { className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${className}`}>
      {text}
    </span>
  );
}

function formatRunTimestamp(value: string | null | undefined) {
  if (!value) return '–';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRunDuration(startedAt: string, finishedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '–';

  const durationMs = end - start;
  const totalMinutes = Math.round(durationMs / 60000);
  if (totalMinutes < 1) return '< 1 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function prettifySummaryKey(key: string) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

interface Props {
  runs: AssignmentRun[];
}

interface RunReportRow {
  decisionId?: number;
  displayTicketNumber: string;
  internalTicketId?: string | null;
  queueType?: string | null;
  systemName?: string | null;
  ticketCategory?: string | null;
  ticketSubtype?: string | null;
  assignedTo?: string | null;
  reason?: string | null;
  result?: string | null;
  existsInQueueDb?: boolean;
}

interface RunReport {
  summary?: Record<string, number>;
  validation?: {
    totalProcessed: number;
    totalAssigned: number;
    totalUnassigned: number;
    totalNotRelevant: number;
    recordedTotalTickets?: number;
    presentInQueueDbCount?: number;
    missingInQueueDbCount?: number;
    warning?: string | null;
  };
  assigned?: RunReportRow[];
  unassigned?: RunReportRow[];
  notRelevant?: RunReportRow[];
}

function TicketPreviewTable({ rows, tone }: { rows: RunReportRow[]; tone: 'green' | 'red' | 'zinc' }) {
  const toneClass = tone === 'green' ? 'hover:bg-green-500/5' : tone === 'red' ? 'hover:bg-red-500/5' : 'hover:bg-zinc-500/5';

  return (
    <div className="overflow-x-auto rounded-lg border border-border/20">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-background/60 text-muted-foreground">
            <th className="px-3 py-2 text-left">Ticket</th>
            <th className="px-3 py-2 text-left">System</th>
            <th className="px-3 py-2 text-left">Kategorie</th>
            <th className="px-3 py-2 text-left">Queue</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.decisionId || row.displayTicketNumber}-${row.reason || row.result || ''}`} className={`border-t border-border/10 ${toneClass}`}>
              <td className="px-3 py-2 font-mono">
                <div>{row.displayTicketNumber}</div>
                {row.internalTicketId && row.internalTicketId !== row.displayTicketNumber && (
                  <div className="text-[10px] text-muted-foreground">DB-ID {row.internalTicketId}</div>
                )}
              </td>
              <td className="px-3 py-2">{row.systemName || '–'}</td>
              <td className="px-3 py-2">{row.ticketCategory || '–'}</td>
              <td className="px-3 py-2">{row.queueType || '–'}</td>
              <td className="px-3 py-2">
                {row.assignedTo || row.result || (row.existsInQueueDb === false ? 'Nicht mehr in DB' : 'OK')}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {row.reason || row.ticketSubtype || '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AssignmentRunTable({ runs }: Props) {
  const { selectRun, selectedRun } = useAssignmentStore();
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);
  const [reportsByRun, setReportsByRun] = useState<Record<number, RunReport>>({});

  const toggleRun = async (run: AssignmentRun) => {
    if (expandedRunId === run.id) {
      setExpandedRunId(null);
      return;
    }

    setExpandedRunId(run.id);
    await selectRun(run.id);

    if (!reportsByRun[run.id]) {
      setLoadingReportId(run.id);
      try {
        const data = await AssignmentApi.getRunReport(run.id);
        setReportsByRun((current) => ({ ...current, [run.id]: data.report as RunReport }));
      } finally {
        setLoadingReportId(null);
      }
    }
  };

  const selectOnly = async (run: AssignmentRun) => {
    await selectRun(run.id);
  };

  if (runs.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        Keine Runs vorhanden. Starten Sie einen Shadow-Run.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/30 text-xs text-muted-foreground">
            <th className="text-left px-3 py-2 font-medium">ID</th>
            <th className="text-left px-3 py-2 font-medium">Modus</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
            <th className="text-left px-3 py-2 font-medium">
              <span className="flex items-center gap-1">
                Grund
                <InfoTooltip title="Fehlgrund / Ursache" side="bottom">
                  <p>Zeigt bei fehlgeschlagenen oder abgebrochenen Runs eine verständliche Begründung, warum der Lauf nicht erfolgreich abgeschlossen wurde.</p>
                  <p><strong>Kategorien:</strong></p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li><strong>Technisch:</strong> API-/DB-Fehler, Validierungsfehler, unerwartete Ausnahme</li>
                    <li><strong>Fachlich:</strong> Keine Kandidaten, Tickettyp nicht unterstützt, Regeln blockieren</li>
                    <li><strong>Kontrolliert:</strong> Crawler-Daten veraltet, Pflichtkonfiguration fehlt</li>
                    <li><strong>Kritisch:</strong> Stop bei kritischem Fehler aktiv</li>
                  </ul>
                </InfoTooltip>
              </span>
            </th>
            <th className="text-left px-3 py-2 font-medium">Gestartet</th>
            <th className="text-right px-3 py-2 font-medium">Tickets</th>
            <th className="text-right px-3 py-2 font-medium">Assigned</th>
            <th className="text-right px-3 py-2 font-medium">Review</th>
            <th className="text-right px-3 py-2 font-medium">Errors</th>
            <th className="text-left px-3 py-2 font-medium">Ausgelöst von</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const sb = statusBadge[run.status] || statusBadge.completed;
            const mb = modeBadge[run.mode] || modeBadge.shadow;
            const failureDisplay = getFailureDisplay(run);
            const errCat = run.error_category ? ERROR_CATEGORY_LABELS[run.error_category] : null;
            const isExpanded = expandedRunId === run.id;
            const isSelected = selectedRun?.id === run.id;
            const report = reportsByRun[run.id];
            return (
              <Fragment key={run.id}>
                <tr
                  className={`border-b border-border/20 cursor-pointer transition ${isSelected ? 'bg-blue-500/10' : 'hover:bg-accent/30'}`}
                  onClick={() => selectOnly(run)}
                >
                  <td className="px-3 py-2 font-mono text-xs">#{run.id}</td>
                  <td className="px-3 py-2"><Badge text={run.mode} className={mb.className} /></td>
                  <td className="px-3 py-2"><Badge text={sb.label} className={sb.className} /></td>
                  <td className="px-3 py-2 max-w-62.5">
                    {failureDisplay ? (
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        <span className="text-xs text-red-300 truncate" title={failureDisplay}>
                          {failureDisplay.length > 50 ? failureDisplay.slice(0, 47) + '…' : failureDisplay}
                        </span>
                        {errCat && (
                          <span className={`text-[8px] font-bold px-1 py-0.5 rounded border shrink-0 ${errCat.className}`}>
                            {errCat.label}
                          </span>
                        )}
                        {failureDisplay.length > 50 && (
                          <span onClick={(e) => e.stopPropagation()}>
                            <InfoTooltip title="Vollständiger Fehlgrund" side="left" width="w-96">
                              <p>{failureDisplay}</p>
                              {run.failure_step && <p className="mt-1"><strong>Fehlgeschlagener Schritt:</strong> {run.failure_step}</p>}
                              {run.error_category && <p><strong>Kategorie:</strong> {run.error_category}</p>}
                            </InfoTooltip>
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">–</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(run.started_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2 text-right">{run.total_tickets}</td>
                  <td className="px-3 py-2 text-right text-green-400">{run.assigned}</td>
                  <td className="px-3 py-2 text-right text-amber-400">{run.manual_review}</td>
                  <td className="px-3 py-2 text-right text-red-400">{run.errors}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-30">
                    {run.triggered_by || '–'}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void toggleRun(run);
                      }}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                        isExpanded
                          ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                          : 'border-border/30 bg-background/40 text-muted-foreground hover:border-blue-500/30 hover:text-foreground'
                      }`}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {isExpanded ? 'Details verbergen' : 'Details anzeigen'}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-b border-border/20 bg-background/20">
                    <td colSpan={11} className="px-4 py-4">
                      {loadingReportId === run.id ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" /> Run-Details werden geladen
                        </div>
                      ) : report ? (
                        <div className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-lg border border-border/20 bg-background/40 p-3">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <PlayCircle className="h-3.5 w-3.5" />
                                Start
                              </div>
                              <div className="mt-1 text-sm text-foreground">{formatRunTimestamp(run.started_at)}</div>
                            </div>
                            <div className="rounded-lg border border-border/20 bg-background/40 p-3">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <Clock3 className="h-3.5 w-3.5" />
                                Dauer
                              </div>
                              <div className="mt-1 text-sm text-foreground">{formatRunDuration(run.started_at, run.finished_at)}</div>
                              <div className="text-[11px] text-muted-foreground">Fertig: {formatRunTimestamp(run.finished_at)}</div>
                            </div>
                            <div className="rounded-lg border border-border/20 bg-background/40 p-3">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <UserRound className="h-3.5 w-3.5" />
                                Ausgelöst von
                              </div>
                              <div className="mt-1 text-sm text-foreground">{run.triggered_by || '–'}</div>
                            </div>
                            <div className="rounded-lg border border-border/20 bg-background/40 p-3">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                Fehlerpfad
                              </div>
                              <div className="mt-1 text-sm text-foreground">{run.failure_step || '–'}</div>
                              <div className="text-[11px] text-muted-foreground">Kategorie: {run.error_category || '–'}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {Object.entries(report.summary || {}).map(([key, value]) => (
                              <div key={key} className="rounded-lg border border-border/20 bg-background/40 p-3 text-center">
                                <div className="text-lg font-bold text-foreground">{String(value)}</div>
                                <div className="text-[10px] uppercase text-muted-foreground">{prettifySummaryKey(key)}</div>
                              </div>
                            ))}
                          </div>

                          {run.failure_reason && (
                            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                              <div className="text-xs font-semibold text-red-300">Run-Fehler</div>
                              <div className="mt-1 text-sm text-red-100">{run.failure_reason}</div>
                            </div>
                          )}

                          {report.validation && (
                            <div className={`rounded-lg border p-3 ${report.validation.warning ? 'border-amber-500/30 bg-amber-500/5' : 'border-green-500/30 bg-green-500/5'}`}>
                              <div className="text-xs font-semibold text-foreground">Run-Validierung</div>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                Decisions: {report.validation.totalProcessed} | Zugewiesen: {report.validation.totalAssigned} | Nicht zugewiesen: {report.validation.totalUnassigned} | Nicht relevant: {report.validation.totalNotRelevant}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                Run-Header: {report.validation.recordedTotalTickets ?? 0} | Aktuell in queue_items vorhanden: {report.validation.presentInQueueDbCount ?? 0}
                              </div>
                              {report.validation.warning && (
                                <div className="mt-2 text-[11px] text-amber-300">{report.validation.warning}</div>
                              )}
                            </div>
                          )}

                          {report.assigned && report.assigned.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-green-400">Zugewiesene Tickets ({report.assigned.length})</div>
                              <TicketPreviewTable rows={report.assigned} tone="green" />
                            </div>
                          )}

                          {report.unassigned && report.unassigned.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-red-400">Nicht zugewiesene Tickets ({report.unassigned.length})</div>
                              <TicketPreviewTable rows={report.unassigned} tone="red" />
                            </div>
                          )}

                          {report.notRelevant && report.notRelevant.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-zinc-300">Nicht relevante Tickets ({report.notRelevant.length})</div>
                              <TicketPreviewTable rows={report.notRelevant} tone="zinc" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">Für diesen Run konnten keine Detaildaten geladen werden.</div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
