import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  Brain,
  CheckCircle2,
  Clock3,
  Filter,
  GanttChartSquare,
  Layers3,
  Loader2,
  ScanSearch,
  Search,
  ShieldCheck,
  Target,
  UserCheck,
  UserX,
  Users,
  Workflow,
  XCircle,
} from 'lucide-react';
import { AssignmentApi } from '../../api/assignment';
import { useLanguage } from '../../context/LanguageContext';
import { EnterpriseCard, EnterpriseKpiCard } from '../layout/EnterpriseLayout';
import { AssignmentGlossaryPanel, AssignmentMetricBadge } from '../assignment/AssignmentTraceGlossary';
import { InfoTooltip } from '../ui/InfoTooltip';
import type {
  AssignmentDecision,
  AssignmentRun,
  AssignmentStructuredTrace,
  CandidateRankingEntry,
  CandidateRef,
  ExcludedCandidate,
  TicketExplanation,
  TicketSelectionTrace,
} from '../../types/assignment';
import {
  formatAssignmentRemainingHours,
  getAssignmentDisplayTicketNumber,
  getAssignmentInternalTicketId,
  getAssignmentQueueOrigin,
  getAssignmentRemainingHours,
  getAssignmentSystemName,
  getAssignmentTicketCategory,
} from '../../utils/assignmentTicketDisplay';
import {
  collectAssignmentTraceGlossaryKeys,
  formatAssignmentMetricLabel,
  formatAssignmentPrioritizationFactor,
  formatAssignmentRankingFactorText,
  resolveAssignmentTraceGlossaryKey,
} from '../../utils/assignmentTraceGlossary';

type GroupedExcludedCandidate = CandidateRef & {
  reasons: string[];
  rules: string[];
};

const RESULT_META = {
  assigned: {
    labelDe: 'Zugewiesen',
    labelEn: 'Assigned',
    icon: CheckCircle2,
    chipClass: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    surfaceClass: 'border-emerald-400/20 bg-emerald-500/5',
  },
  manual_review: {
    labelDe: 'Manuelle Prüfung',
    labelEn: 'Manual review',
    icon: AlertTriangle,
    chipClass: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
    surfaceClass: 'border-amber-400/20 bg-amber-500/5',
  },
  no_candidate: {
    labelDe: 'Kein Kandidat',
    labelEn: 'No candidate',
    icon: UserX,
    chipClass: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
    surfaceClass: 'border-rose-400/20 bg-rose-500/5',
  },
  not_relevant: {
    labelDe: 'Ausgeschlossen',
    labelEn: 'Excluded',
    icon: Ban,
    chipClass: 'border-slate-400/30 bg-slate-500/10 text-slate-200',
    surfaceClass: 'border-slate-400/20 bg-slate-500/5',
  },
  blocked: {
    labelDe: 'Gesperrt',
    labelEn: 'Blocked',
    icon: ShieldCheck,
    chipClass: 'border-red-400/30 bg-red-500/10 text-red-100',
    surfaceClass: 'border-red-400/20 bg-red-500/5',
  },
  error: {
    labelDe: 'Fehler',
    labelEn: 'Error',
    icon: XCircle,
    chipClass: 'border-red-400/30 bg-red-500/10 text-red-100',
    surfaceClass: 'border-red-400/20 bg-red-500/5',
  },
  crawler_stale: {
    labelDe: 'Crawler stale',
    labelEn: 'Crawler stale',
    icon: Clock3,
    chipClass: 'border-orange-400/30 bg-orange-500/10 text-orange-100',
    surfaceClass: 'border-orange-400/20 bg-orange-500/5',
  },
} as const;

const CONTROL_COPY = {
  de: {
    title: 'Assignment Control Center',
    subtitle: 'Vollständige, auditierbare Transparenz über Ticketfilter, Priorisierung, Kandidatenfunnel und finale Auswahl.',
    runLabel: 'Run',
    resultLabel: 'Ergebnis',
    searchLabel: 'Suche',
    searchPlaceholder: 'Ticket, System, Mitarbeiter, Grund ...',
    allResults: 'Alle Ergebnisse',
    totalTickets: 'Tickets gesamt',
    eligibleTickets: 'Im Assignment-Pfad',
    filteredTickets: 'Früh ausgeschlossen',
    assignedTickets: 'Zugewiesen',
    unassignedTickets: 'Nicht zugewiesen',
    availableEmployees: 'Verfügbare Mitarbeiter',
    excludedEmployees: 'Ausgeschlossene Mitarbeiter',
    runStarted: 'Run gestartet',
    triggeredBy: 'Ausgelöst von',
    mode: 'Modus',
    status: 'Status',
    currentShiftPolicy: 'Schichtregel',
    currentShiftOnly: 'Nur aktuelle Schicht',
    planningWindow: 'Planungsfenster',
    hours: 'Std.',
    ticketUniverse: 'Ticket Universe / Ticket Pool',
    ticketUniverseHint: 'Alle Tickets des gewählten Runs inklusive Ausschlüssen. Jeder Eintrag zeigt Status, Kontext und Hauptbegründung.',
    prioritization: 'Ticket Prioritization Pipeline',
    prioritizationHint: 'Die deterministische Reihenfolge, in der ODIN Tickets tatsächlich verarbeitet hat, inklusive Begründung gegen die nächsten Alternativen.',
    decisionStory: 'Decision Story / Candidate Funnel',
    decisionStoryHint: 'Kompletter Entscheidungsweg für das ausgewählte Ticket: Kontext, Ausschlüsse, Ranking und finale Entscheidung.',
    finalBoard: 'Final Assignment Board',
    finalBoardHint: 'Endstand des Runs: erfolgreich zugewiesen, unassigned/manual review und früh gefilterte Tickets.',
    noRun: 'Kein Run verfügbar.',
    noDecisions: 'Für diesen Run wurden keine Entscheidungen gefunden.',
    noSelection: 'Wählen Sie links ein Ticket aus, um die vollständige Entscheidung zu sehen.',
    loadError: 'Die Decisions konnten nicht geladen werden.',
    loading: 'Lade Assignment-Transparenz ...',
    loadingTicket: 'Lade Ticket-Erklärung ...',
    executiveSummary: 'Executive Summary',
    ticketContext: 'Ticketkontext',
    filterVerdict: 'Filter- und Eligibility-Urteil',
    policyFrame: 'Engine-Rahmen',
    metricGuide: 'Begriffs- und Metrik-Guide',
    metricGuideHint: 'Erklärt die wichtigsten Bewertungsbegriffe, damit Ranking und Priorisierung fachlich lesbar bleiben.',
    candidateFunnel: 'Candidate Funnel',
    ranking: 'Ranking / Decision Scoring',
    timeline: 'Decision Timeline',
    initialCandidates: 'Initiale Kandidaten',
    excludedCandidates: 'Ausgeschlossen',
    survivingCandidates: 'Verbleibend',
    selectedWorker: 'Final gewählt',
    noWorkerSelected: 'Kein finaler Mitarbeiter',
    primaryReason: 'Hauptgrund',
    selectionReason: 'Auswahlgrund',
    noAssignmentReason: 'No-Assignment-Grund',
    system: 'System',
    queue: 'Queue',
    category: 'Kategorie',
    activity: 'Aktivität',
    owner: 'Aktueller Owner',
    remainingTime: 'Restzeit',
    dueAt: 'Commit / Due',
    scheduledStart: 'Sched. Start',
    tieBreaker: 'Tie-Breaker',
    verification: 'Verifikation',
    candidateLoad: 'Offene Last',
    candidateFactors: 'Rankingfaktoren',
    selected: 'Gewählt',
    blockedInRanking: 'Im Ranking blockiert',
    rank: 'Rank',
    comparedAgainst: 'Verglichen gegen',
    onlyTicket: 'Einzig verbleibendes Ticket im priorisierten Pool',
    assignedColumn: 'Assigned',
    unassignedColumn: 'Nicht zugewiesen',
    filteredColumn: 'Vorab ausgeschlossen',
    showAll: 'Alle',
    noItems: 'Keine Einträge',
    excludedReason: 'Ausschlussgrund',
    fallbackTrace: 'Historische Entscheidung ohne erweiterten Trace. Die Ansicht zeigt die bestmögliche Rekonstruktion.',
    stageFiltered: 'Excluded',
    stagePipeline: 'Pipeline',
    stageAssigned: 'Assigned',
  },
  en: {
    title: 'Assignment Control Center',
    subtitle: 'Full audit-ready transparency across ticket filtering, prioritization, candidate funnel, and final worker selection.',
    runLabel: 'Run',
    resultLabel: 'Result',
    searchLabel: 'Search',
    searchPlaceholder: 'Ticket, system, employee, reason ...',
    allResults: 'All results',
    totalTickets: 'Total tickets',
    eligibleTickets: 'In assignment pipeline',
    filteredTickets: 'Filtered early',
    assignedTickets: 'Assigned',
    unassignedTickets: 'Unassigned',
    availableEmployees: 'Available employees',
    excludedEmployees: 'Excluded employees',
    runStarted: 'Run started',
    triggeredBy: 'Triggered by',
    mode: 'Mode',
    status: 'Status',
    currentShiftPolicy: 'Shift policy',
    currentShiftOnly: 'Current shift only',
    planningWindow: 'Planning window',
    hours: 'hrs',
    ticketUniverse: 'Ticket Universe / Ticket Pool',
    ticketUniverseHint: 'All tickets from the selected run, including filtered tickets. Every row shows status, context, and the primary reason.',
    prioritization: 'Ticket Prioritization Pipeline',
    prioritizationHint: 'The deterministic order in which ODIN processed tickets, including the justification against the next alternatives.',
    decisionStory: 'Decision Story / Candidate Funnel',
    decisionStoryHint: 'Complete decision walkthrough for the selected ticket: context, exclusions, ranking, and the final choice.',
    finalBoard: 'Final Assignment Board',
    finalBoardHint: 'Run end-state: successful assignments, unassigned/manual review, and early filtered tickets.',
    noRun: 'No run available.',
    noDecisions: 'No decisions were found for this run.',
    noSelection: 'Select a ticket on the left to inspect the full decision.',
    loadError: 'The decisions could not be loaded.',
    loading: 'Loading assignment transparency ...',
    loadingTicket: 'Loading ticket explanation ...',
    executiveSummary: 'Executive Summary',
    ticketContext: 'Ticket context',
    filterVerdict: 'Filter and eligibility verdict',
    policyFrame: 'Engine frame',
    metricGuide: 'Metric guide',
    metricGuideHint: 'Explains the key scoring terms so ranking and prioritization stay readable for operations.',
    candidateFunnel: 'Candidate Funnel',
    ranking: 'Ranking / Decision Scoring',
    timeline: 'Decision Timeline',
    initialCandidates: 'Initial candidates',
    excludedCandidates: 'Excluded',
    survivingCandidates: 'Surviving',
    selectedWorker: 'Final winner',
    noWorkerSelected: 'No final worker',
    primaryReason: 'Primary reason',
    selectionReason: 'Selection reason',
    noAssignmentReason: 'No-assignment reason',
    system: 'System',
    queue: 'Queue',
    category: 'Category',
    activity: 'Activity',
    owner: 'Current owner',
    remainingTime: 'Remaining time',
    dueAt: 'Commit / due',
    scheduledStart: 'Scheduled start',
    tieBreaker: 'Tie breaker',
    verification: 'Verification',
    candidateLoad: 'Open load',
    candidateFactors: 'Ranking factors',
    selected: 'Selected',
    blockedInRanking: 'Blocked in ranking',
    rank: 'Rank',
    comparedAgainst: 'Compared against',
    onlyTicket: 'Only remaining ticket in the prioritized pool',
    assignedColumn: 'Assigned',
    unassignedColumn: 'Unassigned',
    filteredColumn: 'Filtered early',
    showAll: 'All',
    noItems: 'No entries',
    excludedReason: 'Exclusion reason',
    fallbackTrace: 'Historical decision without the extended trace. The view shows the best possible reconstruction.',
    stageFiltered: 'Excluded',
    stagePipeline: 'Pipeline',
    stageAssigned: 'Assigned',
  },
} as const;

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSummaryNumber(run: AssignmentRun | null, key: string): number | null {
  if (!run?.summary || typeof run.summary !== 'object') return null;
  return toNumber((run.summary as Record<string, unknown>)[key]);
}

function getDecisionTrace(decision: AssignmentDecision | null | undefined): AssignmentStructuredTrace | null {
  return decision?.decision_trace || null;
}

function getDecisionPriorityRank(decision: AssignmentDecision): number {
  return getDecisionTrace(decision)?.ticketSelection?.prioritizationRank ?? Number.MAX_SAFE_INTEGER;
}

function sortDecisionsForAudit(decisions: AssignmentDecision[]): AssignmentDecision[] {
  return [...decisions].sort((left, right) => {
    const leftRank = getDecisionPriorityRank(left);
    const rightRank = getDecisionPriorityRank(right);

    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftTime = new Date(left.decided_at).getTime();
    const rightTime = new Date(right.decided_at).getTime();
    if (leftTime !== rightTime) return leftTime - rightTime;

    return left.id - right.id;
  });
}

function groupExcludedCandidates(excludedCandidates: ExcludedCandidate[] | null | undefined): GroupedExcludedCandidate[] {
  const grouped = new Map<string, GroupedExcludedCandidate>();

  for (const candidate of excludedCandidates || []) {
    const key = `${candidate.id}:${candidate.name}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: candidate.id,
        name: candidate.name,
        role: candidate.role || null,
        weekplanRole: candidate.weekplanRole || null,
        shiftCode: candidate.shiftCode || null,
        shiftPlanningDate: candidate.shiftPlanningDate || null,
        shiftStart: candidate.shiftStart || null,
        shiftEnd: candidate.shiftEnd || null,
        shiftActive: candidate.shiftActive,
        planningSource: candidate.planningSource || null,
        userMapped: candidate.userMapped,
        plannedEmployeeName: candidate.plannedEmployeeName || null,
        reasons: [],
        rules: [],
      });
    }

    const entry = grouped.get(key)!;
    if (candidate.reason && !entry.reasons.includes(candidate.reason)) {
      entry.reasons.push(candidate.reason);
    }
    if (candidate.rule && !entry.rules.includes(candidate.rule)) {
      entry.rules.push(candidate.rule);
    }
  }

  return Array.from(grouped.values());
}

function matchesSearch(decision: AssignmentDecision, query: string): boolean {
  if (!query) return true;

  const haystack = [
    getAssignmentDisplayTicketNumber(decision),
    getAssignmentInternalTicketId(decision),
    getAssignmentSystemName(decision),
    getAssignmentQueueOrigin(decision),
    getAssignmentTicketCategory(decision),
    decision.ticket_type,
    decision.ticket_priority,
    decision.assigned_worker_name,
    decision.short_reason,
    decision.selection_reason,
    getDecisionTrace(decision)?.ticketSelection?.selectedNextReason,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return haystack.some((value) => value.includes(query));
}

function getTicketField(decision: AssignmentDecision | null | undefined, ...keys: string[]): string | null {
  if (!decision) return null;

  const normalized = decision.normalized_ticket || null;
  const raw = decision.raw_ticket || null;
  for (const key of keys) {
    if (normalized && key in normalized && normalized[key] != null) {
      const value = String(normalized[key]).trim();
      if (value) return value;
    }
    if (raw && key in raw && raw[key] != null) {
      const value = String(raw[key]).trim();
      if (value) return value;
    }
  }

  return null;
}

function getDecisionContext(decision: AssignmentDecision | null | undefined) {
  return {
    systemName: getAssignmentSystemName(decision || {}),
    queue: getAssignmentQueueOrigin(decision || {}),
    category: getAssignmentTicketCategory(decision || {}),
    activity: getTicketField(decision, 'activity', 'customerTroubleType', 'customer_trouble_type', 'subtype'),
    owner: getTicketField(decision, 'owner', 'Owner', 'current_owner'),
    remainingTime: formatAssignmentRemainingHours(getAssignmentRemainingHours(decision || {})),
    dueAt: getTicketField(decision, 'dueAt', 'due_at', 'commit_date', 'Commit Date'),
    scheduledStart: getTicketField(decision, 'scheduledStart', 'sched_start', 'Sched. Start'),
  };
}

function getResultMeta(result: string, isGerman: boolean) {
  const meta = RESULT_META[result as keyof typeof RESULT_META] || RESULT_META.error;
  return {
    ...meta,
    label: isGerman ? meta.labelDe : meta.labelEn,
  };
}

function buildCandidateSummary(decision: AssignmentDecision | null | undefined) {
  const trace = getDecisionTrace(decision);
  if (trace?.candidateSummary) return trace.candidateSummary;

  const initialCount = decision?.initial_candidates?.length || 0;
  const groupedExcluded = groupExcludedCandidates(decision?.excluded_candidates || []);
  const survivingCount = decision?.remaining_candidates?.length || 0;

  return {
    initialCandidateCount: initialCount,
    excludedCandidateCount: groupedExcluded.length,
    exclusionEventCount: decision?.excluded_candidates?.length || 0,
    survivingCandidateCount: survivingCount,
    selectedCandidateCount: decision?.result === 'assigned' ? 1 : 0,
  };
}

function buildSelectedDetail(decision: AssignmentDecision | null, explanation: TicketExplanation | null) {
  if (!decision) {
    return {
      structured: null,
      trace: null,
      initialCandidates: [] as CandidateRef[],
      excludedCandidateGroups: [] as GroupedExcludedCandidate[],
      remainingCandidates: [] as CandidateRef[],
      candidateRanking: [] as CandidateRankingEntry[],
      ticketSelection: null as TicketSelectionTrace | null,
      candidateSummary: null,
      context: null,
      finalDecision: null,
      configSnapshot: null,
      timeline: [] as AssignmentStructuredTrace['timeline'],
    };
  }

  const structured = explanation?.explanation?.structured || null;
  const trace = structured?.traceModel || getDecisionTrace(decision);
  const initialCandidates = structured?.initialCandidates || decision.initial_candidates || [];
  const excludedCandidateGroups = structured?.excludedCandidateGroups || groupExcludedCandidates(decision.excluded_candidates || []);
  const remainingCandidates = structured?.remainingCandidates || decision.remaining_candidates || [];
  const candidateRanking = structured?.candidateRanking || trace?.candidateRanking || [];
  const ticketSelection = structured?.ticketSelection || trace?.ticketSelection || null;
  const candidateSummary = structured?.candidateSummary || trace?.candidateSummary || buildCandidateSummary(decision);
  const context = structured?.ticketContext || getDecisionContext(decision);
  const finalDecision = structured?.finalDecision || trace?.finalDecision || null;
  const configSnapshot = structured?.configSnapshot || trace?.configSnapshot || null;
  const timeline = structured?.decisionTrace || trace?.timeline || [];

  return {
    structured,
    trace,
    initialCandidates,
    excludedCandidateGroups,
    remainingCandidates,
    candidateRanking,
    ticketSelection,
    candidateSummary,
    context,
    finalDecision,
    configSnapshot,
    timeline,
  };
}

function StageBadge({ decision, isGerman, copy }: { decision: AssignmentDecision; isGerman: boolean; copy: Record<string, string> }) {
  const label = decision.result === 'assigned'
    ? copy.stageAssigned
    : decision.result === 'not_relevant' || decision.result === 'blocked'
      ? copy.stageFiltered
      : copy.stagePipeline;

  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
      {label}
    </span>
  );
}

function ResultChip({ result, isGerman }: { result: string; isGerman: boolean }) {
  const meta = getResultMeta(result, isGerman);
  const Icon = meta.icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.chipClass}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function DetailLabelValue({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-2xl border border-border/25 bg-background/35 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value || '–'}</div>
    </div>
  );
}

function SectionFrame({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string;
  hint?: string;
  icon: typeof Activity;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border/30 bg-background/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-2">
            <Icon className="h-4 w-4 text-blue-300" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

interface Props {
  runs: AssignmentRun[];
}

export default function AssignmentControlCenter({ runs }: Props) {
  const { language } = useLanguage();
  const isGerman = language === 'de';
  const glossaryLanguage = isGerman ? 'de' : 'en';
  const copy = CONTROL_COPY[isGerman ? 'de' : 'en'] as typeof CONTROL_COPY['en'];

  const [selectedRunId, setSelectedRunId] = useState<number | null>(runs[0]?.id ?? null);
  const [decisions, setDecisions] = useState<AssignmentDecision[]>([]);
  const [selectedDecisionId, setSelectedDecisionId] = useState<number | null>(null);
  const [selectedExplanation, setSelectedExplanation] = useState<TicketExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(null);
      return;
    }

    if (selectedRunId == null || !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) {
      setDecisions([]);
      setSelectedDecisionId(null);
      setSelectedExplanation(null);
      return;
    }

    let active = true;

    async function loadRunDecisions() {
      setLoading(true);
      setError(null);

      try {
        const loaded = await AssignmentApi.getDecisions({ runId: selectedRunId!, limit: 1000 });
        if (!active) return;

        const sorted = sortDecisionsForAudit(Array.isArray(loaded) ? loaded : []);
        setDecisions(sorted);
        setSelectedDecisionId((current) => {
          if (current && sorted.some((decision) => decision.id === current)) {
            return current;
          }
          return sorted[0]?.id ?? null;
        });
      } catch (loadError) {
        if (!active) return;
        setDecisions([]);
        setSelectedDecisionId(null);
        setSelectedExplanation(null);
        setError(copy.loadError);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadRunDecisions();

    return () => {
      active = false;
    };
  }, [selectedRunId]);

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;
  const selectedDecision = decisions.find((decision) => decision.id === selectedDecisionId) ?? null;

  useEffect(() => {
    if (!selectedRunId || !selectedDecision?.ticket_id) {
      setSelectedExplanation(null);
      return;
    }

    const ticketId = selectedDecision.ticket_id;
    let active = true;

    async function loadExplanation() {
      setDetailLoading(true);

      try {
        const explanation = await AssignmentApi.getTicketExplanation(ticketId, selectedRunId!);
        if (active) {
          setSelectedExplanation(explanation);
        }
      } catch {
        if (active) {
          setSelectedExplanation(null);
        }
      } finally {
        if (active) {
          setDetailLoading(false);
        }
      }
    }

    loadExplanation();

    return () => {
      active = false;
    };
  }, [selectedDecision?.ticket_id, selectedRunId]);

  const filteredDecisions = sortDecisionsForAudit(decisions).filter((decision) => {
    if (resultFilter !== 'all' && decision.result !== resultFilter) return false;
    return matchesSearch(decision, deferredSearch);
  });

  const prioritizedDecisions = sortDecisionsForAudit(decisions).filter(
    (decision) => Boolean(getDecisionTrace(decision)?.ticketSelection),
  );

  const summaryCounts = decisions.reduce<Record<string, number>>((accumulator, decision) => {
    accumulator[decision.result] = (accumulator[decision.result] || 0) + 1;
    return accumulator;
  }, {});

  const totalTickets = selectedRun?.total_tickets || decisions.length;
  const eligibleTickets = selectedRun?.relevant || decisions.filter((decision) => decision.result !== 'not_relevant').length;
  const filteredTicketCount = (summaryCounts.not_relevant || 0) + (summaryCounts.blocked || 0);
  const unassignedTicketCount = (summaryCounts.manual_review || 0) + (summaryCounts.no_candidate || 0) + (summaryCounts.error || 0);
  const availableEmployees = readSummaryNumber(selectedRun, 'loadedCandidatesInCurrentWindow')
    || readSummaryNumber(selectedRun, 'loadedEmployeesFromWeeklyPlan')
    || Array.from(new Set(decisions.flatMap((decision) => (decision.initial_candidates || []).map((candidate) => candidate.id)))).length;
  const excludedEmployees = Array.from(new Set(decisions.flatMap((decision) => (decision.excluded_candidates || []).map((candidate) => candidate.id)))).length;
  const selectedDetail = buildSelectedDetail(selectedDecision, selectedExplanation);
  const selectedTrace = selectedDetail.trace;
  const selectedGlossaryKeys = collectAssignmentTraceGlossaryKeys({
    configSnapshot: selectedDetail.configSnapshot,
    ticketSelection: selectedDetail.ticketSelection,
    finalDecision: selectedDetail.finalDecision,
    candidateRanking: selectedDetail.candidateRanking,
  });
  const resultOptions = Object.keys(RESULT_META).filter((result) => summaryCounts[result] > 0);

  if (runs.length === 0) {
    return (
      <EnterpriseCard>
        <div className="rounded-3xl border border-dashed border-border/40 bg-background/30 px-6 py-10 text-center text-sm text-muted-foreground">
          {copy.noRun}
        </div>
      </EnterpriseCard>
    );
  }

  return (
    <div className="space-y-4">
      <EnterpriseCard
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(140deg, rgba(10,15,28,0.94) 0%, rgba(17,24,39,0.92) 40%, rgba(12,74,110,0.82) 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background: 'radial-gradient(circle at 12% 16%, rgba(96,165,250,0.22), transparent 28%), radial-gradient(circle at 88% 18%, rgba(16,185,129,0.16), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 55%)',
          }}
        />
        <div className="relative space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-blue-200/80">
                <Brain className="h-3.5 w-3.5" />
                {copy.executiveSummary}
              </div>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-slate-50">{copy.title}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{copy.subtitle}</p>
              </div>
            </div>

            <div className="grid gap-2 text-xs text-slate-200 sm:grid-cols-2 lg:min-w-90">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{copy.runStarted}</div>
                <div className="mt-1 font-medium text-slate-100">{selectedRun ? new Date(selectedRun.started_at).toLocaleString(isGerman ? 'de-DE' : 'en-US') : '–'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{copy.triggeredBy}</div>
                <div className="mt-1 font-medium text-slate-100">{selectedRun?.triggered_by || 'system'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{copy.mode}</div>
                <div className="mt-1 flex items-center gap-2 font-medium text-slate-100">
                  <span>{selectedRun?.mode || 'shadow'}</span>
                  <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${selectedRun?.mode === 'live' ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : selectedRun?.mode === 'dry-run' ? 'border-sky-400/20 bg-sky-500/10 text-sky-100' : 'border-amber-400/20 bg-amber-500/10 text-amber-100'}`}>
                    {selectedRun?.mode || 'shadow'}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{copy.currentShiftPolicy}</div>
                <div className="mt-1 font-medium text-slate-100">
                  {selectedDetail.configSnapshot?.currentShiftOnly === true
                    ? copy.currentShiftOnly
                    : `${copy.planningWindow}: ${selectedDetail.configSnapshot?.planningWindowHours ?? '–'} ${copy.hours}`}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
            <EnterpriseKpiCard label={copy.totalTickets} value={totalTickets} color="#f8fafc" accent="#3b82f6" icon={Layers3} index={0} />
            <EnterpriseKpiCard label={copy.eligibleTickets} value={eligibleTickets} color="#e0f2fe" accent="#0ea5e9" icon={Workflow} index={1} />
            <EnterpriseKpiCard label={copy.filteredTickets} value={filteredTicketCount} color="#cbd5e1" accent="#64748b" icon={Filter} index={2} />
            <EnterpriseKpiCard label={copy.assignedTickets} value={summaryCounts.assigned || 0} color="#d1fae5" accent="#10b981" icon={CheckCircle2} index={3} />
            <EnterpriseKpiCard label={copy.unassignedTickets} value={unassignedTicketCount} color="#fef3c7" accent="#f59e0b" icon={AlertTriangle} index={4} />
            <EnterpriseKpiCard label={copy.availableEmployees} value={availableEmployees} color="#dbeafe" accent="#60a5fa" icon={Users} index={5} />
            <EnterpriseKpiCard label={copy.excludedEmployees} value={excludedEmployees} color="#ffe4e6" accent="#f43f5e" icon={UserX} index={6} />
          </div>
        </div>
      </EnterpriseCard>

      <EnterpriseCard noPadding>
        <div className="border-b border-border/30 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ScanSearch className="h-4 w-4 text-blue-400" />
                {copy.title}
                <InfoTooltip title={copy.title} side="right" width="w-96">
                  <p>{copy.subtitle}</p>
                </InfoTooltip>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedTrace ? copy.subtitle : copy.fallbackTrace}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:min-w-180">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{copy.runLabel}</label>
                <select
                  value={selectedRunId ?? ''}
                  onChange={(event) => setSelectedRunId(Number(event.target.value))}
                  className="w-full rounded-xl border border-border/40 bg-background/70 px-3 py-2 text-sm text-foreground"
                >
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      #{run.id} · {run.mode} · {new Date(run.started_at).toLocaleString(isGerman ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{copy.resultLabel}</label>
                <select
                  value={resultFilter}
                  onChange={(event) => setResultFilter(event.target.value)}
                  className="w-full rounded-xl border border-border/40 bg-background/70 px-3 py-2 text-sm text-foreground"
                >
                  <option value="all">{copy.allResults} ({decisions.length})</option>
                  {resultOptions.map((result) => {
                    const meta = getResultMeta(result, isGerman);
                    return (
                      <option key={result} value={result}>
                        {meta.label} ({summaryCounts[result] || 0})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{copy.searchLabel}</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={copy.searchPlaceholder}
                    className="w-full rounded-xl border border-border/40 bg-background/70 py-2 pl-10 pr-3 text-sm text-foreground"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            {copy.loading}
          </div>
        ) : error ? (
          <div className="px-6 py-8">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-200">{error}</div>
          </div>
        ) : decisions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">{copy.noDecisions}</div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
              <EnterpriseCard noPadding>
                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Layers3 className="h-4 w-4 text-blue-400" />
                        {copy.ticketUniverse}
                        <InfoTooltip title={copy.ticketUniverse} side="right" width="w-80">
                          <p>{copy.ticketUniverseHint}</p>
                        </InfoTooltip>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{filteredDecisions.length} / {decisions.length}</p>
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{copy.showAll}</div>
                  </div>

                  <div className="max-h-220 space-y-2 overflow-y-auto pr-1">
                    {filteredDecisions.map((decision) => {
                      const trace = getDecisionTrace(decision);
                      const context = getDecisionContext(decision);
                      const isSelected = decision.id === selectedDecisionId;
                      const resultMeta = getResultMeta(decision.result, isGerman);

                      return (
                        <button
                          key={decision.id}
                          onClick={() => startTransition(() => setSelectedDecisionId(decision.id))}
                          className={`w-full rounded-3xl border px-4 py-4 text-left transition ${isSelected ? 'border-blue-400/40 bg-blue-500/10 shadow-[0_18px_40px_rgba(37,99,235,0.12)]' : 'border-border/30 bg-background/35 hover:border-blue-400/20 hover:bg-background/55'} ${resultMeta.surfaceClass}`}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-foreground">{getAssignmentDisplayTicketNumber(decision)}</span>
                                {trace?.ticketSelection?.prioritizationRank ? (
                                  <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-blue-100">
                                    {copy.rank} {trace.ticketSelection.prioritizationRank}
                                  </span>
                                ) : null}
                                <StageBadge decision={decision} isGerman={isGerman} copy={copy} />
                              </div>
                              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                {context.queue ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{copy.queue}: {context.queue}</span> : null}
                                {context.systemName ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{copy.system}: {context.systemName}</span> : null}
                                {decision.ticket_priority ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">P: {decision.ticket_priority}</span> : null}
                                {context.remainingTime ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{copy.remainingTime}: {context.remainingTime}</span> : null}
                              </div>
                              <div className="text-sm leading-6 text-slate-200">{decision.short_reason || decision.selection_reason || '—'}</div>
                            </div>

                            <div className="flex flex-col items-start gap-2 md:items-end">
                              <ResultChip result={decision.result} isGerman={isGerman} />
                              {decision.assigned_worker_name ? (
                                <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100">
                                  {copy.selectedWorker}: {decision.assigned_worker_name}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </EnterpriseCard>

              <EnterpriseCard noPadding>
                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Target className="h-4 w-4 text-emerald-400" />
                        {copy.decisionStory}
                        <InfoTooltip title={copy.decisionStory} side="right" width="w-80">
                          <p>{copy.decisionStoryHint}</p>
                        </InfoTooltip>
                      </div>
                      {selectedDecision ? (
                        <p className="mt-1 text-xs text-muted-foreground">{getAssignmentDisplayTicketNumber(selectedDecision)}</p>
                      ) : null}
                    </div>
                    {detailLoading ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> : null}
                  </div>

                  {!selectedDecision ? (
                    <div className="rounded-3xl border border-dashed border-border/30 bg-background/25 px-6 py-10 text-center text-sm text-muted-foreground">
                      {copy.noSelection}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <SectionFrame title={copy.filterVerdict} hint={selectedDetail.trace ? undefined : copy.fallbackTrace} icon={Filter}>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-[20px] border border-border/25 bg-background/30 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{copy.primaryReason}</div>
                                <div className="mt-2 text-sm leading-6 text-foreground">{selectedDecision.short_reason || '—'}</div>
                              </div>
                              <ResultChip result={selectedDecision.result} isGerman={isGerman} />
                            </div>
                            <div className="mt-4 text-xs text-muted-foreground">
                              {copy.selectionReason}: {selectedDecision.selection_reason || '—'}
                            </div>
                            {(selectedDetail.finalDecision?.assignedWorkerId != null || selectedDetail.finalDecision?.tieBreaker) ? (
                              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                                {selectedDetail.finalDecision?.assignedWorkerId != null ? (
                                  <AssignmentMetricBadge
                                    label={formatAssignmentMetricLabel('worker-id', selectedDetail.finalDecision.assignedWorkerId, glossaryLanguage)}
                                    glossaryKey="worker-id"
                                    language={glossaryLanguage}
                                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                                  />
                                ) : null}
                                {selectedDetail.finalDecision?.tieBreaker ? (
                                  <AssignmentMetricBadge
                                    label={formatAssignmentMetricLabel('tie-breaker', selectedDetail.finalDecision.tieBreaker, glossaryLanguage)}
                                    glossaryKey="tie-breaker"
                                    language={glossaryLanguage}
                                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                                  />
                                ) : null}
                              </div>
                            ) : null}
                            {selectedDetail.finalDecision?.noAssignmentReason ? (
                              <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/5 px-3 py-3 text-xs text-amber-100">
                                <div className="mb-1 font-semibold uppercase tracking-[0.16em] text-amber-200/80">{copy.noAssignmentReason}</div>
                                {selectedDetail.finalDecision.noAssignmentReason}
                              </div>
                            ) : null}
                          </div>

                          <div className="rounded-[20px] border border-border/25 bg-background/30 p-4">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{copy.policyFrame}</div>
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200">{copy.mode}: {selectedDetail.configSnapshot?.mode || selectedRun?.mode || 'shadow'}</span>
                              {selectedDetail.configSnapshot?.currentShiftOnly === true ? (
                                <AssignmentMetricBadge
                                  label={formatAssignmentMetricLabel('current-shift-only', true, glossaryLanguage)}
                                  glossaryKey="current-shift-only"
                                  language={glossaryLanguage}
                                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                                />
                              ) : (
                                <AssignmentMetricBadge
                                  label={formatAssignmentMetricLabel('planning-window', selectedDetail.configSnapshot?.planningWindowHours ?? '–', glossaryLanguage)}
                                  glossaryKey="planning-window"
                                  language={glossaryLanguage}
                                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                                />
                              )}
                              {selectedDetail.configSnapshot?.fallbackTieBreaker ? (
                                <AssignmentMetricBadge
                                  label={formatAssignmentMetricLabel('tie-breaker', selectedDetail.configSnapshot.fallbackTieBreaker, glossaryLanguage)}
                                  glossaryKey="tie-breaker"
                                  language={glossaryLanguage}
                                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                                />
                              ) : null}
                              {selectedDetail.configSnapshot?.enableRotationTieBreaker != null ? (
                                <AssignmentMetricBadge
                                  label={formatAssignmentMetricLabel('rotation-tie-breaker', selectedDetail.configSnapshot.enableRotationTieBreaker, glossaryLanguage)}
                                  glossaryKey="rotation-tie-breaker"
                                  language={glossaryLanguage}
                                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                                />
                              ) : null}
                              {selectedDetail.configSnapshot?.verificationEnabled != null ? (
                                <AssignmentMetricBadge
                                  label={formatAssignmentMetricLabel('verification', selectedDetail.configSnapshot.verificationEnabled, glossaryLanguage)}
                                  glossaryKey="verification"
                                  language={glossaryLanguage}
                                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                                />
                              ) : null}
                            </div>
                            {selectedDetail.ticketSelection?.selectedNextReason ? (
                              <div className="mt-4 rounded-2xl border border-blue-400/15 bg-blue-500/5 px-3 py-3 text-xs text-blue-100">
                                <div className="mb-1 font-semibold uppercase tracking-[0.16em] text-blue-200/80">{copy.prioritization}</div>
                                {selectedDetail.ticketSelection.selectedNextReason}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </SectionFrame>

                      {selectedGlossaryKeys.length > 0 ? (
                        <SectionFrame title={copy.metricGuide} hint={copy.metricGuideHint} icon={Brain}>
                          <AssignmentGlossaryPanel keys={selectedGlossaryKeys} language={glossaryLanguage} />
                        </SectionFrame>
                      ) : null}

                      <SectionFrame title={copy.ticketContext} icon={Activity}>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <DetailLabelValue label={copy.system} value={selectedDetail.context?.systemName} />
                          <DetailLabelValue label={copy.queue} value={selectedDetail.context?.queue} />
                          <DetailLabelValue label={copy.category} value={selectedDetail.context?.category} />
                          <DetailLabelValue label={copy.activity} value={selectedDetail.context?.activity} />
                          <DetailLabelValue label={copy.owner} value={selectedDetail.context?.owner} />
                          <DetailLabelValue label={copy.remainingTime} value={selectedDetail.context?.remainingTime} />
                          <DetailLabelValue label={copy.dueAt} value={selectedDetail.context?.dueAt} />
                          <DetailLabelValue label={copy.scheduledStart} value={selectedDetail.context?.scheduledStart} />
                        </div>
                      </SectionFrame>

                      <SectionFrame title={copy.candidateFunnel} icon={Users}>
                        <div className="grid gap-3 md:grid-cols-4">
                          <DetailLabelValue label={copy.initialCandidates} value={selectedDetail.candidateSummary?.initialCandidateCount} />
                          <DetailLabelValue label={copy.excludedCandidates} value={selectedDetail.candidateSummary?.excludedCandidateCount} />
                          <DetailLabelValue label={copy.survivingCandidates} value={selectedDetail.candidateSummary?.survivingCandidateCount} />
                          <DetailLabelValue label={selectedDecision.result === 'assigned' ? copy.selectedWorker : copy.noWorkerSelected} value={selectedDecision.assigned_worker_name || '–'} />
                        </div>

                        <div className="mt-4 grid gap-3 xl:grid-cols-3">
                          <CandidateColumn title={copy.initialCandidates} icon={Users} accentClass="text-blue-200" items={selectedDetail.initialCandidates} emptyLabel={copy.noItems} language={glossaryLanguage} />
                          <ExcludedCandidateColumn title={copy.excludedCandidates} icon={UserX} accentClass="text-rose-100" items={selectedDetail.excludedCandidateGroups} emptyLabel={copy.noItems} excludedReasonLabel={copy.excludedReason} language={glossaryLanguage} />
                          <CandidateColumn title={copy.survivingCandidates} icon={UserCheck} accentClass="text-emerald-100" items={selectedDetail.remainingCandidates} emptyLabel={copy.noItems} highlightId={selectedDecision.assigned_worker_id || null} language={glossaryLanguage} />
                        </div>
                      </SectionFrame>

                      <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
                        <SectionFrame title={copy.ranking} icon={GanttChartSquare}>
                          {(selectedDetail.candidateRanking || []).length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border/30 bg-background/25 px-4 py-8 text-center text-sm text-muted-foreground">{copy.noItems}</div>
                          ) : (
                            <div className="space-y-2">
                              {selectedDetail.candidateRanking.map((candidate) => (
                                <div
                                  key={`${candidate.employeeId ?? 'candidate'}-${candidate.finalRank ?? 'x'}`}
                                  className={`rounded-2xl border px-4 py-4 ${candidate.selected ? 'border-emerald-400/30 bg-emerald-500/10' : candidate.selectionBlocked ? 'border-rose-400/20 bg-rose-500/5' : 'border-border/25 bg-background/30'}`}
                                >
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                          {candidate.finalRank != null ? `${copy.rank} ${candidate.finalRank}` : copy.blockedInRanking}
                                        </span>
                                        <span>{candidate.employeeName || '—'}</span>
                                        {candidate.selected ? <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100">{copy.selected}</span> : null}
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                        {candidate.employeeId != null ? (
                                          <AssignmentMetricBadge
                                            label={formatAssignmentMetricLabel('worker-id', candidate.employeeId, glossaryLanguage)}
                                            glossaryKey="worker-id"
                                            language={glossaryLanguage}
                                            className="rounded-full border border-white/10 bg-white/5 px-2 py-1"
                                          />
                                        ) : null}
                                        {candidate.shiftCode ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{candidate.shiftCode}</span> : null}
                                        {candidate.role || candidate.weekplanRole ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{candidate.weekplanRole || candidate.role}</span> : null}
                                        <AssignmentMetricBadge
                                          label={formatAssignmentMetricLabel('workload', candidate.workload ?? '–', glossaryLanguage)}
                                          glossaryKey="workload"
                                          language={glossaryLanguage}
                                          className="rounded-full border border-white/10 bg-white/5 px-2 py-1"
                                        />
                                        {candidate.groupingScore != null ? (
                                          <AssignmentMetricBadge
                                            label={formatAssignmentMetricLabel('grouping-score', candidate.groupingScore, glossaryLanguage)}
                                            glossaryKey="grouping-score"
                                            language={glossaryLanguage}
                                            className="rounded-full border border-white/10 bg-white/5 px-2 py-1"
                                          />
                                        ) : null}
                                        {candidate.queuePure != null ? (
                                          <AssignmentMetricBadge
                                            label={formatAssignmentMetricLabel('queue-purity', candidate.queuePure, glossaryLanguage)}
                                            glossaryKey="queue-purity"
                                            language={glossaryLanguage}
                                            className="rounded-full border border-white/10 bg-white/5 px-2 py-1"
                                          />
                                        ) : null}
                                        {(candidate.colleagueScore || 0) > 0 ? (
                                          <AssignmentMetricBadge
                                            label={formatAssignmentMetricLabel('colleague-proximity', candidate.colleagueScore, glossaryLanguage)}
                                            glossaryKey="colleague-proximity"
                                            language={glossaryLanguage}
                                            className="rounded-full border border-white/10 bg-white/5 px-2 py-1"
                                          />
                                        ) : null}
                                      </div>
                                    </div>

                                    {candidate.selectionBlocked && candidate.blockingReason ? (
                                      <div className="max-w-xs rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{candidate.blockingReason}</div>
                                    ) : null}
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {(candidate.rankingFactors || []).map((factor) => (
                                      <AssignmentMetricBadge
                                        key={factor}
                                        label={formatAssignmentRankingFactorText(factor, glossaryLanguage)}
                                        glossaryKey={resolveAssignmentTraceGlossaryKey(factor)}
                                        language={glossaryLanguage}
                                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200"
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </SectionFrame>

                        <SectionFrame title={copy.timeline} icon={Clock3}>
                          {(selectedDetail.timeline || []).length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border/30 bg-background/25 px-4 py-8 text-center text-sm text-muted-foreground">{copy.noItems}</div>
                          ) : (
                            <div className="space-y-3">
                              {selectedDetail.timeline.map((step) => (
                                <div key={`${step.stepOrder || 0}-${step.key}`} className="relative rounded-2xl border border-border/25 bg-background/30 px-4 py-4">
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-400/20 bg-blue-500/10 text-[11px] font-semibold text-blue-100">
                                      {step.stepOrder || '•'}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                        <div className="text-sm font-medium text-foreground">{step.label}</div>
                                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{step.status}</span>
                                      </div>
                                      <div className="mt-2 text-sm leading-6 text-slate-200">{step.reason}</div>
                                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                        {step.inputSummary && Object.entries(step.inputSummary).map(([key, value]) => (
                                          <span key={`input-${key}`} className="rounded-full border border-white/10 bg-white/5 px-2 py-1">in {key}: {String(value)}</span>
                                        ))}
                                        {step.outputSummary && Object.entries(step.outputSummary).map(([key, value]) => (
                                          <span key={`output-${key}`} className="rounded-full border border-white/10 bg-white/5 px-2 py-1">out {key}: {String(value)}</span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </SectionFrame>
                      </div>
                    </div>
                  )}
                </div>
              </EnterpriseCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <EnterpriseCard noPadding>
                <div className="space-y-4 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Workflow className="h-4 w-4 text-blue-400" />
                    {copy.prioritization}
                    <InfoTooltip title={copy.prioritization} side="right" width="w-80">
                      <p>{copy.prioritizationHint}</p>
                    </InfoTooltip>
                  </div>

                  <div className="max-h-130 space-y-3 overflow-y-auto pr-1">
                    {prioritizedDecisions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/30 bg-background/25 px-4 py-10 text-center text-sm text-muted-foreground">{copy.noItems}</div>
                    ) : prioritizedDecisions.map((decision) => {
                      const trace = getDecisionTrace(decision)?.ticketSelection;
                      if (!trace) return null;

                      return (
                        <button
                          key={decision.id}
                          onClick={() => startTransition(() => setSelectedDecisionId(decision.id))}
                          className={`w-full rounded-3xl border px-4 py-4 text-left transition ${decision.id === selectedDecisionId ? 'border-blue-400/40 bg-blue-500/10 shadow-[0_18px_40px_rgba(37,99,235,0.12)]' : 'border-border/30 bg-background/35 hover:border-blue-400/20 hover:bg-background/55'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-blue-100">{copy.rank} {trace.prioritizationRank || '–'}</span>
                                {getAssignmentDisplayTicketNumber(decision)}
                              </div>
                              <div className="mt-2 text-sm leading-6 text-slate-200">{trace.selectedNextReason || copy.onlyTicket}</div>
                              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                {(trace.prioritizationFactors || []).map((factor) => (
                                  <AssignmentMetricBadge
                                    key={`${factor.key}-${String(factor.value)}`}
                                    label={formatAssignmentPrioritizationFactor(factor, glossaryLanguage)}
                                    glossaryKey={resolveAssignmentTraceGlossaryKey(factor)}
                                    language={glossaryLanguage}
                                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1"
                                  />
                                ))}
                              </div>
                            </div>
                            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>

                          {(trace.comparedTickets || []).length > 0 ? (
                            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-slate-200">
                              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">{copy.comparedAgainst}</div>
                              <div className="space-y-2">
                                {trace.comparedTickets.map((candidate) => (
                                  <div key={`${candidate.ticketId}-${candidate.rank}`} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                                    <div className="font-mono text-[11px] text-slate-100">{candidate.displayTicketNumber || candidate.ticketId}</div>
                                    <div className="mt-1 text-slate-300">{candidate.selectedFirstBy}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </EnterpriseCard>

              <EnterpriseCard noPadding>
                <div className="space-y-4 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Target className="h-4 w-4 text-emerald-400" />
                    {copy.finalBoard}
                    <InfoTooltip title={copy.finalBoard} side="right" width="w-80">
                      <p>{copy.finalBoardHint}</p>
                    </InfoTooltip>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-3">
                    <FinalColumn title={copy.assignedColumn} decisions={decisions.filter((decision) => decision.result === 'assigned')} isGerman={isGerman} emptyLabel={copy.noItems} tone="assigned" />
                    <FinalColumn title={copy.unassignedColumn} decisions={decisions.filter((decision) => decision.result !== 'assigned' && decision.result !== 'not_relevant' && decision.result !== 'blocked')} isGerman={isGerman} emptyLabel={copy.noItems} tone="manual_review" />
                    <FinalColumn title={copy.filteredColumn} decisions={decisions.filter((decision) => decision.result === 'not_relevant' || decision.result === 'blocked')} isGerman={isGerman} emptyLabel={copy.noItems} tone="not_relevant" />
                  </div>
                </div>
              </EnterpriseCard>
            </div>
          </div>
        )}
      </EnterpriseCard>
    </div>
  );
}

function CandidateColumn({
  title,
  icon: Icon,
  accentClass,
  items,
  emptyLabel,
  highlightId,
  language = 'en',
}: {
  title: string;
  icon: typeof Users;
  accentClass: string;
  items: CandidateRef[];
  emptyLabel: string;
  highlightId?: number | null;
  language?: 'de' | 'en';
}) {
  return (
    <div className="rounded-[20px] border border-border/25 bg-background/30 p-3">
      <div className={`mb-3 flex items-center gap-2 text-sm font-medium ${accentClass}`}>
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/25 bg-background/20 px-3 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : items.map((candidate) => (
          <div
            key={candidate.id}
            className={`rounded-2xl border px-3 py-3 ${highlightId && highlightId === candidate.id ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-border/20 bg-background/25'}`}
          >
            <div className="text-sm font-medium text-foreground">{candidate.name}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <AssignmentMetricBadge
                label={formatAssignmentMetricLabel('worker-id', candidate.id, language)}
                glossaryKey="worker-id"
                language={language}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-1"
              />
              {candidate.shiftCode ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{candidate.shiftCode}</span> : null}
              {candidate.shiftPlanningDate ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{candidate.shiftPlanningDate}</span> : null}
              {candidate.weekplanRole || candidate.role ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{candidate.weekplanRole || candidate.role}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExcludedCandidateColumn({
  title,
  icon: Icon,
  accentClass,
  items,
  emptyLabel,
  excludedReasonLabel,
  language = 'en',
}: {
  title: string;
  icon: typeof UserX;
  accentClass: string;
  items: GroupedExcludedCandidate[];
  emptyLabel: string;
  excludedReasonLabel: string;
  language?: 'de' | 'en';
}) {
  return (
    <div className="rounded-[20px] border border-border/25 bg-background/30 p-3">
      <div className={`mb-3 flex items-center gap-2 text-sm font-medium ${accentClass}`}>
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/25 bg-background/20 px-3 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : items.map((candidate) => (
          <div key={`${candidate.id}-${candidate.name}`} className="rounded-2xl border border-rose-400/15 bg-rose-500/5 px-3 py-3">
            <div className="text-sm font-medium text-foreground">{candidate.name}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <AssignmentMetricBadge
                label={formatAssignmentMetricLabel('worker-id', candidate.id, language)}
                glossaryKey="worker-id"
                language={language}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-1"
              />
              {candidate.shiftCode ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{candidate.shiftCode}</span> : null}
              {candidate.shiftPlanningDate ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{candidate.shiftPlanningDate}</span> : null}
              {candidate.weekplanRole || candidate.role ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{candidate.weekplanRole || candidate.role}</span> : null}
            </div>
            <div className="mt-3 rounded-2xl border border-rose-400/15 bg-black/10 px-3 py-3 text-xs leading-6 text-rose-100">
              <div className="mb-1 font-semibold uppercase tracking-[0.16em] text-rose-200/80">{excludedReasonLabel}</div>
              {candidate.reasons.join('; ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinalColumn({
  title,
  decisions,
  isGerman,
  emptyLabel,
  tone,
}: {
  title: string;
  decisions: AssignmentDecision[];
  isGerman: boolean;
  emptyLabel: string;
  tone: string;
}) {
  const meta = getResultMeta(tone, isGerman);

  return (
    <div className={`rounded-3xl border p-4 ${meta.surfaceClass}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{decisions.length}</span>
      </div>
      <div className="max-h-110 space-y-2 overflow-y-auto pr-1">
        {decisions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/30 bg-background/25 px-3 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : sortDecisionsForAudit(decisions).map((decision) => (
          <div key={decision.id} className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-sm text-slate-100">{getAssignmentDisplayTicketNumber(decision)}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{getAssignmentSystemName(decision) || getAssignmentQueueOrigin(decision) || '–'}</div>
              </div>
              <ResultChip result={decision.result} isGerman={isGerman} />
            </div>
            {decision.assigned_worker_name ? (
              <div className="mt-3 text-xs text-emerald-100">{decision.assigned_worker_name}</div>
            ) : null}
            <div className="mt-2 text-xs leading-6 text-slate-200">{decision.selection_reason || decision.short_reason || '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}