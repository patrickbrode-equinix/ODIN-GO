/* ================================================ */
/* Critical Workload — Shared Service Helpers       */
/* ================================================ */

import { CRAWLER_MAX_AGE_MS } from '../constants.js';
import { buildTicketExplanation } from '../logging/decisionLog.js';

const DEFAULT_CRITICAL_WINDOW_HOURS = 72;

const DEFAULT_ASSIGNMENT_VISUALIZATION = {
  mode: 'enterprise',
  animationSpeed: 'normal',
  celebrationIntensity: 'medium',
  autoFallbackToEnterprise: true,
  confettiEnabled: true,
  applauseEnabled: true,
  displayReasoningAfterAnimation: true,
};

const ASSIGNMENT_VISUALIZATION_MODES = new Set(['enterprise', 'gamified_wheel', 'gamified_slot']);
const ASSIGNMENT_ANIMATION_SPEEDS = new Set(['slow', 'normal', 'fast']);
const ASSIGNMENT_CELEBRATION_INTENSITIES = new Set(['low', 'medium', 'high']);

const SHIFT_DEFINITIONS = [
  { code: 'E1', startHour: 6, startMinute: 30, endHour: 15, endMinute: 30 },
  { code: 'E2', startHour: 7, startMinute: 0, endHour: 16, endMinute: 0 },
  { code: 'L1', startHour: 13, startMinute: 0, endHour: 22, endMinute: 0 },
  { code: 'L2', startHour: 15, startMinute: 0, endHour: 0, endMinute: 0, overnight: true },
  { code: 'N', startHour: 21, startMinute: 15, endHour: 6, endMinute: 45, overnight: true },
];

const DIRECT_EXPEDITE_KEYS = [
  'expedite',
  'is_expedite',
  'isExpedite',
  'expedite_flag',
  'expediteFlag',
  'expedited',
  'is_expedited',
  'isExpedited',
];

const TRUTHY_VALUES = new Set(['true', '1', 'yes', 'y', 'ja', 'expedite', 'expedited']);

function normalizeCriticalWindowHours(value, fallback = DEFAULT_CRITICAL_WINDOW_HOURS) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 168);
}

function normalizeBooleanSetting(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'ja', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'nein', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeEnumSetting(value, allowedValues, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowedValues.has(normalized) ? normalized : fallback;
}

function buildAssignmentVisualizationSettings(settingsMap = {}) {
  return {
    mode: normalizeEnumSetting(
      settingsMap['tv.assignment_visualization_mode'],
      ASSIGNMENT_VISUALIZATION_MODES,
      DEFAULT_ASSIGNMENT_VISUALIZATION.mode
    ),
    animationSpeed: normalizeEnumSetting(
      settingsMap['tv.assignment_animation_speed'],
      ASSIGNMENT_ANIMATION_SPEEDS,
      DEFAULT_ASSIGNMENT_VISUALIZATION.animationSpeed
    ),
    celebrationIntensity: normalizeEnumSetting(
      settingsMap['tv.assignment_celebration_intensity'],
      ASSIGNMENT_CELEBRATION_INTENSITIES,
      DEFAULT_ASSIGNMENT_VISUALIZATION.celebrationIntensity
    ),
    autoFallbackToEnterprise: normalizeBooleanSetting(
      settingsMap['tv.assignment_auto_fallback'],
      DEFAULT_ASSIGNMENT_VISUALIZATION.autoFallbackToEnterprise
    ),
    confettiEnabled: normalizeBooleanSetting(
      settingsMap['tv.assignment_confetti_enabled'],
      DEFAULT_ASSIGNMENT_VISUALIZATION.confettiEnabled
    ),
    applauseEnabled: normalizeBooleanSetting(
      settingsMap['tv.assignment_applause_enabled'],
      DEFAULT_ASSIGNMENT_VISUALIZATION.applauseEnabled
    ),
    displayReasoningAfterAnimation: normalizeBooleanSetting(
      settingsMap['tv.assignment_display_reasoning'],
      DEFAULT_ASSIGNMENT_VISUALIZATION.displayReasoningAfterAnimation
    ),
  };
}

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDateValue(ticket, ...keys) {
  for (const key of keys) {
    const value = ticket?.[key];
    const parsed = toDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function getTextValue(ticket, ...keys) {
  for (const key of keys) {
    const value = ticket?.[key];
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSeverity(ticket) {
  return normalizeText(ticket?.severity || ticket?.ticket_priority || ticket?.priority);
}

export function isTroubleTicket(ticket) {
  const queueType = normalizeText(ticket?.queue_type || ticket?.queueType || ticket?.type || ticket?.ticket_type || ticket?.Type);
  return queueType.includes('trouble') || queueType === 'tt' || queueType.includes('troubleticket');
}

export function getTroubleSeverityRank(ticket) {
  const severity = normalizeSeverity(ticket);
  if (severity === 'critical' || severity === 'high' || severity === '1' || severity === 'p1') return 1;
  if (severity === 'medium' || severity === '2' || severity === 'p2') return 2;
  if (severity === 'low' || severity === '3' || severity === '4' || severity === 'p3' || severity === 'p4') return 8;
  return 2;
}

export function getRemainingTimeMinutes(ticket, now = new Date()) {
  const dueAt = getDateValue(ticket, 'revised_commit_date', 'revisedCommitDate', 'commit_date', 'commitDate', 'due_at', 'dueAt');
  if (!dueAt) return null;
  return Math.round((dueAt.getTime() - now.getTime()) / 60000);
}

export function detectExpediteFlag(ticket) {
  for (const key of DIRECT_EXPEDITE_KEYS) {
    if (!(key in (ticket || {}))) continue;
    const raw = ticket[key];
    if (raw === true) return true;
    const normalized = normalizeText(raw);
    if (TRUTHY_VALUES.has(normalized)) return true;
  }

  const rawJson = ticket?.raw_json;
  if (rawJson && typeof rawJson === 'object') {
    const stack = [rawJson];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== 'object') continue;

      for (const [key, value] of Object.entries(current)) {
        const normalizedKey = normalizeText(key);
        if (DIRECT_EXPEDITE_KEYS.includes(key) || DIRECT_EXPEDITE_KEYS.includes(normalizedKey)) {
          if (value === true) return true;
          if (TRUTHY_VALUES.has(normalizeText(value))) return true;
        }

        if (typeof value === 'string') {
          const normalizedValue = normalizeText(value);
          if (normalizedValue === 'expedite' || normalizedValue === 'expedited') {
            return true;
          }
        }

        if (value && typeof value === 'object') {
          stack.push(value);
        }
      }
    }
  }

  return false;
}

function buildShiftWindow(baseDate, definition, dayOffset = 0) {
  const start = new Date(baseDate);
  start.setDate(start.getDate() + dayOffset);
  start.setHours(definition.startHour, definition.startMinute, 0, 0);

  const end = new Date(baseDate);
  end.setDate(end.getDate() + dayOffset + (definition.overnight ? 1 : 0));
  end.setHours(definition.endHour, definition.endMinute, 0, 0);

  return {
    code: definition.code,
    start,
    end,
  };
}

export function getShiftWindows(now = new Date()) {
  return [
    ...SHIFT_DEFINITIONS.map((definition) => buildShiftWindow(now, definition, -1)),
    ...SHIFT_DEFINITIONS.map((definition) => buildShiftWindow(now, definition, 0)),
    ...SHIFT_DEFINITIONS.map((definition) => buildShiftWindow(now, definition, 1)),
  ].sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function getShiftContext(now = new Date()) {
  const windows = getShiftWindows(now);
  const currentShift = windows.find((window) => now >= window.start && now < window.end) || null;
  const nextShift = windows.find((window) => window.start > now) || null;

  return {
    currentShift,
    nextShift,
    remainingShiftTimeMinutes: currentShift ? Math.max(0, Math.round((currentShift.end.getTime() - now.getTime()) / 60000)) : null,
  };
}

export function isCrawlerDataStale(lastUpdate, now = new Date(), thresholdMs = CRAWLER_MAX_AGE_MS) {
  const parsed = toDate(lastUpdate);
  if (!parsed) {
    return {
      isStale: true,
      ageMinutes: null,
      thresholdMinutes: Math.round(thresholdMs / 60000),
    };
  }

  const ageMs = Math.max(0, now.getTime() - parsed.getTime());
  return {
    isStale: ageMs > thresholdMs,
    ageMinutes: Math.round(ageMs / 60000),
    thresholdMinutes: Math.round(thresholdMs / 60000),
  };
}

function getScheduledStart(ticket) {
  return getDateValue(ticket, 'sched_start', 'scheduled_start', 'scheduledStart', 'Start_Date');
}

function getScheduledWindowLabel(ticket) {
  const scheduledStart = getScheduledStart(ticket);
  if (!scheduledStart) return null;

  const dueAt = getDateValue(ticket, 'revised_commit_date', 'revisedCommitDate', 'commit_date', 'commitDate', 'due_at', 'dueAt', 'EndDate');
  if (!dueAt) return scheduledStart.toISOString();
  return `${scheduledStart.toISOString()} - ${dueAt.toISOString()}`;
}

function getPrioritySourceLabel({ isExpedite, scheduledRelevant, remainingTimeMinutes, troubleTicket }) {
  if (troubleTicket) return 'Trouble Ticket priority';
  if (isExpedite) return 'Expedite flag';
  if (scheduledRelevant) return 'Scheduled window';
  if (remainingTimeMinutes != null) return 'Revised Commit Date';
  return 'Queue metadata';
}

export function classifyCriticalTicket(ticket, now = new Date(), shiftContext = getShiftContext(now), criticalWindowHours = DEFAULT_CRITICAL_WINDOW_HOURS) {
  const troubleTicket = isTroubleTicket(ticket);
  const severityRank = getTroubleSeverityRank(ticket);
  const remainingTimeMinutes = troubleTicket ? null : getRemainingTimeMinutes(ticket, now);
  const scheduledStart = getScheduledStart(ticket);
  const expedite = !troubleTicket && detectExpediteFlag(ticket);
  const windowHours = normalizeCriticalWindowHours(criticalWindowHours);
  const criticalWindowMinutes = windowHours * 60;
  const highRiskMinutes = Math.min(24 * 60, criticalWindowMinutes);
  const mediumRiskMinutes = Math.min(48 * 60, criticalWindowMinutes);
  const scheduledRelevant = Boolean(
    scheduledStart && (
      (shiftContext.currentShift && scheduledStart >= now && scheduledStart <= shiftContext.currentShift.end)
      || (shiftContext.nextShift && scheduledStart >= now && scheduledStart <= shiftContext.nextShift.end)
    )
  );

  const dueAt = getDateValue(ticket, 'revised_commit_date', 'revisedCommitDate', 'commit_date', 'commitDate', 'due_at', 'dueAt');
  const fallbackSortTime = dueAt?.getTime() || scheduledStart?.getTime() || Number.MAX_SAFE_INTEGER;

  if (troubleTicket && severityRank === 1) {
    return {
      included: true,
      priorityBucket: 1,
      criticalityLevel: 'critical',
      criticalityReasonCode: 'INCIDENT_SEVERITY',
      criticalityReason: 'Incident Severity',
      prioritySource: getPrioritySourceLabel({ troubleTicket: true }),
      remainingTimeMinutes: null,
      scheduledRelevant: false,
      isExpedite: false,
      sortTime: fallbackSortTime,
      scheduledWindow: getScheduledWindowLabel(ticket),
    };
  }

  if (troubleTicket && severityRank === 2) {
    return {
      included: true,
      priorityBucket: 2,
      criticalityLevel: 'high',
      criticalityReasonCode: 'INCIDENT_SEVERITY',
      criticalityReason: 'Incident Severity',
      prioritySource: getPrioritySourceLabel({ troubleTicket: true }),
      remainingTimeMinutes: null,
      scheduledRelevant: false,
      isExpedite: false,
      sortTime: fallbackSortTime,
      scheduledWindow: getScheduledWindowLabel(ticket),
    };
  }

  if (expedite) {
    return {
      included: true,
      priorityBucket: 3,
      criticalityLevel: 'high',
      criticalityReasonCode: 'EXPEDITE_FLAG',
      criticalityReason: 'Remaining Time Risk',
      prioritySource: getPrioritySourceLabel({ isExpedite: true }),
      remainingTimeMinutes,
      scheduledRelevant: false,
      isExpedite: true,
      sortTime: fallbackSortTime,
      scheduledWindow: getScheduledWindowLabel(ticket),
    };
  }

  if (scheduledRelevant) {
    return {
      included: true,
      priorityBucket: 4,
      criticalityLevel: 'high',
      criticalityReasonCode: 'SCHEDULED_WINDOW',
      criticalityReason: 'Remaining Time Risk',
      prioritySource: getPrioritySourceLabel({ scheduledRelevant: true }),
      remainingTimeMinutes,
      scheduledRelevant: true,
      isExpedite: false,
      sortTime: scheduledStart?.getTime() || fallbackSortTime,
      scheduledWindow: getScheduledWindowLabel(ticket),
    };
  }

  if (remainingTimeMinutes != null && remainingTimeMinutes < highRiskMinutes) {
    return {
      included: true,
      priorityBucket: 5,
      criticalityLevel: 'high',
      criticalityReasonCode: 'REMAINING_TIME_LT_24H',
      criticalityReason: 'Remaining Time Risk',
      prioritySource: getPrioritySourceLabel({ remainingTimeMinutes }),
      remainingTimeMinutes,
      scheduledRelevant: false,
      isExpedite: false,
      sortTime: fallbackSortTime,
      scheduledWindow: getScheduledWindowLabel(ticket),
    };
  }

  if (criticalWindowMinutes > 24 * 60 && remainingTimeMinutes != null && remainingTimeMinutes < mediumRiskMinutes) {
    return {
      included: true,
      priorityBucket: 6,
      criticalityLevel: 'medium',
      criticalityReasonCode: 'REMAINING_TIME_LT_48H',
      criticalityReason: 'Remaining Time Risk',
      prioritySource: getPrioritySourceLabel({ remainingTimeMinutes }),
      remainingTimeMinutes,
      scheduledRelevant: false,
      isExpedite: false,
      sortTime: fallbackSortTime,
      scheduledWindow: getScheduledWindowLabel(ticket),
    };
  }

  if (criticalWindowMinutes > mediumRiskMinutes && remainingTimeMinutes != null && remainingTimeMinutes < criticalWindowMinutes) {
    return {
      included: true,
      priorityBucket: 7,
      criticalityLevel: 'medium',
      criticalityReasonCode: 'REMAINING_TIME_LT_72H',
      criticalityReason: 'Remaining Time Risk',
      prioritySource: getPrioritySourceLabel({ remainingTimeMinutes }),
      remainingTimeMinutes,
      scheduledRelevant: false,
      isExpedite: false,
      sortTime: fallbackSortTime,
      scheduledWindow: getScheduledWindowLabel(ticket),
    };
  }

  if (troubleTicket && severityRank === 8) {
    return {
      included: true,
      priorityBucket: 8,
      criticalityLevel: 'medium',
      criticalityReasonCode: 'INCIDENT_SEVERITY',
      criticalityReason: 'Incident Severity',
      prioritySource: getPrioritySourceLabel({ troubleTicket: true }),
      remainingTimeMinutes: null,
      scheduledRelevant: false,
      isExpedite: false,
      sortTime: fallbackSortTime,
      scheduledWindow: getScheduledWindowLabel(ticket),
    };
  }

  return {
    included: false,
    priorityBucket: null,
    criticalityLevel: null,
    criticalityReasonCode: null,
    criticalityReason: null,
    prioritySource: null,
    remainingTimeMinutes,
    scheduledRelevant,
    isExpedite: expedite,
    sortTime: fallbackSortTime,
    scheduledWindow: getScheduledWindowLabel(ticket),
  };
}

export function compareCriticalTickets(left, right) {
  const leftSortTime = Number.isFinite(left.classification.sortTime)
    ? left.classification.sortTime
    : Number.MAX_SAFE_INTEGER;
  const rightSortTime = Number.isFinite(right.classification.sortTime)
    ? right.classification.sortTime
    : Number.MAX_SAFE_INTEGER;

  if (leftSortTime !== rightSortTime) {
    return leftSortTime - rightSortTime;
  }

  if (left.classification.priorityBucket !== right.classification.priorityBucket) {
    const leftBucket = Number.isFinite(left.classification.priorityBucket)
      ? left.classification.priorityBucket
      : Number.MAX_SAFE_INTEGER;
    const rightBucket = Number.isFinite(right.classification.priorityBucket)
      ? right.classification.priorityBucket
      : Number.MAX_SAFE_INTEGER;
    return leftBucket - rightBucket;
  }

  const leftId = getTextValue(left.ticket, 'external_id', 'ticketNumber', 'activity_no', 'id') || '';
  const rightId = getTextValue(right.ticket, 'external_id', 'ticketNumber', 'activity_no', 'id') || '';
  return leftId.localeCompare(rightId);
}

export function buildLogicStatus({ enabled, mode, latestRunStatus }) {
  if (latestRunStatus === 'failed') return 'ERROR';
  if (!enabled) return 'OFFLINE';
  if (mode === 'live') return 'LIVE';
  return 'DRY RUN';
}

export function buildOdinTicketStatus(decision) {
  if (!decision) return 'WAITING';

  switch (decision.result) {
    case 'assigned':
      return 'ASSIGNED';
    case 'manual_review':
    case 'no_candidate':
    case 'blocked':
      return 'BLOCKED';
    case 'not_relevant':
      return 'EXCLUDED';
    case 'error':
    case 'crawler_stale':
      return 'RETRY_PENDING';
    default:
      return 'ANALYZING';
  }
}

export function buildCriticalWorkloadSummary(entries = [], criticalWindowHours = DEFAULT_CRITICAL_WINDOW_HOURS) {
  const criticalWindowMinutes = normalizeCriticalWindowHours(criticalWindowHours) * 60;

  return entries.reduce((summary, entry) => {
    const classification = entry.classification || entry;
    const odinStatus = entry.odinStatus || 'ANALYZING';
    if (classification.priorityBucket === 1) summary.ttHigh += 1;
    if (classification.priorityBucket === 2) summary.ttMedium += 1;
    if (classification.isExpedite) summary.expedites += 1;
    if (classification.remainingTimeMinutes != null && classification.remainingTimeMinutes < 24 * 60) summary.lt24h += 1;
    if (classification.remainingTimeMinutes != null && classification.remainingTimeMinutes < criticalWindowMinutes) summary.lt72h += 1;
    if (odinStatus !== 'ASSIGNED' && odinStatus !== 'EXCLUDED') summary.unassignedCritical += 1;
    if (odinStatus === 'BLOCKED') summary.blocked += 1;
    summary.totalCritical += 1;
    return summary;
  }, {
    ttHigh: 0,
    ttMedium: 0,
    expedites: 0,
    lt24h: 0,
    lt72h: 0,
    unassignedCritical: 0,
    blocked: 0,
    totalCritical: 0,
  });
}

function formatShiftWindow(window) {
  if (!window) return null;
  return {
    code: window.code,
    start: window.start.toISOString(),
    end: window.end.toISOString(),
  };
}

export function buildEmptyCriticalWorkloadSnapshot(now = new Date()) {
  const shiftContext = getShiftContext(now);
  return {
    generatedAt: now.toISOString(),
    criticalWindowHours: DEFAULT_CRITICAL_WINDOW_HOURS,
    assignmentVisualization: { ...DEFAULT_ASSIGNMENT_VISUALIZATION },
    logicStatus: 'OFFLINE',
    latestRun: null,
    crawler: {
      lastUpdate: null,
      isStale: false,
      ageMinutes: null,
      thresholdMinutes: Math.round(CRAWLER_MAX_AGE_MS / 60000),
    },
    shiftplan: {
      lastUpdate: null,
    },
    shift: {
      current: formatShiftWindow(shiftContext.currentShift),
      next: formatShiftWindow(shiftContext.nextShift),
      remainingShiftTimeMinutes: shiftContext.remainingShiftTimeMinutes,
    },
    teams: {
      configured: false,
      active: false,
      sentToday: 0,
    },
    summary: buildCriticalWorkloadSummary([], DEFAULT_CRITICAL_WINDOW_HOURS),
    tickets: [],
  };
}

function mapQueueTicketType(ticket) {
  const queueType = normalizeText(ticket?.queue_type || ticket?.queueType || ticket?.type || ticket?.ticket_type);
  if (queueType.includes('trouble')) return 'Trouble Ticket';
  if (queueType.includes('smart')) return 'Smart Hands';
  if (queueType.includes('cc') || queueType.includes('cross')) return 'Cross Connect';
  if (getScheduledStart(ticket)) return 'Scheduled';
  return getTextValue(ticket, 'queue_type', 'type', 'ticket_type') || 'Other';
}

function buildReasonCode(rule, fallback = 'UNKNOWN') {
  const normalized = normalizeText(rule);
  const explicitMap = {
    rolefilter: 'ROLE_EXCLUSION',
    checkrole: 'ROLE_EXCLUSION',
    isverified: 'NOT_VERIFIED',
    isshiftactive: 'SHIFT_INACTIVE',
    isnotnearshiftend: 'SHIFT_ENDING_SOON',
    samesystemlimit: 'SYSTEM_NAME_CAP_REACHED',
    hasusermapping: 'USER_MAPPING_MISSING',
    isworkerautoassignable: 'AUTO_ASSIGNMENT_DISABLED',
    isavailable: 'EMPLOYEE_BLOCKED',
    isnotonbreak: 'ON_BREAK',
    isnotabsent: 'ABSENT',
    matchessite: 'SITE_MISMATCH',
    matchesresponsibility: 'RESPONSIBILITY_MISMATCH',
    checkticketcapacity: 'WORKLOAD_CAPACITY_REACHED',
    ticketcapacity: 'WORKLOAD_CAPACITY_REACHED',
    queuepurity: 'QUEUE_PURITY_CONFLICT',
  };

  if (explicitMap[normalized]) return explicitMap[normalized];
  if (!normalized) return fallback;
  return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase() || fallback;
}

function mapTimelineStatus(status, result) {
  const normalized = normalizeText(status);
  if (normalized === 'done') return result === 'error' ? 'warning' : 'passed';
  if (normalized === 'skipped') return 'failed';
  return 'pending';
}

function readCount(summary, preferredKeys = []) {
  if (!summary || typeof summary !== 'object') return null;

  for (const key of preferredKeys) {
    const parsed = Number(summary[key]);
    if (Number.isFinite(parsed)) return parsed;
  }

  for (const value of Object.values(summary)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function buildDecisionSteps(structured, classification, decision) {
  const steps = [
    {
      step: 'CRITICALITY_CLASSIFICATION',
      status: 'passed',
      title: 'Criticality classified',
      message: `${classification.criticalityReason} placed the ticket in priority bucket ${classification.priorityBucket}`,
      beforeCount: null,
      afterCount: null,
    },
  ];

  const prioritizationReason = structured?.ticketSelection?.selectedNextReason;
  if (prioritizationReason) {
    steps.push({
      step: 'PRIORITY_QUEUE_SELECTION',
      status: 'passed',
      title: 'Priority queue selected',
      message: prioritizationReason,
      beforeCount: structured?.ticketSelection?.totalEligibleTickets ?? null,
      afterCount: structured?.ticketSelection?.totalRemainingTickets ?? null,
    });
  }

  if (!structured?.decisionTrace || structured.decisionTrace.length === 0) {
    steps.push({
      step: 'TRACE_LOOKUP',
      status: 'pending',
      title: 'Assignment trace pending',
      message: decision
        ? 'Assignment trace is incomplete for this ticket'
        : 'No assignment trace is available for this ticket in the latest completed ODIN run',
      beforeCount: null,
      afterCount: null,
    });
    return steps;
  }

  for (const step of structured.decisionTrace) {
    steps.push({
      step: buildReasonCode(step.stepType || step.key, 'TRACE_STEP'),
      status: mapTimelineStatus(step.status, decision?.result),
      title: step.label,
      message: step.reason,
      beforeCount: readCount(step.inputSummary, ['candidateCount', 'remainingCandidateCount']),
      afterCount: readCount(step.outputSummary, ['candidateCount', 'remainingCandidateCount', 'excludedCandidateCount', 'assignedWorkerId']),
    });
  }

  return steps;
}

function buildCandidateEvaluations(structured, decision) {
  if (Array.isArray(structured?.candidateRanking) && structured.candidateRanking.length > 0) {
    return structured.candidateRanking.map((candidate) => ({
      employeeId: candidate.employeeId,
      name: candidate.employeeName,
      eligible: candidate.selectionBlocked !== true,
      score: null,
      finalRank: candidate.finalRank,
      selected: candidate.selected === true,
      reasons: [
        ...(Array.isArray(candidate.rankingFactors) ? candidate.rankingFactors : []),
        candidate.blockingReason,
      ].filter(Boolean),
    }));
  }

  const remainingIds = new Set((structured?.remainingCandidates || []).map((candidate) => candidate.id));
  return (structured?.initialCandidates || []).map((candidate) => ({
    employeeId: candidate.id,
    name: candidate.name,
    eligible: remainingIds.has(candidate.id),
    score: null,
    finalRank: null,
    selected: decision?.assigned_worker_id === candidate.id,
    reasons: remainingIds.has(candidate.id)
      ? ['Eligible candidate remaining after current ODIN filters']
      : ['Candidate did not remain in the final ODIN candidate set'],
  }));
}

function buildExcludedCandidates(structured) {
  return (structured?.excludedCandidateGroups || []).map((candidate) => ({
    employeeId: candidate.id,
    name: candidate.name,
    excluded: true,
    reasonCode: buildReasonCode(candidate.rules?.[0]),
    reasonLabel: Array.isArray(candidate.reasons) && candidate.reasons.length > 0
      ? candidate.reasons.join('; ')
      : 'Excluded by ODIN rule',
  }));
}

function buildAssignmentReasonSummary(decision, structured) {
  return decision?.short_reason
    || decision?.selection_reason
    || structured?.finalDecision?.shortReason
    || structured?.finalDecision?.selectionReason
    || null;
}

function buildNextAction({ decision, logicStatus, crawlerState }) {
  if (crawlerState.isStale) return 'Await fresh crawler data input';
  if (!decision) {
    if (logicStatus === 'OFFLINE') return 'ODIN logic is offline; no live decision trace is available';
    if (logicStatus === 'ERROR') return 'ODIN logic reported an error in the latest run; inspect run logs';
    return 'Await next ODIN assignment run for a full decision trace';
  }

  switch (decision.result) {
    case 'assigned':
      return 'Assignment completed';
    case 'manual_review':
      return 'Dispatcher manual review required';
    case 'no_candidate':
      return decision.selection_reason || 'Await eligible employee availability';
    case 'blocked':
      return decision.selection_reason || 'Ticket is blocked by active ODIN rule or override';
    case 'not_relevant':
      return 'Ticket excluded from automatic assignment';
    case 'error':
    case 'crawler_stale':
      return 'Retry pending after controlled ODIN failure';
    default:
      return decision.selection_reason || 'Further ODIN evaluation required';
  }
}

function buildTicketRecord({ ticket, classification, decision, structured, logicStatus, crawlerState }) {
  const activityId = getTextValue(ticket, 'activity_no', 'Activity #', 'external_id', 'id');
  const ticketNumber = getTextValue(ticket, 'external_id', 'ticketNumber', 'id');
  const selectedEngineer = decision?.assigned_worker_name
    ? {
        employeeId: decision.assigned_worker_id ?? null,
        name: decision.assigned_worker_name,
      }
    : null;

  return {
    ticketId: String(ticket.id),
    activityId,
    ticketNumber,
    ticketType: mapQueueTicketType(ticket),
    priority: normalizeSeverity(ticket) || null,
    severity: getTextValue(ticket, 'severity'),
    status: getTextValue(ticket, 'status'),
    systemName: getTextValue(ticket, 'system_name', 'systemName'),
    owner: getTextValue(ticket, 'owner', 'Owner'),
    revisedCommitDate: getTextValue(ticket, 'revised_commit_date', 'commit_date'),
    remainingTimeMinutes: classification.remainingTimeMinutes,
    scheduledWindow: classification.scheduledWindow,
    isExpedite: classification.isExpedite,
    isTroubleTicket: isTroubleTicket(ticket),
    criticalityLevel: classification.criticalityLevel,
    criticalityReason: classification.criticalityReason,
    criticalityReasonCode: classification.criticalityReasonCode,
    prioritySource: classification.prioritySource,
    priorityBucket: classification.priorityBucket,
    odinStatus: buildOdinTicketStatus(decision),
    selectedEngineer,
    assignmentResult: decision?.result || null,
    assignmentReasonSummary: buildAssignmentReasonSummary(decision, structured),
    decisionSteps: buildDecisionSteps(structured, classification, decision),
    candidateEvaluations: buildCandidateEvaluations(structured, decision),
    excludedCandidates: buildExcludedCandidates(structured),
    nextAction: buildNextAction({ decision, logicStatus, crawlerState }),
    runId: decision?.run_id || null,
    runMode: decision?.run_mode || null,
    traceAvailable: Boolean(decision),
  };
}

function pickLatestDecisionForTicket(ticket, decisions = []) {
  const ticketId = String(ticket.id);
  const externalId = getTextValue(ticket, 'external_id');

  return decisions.find((decision) => (
    (externalId && decision.external_id === externalId)
    || decision.ticket_id === ticketId
    || (externalId && decision.ticket_id === externalId)
  )) || null;
}

async function loadTeamsStatus(queryFn) {
  const hasWebhook = Boolean(process.env.TEAMS_CHANNEL_WEBHOOK || process.env.TEAMS_PERSONAL_WEBHOOK);
  const hasBotKey = Boolean(process.env.BOT_INTERNAL_API_KEY);
  const hasGraph = Boolean(
    (process.env.GRAPH_CLIENT_ID || process.env.CLIENT_ID || process.env.BOT_ID)
    && (process.env.GRAPH_CLIENT_SECRET || process.env.CLIENT_SECRET || process.env.CLIENT_PASSWORD)
    && (process.env.GRAPH_TENANT_ID || process.env.TENANT_ID || process.env.BOT_TENANT_ID)
    && (process.env.BOT_APP_ID || process.env.TEAMS_APP_ID)
  );
  const configured = hasWebhook || hasBotKey || hasGraph;

  let sentToday = 0;
  try {
    const { rows } = await queryFn(
      `SELECT COUNT(*) AS cnt FROM teams_message_log WHERE status = 'sent' AND sent_at >= CURRENT_DATE`
    );
    sentToday = Number.parseInt(String(rows[0]?.cnt || '0'), 10) || 0;
  } catch {
    sentToday = 0;
  }

  return {
    configured,
    active: configured,
    sentToday,
  };
}

export async function getCriticalWorkloadSnapshot({ queryFn, now = new Date() }) {
  if (typeof queryFn !== 'function') {
    throw new Error('getCriticalWorkloadSnapshot requires a queryFn');
  }

  const shiftContext = getShiftContext(now);

  const [
    assignmentSettingsResult,
    appSettingsResult,
    latestRunResult,
    crawlerResult,
    shiftplanResult,
    queueResult,
    teamsStatus,
  ] = await Promise.all([
    queryFn(
      `SELECT key, value FROM assignment_settings WHERE key IN ('assignment.enabled', 'assignment.mode', 'assignment.crawlerMaxAgeMinutes')`
    ),
    queryFn(
      `SELECT key, value
       FROM app_settings
       WHERE key = 'threshold.critical_ticket_window_hours'
          OR key LIKE 'tv.assignment_%'`
    ).catch(() => ({ rows: [] })),
    queryFn(
      `SELECT id, mode, status, started_at, finished_at, summary FROM assignment_runs ORDER BY started_at DESC LIMIT 1`
    ),
    queryFn(
      `SELECT snapshot_at FROM crawler_runs WHERE success = TRUE ORDER BY snapshot_at DESC LIMIT 1`
    ),
    queryFn(
      `SELECT uploaded_at FROM shiftplan_upload_log ORDER BY uploaded_at DESC LIMIT 1`
    ).catch(() => ({ rows: [] })),
    queryFn(
      `SELECT * FROM queue_items WHERE active = TRUE AND COALESCE(is_final_closed, FALSE) = FALSE ORDER BY updated_at DESC, id ASC`
    ),
    loadTeamsStatus(queryFn),
  ]);

  const settingsMap = Object.fromEntries((assignmentSettingsResult.rows || []).map((row) => [row.key, row.value]));
  const appSettingsMap = Object.fromEntries((appSettingsResult.rows || []).map((row) => [row.key, row.value]));
  const enabled = settingsMap['assignment.enabled'] === 'true';
  const mode = settingsMap['assignment.mode'] || 'shadow';
  const latestRun = latestRunResult.rows?.[0] || null;
  const crawlerLastUpdate = crawlerResult.rows?.[0]?.snapshot_at || null;
  const criticalWindowHours = normalizeCriticalWindowHours(appSettingsMap['threshold.critical_ticket_window_hours']);
  const assignmentVisualization = buildAssignmentVisualizationSettings(appSettingsMap);
  const crawlerThresholdMinutes = Number.parseInt(String(settingsMap['assignment.crawlerMaxAgeMinutes'] || ''), 10) || Math.round(CRAWLER_MAX_AGE_MS / 60000);
  const crawlerState = isCrawlerDataStale(crawlerLastUpdate, now, crawlerThresholdMinutes * 60000);
  const logicStatus = buildLogicStatus({ enabled, mode, latestRunStatus: latestRun?.status || null });

  const criticalCandidates = (queueResult.rows || [])
    .map((ticket) => ({
      ticket,
      classification: classifyCriticalTicket(ticket, now, shiftContext, criticalWindowHours),
    }))
    .filter((entry) => entry.classification.included)
    .sort(compareCriticalTickets);

  const externalIds = Array.from(new Set(
    criticalCandidates
      .map((entry) => getTextValue(entry.ticket, 'external_id'))
      .filter(Boolean)
  ));
  const internalIds = Array.from(new Set(criticalCandidates.map((entry) => String(entry.ticket.id))));

  let decisionRows = [];
  if (externalIds.length > 0 || internalIds.length > 0) {
    const decisionResult = await queryFn(
      `SELECT d.*, r.mode AS run_mode, r.status AS run_status, r.started_at AS run_started_at
       FROM assignment_ticket_decisions d
       JOIN assignment_runs r ON r.id = d.run_id
       WHERE ($1::text[] <> '{}'::text[] AND d.external_id = ANY($1::text[]))
          OR ($2::text[] <> '{}'::text[] AND d.ticket_id = ANY($2::text[]))
       ORDER BY d.decided_at DESC`,
      [externalIds, internalIds]
    );
    decisionRows = decisionResult.rows || [];
  }

  const tickets = criticalCandidates.map(({ ticket, classification }) => {
    const decision = pickLatestDecisionForTicket(ticket, decisionRows);
    const structured = decision ? buildTicketExplanation(decision).structured : null;
    return buildTicketRecord({
      ticket,
      classification,
      decision,
      structured,
      logicStatus,
      crawlerState,
    });
  });

  return {
    ...buildEmptyCriticalWorkloadSnapshot(now),
    criticalWindowHours,
    assignmentVisualization,
    logicStatus,
    latestRun: latestRun ? {
      id: latestRun.id,
      mode: latestRun.mode,
      status: latestRun.status,
      startedAt: latestRun.started_at,
      finishedAt: latestRun.finished_at,
      summary: latestRun.summary && typeof latestRun.summary === 'object' ? latestRun.summary : null,
    } : null,
    crawler: {
      lastUpdate: crawlerLastUpdate,
      isStale: crawlerState.isStale,
      ageMinutes: crawlerState.ageMinutes,
      thresholdMinutes: crawlerState.thresholdMinutes,
    },
    shiftplan: {
      lastUpdate: shiftplanResult.rows?.[0]?.uploaded_at || null,
    },
    teams: teamsStatus,
    summary: buildCriticalWorkloadSummary(tickets, criticalWindowHours),
    tickets,
  };
}
