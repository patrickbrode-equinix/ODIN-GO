import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, BrainCircuit, Clock3, ShieldAlert, Sparkles, Target, UserRoundCheck, Users, Zap } from 'lucide-react';

import { fetchTvCriticalWorkload } from '../../api/criticalWorkload';
import { getLanguageLocale, useLanguage, type LanguageCode } from '../../context/LanguageContext';
import type { CriticalWorkloadAssignmentVisualization, CriticalWorkloadSnapshot, CriticalWorkloadTicket } from '../../types/criticalWorkload';
import {
  formatBucket,
  formatCriticalDateTime,
  formatLogicStatus,
  formatRemainingTimeMinutes,
  getCriticalityTone,
  getOdinStatusTone,
  getStepTone,
} from './criticalWorkload.shared';
import { TVCriticalAssignmentArena, TVCriticalAssignmentArenaBoundary } from './TVCriticalAssignmentArena';

const DEFAULT_ASSIGNMENT_VISUALIZATION: CriticalWorkloadAssignmentVisualization = {
  mode: 'enterprise',
  animationSpeed: 'normal',
  celebrationIntensity: 'medium',
  autoFallbackToEnterprise: true,
  confettiEnabled: true,
  applauseEnabled: true,
  displayReasoningAfterAnimation: true,
};

const TV_COPY: Partial<Record<LanguageCode, {
  title: string;
  subtitle: string;
  loading: string;
  error: string;
  noTickets: string;
  queue: string;
  selectedEngineer: string;
  nextAction: string;
  decisionPath: string;
  candidateView: string;
  exclusions: string;
  criticalTickets: string;
  blocked: string;
  expedites: string;
  unresolved: string;
  crawlerStale: string;
  currentShift: string;
  nextShift: string;
  lastRun: string;
  noTrace: string;
}>> = {
  de: {
    title: 'Critical Workload Command Center',
    subtitle: 'ODIN priorisiert Trouble Tickets, Expedites und kurzfristige Risiken in einem gemeinsamen Lagebild.',
    loading: 'Critical-Workload-Daten werden geladen…',
    error: 'Critical-Workload-Daten sind derzeit nicht verfügbar.',
    noTickets: 'Derzeit liegt kein kritisches Ticket im Fokus.',
    queue: 'Kritische Warteschlange',
    selectedEngineer: 'Ausgewählter Engineer',
    nextAction: 'Nächste Aktion',
    decisionPath: 'Entscheidungspfad',
    candidateView: 'Kandidaten',
    exclusions: 'Ausschlüsse',
    criticalTickets: 'Kritische Tickets',
    blocked: 'Blockiert',
    expedites: 'Expedites',
    unresolved: 'Offen',
    crawlerStale: 'Crawler-Daten sind veraltet',
    currentShift: 'Aktive Schicht',
    nextShift: 'Nächste Schicht',
    lastRun: 'Letzter Lauf',
    noTrace: 'Noch keine vollständige ODIN-Trace verfügbar.',
  },
  en: {
    title: 'Critical Workload Command Center',
    subtitle: 'ODIN prioritizes trouble tickets, expedites, and near-term workload risks in one operational view.',
    loading: 'Loading critical workload data…',
    error: 'Critical workload data is currently unavailable.',
    noTickets: 'There are currently no critical tickets in focus.',
    queue: 'Critical queue',
    selectedEngineer: 'Selected engineer',
    nextAction: 'Next action',
    decisionPath: 'Decision path',
    candidateView: 'Candidates',
    exclusions: 'Exclusions',
    criticalTickets: 'Critical tickets',
    blocked: 'Blocked',
    expedites: 'Expedites',
    unresolved: 'Open',
    crawlerStale: 'Crawler data is stale',
    currentShift: 'Current shift',
    nextShift: 'Next shift',
    lastRun: 'Latest run',
    noTrace: 'No complete ODIN trace is available yet.',
  },
};

function formatTvSubtitle(language: LanguageCode, criticalWindowHours: number) {
  return language === 'de'
    ? `ODIN priorisiert Trouble Tickets, Expedites und ${criticalWindowHours}h-Risiken in einem gemeinsamen Lagebild.`
    : `ODIN prioritizes trouble tickets, expedites, and ${criticalWindowHours}h workload risks in one operational view.`;
}

function MetaTile({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className={`rounded-3xl border px-4 py-4 ${accent}`}>
      <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-white/60">{label}</div>
      <div className="mt-3 text-3xl font-black tracking-tight text-white">{value}</div>
    </div>
  );
}

function QueueCard({
  ticket,
  selected,
  language,
  locale,
  onSelect,
}: {
  ticket: CriticalWorkloadTicket;
  selected: boolean;
  language: LanguageCode;
  locale: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-3xl border p-4 text-left transition ${selected ? 'border-cyan-300/45 bg-cyan-400/10 shadow-[0_0_30px_rgba(34,211,238,0.22)]' : 'border-white/8 bg-slate-950/45 hover:bg-white/3'}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getCriticalityTone(ticket.criticalityLevel, ticket.isTroubleTicket)}`}>{formatBucket(ticket.priorityBucket, language)}</span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getOdinStatusTone(ticket.odinStatus)}`}>{ticket.odinStatus}</span>
            {ticket.isExpedite ? <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">Expedite</span> : null}
            {ticket.isTroubleTicket ? <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-red-100">TT</span> : null}
          </div>
          <div className="mt-3 text-2xl font-black tracking-tight text-white">{ticket.ticketNumber || ticket.activityId || ticket.ticketId}</div>
          <div className="mt-1 text-base font-medium text-slate-300">{ticket.systemName || ticket.ticketType}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-cyan-100">{formatRemainingTimeMinutes(ticket.remainingTimeMinutes, language)}</div>
          <div className="mt-2 text-xs text-slate-500">{ticket.revisedCommitDate ? formatCriticalDateTime(ticket.revisedCommitDate, locale) : '—'}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
        <span>{ticket.assignmentReasonSummary || ticket.criticalityReason || '—'}</span>
        <span>{ticket.selectedEngineer?.name || '—'}</span>
      </div>
    </button>
  );
}

function EnterpriseAssignmentPane({
  activeTicket,
  copy,
  language,
  locale,
}: {
  activeTicket: CriticalWorkloadTicket;
  copy: NonNullable<typeof TV_COPY[LanguageCode]>;
  language: LanguageCode;
  locale: string;
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-4xl border border-white/8 bg-slate-950/55 p-5 shadow-[0_20px_80px_rgba(2,6,23,0.5)] backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getCriticalityTone(activeTicket.criticalityLevel, activeTicket.isTroubleTicket)}`}>{formatBucket(activeTicket.priorityBucket, language)}</span>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getOdinStatusTone(activeTicket.odinStatus)}`}>{activeTicket.odinStatus}</span>
          </div>
          <div className="mt-4 text-3xl font-black tracking-tight text-white">{activeTicket.ticketNumber || activeTicket.activityId || activeTicket.ticketId}</div>
          <div className="mt-2 text-base text-slate-300">{activeTicket.systemName || activeTicket.ticketType}</div>
        </div>
        <div className="min-w-56 rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.07] px-4 py-4 text-right">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-cyan-200/70">{copy.selectedEngineer}</div>
          <div className="mt-3 text-2xl font-black text-cyan-50">{activeTicket.selectedEngineer?.name || '—'}</div>
          <div className="mt-2 text-sm text-cyan-100/70">{activeTicket.assignmentReasonSummary || activeTicket.prioritySource || '—'}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MetaTile label={copy.nextAction} value={activeTicket.nextAction || '—'} accent="border-amber-400/20 bg-amber-400/8" />
        <MetaTile label="Commit" value={activeTicket.revisedCommitDate ? formatCriticalDateTime(activeTicket.revisedCommitDate, locale) : '—'} accent="border-indigo-400/20 bg-indigo-400/8" />
        <MetaTile label="Rest" value={formatRemainingTimeMinutes(activeTicket.remainingTimeMinutes, language)} accent="border-cyan-400/20 bg-cyan-400/8" />
      </div>

      <div className="mt-5 grid min-h-0 flex-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="min-h-0 overflow-auto rounded-3xl border border-white/8 bg-white/2 p-4">
          <div className="mb-4 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-cyan-200/80">
            <BrainCircuit className="h-4 w-4 text-cyan-300" />
            {copy.decisionPath}
          </div>
          <div className="space-y-3">
            {activeTicket.decisionSteps.length === 0 ? <div className="rounded-2xl border border-white/8 px-4 py-4 text-sm text-slate-400">{copy.noTrace}</div> : null}
            {activeTicket.decisionSteps.map((step, index) => (
              <div key={`${activeTicket.ticketId}-${step.step}-${index}`} className="grid grid-cols-[auto_1fr] gap-3">
                <div className={`mt-1.5 h-3.5 w-3.5 rounded-full border ${getStepTone(step.status)}`} />
                <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-semibold text-slate-100">{step.title}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{step.status}</div>
                  </div>
                  {step.message ? <div className="mt-1.5 text-sm text-slate-300">{step.message}</div> : null}
                  {(step.beforeCount != null || step.afterCount != null) ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <span>{step.beforeCount != null ? step.beforeCount : '—'}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{step.afterCount != null ? step.afterCount : '—'}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-auto">
          <div className="rounded-3xl border border-white/8 bg-white/2 p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-slate-200/70">
              <Users className="h-4 w-4 text-cyan-200" />
              {copy.candidateView}
            </div>
            <div className="space-y-2">
              {activeTicket.candidateEvaluations.slice(0, 4).map((candidate) => (
                <div key={`${activeTicket.ticketId}-${candidate.employeeId || candidate.name}`} className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-100">{candidate.name || '—'}</div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${candidate.selected ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-100' : candidate.eligible ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100' : 'border-slate-500/30 bg-slate-500/10 text-slate-200'}`}>{candidate.selected ? 'Selected' : candidate.eligible ? 'Eligible' : 'Observed'}</span>
                  </div>
                  {candidate.reasons.length > 0 ? <div className="mt-2 text-xs text-slate-400">{candidate.reasons.slice(0, 2).join(' • ')}</div> : null}
                </div>
              ))}
              {activeTicket.candidateEvaluations.length === 0 ? <div className="rounded-2xl border border-white/8 px-4 py-4 text-sm text-slate-400">{copy.noTrace}</div> : null}
            </div>
          </div>

          <div className="rounded-3xl border border-red-500/12 bg-red-500/4 p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-red-100/80">
              <ShieldAlert className="h-4 w-4 text-red-300" />
              {copy.exclusions}
            </div>
            <div className="space-y-2">
              {activeTicket.excludedCandidates.slice(0, 4).map((candidate) => (
                <div key={`${activeTicket.ticketId}-${candidate.employeeId || candidate.name}`} className="rounded-2xl border border-red-500/15 bg-red-500/5 px-4 py-3">
                  <div className="text-sm font-semibold text-red-50">{candidate.name || '—'}</div>
                  <div className="mt-1 text-xs text-red-100/75">{candidate.reasonLabel}</div>
                </div>
              ))}
              {activeTicket.excludedCandidates.length === 0 ? <div className="rounded-2xl border border-white/8 px-4 py-4 text-sm text-slate-400">0</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TVCriticalWorkloadSlide() {
  const { language } = useLanguage();
  const locale = getLanguageLocale(language);
  const copy = TV_COPY[language] || TV_COPY.en!;

  const [snapshot, setSnapshot] = useState<CriticalWorkloadSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const data = await fetchTvCriticalWorkload();
        if (!alive) return;
        setSnapshot(data);
        setError(null);
      } catch {
        if (!alive) return;
        setError(copy.error);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    load();
    const intervalId = window.setInterval(() => { void load(); }, 30_000);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [copy.error]);

  useEffect(() => {
    setFocusIndex(0);
  }, [snapshot?.tickets.length]);

  useEffect(() => {
    if (!snapshot?.tickets.length || snapshot.tickets.length < 2) return undefined;
    const intervalId = window.setInterval(() => {
      setFocusIndex((current) => (current + 1) % snapshot.tickets.length);
    }, 6500);
    return () => window.clearInterval(intervalId);
  }, [snapshot?.tickets]);

  const tickets = snapshot?.tickets || [];
  const activeTicket = tickets[Math.min(focusIndex, Math.max(tickets.length - 1, 0))] || null;
  const criticalWindowHours = snapshot?.criticalWindowHours || 72;
  const assignmentVisualization = snapshot?.assignmentVisualization || DEFAULT_ASSIGNMENT_VISUALIZATION;

  const metaBadges = useMemo(() => ({
    currentShift: snapshot?.shift.current?.code || '—',
    nextShift: snapshot?.shift.next?.code || '—',
    lastRun: snapshot?.latestRun ? `${snapshot.latestRun.mode} · ${snapshot.latestRun.status}` : '—',
  }), [snapshot]);

  const canRenderGamifiedArena = useMemo(() => {
    if (!activeTicket) return false;
    if (assignmentVisualization.mode === 'enterprise') return false;
    if (!activeTicket.selectedEngineer?.name) return false;
    return activeTicket.candidateEvaluations.some((candidate) => Boolean(candidate.name && (candidate.eligible || candidate.selected)));
  }, [activeTicket, assignmentVisualization.mode]);

  return (
    <div className="h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(239,68,68,0.18),transparent_28%),linear-gradient(180deg,#020817,#061122_48%,#020611)] p-6 text-slate-100">
      {loading && !snapshot ? <div className="flex h-full items-center justify-center text-xl text-slate-300">{copy.loading}</div> : null}
      {!loading && error && !snapshot ? <div className="flex h-full items-center justify-center text-xl text-red-200">{error}</div> : null}
      {!loading && snapshot ? (
        <div className="grid h-full grid-rows-[auto_1fr] gap-5">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-4xl border border-cyan-400/20 bg-slate-950/55 p-6 shadow-[0_20px_80px_rgba(2,6,23,0.45)] backdrop-blur-md">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-cyan-200/75">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    {copy.title}
                  </div>
                  <div className="mt-3 max-w-3xl text-lg leading-relaxed text-slate-300">{formatTvSubtitle(language, criticalWindowHours)}</div>
                </div>
                <span className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.2em] ${snapshot.crawler.isStale ? 'border-red-500/35 bg-red-500/12 text-red-100' : 'border-cyan-400/25 bg-cyan-400/12 text-cyan-100'}`}>
                  {snapshot.crawler.isStale ? copy.crawlerStale : `ODIN ${formatLogicStatus(snapshot.logicStatus, language)}`}
                </span>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <MetaTile label={copy.currentShift} value={metaBadges.currentShift} accent="border-cyan-400/20 bg-cyan-400/8" />
                <MetaTile label={copy.nextShift} value={metaBadges.nextShift} accent="border-indigo-400/20 bg-indigo-400/8" />
                <MetaTile label={copy.lastRun} value={metaBadges.lastRun} accent="border-emerald-400/20 bg-emerald-400/8" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <MetaTile label={copy.criticalTickets} value={snapshot.summary.totalCritical} accent="border-cyan-400/20 bg-cyan-400/8" />
              <MetaTile label={copy.blocked} value={snapshot.summary.blocked} accent="border-red-500/20 bg-red-500/8" />
              <MetaTile label={copy.expedites} value={snapshot.summary.expedites} accent="border-amber-400/20 bg-amber-400/8" />
              <MetaTile label={copy.unresolved} value={snapshot.summary.unassignedCritical} accent="border-fuchsia-400/20 bg-fuchsia-400/8" />
            </div>
          </div>

          <div className="grid min-h-0 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="flex min-h-0 flex-col rounded-4xl border border-white/8 bg-slate-950/50 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-slate-200/70">
                  <Target className="h-4 w-4 text-cyan-300" />
                  {copy.queue}
                </div>
                <div className="text-sm text-slate-400">{snapshot.generatedAt ? formatCriticalDateTime(snapshot.generatedAt, locale) : '—'}</div>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-5">
                {tickets.length === 0 ? <div className="flex h-full items-center justify-center text-lg text-slate-400">{copy.noTickets}</div> : null}
                {tickets.map((ticket, index) => (
                  <QueueCard
                    key={ticket.ticketId}
                    ticket={ticket}
                    selected={index === focusIndex}
                    language={language}
                    locale={locale}
                    onSelect={() => setFocusIndex(index)}
                  />
                ))}
              </div>
            </div>

            {activeTicket ? (
              canRenderGamifiedArena ? (
                <TVCriticalAssignmentArenaBoundary
                  resetKey={`${activeTicket.ticketId}-${assignmentVisualization.mode}-${focusIndex}`}
                  fallback={<EnterpriseAssignmentPane activeTicket={activeTicket} copy={copy} language={language} locale={locale} />}
                >
                  <TVCriticalAssignmentArena
                    ticket={activeTicket}
                    settings={assignmentVisualization}
                    locale={locale}
                    language={language}
                    summaryLabel={activeTicket.assignmentReasonSummary || activeTicket.prioritySource || 'ODIN rule lock'}
                  />
                </TVCriticalAssignmentArenaBoundary>
              ) : (
                <EnterpriseAssignmentPane activeTicket={activeTicket} copy={copy} language={language} locale={locale} />
              )
            ) : (
              <div className="flex min-h-0 flex-col rounded-4xl border border-white/8 bg-slate-950/55 p-5 shadow-[0_20px_80px_rgba(2,6,23,0.5)] backdrop-blur-md">
                <div className="flex h-full items-center justify-center text-lg text-slate-400">{copy.noTickets}</div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}