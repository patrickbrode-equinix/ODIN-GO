/* ================================================ */
/* ODIN-Logik — Explanation Card (Structured)       */
/* ================================================ */

import type { TicketExplanation, ExcludedCandidateGroup, CandidateRef, CandidateRankingEntry } from '../../types/assignment';
import { CheckCircle, XCircle, AlertTriangle, Info, ListOrdered, Users, UserCheck } from 'lucide-react';
import { getAssignmentDisplayTicketNumber, getAssignmentInternalTicketId, getAssignmentQueueOrigin } from '../../utils/assignmentTicketDisplay';
import { useLanguage } from '../../context/LanguageContext';
import { AssignmentGlossaryPanel, AssignmentMetricBadge } from './AssignmentTraceGlossary';
import {
  collectAssignmentTraceGlossaryKeys,
  formatAssignmentMetricLabel,
  formatAssignmentPrioritizationFactor,
  formatAssignmentRankingFactorText,
  resolveAssignmentTraceGlossaryKey,
} from '../../utils/assignmentTraceGlossary';

interface Props {
  explanation: TicketExplanation;
}

export function AssignmentExplanationCard({ explanation }: Props) {
  const { language } = useLanguage();
  const isGerman = language === 'de';
  const glossaryLanguage = isGerman ? 'de' : 'en';

  if (!explanation.found || !explanation.explanation) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {explanation.message || (isGerman ? 'Keine Erklärung verfügbar.' : 'No explanation available.')}
      </div>
    );
  }

  const s = explanation.explanation.structured;
  const glossaryKeys = collectAssignmentTraceGlossaryKeys({
    configSnapshot: s.configSnapshot,
    ticketSelection: s.ticketSelection,
    finalDecision: s.finalDecision,
    candidateRanking: s.candidateRanking,
  });

  const resultStyles: Record<string, { label: string; className: string; icon: typeof CheckCircle }> = {
    assigned: { label: isGerman ? 'Zugewiesen' : 'Assigned', className: 'text-green-400', icon: CheckCircle },
    manual_review: { label: isGerman ? 'Manuelle Prüfung' : 'Manual review', className: 'text-amber-400', icon: AlertTriangle },
    no_candidate: { label: isGerman ? 'Kein Kandidat' : 'No candidate', className: 'text-orange-400', icon: XCircle },
    not_relevant: { label: isGerman ? 'Nicht relevant' : 'Not relevant', className: 'text-zinc-400', icon: Info },
    blocked: { label: isGerman ? 'Gesperrt' : 'Blocked', className: 'text-red-400', icon: XCircle },
    error: { label: isGerman ? 'Fehler' : 'Error', className: 'text-red-400', icon: XCircle },
  };
  const rs = resultStyles[s.result] || resultStyles.error;
  const ResultIcon = rs.icon;
  const displayTicketNumber = getAssignmentDisplayTicketNumber(s);
  const internalTicketId = getAssignmentInternalTicketId(s);
  const queueOrigin = getAssignmentQueueOrigin(s);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ResultIcon className={`w-5 h-5 ${rs.className}`} />
        <div>
          <div className="text-sm font-semibold text-foreground">{rs.label}</div>
          <div className="text-xs text-muted-foreground">{s.shortReason}</div>
        </div>
      </div>

      {/* Ticket Details */}
      <Section title={isGerman ? 'Ticket-Details' : 'Ticket details'} icon={Info}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">{isGerman ? 'Ticketnummer' : 'Ticket number'}</dt>
          <dd className="font-mono">{displayTicketNumber}</dd>
          {internalTicketId && internalTicketId !== displayTicketNumber && (<><dt className="text-muted-foreground">{isGerman ? 'Interne ID' : 'Internal ID'}</dt><dd className="font-mono">{internalTicketId}</dd></>)}
          {s.externalId && (<><dt className="text-muted-foreground">{isGerman ? 'Externe ID' : 'External ID'}</dt><dd className="font-mono">{s.externalId}</dd></>)}
          {queueOrigin && (<><dt className="text-muted-foreground">Queue</dt><dd>{queueOrigin}</dd></>)}
          <dt className="text-muted-foreground">{isGerman ? 'Typ' : 'Type'}</dt>
          <dd>{s.ticketType || '–'}</dd>
          <dt className="text-muted-foreground">{isGerman ? 'Status' : 'Status'}</dt>
          <dd>{s.ticketStatus || '–'}</dd>
          <dt className="text-muted-foreground">{isGerman ? 'Priorität' : 'Priority'}</dt>
          <dd>{s.ticketPriority || '–'}</dd>
          <dt className="text-muted-foreground">Site</dt>
          <dd>{s.ticketSite || '–'}</dd>
          <dt className="text-muted-foreground">{isGerman ? 'Modus' : 'Mode'}</dt>
          <dd>{s.mode || s.ticketContext?.mode || '–'}</dd>
        </dl>
      </Section>

      <Section title={isGerman ? 'Ticketkontext' : 'Ticket context'} icon={Info}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">System</dt>
          <dd>{s.ticketContext?.systemName || '–'}</dd>
          <dt className="text-muted-foreground">{isGerman ? 'Aktivität' : 'Activity'}</dt>
          <dd>{s.ticketContext?.activity || '–'}</dd>
          <dt className="text-muted-foreground">{isGerman ? 'Aktueller Owner' : 'Current owner'}</dt>
          <dd>{s.ticketContext?.currentOwner || '–'}</dd>
          <dt className="text-muted-foreground">{isGerman ? 'Vorgeschlagener Owner' : 'Suggested owner'}</dt>
          <dd>{s.ticketContext?.recommendedOwner || '–'}</dd>
          <dt className="text-muted-foreground">{isGerman ? 'Restzeit' : 'Remaining time'}</dt>
          <dd>{s.ticketContext?.remainingTimeLabel || '–'}</dd>
          <dt className="text-muted-foreground">Commit / Due</dt>
          <dd>{s.ticketContext?.dueAt || '–'}</dd>
          <dt className="text-muted-foreground">Revised Commit</dt>
          <dd>{s.ticketContext?.revisedCommitDate || '–'}</dd>
          <dt className="text-muted-foreground">Sched. Start</dt>
          <dd>{s.ticketContext?.scheduledStart || '–'}</dd>
        </dl>
      </Section>

      {s.ticketSelection && (
        <Section title={isGerman ? 'Priorisierung' : 'Prioritization'} icon={ListOrdered}>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="text-muted-foreground">{isGerman ? 'Reihenfolge im Lauf' : 'Rank in run'}</div>
              <div>{s.ticketSelection.prioritizationRank || '–'} / {s.ticketSelection.totalEligibleTickets || '–'}</div>
              <div className="text-muted-foreground">{isGerman ? 'Aktiver Restpool' : 'Remaining pool'}</div>
              <div>{s.ticketSelection.totalRemainingTickets || '–'}</div>
            </div>
            {s.ticketSelection.selectedNextReason && (
              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-blue-100">
                {s.ticketSelection.selectedNextReason}
              </div>
            )}
            {(s.ticketSelection.prioritizationFactors || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {s.ticketSelection.prioritizationFactors.map((factor) => (
                  <AssignmentMetricBadge
                    key={`${factor.key}-${String(factor.value)}`}
                    label={formatAssignmentPrioritizationFactor(factor, glossaryLanguage)}
                    glossaryKey={resolveAssignmentTraceGlossaryKey(factor)}
                    language={glossaryLanguage}
                    className="rounded-full border border-border/30 bg-background/60 px-2 py-1 text-[10px] text-foreground/80"
                    tooltipWidth="w-80"
                  />
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {(s.configSnapshot.mode || s.configSnapshot.currentShiftOnly != null || s.configSnapshot.planningWindowHours != null || s.configSnapshot.enableRotationTieBreaker != null || s.configSnapshot.fallbackTieBreaker || s.configSnapshot.verificationEnabled != null) && (
        <Section title={isGerman ? 'Engine-Rahmen' : 'Engine frame'} icon={Info}>
          <div className="flex flex-wrap gap-2 text-xs">
            {s.configSnapshot.mode && <span className="rounded-full border border-border/30 bg-background/60 px-2 py-1">{isGerman ? 'Modus' : 'Mode'}: {s.configSnapshot.mode}</span>}
            {s.configSnapshot.currentShiftOnly != null && (
              <AssignmentMetricBadge
                label={formatAssignmentMetricLabel('current-shift-only', s.configSnapshot.currentShiftOnly, glossaryLanguage)}
                glossaryKey="current-shift-only"
                language={glossaryLanguage}
                className="rounded-full border border-border/30 bg-background/60 px-2 py-1"
                tooltipWidth="w-80"
              />
            )}
            {s.configSnapshot.planningWindowHours != null && (
              <AssignmentMetricBadge
                label={formatAssignmentMetricLabel('planning-window', s.configSnapshot.planningWindowHours, glossaryLanguage)}
                glossaryKey="planning-window"
                language={glossaryLanguage}
                className="rounded-full border border-border/30 bg-background/60 px-2 py-1"
                tooltipWidth="w-80"
              />
            )}
            {s.configSnapshot.enableRotationTieBreaker != null && (
              <AssignmentMetricBadge
                label={formatAssignmentMetricLabel('rotation-tie-breaker', s.configSnapshot.enableRotationTieBreaker, glossaryLanguage)}
                glossaryKey="rotation-tie-breaker"
                language={glossaryLanguage}
                className="rounded-full border border-border/30 bg-background/60 px-2 py-1"
                tooltipWidth="w-80"
              />
            )}
            {s.configSnapshot.fallbackTieBreaker && (
              <AssignmentMetricBadge
                label={formatAssignmentMetricLabel('tie-breaker', s.configSnapshot.fallbackTieBreaker, glossaryLanguage)}
                glossaryKey="tie-breaker"
                language={glossaryLanguage}
                className="rounded-full border border-border/30 bg-background/60 px-2 py-1"
                tooltipWidth="w-80"
              />
            )}
            {s.configSnapshot.verificationEnabled != null && (
              <AssignmentMetricBadge
                label={formatAssignmentMetricLabel('verification', s.configSnapshot.verificationEnabled, glossaryLanguage)}
                glossaryKey="verification"
                language={glossaryLanguage}
                className="rounded-full border border-border/30 bg-background/60 px-2 py-1"
                tooltipWidth="w-80"
              />
            )}
          </div>
        </Section>
      )}

      {glossaryKeys.length > 0 && (
        <Section title={isGerman ? 'Begriffserklärung' : 'Metric guide'} icon={Info}>
          <AssignmentGlossaryPanel keys={glossaryKeys} language={glossaryLanguage} />
        </Section>
      )}

      {s.decisionTrace.length > 0 && (
        <Section title={isGerman ? 'Entscheidungsweg' : 'Decision trace'} icon={ListOrdered}>
          <ol className="space-y-2">
            {s.decisionTrace.map((step) => (
              <li key={step.key} className="rounded-md border border-border/20 bg-background/40 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground/90">{step.label}</span>
                  <span className="uppercase tracking-wider text-[10px] text-muted-foreground">{step.status}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{step.reason}</div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Normalization Warnings */}
      {s.normalizationWarnings.length > 0 && (
        <Section title={isGerman ? 'Normalisierungs-Warnungen' : 'Normalization warnings'} icon={AlertTriangle}>
          <ul className="space-y-0.5">
            {s.normalizationWarnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-400 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Initial Candidates */}
      <Section title={`${isGerman ? 'Initiale Kandidaten' : 'Initial candidates'} (${s.initialCandidates.length})`} icon={Users}>
        {s.initialCandidates.length === 0 ? (
          <div className="text-xs text-muted-foreground">{isGerman ? 'Keine Kandidaten geladen.' : 'No candidates loaded.'}</div>
        ) : (
          <ul className="space-y-0.5">
            {s.initialCandidates.map((c: CandidateRef) => (
              <li key={c.id} className="text-xs text-foreground/80">
                {c.name}
                <AssignmentMetricBadge
                  label={formatAssignmentMetricLabel('worker-id', c.id, glossaryLanguage)}
                  glossaryKey="worker-id"
                  language={glossaryLanguage}
                  className="ml-2 text-muted-foreground"
                  tooltipWidth="w-80"
                />
                {(c.shiftCode || c.weekplanRole || c.role) && (
                  <span className="text-muted-foreground"> • {[c.shiftCode, c.weekplanRole || c.role].filter(Boolean).join(' | ')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Excluded Candidates */}
      {s.excludedCandidateGroups.length > 0 && (
        <Section title={`${isGerman ? 'Ausgeschlossen' : 'Excluded'} (${s.excludedCandidateGroups.length})`} icon={XCircle}>
          <ul className="space-y-1">
            {s.excludedCandidateGroups.map((e: ExcludedCandidateGroup, i: number) => (
              <li key={i} className="text-xs flex items-start gap-1.5">
                <XCircle className="w-3 h-3 mt-0.5 shrink-0 text-red-400" />
                <div>
                  <span className="font-medium text-foreground/80">{e.name || '–'}</span>
                  <AssignmentMetricBadge
                    label={formatAssignmentMetricLabel('worker-id', e.id, glossaryLanguage)}
                    glossaryKey="worker-id"
                    language={glossaryLanguage}
                    className="ml-2 text-muted-foreground"
                    tooltipWidth="w-80"
                  />
                  <span className="text-muted-foreground"> — {e.reasons.join('; ')}</span>
                  {(e.shiftCode || e.weekplanRole || e.role) && (
                    <span className="text-muted-foreground"> • {[e.shiftCode, e.weekplanRole || e.role].filter(Boolean).join(' | ')}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Remaining Candidates */}
      <Section title={`${isGerman ? 'Verbleibende Kandidaten' : 'Remaining candidates'} (${s.remainingCandidates.length})`} icon={UserCheck}>
        {s.remainingCandidates.length === 0 ? (
          <div className="text-xs text-muted-foreground">{isGerman ? 'Keine Kandidaten übrig.' : 'No candidates left.'}</div>
        ) : (
          <ul className="space-y-0.5">
            {s.remainingCandidates.map((c: CandidateRef) => (
              <li key={c.id} className="text-xs text-green-400/80">
                ✓ {c.name}
                <AssignmentMetricBadge
                  label={formatAssignmentMetricLabel('worker-id', c.id, glossaryLanguage)}
                  glossaryKey="worker-id"
                  language={glossaryLanguage}
                  className="ml-2 text-muted-foreground"
                  tooltipWidth="w-80"
                />
                {(c.shiftCode || c.weekplanRole || c.role) && (
                  <span className="text-muted-foreground"> • {[c.shiftCode, c.weekplanRole || c.role].filter(Boolean).join(' | ')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {s.candidateRanking.length > 0 && (
        <Section title={isGerman ? 'Kandidatenranking' : 'Candidate ranking'} icon={UserCheck}>
          <div className="space-y-2">
            {s.candidateRanking.map((candidate: CandidateRankingEntry) => (
              <div key={`${candidate.employeeId ?? 'candidate'}-${candidate.finalRank ?? 'x'}`} className={`rounded-md border px-3 py-2 text-xs ${candidate.selected ? 'border-green-500/30 bg-green-500/5' : candidate.selectionBlocked ? 'border-red-500/20 bg-red-500/5' : 'border-border/20 bg-background/40'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-foreground/90">
                    {candidate.employeeName || '–'}
                    {candidate.finalRank != null && <span className="ml-2 text-muted-foreground">#{candidate.finalRank}</span>}
                  </div>
                  {candidate.selected && <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-300">{isGerman ? 'Gewählt' : 'Selected'}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  {candidate.employeeId != null && (
                    <AssignmentMetricBadge
                      label={formatAssignmentMetricLabel('worker-id', candidate.employeeId, glossaryLanguage)}
                      glossaryKey="worker-id"
                      language={glossaryLanguage}
                      className="rounded-full border border-border/30 bg-background/60 px-2 py-0.5"
                      tooltipWidth="w-80"
                    />
                  )}
                  {candidate.shiftCode && <span>{candidate.shiftCode}</span>}
                  {(candidate.weekplanRole || candidate.role) && <span>{candidate.weekplanRole || candidate.role}</span>}
                  {candidate.workload != null && (
                    <AssignmentMetricBadge
                      label={formatAssignmentMetricLabel('workload', candidate.workload, glossaryLanguage)}
                      glossaryKey="workload"
                      language={glossaryLanguage}
                      className="rounded-full border border-border/30 bg-background/60 px-2 py-0.5"
                      tooltipWidth="w-80"
                    />
                  )}
                  {candidate.groupingScore != null && (
                    <AssignmentMetricBadge
                      label={formatAssignmentMetricLabel('grouping-score', candidate.groupingScore, glossaryLanguage)}
                      glossaryKey="grouping-score"
                      language={glossaryLanguage}
                      className="rounded-full border border-border/30 bg-background/60 px-2 py-0.5"
                      tooltipWidth="w-80"
                    />
                  )}
                  {candidate.queuePure != null && (
                    <AssignmentMetricBadge
                      label={formatAssignmentMetricLabel('queue-purity', candidate.queuePure, glossaryLanguage)}
                      glossaryKey="queue-purity"
                      language={glossaryLanguage}
                      className="rounded-full border border-border/30 bg-background/60 px-2 py-0.5"
                      tooltipWidth="w-80"
                    />
                  )}
                  {(candidate.colleagueScore || 0) > 0 && (
                    <AssignmentMetricBadge
                      label={formatAssignmentMetricLabel('colleague-proximity', candidate.colleagueScore, glossaryLanguage)}
                      glossaryKey="colleague-proximity"
                      language={glossaryLanguage}
                      className="rounded-full border border-border/30 bg-background/60 px-2 py-0.5"
                      tooltipWidth="w-80"
                    />
                  )}
                </div>
                {(candidate.rankingFactors || []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {candidate.rankingFactors.map((factor) => (
                      <AssignmentMetricBadge
                        key={factor}
                        label={formatAssignmentRankingFactorText(factor, glossaryLanguage)}
                        glossaryKey={resolveAssignmentTraceGlossaryKey(factor)}
                        language={glossaryLanguage}
                        className="rounded-full border border-border/30 bg-background/60 px-2 py-0.5 text-[10px] text-foreground/80"
                        tooltipWidth="w-80"
                      />
                    ))}
                  </div>
                )}
                {candidate.selectionBlocked && candidate.blockingReason && (
                  <div className="mt-2 text-[10px] text-red-300">{candidate.blockingReason}</div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Selection */}
      {s.result === 'assigned' && (
        <Section title={isGerman ? 'Auswahl' : 'Selection'} icon={CheckCircle}>
          <div className="text-xs space-y-1">
            <div>
              <span className="text-muted-foreground">{isGerman ? 'Ausgewählt' : 'Selected'}: </span>
              <span className="font-semibold text-green-400">{s.assignedWorkerName}</span>
            </div>
            {(s.assignedWorkerId != null || s.finalDecision?.tieBreaker) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {s.assignedWorkerId != null && (
                  <AssignmentMetricBadge
                    label={formatAssignmentMetricLabel('worker-id', s.assignedWorkerId, glossaryLanguage)}
                    glossaryKey="worker-id"
                    language={glossaryLanguage}
                    className="rounded-full border border-border/30 bg-background/60 px-2 py-1"
                    tooltipWidth="w-80"
                  />
                )}
                {s.finalDecision?.tieBreaker ? (
                  <AssignmentMetricBadge
                    label={formatAssignmentMetricLabel('tie-breaker', s.finalDecision.tieBreaker, glossaryLanguage)}
                    glossaryKey="tie-breaker"
                    language={glossaryLanguage}
                    className="rounded-full border border-border/30 bg-background/60 px-2 py-1"
                    tooltipWidth="w-80"
                  />
                ) : null}
              </div>
            )}
            <div>
              <span className="text-muted-foreground">{isGerman ? 'Begründung' : 'Reason'}: </span>
              <span className="text-foreground/80">{s.selectionReason || '–'}</span>
            </div>
          </div>
        </Section>
      )}

      {/* Rule Path */}
      {s.rulePath.length > 0 && (
        <Section title={isGerman ? 'Regelreihenfolge' : 'Rule order'} icon={ListOrdered}>
          <ol className="space-y-0.5 list-decimal list-inside">
            {s.rulePath.map((rule: string, i: number) => (
              <li key={i} className="text-xs text-foreground/70">{rule}</li>
            ))}
          </ol>
        </Section>
      )}

      {/* Error Message */}
      {s.errorMessage && (
        <Section title={isGerman ? 'Fehler' : 'Error'} icon={XCircle}>
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
            {s.errorMessage}
          </div>
        </Section>
      )}

      {s.normalizedTicket && (
        <Section title={isGerman ? 'Normalisierte Ticketdaten' : 'Normalized ticket data'} icon={Info}>
          <pre className="text-[11px] leading-5 whitespace-pre-wrap break-all text-foreground/75">{JSON.stringify(s.normalizedTicket, null, 2)}</pre>
        </Section>
      )}

      {s.rawTicket && (
        <Section title={isGerman ? 'Rohes Ticket' : 'Raw ticket'} icon={Info}>
          <pre className="text-[11px] leading-5 whitespace-pre-wrap break-all text-foreground/75">{JSON.stringify(s.rawTicket, null, 2)}</pre>
        </Section>
      )}
    </div>
  );
}

/* ---- Reusable Section Component ---- */

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Info; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/30 bg-background/40">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground/80">{title}</span>
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}
