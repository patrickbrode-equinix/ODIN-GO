/* ================================================ */
/* Assignment Engine — Decision Logging             */
/* ================================================ */

function snapshotCandidate(candidate) {
  if (!candidate) return candidate;

  const snapshot = {
    id: candidate.id,
    name: candidate.name,
  };

  if (candidate.role != null) snapshot.role = candidate.role;
  if (candidate.weekplanRole != null) snapshot.weekplanRole = candidate.weekplanRole;
  if (candidate.shiftCode != null) snapshot.shiftCode = candidate.shiftCode;
  if (candidate.shiftPlanningDate != null) snapshot.shiftPlanningDate = candidate.shiftPlanningDate;
  if (candidate.shiftStart != null) snapshot.shiftStart = candidate.shiftStart;
  if (candidate.shiftEnd != null) snapshot.shiftEnd = candidate.shiftEnd;
  if (candidate.shiftActive != null) snapshot.shiftActive = candidate.shiftActive;
  if (candidate.planningSource != null) snapshot.planningSource = candidate.planningSource;
  if (candidate.userMapped != null) snapshot.userMapped = candidate.userMapped;
  if (candidate.plannedEmployeeName != null) snapshot.plannedEmployeeName = candidate.plannedEmployeeName;
  if (candidate.currentLoad != null) snapshot.currentLoad = candidate.currentLoad;

  return snapshot;
}

function readObjectValue(source, key) {
  if (!source || typeof source !== 'object' || !(key in source)) return null;
  const value = source[key];
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function getFirstString(...values) {
  for (const value of values) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function formatRemainingHours(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 1) {
    const minutes = Math.max(1, Math.round(parsed * 60));
    return `${minutes} min`;
  }
  const hours = Math.floor(parsed);
  const minutes = Math.round((parsed - hours) * 60);
  if (minutes <= 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function parseBooleanValue(value) {
  if (value === true || value === false) return value;
  if (value == null) return null;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function parseNumberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeFactorList(factors = []) {
  if (!Array.isArray(factors)) return [];

  return factors
    .filter((factor) => factor && typeof factor === 'object')
    .map((factor) => ({
      key: getFirstString(factor.key, factor.label) || 'factor',
      label: getFirstString(factor.label, factor.key) || 'Factor',
      value: factor.value ?? null,
      detail: getFirstString(factor.detail, factor.reason) || null,
      emphasis: getFirstString(factor.emphasis) || null,
    }));
}

function sanitizeComparedTickets(comparedTickets = []) {
  if (!Array.isArray(comparedTickets)) return [];

  return comparedTickets
    .filter((ticket) => ticket && typeof ticket === 'object')
    .map((ticket) => ({
      ticketId: getFirstString(ticket.ticketId) || null,
      displayTicketNumber: getFirstString(ticket.displayTicketNumber, ticket.ticketId) || null,
      ticketType: getFirstString(ticket.ticketType) || null,
      ticketPriority: getFirstString(ticket.ticketPriority) || null,
      priorityTier: parseNumberValue(ticket.priorityTier),
      rank: parseNumberValue(ticket.rank),
      selectedFirstBy: getFirstString(ticket.selectedFirstBy, ticket.reason) || null,
      factors: sanitizeFactorList(ticket.factors || []),
    }));
}

function sanitizeCandidateRanking(candidateRanking = []) {
  if (!Array.isArray(candidateRanking)) return [];

  return candidateRanking
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      employeeId: parseNumberValue(entry.employeeId ?? entry.id),
      employeeName: getFirstString(entry.employeeName, entry.name) || null,
      role: getFirstString(entry.role) || null,
      weekplanRole: getFirstString(entry.weekplanRole) || null,
      shiftCode: getFirstString(entry.shiftCode) || null,
      shiftPlanningDate: getFirstString(entry.shiftPlanningDate) || null,
      shiftStart: getFirstString(entry.shiftStart) || null,
      shiftEnd: getFirstString(entry.shiftEnd) || null,
      workload: parseNumberValue(entry.workload),
      groupingScore: parseNumberValue(entry.groupingScore),
      queuePure: parseBooleanValue(entry.queuePure),
      colleagueScore: parseNumberValue(entry.colleagueScore),
      selectionBlocked: entry.selectionBlocked === true,
      blockingReason: getFirstString(entry.blockingReason) || null,
      rankingFactors: Array.isArray(entry.rankingFactors)
        ? entry.rankingFactors.map((factor) => String(factor)).filter(Boolean)
        : [],
      scoreBreakdown: entry.scoreBreakdown && typeof entry.scoreBreakdown === 'object'
        ? entry.scoreBreakdown
        : {},
      finalRank: parseNumberValue(entry.finalRank),
      selected: entry.selected === true,
    }));
}

function buildConfigSnapshot(configSnapshot = {}) {
  if (!configSnapshot || typeof configSnapshot !== 'object') {
    return {
      mode: null,
      currentShiftOnly: null,
      planningWindowHours: null,
      siteStrictness: null,
      responsibilityStrictness: null,
      enableRotationTieBreaker: null,
      fallbackTieBreaker: null,
      insufficientResources: null,
      verificationEnabled: null,
      pendingBlocksAssignment: null,
    };
  }

  return {
    mode: getFirstString(configSnapshot.mode, configSnapshot.executionMode) || null,
    currentShiftOnly: parseBooleanValue(configSnapshot.currentShiftOnly),
    planningWindowHours: parseNumberValue(configSnapshot.planningWindowHours),
    siteStrictness: parseBooleanValue(configSnapshot.siteStrictness),
    responsibilityStrictness: parseBooleanValue(configSnapshot.responsibilityStrictness),
    enableRotationTieBreaker: parseBooleanValue(configSnapshot.enableRotationTieBreaker),
    fallbackTieBreaker: getFirstString(configSnapshot.fallbackTieBreaker) || null,
    insufficientResources: parseBooleanValue(configSnapshot.insufficientResources),
    verificationEnabled: parseBooleanValue(configSnapshot.verificationEnabled),
    pendingBlocksAssignment: parseBooleanValue(configSnapshot.pendingBlocksAssignment),
  };
}

function groupExcludedCandidates(excludedCandidates = []) {
  const grouped = new Map();

  for (const candidate of excludedCandidates || []) {
    const key = `${candidate.id}:${candidate.name || ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...snapshotCandidate(candidate),
        rules: [],
        reasons: [],
      });
    }

    const target = grouped.get(key);
    if (candidate.rule && !target.rules.includes(candidate.rule)) {
      target.rules.push(candidate.rule);
    }
    if (candidate.reason && !target.reasons.includes(candidate.reason)) {
      target.reasons.push(candidate.reason);
    }
  }

  return Array.from(grouped.values());
}

function buildStructuredTimeline({
  decision,
  generatedAt,
  groupedExcludedCandidates = [],
  ticketSelection = null,
  candidateRanking = [],
}) {
  const initialCandidates = decision.initialCandidates || decision.initial_candidates || [];
  const remainingCandidates = decision.remainingCandidates || decision.remaining_candidates || [];
  const resultReason = decision.selectionReason || decision.selection_reason || decision.shortReason || decision.short_reason || decision.errorMessage || decision.error_message || decision.result;

  return [
    {
      stepOrder: 1,
      key: 'ticket-validated',
      stepType: 'ticket_validation',
      label: 'Ticket analysiert',
      status: 'done',
      reason: decision.shortReason || decision.short_reason || 'Ticketdaten wurden validiert und normalisiert',
      inputSummary: {
        ticketId: decision.ticketId || decision.ticket_id || null,
      },
      outputSummary: {
        normalizationWarnings: Array.isArray(decision.normalizationWarnings || decision.normalization_warnings)
          ? (decision.normalizationWarnings || decision.normalization_warnings).length
          : 0,
      },
      decisionReason: decision.shortReason || decision.short_reason || resultReason,
      timestamp: generatedAt,
    },
    {
      stepOrder: 2,
      key: 'ticket-eligibility',
      stepType: 'ticket_eligibility',
      label: 'Ticket-Eligibility geprüft',
      status: 'done',
      reason: decision.result === 'not_relevant'
        ? (resultReason || 'Ticket wurde vor der Zuweisung ausgeschlossen')
        : 'Ticket hat Relevanz-, Override- und Vorfilter bestanden',
      inputSummary: {
        rulePathCount: Array.isArray(decision.rulePath || decision.rule_path)
          ? (decision.rulePath || decision.rule_path).length
          : 0,
      },
      outputSummary: {
        result: decision.result === 'not_relevant' ? 'excluded' : 'continued',
      },
      decisionReason: decision.result === 'not_relevant'
        ? resultReason
        : 'Ticket blieb im Auto-Assignment-Pfad',
      timestamp: generatedAt,
    },
    {
      stepOrder: 3,
      key: 'ticket-prioritization',
      stepType: 'ticket_prioritization',
      label: 'Ticket priorisiert',
      status: ticketSelection ? 'done' : 'skipped',
      reason: ticketSelection
        ? (ticketSelection.selectedNextReason || 'Ticket wurde deterministisch in die Prioritätsreihenfolge eingeordnet')
        : 'Kein Priorisierungskontext vorhanden',
      inputSummary: {
        totalEligibleTickets: ticketSelection?.totalEligibleTickets || 0,
        totalRemainingTickets: ticketSelection?.totalRemainingTickets || 0,
      },
      outputSummary: {
        prioritizationRank: ticketSelection?.prioritizationRank || null,
      },
      decisionReason: ticketSelection?.selectedNextReason || null,
      timestamp: generatedAt,
    },
    {
      stepOrder: 4,
      key: 'candidate-pool',
      stepType: 'candidate_pool',
      label: 'Kandidatenpool geladen',
      status: initialCandidates.length > 0 ? 'done' : 'skipped',
      reason: initialCandidates.length > 0
        ? `${initialCandidates.length} Mitarbeiter wurden für die Prüfung geladen`
        : 'Für dieses Ticket war kein Kandidatenpool verfügbar',
      inputSummary: {
        candidateCount: initialCandidates.length,
      },
      outputSummary: {
        candidateCount: initialCandidates.length,
      },
      decisionReason: initialCandidates.length > 0 ? null : resultReason,
      timestamp: generatedAt,
    },
    {
      stepOrder: 5,
      key: 'candidate-filter',
      stepType: 'candidate_filtering',
      label: 'Kandidaten gefiltert',
      status: initialCandidates.length > 0 ? 'done' : 'skipped',
      reason: groupedExcludedCandidates.length > 0
        ? `${groupedExcludedCandidates.length} Mitarbeiter wurden durch harte Regeln ausgeschlossen`
        : remainingCandidates.length > 0
          ? 'Keine harten Ausschlüsse nötig'
          : 'Nach der Filterung blieb kein zulässiger Kandidat übrig',
      inputSummary: {
        initialCandidateCount: initialCandidates.length,
      },
      outputSummary: {
        excludedCandidateCount: groupedExcludedCandidates.length,
        remainingCandidateCount: remainingCandidates.length,
      },
      decisionReason: groupedExcludedCandidates[0]?.reasons?.[0] || null,
      timestamp: generatedAt,
    },
    {
      stepOrder: 6,
      key: 'candidate-ranking',
      stepType: 'candidate_ranking',
      label: 'Kandidaten gerankt',
      status: candidateRanking.length > 0 ? 'done' : remainingCandidates.length > 0 ? 'pending' : 'skipped',
      reason: candidateRanking.length > 0
        ? `${candidateRanking.filter((candidate) => !candidate.selectionBlocked).length} Kandidaten haben deterministische Ranking-Signale erhalten`
        : remainingCandidates.length > 0
          ? 'Rankingdaten fehlen für diese historische Entscheidung'
          : 'Keine Kandidaten für das Ranking vorhanden',
      inputSummary: {
        rankingCandidateCount: candidateRanking.length || remainingCandidates.length,
      },
      outputSummary: {
        topCandidateId: candidateRanking.find((candidate) => candidate.selected)?.employeeId || decision.assignedWorkerId || decision.assigned_worker_id || null,
      },
      decisionReason: decision.selectionReason || decision.selection_reason || null,
      timestamp: generatedAt,
    },
    {
      stepOrder: 7,
      key: 'final-decision',
      stepType: 'final_decision',
      label: 'Finale Entscheidung',
      status: 'done',
      reason: resultReason,
      inputSummary: {
        result: decision.result,
      },
      outputSummary: {
        assignedWorkerId: decision.assignedWorkerId || decision.assigned_worker_id || null,
        assignedWorkerName: decision.assignedWorkerName || decision.assigned_worker_name || null,
      },
      decisionReason: resultReason,
      timestamp: generatedAt,
    },
  ];
}

function buildStructuredDecisionTrace(decision, traceInput = {}) {
  const generatedAt = getFirstString(traceInput.generatedAt) || new Date().toISOString();
  const groupedExcludedCandidates = groupExcludedCandidates(decision.excludedCandidates || decision.excluded_candidates || []);
  const initialCandidates = decision.initialCandidates || decision.initial_candidates || [];
  const excludedCandidates = decision.excludedCandidates || decision.excluded_candidates || [];
  const remainingCandidates = decision.remainingCandidates || decision.remaining_candidates || [];
  const candidateRanking = sanitizeCandidateRanking(traceInput.candidateRanking || traceInput.candidate_ranking || []);
  const ticketSelection = traceInput.ticketSelection
    ? {
        prioritizationRank: parseNumberValue(traceInput.ticketSelection.prioritizationRank),
        totalEligibleTickets: parseNumberValue(traceInput.ticketSelection.totalEligibleTickets),
        totalRemainingTickets: parseNumberValue(traceInput.ticketSelection.totalRemainingTickets),
        priorityTier: parseNumberValue(traceInput.ticketSelection.priorityTier),
        selectedNextReason: getFirstString(traceInput.ticketSelection.selectedNextReason) || null,
        prioritizationFactors: sanitizeFactorList(traceInput.ticketSelection.prioritizationFactors || []),
        comparedTickets: sanitizeComparedTickets(traceInput.ticketSelection.comparedTickets || []),
      }
    : null;

  const finalDecision = {
    result: decision.result,
    assignedWorkerId: decision.assignedWorkerId || decision.assigned_worker_id || null,
    assignedWorkerName: decision.assignedWorkerName || decision.assigned_worker_name || null,
    tieBreaker: getFirstString(
      traceInput.selectionTieBreaker,
      traceInput.tieBreaker,
      traceInput.finalDecision?.tieBreaker,
      traceInput.final_decision?.tieBreaker,
    ) || null,
    selectionReason: decision.selectionReason || decision.selection_reason || null,
    shortReason: decision.shortReason || decision.short_reason || null,
    noAssignmentReason: getFirstString(traceInput.noAssignmentReason)
      || (decision.result === 'assigned'
        ? null
        : getFirstString(decision.selectionReason, decision.selection_reason, decision.shortReason, decision.short_reason, decision.errorMessage, decision.error_message)),
  };

  return {
    version: 2,
    generatedAt,
    configSnapshot: buildConfigSnapshot(traceInput.configSnapshot || traceInput.config_snapshot || {}),
    ticketSelection,
    candidateSummary: {
      initialCandidateCount: initialCandidates.length,
      excludedCandidateCount: groupedExcludedCandidates.length,
      exclusionEventCount: excludedCandidates.length,
      survivingCandidateCount: remainingCandidates.length,
      selectedCandidateCount: decision.result === 'assigned' ? 1 : 0,
    },
    candidateRanking,
    finalDecision,
    timeline: Array.isArray(traceInput.timeline) && traceInput.timeline.length > 0
      ? traceInput.timeline
      : buildStructuredTimeline({
          decision,
          generatedAt,
          groupedExcludedCandidates,
          ticketSelection,
          candidateRanking,
        }),
  };
}

function buildDecisionTraceSteps(decision, groupedExcludedCandidates = [], traceModel = null) {
  if (Array.isArray(traceModel?.timeline) && traceModel.timeline.length > 0) {
    return traceModel.timeline.map((step, index) => ({
      key: step.key || step.stepType || `step-${index + 1}`,
      label: step.label || step.stepType || `Step ${index + 1}`,
      status: step.status || 'done',
      reason: step.decisionReason || step.reason || '',
      stepOrder: step.stepOrder || index + 1,
      stepType: step.stepType || step.key || `step-${index + 1}`,
      inputSummary: step.inputSummary || null,
      outputSummary: step.outputSummary || null,
      timestamp: step.timestamp || null,
    }));
  }

  const initialCandidates = decision.initialCandidates || decision.initial_candidates || [];
  const remainingCandidates = decision.remainingCandidates || decision.remaining_candidates || [];
  const rulePath = decision.rulePath || decision.rule_path || [];
  const hasRoleChecks = rulePath.some((rule) => String(rule).toLowerCase().includes('role'));
  const hasCapacityChecks = rulePath.some((rule) => ['queuepurity', 'ticketcapacity', 'worker-selection'].includes(String(rule).toLowerCase()));

  return [
    {
      key: 'ticket-analyzed',
      label: 'Ticket analysiert',
      status: 'done',
      reason: decision.shortReason || 'Ticketdaten wurden validiert und normalisiert',
      stepOrder: 1,
      stepType: 'ticket_validation',
      inputSummary: null,
      outputSummary: null,
      timestamp: null,
    },
    {
      key: 'candidates-loaded',
      label: 'Kandidaten ermittelt',
      status: initialCandidates.length > 0 ? 'done' : 'skipped',
      reason: initialCandidates.length > 0
        ? `${initialCandidates.length} Kandidaten aus Wochenplanung und ODIN-Stammdaten geladen`
        : 'Kein Kandidatenpool verfügbar',
      stepOrder: 2,
      stepType: 'candidate_pool',
      inputSummary: { candidateCount: initialCandidates.length },
      outputSummary: { candidateCount: initialCandidates.length },
      timestamp: null,
    },
    {
      key: 'role-rules-applied',
      label: 'Rollen- und Ausschlussregeln geprüft',
      status: hasRoleChecks || groupedExcludedCandidates.length > 0 ? 'done' : 'pending',
      reason: groupedExcludedCandidates.length > 0
        ? `${groupedExcludedCandidates.length} Kandidaten durch Rollen-, Berechtigungs- oder Ausschlussregeln eingeschränkt`
        : 'Keine regelbasierten Ausschlüsse protokolliert',
      stepOrder: 3,
      stepType: 'candidate_filtering',
      inputSummary: { candidateCount: initialCandidates.length },
      outputSummary: { excludedCandidateCount: groupedExcludedCandidates.length },
      timestamp: null,
    },
    {
      key: 'capacity-checked',
      label: 'Kapazität und Mischlogik geprüft',
      status: hasCapacityChecks ? 'done' : 'pending',
      reason: hasCapacityChecks
        ? 'Queue-Mix, Ticketlimits und Lastverteilung wurden bewertet'
        : 'Keine Kapazitätsprüfung im Regelpfad sichtbar',
      stepOrder: 4,
      stepType: 'candidate_ranking',
      inputSummary: { remainingCandidateCount: remainingCandidates.length },
      outputSummary: { remainingCandidateCount: remainingCandidates.length },
      timestamp: null,
    },
    {
      key: 'winner-selected',
      label: decision.result === 'assigned' ? 'Gewinner ausgewählt' : 'Finale Entscheidung getroffen',
      status: decision.result === 'error' ? 'skipped' : 'done',
      reason: decision.selectionReason || decision.selection_reason || decision.shortReason || decision.short_reason || 'Finale Entscheidung protokolliert',
      stepOrder: 5,
      stepType: 'final_decision',
      inputSummary: { result: decision.result },
      outputSummary: { assignedWorkerId: decision.assignedWorkerId || decision.assigned_worker_id || null },
      timestamp: null,
    },
    {
      key: 'final-reason',
      label: 'Finale Begründung',
      status: 'done',
      reason: decision.shortReason || decision.short_reason || decision.selectionReason || decision.selection_reason || decision.errorMessage || decision.error_message || decision.result,
      stepOrder: 6,
      stepType: 'final_reason',
      inputSummary: null,
      outputSummary: null,
      timestamp: null,
    },
  ];
}

function buildTicketContext(source) {
  const normalized = source.normalizedTicket || source.normalized_ticket || {};
  const raw = source.rawTicket || source.raw_ticket || {};
  const remainingHours = Number.isFinite(Number(normalized.remainingHours))
    ? Number(normalized.remainingHours)
    : (Number.isFinite(Number(raw.remaining_hours)) ? Number(raw.remaining_hours) : null);

  return {
    queueOrigin: getQueueOrigin(source),
    systemName: getFirstString(
      normalized.systemName,
      raw.system_name,
      raw.systemName,
    ),
    activity: getFirstString(
      normalized.activity,
      normalized.customerTroubleType,
      raw.activity,
      raw['Activity'],
      raw['Activity Type'],
      raw['Activity Sub Type'],
      raw.activity_type,
      raw.customer_trouble_type,
      raw.subtype,
    ),
    currentOwner: getFirstString(
      raw.owner,
      raw.Owner,
      raw.current_owner,
      normalized.owner,
    ),
    recommendedOwner: getFirstString(source.assignedWorkerName, source.assigned_worker_name),
    remainingHours,
    remainingTimeLabel: formatRemainingHours(remainingHours),
    dueAt: getFirstString(normalized.dueAt, raw.due_at, raw.commit_date, raw['Commit Date']),
    revisedCommitDate: getFirstString(raw.revised_commit_date, raw.revisedCommitDate, raw['Revised Commit Date']),
    scheduledStart: getFirstString(normalized.scheduledStart, raw.sched_start, raw['Sched. Start']),
    customerTroubleType: getFirstString(normalized.customerTroubleType, raw.customer_trouble_type, raw.subtype),
    customerName: getFirstString(normalized.customer, raw.customer_name, raw.account_name, raw.customer),
    mode: getFirstString(source.run_mode, source.mode),
  };
}

function getDisplayTicketNumber(source) {
  const normalized = source.normalizedTicket || source.normalized_ticket || {};
  const raw = source.rawTicket || source.raw_ticket || {};

  return (
    source.displayTicketNumber ||
    source.externalId ||
    source.external_id ||
    normalized.externalId ||
    raw.external_id ||
    raw.ticketNumber ||
    raw.ticket ||
    raw.Ticket ||
    raw.activity_no ||
    raw.ACTIVITY_NO ||
    raw['Activity #'] ||
    source.ticketId ||
    source.ticket_id ||
    normalized.id ||
    raw.id ||
    null
  );
}

function getQueueOrigin(source) {
  const normalized = source.normalizedTicket || source.normalized_ticket || {};
  const raw = source.rawTicket || source.raw_ticket || {};
  return source.queueOrigin || normalized.queue || raw.queue_type || raw.queue || raw.type || null;
}

/**
 * Build a decision log entry for a single ticket.
 */
export function buildDecisionLog({
  ticket,
  result,
  assignedWorker,
  selectionReason,
  rulePath,
  initialCandidates,
  excludedCandidates,
  remainingCandidates,
  errorMessage,
  decisionTraceInput,
}) {
  const decisionLog = {
    ticketId: ticket.id,
    externalId: ticket.externalId,
    ticketType: ticket.type,
    ticketStatus: ticket.status,
    ticketPriority: ticket.priority,
    ticketSite: ticket.site,
    result,
    assignedWorkerId: assignedWorker?.id ?? null,
    assignedWorkerName: assignedWorker?.name ?? null,
    selectionReason: selectionReason || null,
    shortReason: buildShortReason(result, assignedWorker, selectionReason),
    rulePath: rulePath || [],
    initialCandidates: (initialCandidates || []).map(snapshotCandidate),
    excludedCandidates: (excludedCandidates || []).map(candidate => ({
      ...snapshotCandidate(candidate),
      reason: candidate.reason,
      rule: candidate.rule || null,
    })),
    remainingCandidates: (remainingCandidates || []).map(snapshotCandidate),
    normalizationWarnings: ticket.normalizationWarnings || [],
    normalizedTicket: ticket,
    rawTicket: ticket.raw || {},
    errorMessage: errorMessage || null,
  };

  decisionLog.decisionTrace = buildStructuredDecisionTrace(decisionLog, decisionTraceInput || {});

  return decisionLog;
}

/**
 * Build a short, human-readable reason string.
 */
function buildShortReason(result, assignedWorker, selectionReason) {
  switch (result) {
    case 'assigned':
      return `Zugewiesen an ${assignedWorker?.name || 'Unbekannt'}: ${selectionReason || 'regelbasiert'}`;
    case 'manual_review':
      return selectionReason || 'Manuelle Prüfung erforderlich';
    case 'no_candidate':
      return selectionReason || 'Kein geeigneter Kandidat verfügbar';
    case 'not_relevant':
      return 'Ticket nicht relevant für Zuweisung';
    case 'blocked':
      return 'Ticket gesperrt';
    case 'error':
      return 'Fehler bei der Verarbeitung';
    default:
      return result;
  }
}

/**
 * Build a human-readable summary for a full run.
 */
export function buildRunSummary(decisions, extras = {}) {
  const counts = { assigned: 0, manual_review: 0, no_candidate: 0, not_relevant: 0, blocked: 0, error: 0, crawler_stale: 0 };
  for (const d of decisions) {
    if (counts[d.result] !== undefined) {
      counts[d.result]++;
    }
  }
  return {
    totalDecisions: decisions.length,
    ...counts,
    ...extras,
  };
}

/**
 * Build a full human-readable explanation for a ticket decision.
 * This is the core of the explainability requirement.
 */
export function buildTicketExplanation(decision) {
  const lines = [];
  const displayTicketNumber = getDisplayTicketNumber(decision) || decision.ticketId || decision.ticket_id;
  const internalTicketId = decision.ticketId || decision.ticket_id;
  const queueOrigin = getQueueOrigin(decision);
  const normalizedTicket = decision.normalizedTicket || decision.normalized_ticket || null;
  const rawTicket = decision.rawTicket || decision.raw_ticket || null;
  const groupedExcludedCandidates = groupExcludedCandidates(decision.excludedCandidates || decision.excluded_candidates || []);
  const ticketContext = buildTicketContext(decision);
  const traceModel = buildStructuredDecisionTrace(decision, decision.decisionTrace || decision.decision_trace || {});
  const decisionTrace = buildDecisionTraceSteps(decision, groupedExcludedCandidates, traceModel);

  lines.push(`## Ticket ${displayTicketNumber}`);
  if (internalTicketId && String(internalTicketId) !== String(displayTicketNumber)) {
    lines.push(`Interne ID: ${internalTicketId}`);
  }
  if (decision.externalId || decision.external_id) {
    lines.push(`Externe ID: ${decision.externalId || decision.external_id}`);
  }
  if (queueOrigin) {
    lines.push(`Queue: ${queueOrigin}`);
  }
  lines.push('');

  // Result
  lines.push(`### Ergebnis: ${decision.result}`);
  lines.push(decision.shortReason || decision.short_reason || '');
  lines.push('');

  // Ticket Details
  lines.push('### Ticket-Details');
  lines.push(`- Typ: ${decision.ticketType || decision.ticket_type || 'N/A'}`);
  lines.push(`- Status: ${decision.ticketStatus || decision.ticket_status || 'N/A'}`);
  lines.push(`- Priorität: ${decision.ticketPriority || decision.ticket_priority || 'N/A'}`);
  lines.push(`- Site: ${decision.ticketSite || decision.ticket_site || 'N/A'}`);
  if (queueOrigin) lines.push(`- Queue: ${queueOrigin}`);
  if (ticketContext.mode) lines.push(`- Modus: ${ticketContext.mode}`);
  if (ticketContext.systemName) lines.push(`- System: ${ticketContext.systemName}`);
  if (ticketContext.activity) lines.push(`- Activity: ${ticketContext.activity}`);
  if (ticketContext.currentOwner) lines.push(`- Aktueller Owner: ${ticketContext.currentOwner}`);
  if (ticketContext.recommendedOwner) lines.push(`- Vorgeschlagener Owner: ${ticketContext.recommendedOwner}`);
  if (ticketContext.remainingTimeLabel) lines.push(`- Restzeit: ${ticketContext.remainingTimeLabel}`);
  if (ticketContext.dueAt) lines.push(`- Commit / Due: ${ticketContext.dueAt}`);
  if (ticketContext.revisedCommitDate) lines.push(`- Revised Commit: ${ticketContext.revisedCommitDate}`);
  if (ticketContext.scheduledStart) lines.push(`- Sched. Start: ${ticketContext.scheduledStart}`);
  lines.push('');

  if (traceModel.ticketSelection) {
    lines.push('### Priorisierung');
    lines.push(`- Reihenfolge im Lauf: ${traceModel.ticketSelection.prioritizationRank || 'N/A'} / ${traceModel.ticketSelection.totalEligibleTickets || 'N/A'}`);
    if (traceModel.ticketSelection.selectedNextReason) {
      lines.push(`- Warum dieses Ticket jetzt dran war: ${traceModel.ticketSelection.selectedNextReason}`);
    }
    for (const factor of traceModel.ticketSelection.prioritizationFactors || []) {
      lines.push(`- ${factor.label}: ${factor.value}${factor.detail ? ` — ${factor.detail}` : ''}`);
    }
    lines.push('');
  }

  // Normalization warnings
  const warnings = decision.normalizationWarnings || decision.normalization_warnings || [];
  if (warnings.length > 0) {
    lines.push('### Normalisierungs-Warnungen');
    for (const w of warnings) lines.push(`- ⚠️ ${w}`);
    lines.push('');
  }

  // Candidates
  const initial = decision.initialCandidates || decision.initial_candidates || [];
  lines.push(`### Initiale Kandidaten (${initial.length})`);
  if (initial.length === 0) {
    lines.push('Keine Kandidaten geladen.');
  } else {
    for (const c of initial) {
      const details = [c.shiftCode, c.shiftPlanningDate, c.weekplanRole || c.role].filter(Boolean).join(' | ');
      lines.push(`- ${c.name} (ID: ${c.id})${details ? ` [${details}]` : ''}`);
    }
  }
  lines.push('');

  // Excluded
  const excluded = decision.excludedCandidates || decision.excluded_candidates || [];
  if (excluded.length > 0) {
    lines.push(`### Ausgeschlossene Kandidaten (${excluded.length})`);
    for (const e of groupedExcludedCandidates) {
      const details = [e.shiftCode, e.shiftPlanningDate, e.weekplanRole || e.role].filter(Boolean).join(' | ');
      lines.push(`- ❌ ${e.name || 'ID:' + e.id}${details ? ` [${details}]` : ''}: ${e.reasons.join('; ')}`);
    }
    lines.push('');
  }

  // Remaining
  const remaining = decision.remainingCandidates || decision.remaining_candidates || [];
  lines.push(`### Verbleibende Kandidaten (${remaining.length})`);
  if (remaining.length === 0) {
    lines.push('Keine Kandidaten übrig.');
  } else {
    for (const c of remaining) {
      const details = [c.shiftCode, c.shiftPlanningDate, c.weekplanRole || c.role].filter(Boolean).join(' | ');
      lines.push(`- ✅ ${c.name} (ID: ${c.id})${details ? ` [${details}]` : ''}`);
    }
  }
  lines.push('');

  // Selection
  if (decision.result === 'assigned') {
    lines.push('### Auswahl');
    lines.push(`Ausgewählt: **${decision.assignedWorkerName || decision.assigned_worker_name || 'N/A'}**`);
    lines.push(`Begründung: ${decision.selectionReason || decision.selection_reason || 'N/A'}`);
    lines.push('');
  }

  if ((traceModel.candidateRanking || []).length > 0) {
    lines.push(`### Kandidatenranking (${traceModel.candidateRanking.length})`);
    for (const candidate of traceModel.candidateRanking) {
      const rankLabel = candidate.finalRank != null ? `#${candidate.finalRank}` : 'außerhalb Ranking';
      const stateLabel = candidate.selected ? ' [gewählt]' : candidate.selectionBlocked ? ' [blockiert]' : '';
      lines.push(`- ${rankLabel} ${candidate.employeeName || 'Unbekannt'}${stateLabel}: ${(candidate.rankingFactors || []).join('; ') || 'Keine Rankingfaktoren protokolliert'}`);
    }
    lines.push('');
  }

  // Rule Path
  const rulePath = decision.rulePath || decision.rule_path || [];
  if (rulePath.length > 0) {
    lines.push('### Regelreihenfolge');
    for (let i = 0; i < rulePath.length; i++) {
      lines.push(`${i + 1}. ${rulePath[i]}`);
    }
    lines.push('');
  }

  // Error
  if (decision.errorMessage || decision.error_message) {
    lines.push('### Fehler');
    lines.push(decision.errorMessage || decision.error_message);
  }

  if (normalizedTicket) {
    lines.push('');
    lines.push('### Normalisiertes Ticket');
    lines.push('```json');
    lines.push(JSON.stringify(normalizedTicket, null, 2));
    lines.push('```');
  }

  if (rawTicket) {
    lines.push('');
    lines.push('### Raw Ticket');
    lines.push('```json');
    lines.push(JSON.stringify(rawTicket, null, 2));
    lines.push('```');
  }

  return {
    markdown: lines.join('\n'),
    structured: {
      displayTicketNumber,
      ticketId: decision.ticketId || decision.ticket_id,
      externalId: decision.externalId || decision.external_id,
      queueOrigin,
      mode: ticketContext.mode,
      result: decision.result,
      shortReason: decision.shortReason || decision.short_reason,
      ticketType: decision.ticketType || decision.ticket_type,
      ticketStatus: decision.ticketStatus || decision.ticket_status,
      ticketPriority: decision.ticketPriority || decision.ticket_priority,
      ticketSite: decision.ticketSite || decision.ticket_site,
      ticketContext,
      decisionTrace,
      traceModel,
      ticketSelection: traceModel.ticketSelection,
      candidateSummary: traceModel.candidateSummary,
      candidateRanking: traceModel.candidateRanking,
      configSnapshot: traceModel.configSnapshot,
      finalDecision: traceModel.finalDecision,
      normalizationWarnings: warnings,
      initialCandidates: initial,
      excludedCandidates: excluded,
      excludedCandidateGroups: groupedExcludedCandidates,
      remainingCandidates: remaining,
      assignedWorkerName: decision.assignedWorkerName || decision.assigned_worker_name,
      assignedWorkerId: decision.assignedWorkerId || decision.assigned_worker_id,
      selectionReason: decision.selectionReason || decision.selection_reason,
      rulePath,
      errorMessage: decision.errorMessage || decision.error_message,
      normalizedTicket,
      rawTicket,
    },
  };
}
