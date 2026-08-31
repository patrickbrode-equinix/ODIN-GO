import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BrainCircuit, ChevronRight, ExternalLink, RefreshCw, ShieldAlert, Users } from 'lucide-react';

import { fetchDashboardCriticalWorkload } from '../../api/criticalWorkload';
import { getLanguageLocale, useLanguage, type LanguageCode } from '../../context/LanguageContext';
import type { CriticalWorkloadSnapshot, CriticalWorkloadTicket } from '../../types/criticalWorkload';
import {
  formatBucket,
  formatCriticalDateTime,
  formatLogicStatus,
  formatRemainingTimeMinutes,
  getCriticalityTone,
  getOdinStatusTone,
  getStepTone,
} from './criticalWorkload.shared';

const PANEL_COPY: Partial<Record<LanguageCode, {
  title: string;
  subtitle: string;
  refresh: string;
  loading: string;
  error: string;
  noTickets: string;
  stale: string;
  total: string;
  blocked: string;
  awaiting: string;
  expedites: string;
  lastCrawlerUpdate: string;
  currentShift: string;
  ticketList: string;
  openOdin: string;
  odinWorkspaceHint: string;
  selectedTicket: string;
  selectedEngineer: string;
  remaining: string;
  scheduled: string;
  nextAction: string;
  decisionFlow: string;
  candidateLens: string;
  excluded: string;
  traceMissing: string;
  currentOwner: string;
  ticketMode: string;
  logicMode: string;
  logicFocus: string;
  selectForLogic: string;
  ticketColumn: string;
  systemColumn: string;
  statusColumn: string;
  ownerColumn: string;
  windowColumn: string;
  expediteColumn: string;
  remainingColumn: string;
  odinColumn: string;
  yes: string;
  no: string;
  selected: string;
  eligible: string;
  observed: string;
}>> = {
  de: {
    title: 'Critical Workload',
    subtitle: 'ODIN-Entscheidungen für Trouble Tickets, Expedites und 72h-Risiken',
    refresh: 'Aktualisieren',
    loading: 'Critical-Workload-Daten werden geladen…',
    error: 'Critical-Workload-Daten konnten nicht geladen werden.',
    noTickets: 'Aktuell liegen keine kritischen Tickets im ODIN-Fokus.',
    stale: 'Crawler-Daten sind veraltet. Entscheidungen werden weiter angezeigt, sollten aber vor manuellen Eingriffen verifiziert werden.',
    total: 'Kritische Tickets',
    blocked: 'Blockiert',
    awaiting: 'Offen / ungeklärt',
    expedites: 'Expedites',
    lastCrawlerUpdate: 'Crawler',
    currentShift: 'Aktive Schicht',
    ticketList: 'Ticketliste',
    openOdin: 'ODIN-Logik öffnen',
    odinWorkspaceHint: 'Dry-Run, Shadow-Run, Run-Historie und vollständige Prüfpfade bleiben im ODIN-Reiter.',
    selectedTicket: 'Ausgewähltes Ticket',
    selectedEngineer: 'Ausgewählter Engineer',
    remaining: 'Restzeit',
    scheduled: 'Terminfenster',
    nextAction: 'Nächste Aktion',
    decisionFlow: 'Entscheidungsfluss',
    candidateLens: 'Kandidatenblick',
    excluded: 'Ausschlüsse',
    traceMissing: 'Für dieses Ticket liegt noch keine vollständige ODIN-Trace vor.',
    currentOwner: 'Aktueller Owner',
    ticketMode: 'Ticketliste',
    logicMode: 'ODIN-Logik',
    logicFocus: 'ODIN-Fokus',
    selectForLogic: 'Zeile wählen und dann oben auf ODIN-Logik wechseln.',
    ticketColumn: 'Ticket',
    systemColumn: 'System / Typ',
    statusColumn: 'Status',
    ownerColumn: 'Owner',
    windowColumn: 'Commit / Start',
    expediteColumn: 'Expedite',
    remainingColumn: 'Restzeit',
    odinColumn: 'ODIN',
    yes: 'Ja',
    no: 'Nein',
    selected: 'Ausgewählt',
    eligible: 'Geeignet',
    observed: 'Beobachtet',
  },
  en: {
    title: 'Critical Workload',
    subtitle: 'ODIN decisions for trouble tickets, expedites, and 72h risk windows',
    refresh: 'Refresh',
    loading: 'Loading critical workload data…',
    error: 'Critical workload data could not be loaded.',
    noTickets: 'There are currently no critical tickets in ODIN focus.',
    stale: 'Crawler data is stale. Decisions remain visible but should be verified before manual action.',
    total: 'Critical tickets',
    blocked: 'Blocked',
    awaiting: 'Open / unresolved',
    expedites: 'Expedites',
    lastCrawlerUpdate: 'Crawler',
    currentShift: 'Current shift',
    ticketList: 'Ticket list',
    openOdin: 'Open ODIN logic',
    odinWorkspaceHint: 'Dry runs, shadow runs, run history, and the full validation path remain in the ODIN tab.',
    selectedTicket: 'Selected ticket',
    selectedEngineer: 'Selected engineer',
    remaining: 'Remaining time',
    scheduled: 'Scheduled window',
    nextAction: 'Next action',
    decisionFlow: 'Decision flow',
    candidateLens: 'Candidate lens',
    excluded: 'Exclusions',
    traceMissing: 'No complete ODIN trace is available for this ticket yet.',
    currentOwner: 'Current owner',
    ticketMode: 'Ticket list',
    logicMode: 'ODIN logic',
    logicFocus: 'ODIN focus',
    selectForLogic: 'Pick a row first, then switch to ODIN logic above.',
    ticketColumn: 'Ticket',
    systemColumn: 'System / type',
    statusColumn: 'Status',
    ownerColumn: 'Owner',
    windowColumn: 'Commit / start',
    expediteColumn: 'Expedite',
    remainingColumn: 'Remaining',
    odinColumn: 'ODIN',
    yes: 'Yes',
    no: 'No',
    selected: 'Selected',
    eligible: 'Eligible',
    observed: 'Observed',
  },
};

function formatRiskWindowSubtitle(language: LanguageCode, criticalWindowHours: number) {
  return language === 'de'
    ? `ODIN-Entscheidungen für Trouble Tickets, Expedites und ${criticalWindowHours}h-Risiken`
    : `ODIN decisions for trouble tickets, expedites, and ${criticalWindowHours}h risk windows`;
}

function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${accent}`}>
      <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</div>
    </div>
  );
}

function formatWindowLabel(value: string | null | undefined, locale: string) {
  if (!value) return '—';
  if (!value.includes(' - ')) {
    return formatCriticalDateTime(value, locale);
  }

  const parts = value
    .split(' - ')
    .map((part) => formatCriticalDateTime(part, locale))
    .filter((part) => part !== '—');

  return parts.length > 0 ? parts.join(' → ') : '—';
}

function getTicketWindowLabel(ticket: CriticalWorkloadTicket, locale: string) {
  if (ticket.scheduledWindow) return formatWindowLabel(ticket.scheduledWindow, locale);
  if (ticket.revisedCommitDate) return formatCriticalDateTime(ticket.revisedCommitDate, locale);
  return '—';
}

function TicketTableRow({
  ticket,
  selected,
  locale,
  language,
  copy,
  onSelect,
}: {
  ticket: CriticalWorkloadTicket;
  selected: boolean;
  locale: string;
  language: LanguageCode;
  copy: NonNullable<(typeof PANEL_COPY)[LanguageCode]>;
  onSelect: () => void;
}) {
  const windowLabel = getTicketWindowLabel(ticket, locale);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full grid-cols-[1.35fr_1.45fr_0.85fr_0.9fr_1.15fr_100px_110px_110px] gap-3 px-4 py-3 text-left transition ${selected ? 'bg-cyan-400/10 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]' : 'hover:bg-accent/40'}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${getCriticalityTone(ticket.criticalityLevel, ticket.isTroubleTicket)}`}>{formatBucket(ticket.priorityBucket, language)}</span>
          {ticket.isTroubleTicket ? <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-red-200">TT</span> : null}
          {ticket.isExpedite ? <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100">Expedite</span> : null}
        </div>
        <div className="mt-2 truncate text-sm font-semibold text-foreground">{ticket.ticketNumber || ticket.activityId || ticket.ticketId}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{ticket.assignmentReasonSummary || ticket.criticalityReason || '—'}</div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">{ticket.systemName || '—'}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{ticket.ticketType}</div>
      </div>

      <div className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{ticket.status || '—'}</div>
      <div className="truncate text-xs text-muted-foreground">{ticket.owner || '—'}</div>
      <div className="text-xs font-mono text-muted-foreground">{windowLabel}</div>
      <div className="text-center text-xs font-semibold text-foreground">{ticket.isExpedite ? copy.yes : copy.no}</div>
      <div className="text-right text-xs font-mono font-semibold text-foreground">{formatRemainingTimeMinutes(ticket.remainingTimeMinutes, language)}</div>
      <div className="flex justify-end">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${getOdinStatusTone(ticket.odinStatus)}`}>{ticket.odinStatus}</span>
      </div>
    </button>
  );
}

function TicketTableMode({
  tickets,
  selectedTicket,
  locale,
  language,
  copy,
  criticalWindowHours,
  onSelect,
}: {
  tickets: CriticalWorkloadTicket[];
  selectedTicket: CriticalWorkloadTicket | null;
  locale: string;
  language: LanguageCode;
  copy: NonNullable<(typeof PANEL_COPY)[LanguageCode]>;
  criticalWindowHours: number;
  onSelect: (ticketId: string) => void;
}) {
  return (
    <div className="h-full overflow-auto rounded-2xl border border-border/50 bg-background/55">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-foreground">{copy.ticketList} · {criticalWindowHours}h</div>
        <div className="text-xs text-muted-foreground">{copy.selectForLogic}</div>
      </div>

      <div className="min-w-280">
        <div className="sticky top-0 z-10 grid grid-cols-[1.35fr_1.45fr_0.85fr_0.9fr_1.15fr_100px_110px_110px] gap-3 border-b border-border/50 bg-background/92 px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
          <div>{copy.ticketColumn}</div>
          <div>{copy.systemColumn}</div>
          <div>{copy.statusColumn}</div>
          <div>{copy.ownerColumn}</div>
          <div>{copy.windowColumn}</div>
          <div className="text-center">{copy.expediteColumn}</div>
          <div className="text-right">{copy.remainingColumn}</div>
          <div className="text-right">{copy.odinColumn}</div>
        </div>

        <div className="divide-y divide-border/40">
          {tickets.map((ticket) => (
            <TicketTableRow
              key={ticket.ticketId}
              ticket={ticket}
              selected={selectedTicket?.ticketId === ticket.ticketId}
              locale={locale}
              language={language}
              copy={copy}
              onSelect={() => onSelect(ticket.ticketId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TicketListRow({
  ticket,
  selected,
  locale,
  language,
  copy,
  onSelect,
}: {
  ticket: CriticalWorkloadTicket;
  selected: boolean;
  locale: string;
  language: LanguageCode;
  copy: NonNullable<(typeof PANEL_COPY)[LanguageCode]>;
  onSelect: () => void;
}) {
  const windowLabel = getTicketWindowLabel(ticket, locale);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-cyan-400/30 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.12)]' : 'border-border/50 bg-background/55 hover:bg-accent/40'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${getCriticalityTone(ticket.criticalityLevel, ticket.isTroubleTicket)}`}>{formatBucket(ticket.priorityBucket, language)}</span>
            {ticket.isTroubleTicket ? <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-red-200">TT</span> : null}
            {ticket.isExpedite ? <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-100">{copy.expediteColumn}</span> : null}
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${getOdinStatusTone(ticket.odinStatus)}`}>{ticket.odinStatus}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-sm font-semibold text-foreground">{ticket.ticketNumber || ticket.activityId || ticket.ticketId}</span>
            <span className="text-sm text-muted-foreground">{ticket.systemName || ticket.ticketType}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>{copy.currentOwner}: {ticket.owner || '—'}</span>
            <span>{copy.remaining}: {formatRemainingTimeMinutes(ticket.remainingTimeMinutes, language)}</span>
            <span>{copy.scheduled}: {windowLabel}</span>
          </div>
          <div className="mt-2 truncate text-sm text-muted-foreground">{ticket.assignmentReasonSummary || ticket.criticalityReason || ticket.nextAction || '—'}</div>
        </div>
        <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition ${selected ? 'translate-x-0.5 text-cyan-500 dark:text-cyan-200' : ''}`} />
      </div>
    </button>
  );
}

function LogicFocusPanel({
  ticket,
  copy,
}: {
  ticket: CriticalWorkloadTicket;
  copy: NonNullable<(typeof PANEL_COPY)[LanguageCode]>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
        <div className="mb-4 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-200/80">
          <BrainCircuit className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
          {copy.decisionFlow}
        </div>
        <div className="space-y-3">
          {ticket.decisionSteps.length === 0 ? (
            <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3 text-sm text-muted-foreground">{copy.traceMissing}</div>
          ) : (
            ticket.decisionSteps.map((step, index) => (
              <div key={`${ticket.ticketId}-${step.step}-${index}`} className="grid grid-cols-[auto_1fr] gap-3">
                <div className={`mt-1 h-3 w-3 rounded-full border ${getStepTone(step.status)}`} />
                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">{step.title}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{step.status}</div>
                  </div>
                  {step.message ? <div className="mt-1 text-sm text-muted-foreground">{step.message}</div> : null}
                  {(step.beforeCount != null || step.afterCount != null) ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {step.beforeCount != null ? `in ${step.beforeCount}` : 'in —'}
                      {' → '}
                      {step.afterCount != null ? `out ${step.afterCount}` : 'out —'}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-foreground">
            <Users className="h-4 w-4 text-slate-500 dark:text-slate-200" />
            {copy.candidateLens}
          </div>
          <div className="space-y-2">
            {ticket.candidateEvaluations.slice(0, 4).map((candidate) => (
              <div key={`${ticket.ticketId}-${candidate.employeeId || candidate.name}`} className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-foreground">{candidate.name || '—'}</div>
                  <div className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${candidate.selected ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-700 dark:text-emerald-100' : candidate.eligible ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-700 dark:text-cyan-100' : 'border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-200'}`}>
                    {candidate.selected ? copy.selected : candidate.eligible ? copy.eligible : copy.observed}
                  </div>
                </div>
                {candidate.reasons.length > 0 ? <div className="mt-2 text-xs text-muted-foreground">{candidate.reasons.slice(0, 2).join(' • ')}</div> : null}
              </div>
            ))}
            {ticket.candidateEvaluations.length === 0 ? <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3 text-sm text-muted-foreground">{copy.traceMissing}</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-red-200/80">
            <ShieldAlert className="h-4 w-4 text-red-300" />
            {copy.excluded}
          </div>
          <div className="space-y-2">
            {ticket.excludedCandidates.slice(0, 4).map((candidate) => (
              <div key={`${ticket.ticketId}-${candidate.employeeId || candidate.name}`} className="rounded-xl border border-red-500/15 bg-red-500/4 px-3 py-3">
                <div className="text-sm font-semibold text-red-50">{candidate.name || '—'}</div>
                <div className="mt-1 text-xs text-red-200/80">{candidate.reasonLabel}</div>
              </div>
            ))}
            {ticket.excludedCandidates.length === 0 ? <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3 text-sm text-muted-foreground">0</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CriticalWorkloadDashboardPanel({ panelId }: { panelId?: string }) {
  const { language } = useLanguage();
  const locale = getLanguageLocale(language);
  const copy = PANEL_COPY[language] || PANEL_COPY.en!;

  const [snapshot, setSnapshot] = useState<CriticalWorkloadSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'tickets' | 'logic'>('tickets');

  useEffect(() => {
    let alive = true;

    const load = async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        const data = await fetchDashboardCriticalWorkload();
        if (!alive) return;
        setSnapshot(data);
        setError(null);
      } catch {
        if (!alive) return;
        setError(copy.error);
      } finally {
        if (!alive) return;
        setLoading(false);
        setRefreshing(false);
      }
    };

    load();
    const intervalId = window.setInterval(() => { void load(true); }, 60_000);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [copy.error]);

  useEffect(() => {
    if (!snapshot?.tickets.length) {
      setSelectedTicketId(null);
      return;
    }
    setSelectedTicketId((current) => current && snapshot.tickets.some((ticket) => ticket.ticketId === current)
      ? current
      : snapshot.tickets[0].ticketId);
  }, [snapshot]);

  const tickets = snapshot?.tickets || [];
  const stale = snapshot?.crawler.isStale === true;
  const selectedTicket = tickets.find((ticket) => ticket.ticketId === selectedTicketId) || tickets[0] || null;
  const criticalWindowHours = snapshot?.criticalWindowHours || 72;

  return (
    <div id={panelId} className="theme-glass-panel stat-card flex flex-col rounded-2xl border border-border/50 bg-background/80" style={{ maxHeight: '42vh', animationDelay: '120ms' }}>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-t-2xl border-b border-border/50 px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-200/80">
            <BrainCircuit className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
            {copy.title}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">{formatRiskWindowSubtitle(language, criticalWindowHours)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{copy.odinWorkspaceHint}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${snapshot ? getOdinStatusTone(snapshot.logicStatus === 'LIVE' ? 'ASSIGNED' : snapshot.logicStatus === 'ERROR' ? 'BLOCKED' : snapshot.logicStatus === 'OFFLINE' ? 'EXCLUDED' : 'ANALYZING') : 'border-slate-500/30 bg-slate-500/10 text-slate-200'}`}>
            ODIN {snapshot ? formatLogicStatus(snapshot.logicStatus, language) : '—'}
          </span>
          <span className="rounded-full border border-border/50 bg-background/45 px-3 py-1 text-[11px] font-semibold text-muted-foreground">
            {copy.lastCrawlerUpdate}: <span className="text-foreground">{snapshot?.crawler.lastUpdate ? formatCriticalDateTime(snapshot.crawler.lastUpdate, locale) : '—'}</span>
          </span>
          <span className="rounded-full border border-border/50 bg-background/45 px-3 py-1 text-[11px] font-semibold text-muted-foreground">
            {copy.currentShift}: <span className="text-foreground">{snapshot?.shift.current?.code || snapshot?.shift.next?.code || '—'}</span>
          </span>
          <Link
            to="/odin-logic"
            className="inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700 transition hover:bg-indigo-400/15 dark:text-indigo-100"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {copy.openOdin}
          </Link>
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void fetchDashboardCriticalWorkload()
                .then((data) => {
                  setSnapshot(data);
                  setError(null);
                })
                .catch(() => setError(copy.error))
                .finally(() => setRefreshing(false));
            }}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700 transition hover:bg-cyan-400/15 dark:text-cyan-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {copy.refresh}
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-border/40 px-5 py-4 md:grid-cols-4">
        <SummaryCard label={copy.total} value={snapshot?.summary.totalCritical || 0} accent="border-cyan-400/20 bg-cyan-400/8" />
        <SummaryCard label={copy.blocked} value={snapshot?.summary.blocked || 0} accent="border-red-500/20 bg-red-500/8" />
        <SummaryCard label={copy.awaiting} value={snapshot?.summary.unassignedCritical || 0} accent="border-amber-400/20 bg-amber-400/8" />
        <SummaryCard label={copy.expedites} value={snapshot?.summary.expedites || 0} accent="border-indigo-400/20 bg-indigo-400/8" />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-5 py-3">
        <div className="rounded-full border border-border/50 bg-background/55 p-1">
          {(['tickets', 'logic'] as const).map((mode) => {
            const active = viewMode === mode;
            const label = mode === 'tickets' ? `${copy.ticketMode} · ${criticalWindowHours}h` : copy.logicMode;

            return (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] transition ${active ? 'bg-cyan-400/15 text-cyan-700 shadow-[0_0_18px_rgba(34,211,238,0.14)] dark:text-cyan-100' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {stale ? (
        <div className="mx-5 mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            <span>{copy.stale}</span>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
        {loading && !snapshot ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{copy.loading}</div> : null}
        {!loading && error && !snapshot ? <div className="flex h-full items-center justify-center text-sm text-red-200">{error}</div> : null}
        {!loading && !error && tickets.length === 0 ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{copy.noTickets}</div> : null}
        {tickets.length > 0 ? (
          viewMode === 'tickets' ? (
            <TicketTableMode
              tickets={tickets}
              selectedTicket={selectedTicket}
              locale={locale}
              language={language}
              copy={copy}
              criticalWindowHours={criticalWindowHours}
              onSelect={setSelectedTicketId}
            />
          ) : (
            <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="min-h-0 rounded-2xl border border-border/50 bg-background/55">
                <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-foreground">{copy.ticketList} · {criticalWindowHours}h</div>
                  <div className="text-xs font-semibold text-muted-foreground">{tickets.length}</div>
                </div>
                <div className="min-h-0 space-y-2 overflow-auto p-3">
                  {tickets.map((ticket) => (
                    <TicketListRow
                      key={ticket.ticketId}
                      ticket={ticket}
                      selected={selectedTicket?.ticketId === ticket.ticketId}
                      locale={locale}
                      language={language}
                      copy={copy}
                      onSelect={() => setSelectedTicketId(ticket.ticketId)}
                    />
                  ))}
                </div>
              </div>

              <div className="min-h-0 overflow-auto rounded-2xl border border-border/50 bg-background/60 p-4">
                {selectedTicket ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-200/80">{copy.logicFocus}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${getCriticalityTone(selectedTicket.criticalityLevel, selectedTicket.isTroubleTicket)}`}>{formatBucket(selectedTicket.priorityBucket, language)}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${getOdinStatusTone(selectedTicket.odinStatus)}`}>{selectedTicket.odinStatus}</span>
                      </div>
                      <div className="mt-3 text-lg font-black text-foreground">{selectedTicket.ticketNumber || selectedTicket.activityId || selectedTicket.ticketId}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{selectedTicket.systemName || selectedTicket.ticketType}</div>
                      <div className="mt-2 text-sm text-muted-foreground">{selectedTicket.assignmentReasonSummary || selectedTicket.criticalityReason || selectedTicket.nextAction || '—'}</div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <SummaryCard label={copy.selectedEngineer} value={selectedTicket.selectedEngineer?.name || '—'} accent="border-emerald-400/20 bg-emerald-400/8" />
                      <SummaryCard label={copy.remaining} value={formatRemainingTimeMinutes(selectedTicket.remainingTimeMinutes, language)} accent="border-cyan-400/20 bg-cyan-400/8" />
                      <SummaryCard label={copy.scheduled} value={getTicketWindowLabel(selectedTicket, locale)} accent="border-indigo-400/20 bg-indigo-400/8" />
                      <SummaryCard label={copy.nextAction} value={selectedTicket.nextAction || '—'} accent="border-amber-400/20 bg-amber-400/8" />
                    </div>

                    <LogicFocusPanel ticket={selectedTicket} copy={copy} />
                  </div>
                ) : null}
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}