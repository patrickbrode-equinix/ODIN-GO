/* ================================================ */
/* Assignment Engine — Constants                    */
/* ================================================ */

export const TICKET_TYPES = ['TroubleTicket', 'SmartHands', 'CrossConnect', 'Scheduled', 'Other', 'Unknown'];
export const SUPPORTED_TICKET_TYPES = ['TroubleTicket', 'SmartHands', 'CrossConnect', 'Scheduled', 'Other'];
export const SUPPORTED_QUEUE_ITEM_TYPES = ['SmartHands', 'CCInstalls', 'TroubleTickets', 'Deinstall'];

export const TICKET_STATUSES = ['open', 'active', 'pending', 'closed', 'cancelled', 'unknown'];
export const ACTIVE_STATUSES = ['open', 'active', 'pending'];
export const CLOSED_STATUSES = ['closed', 'cancelled'];

export const PRIORITIES = ['low', 'medium', 'high', 'critical', 'unknown'];
export const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };

export const DECISION_RESULTS = ['assigned', 'manual_review', 'no_candidate', 'not_relevant', 'blocked', 'error', 'crawler_stale'];

export const ENGINE_MODES = ['shadow', 'live', 'dry-run'];

export const RUN_STATUSES = ['running', 'completed', 'failed', 'cancelled'];

/* ---- Handover types ---- */
export const HANDOVER_TYPES = {
  WORKLOAD: 'workload',
  TERMINATED: 'terminated',
  OTHER_TEAMS: 'other_teams',
};

/* ---- Staff roles ---- */
export const STAFF_ROLES = {
  DISPATCHER: 'dispatcher',
  LARGE_ORDER: 'large_order',
  PROJECT: 'project',
  LEADS: 'leads',
  DEUTSCHE_BOERSE: 'deutsche_boerse',
  CROSS_CONNECT: 'cross_connect',
  KOLO: 'kolo',
  BUDDY: 'buddy',
  NEUSTARTER: 'neustarter',
  SUPPORT: 'support',
  NORMAL: 'normal',
};

/** Roles that never receive normal auto-assigned tickets */
export const EXCLUDED_ROLES = new Set([
  STAFF_ROLES.LARGE_ORDER,
  STAFF_ROLES.PROJECT,
  STAFF_ROLES.LEADS,
]);

/* ---- Crawler staleness ---- */
export const CRAWLER_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/* ---- System grouping thresholds ---- */
export const MAX_SH_PER_WORKER_PER_SYSTEM = 3;
export const SIMILAR_TIME_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours
export const MS_24H = 24 * 60 * 60 * 1000;

/**
 * Ticket priority tiers for the spec-defined priority order:
 *   1. TroubleTicket High (& Critical)
 *   2. TroubleTicket Medium
 *   3. KPI queues (SmartHands, CrossConnect) sorted by remaining time
 *   4. Scheduled tickets
 *   5. TroubleTicket Low
 *   6. Everything else
 */
export const PRIORITY_TIERS = {
  TT_HIGH: 1,
  TT_MEDIUM: 2,
  KPI_QUEUE: 3,
  SCHEDULED: 4,
  TT_LOW: 5,
  OTHER: 6,
};

/** @deprecated Use PRIORITY_TIERS + getPriorityTier() instead */
export const TYPE_SORT_ORDER = {
  TroubleTicket: 0,
  CrossConnect: 1,
  SmartHands: 2,
  Scheduled: 3,
  Other: 4,
  Unknown: 5,
};

/** Default settings keys */
export const SETTINGS_KEYS = {
  MODE: 'assignment.mode',
  SITE_STRICTNESS: 'assignment.siteStrictness',
  RESPONSIBILITY_STRICTNESS: 'assignment.responsibilityStrictness',
  ENABLE_ROTATION: 'assignment.enableRotationTieBreaker',
  FALLBACK_TIE: 'assignment.fallbackTieBreaker',
  PLANNING_WINDOW: 'assignment.planningWindowHours',
  CURRENT_SHIFT_ONLY: 'assignment.currentShiftOnly',
  MAX_TICKETS: 'assignment.maxTicketsPerRun',
  STOP_ON_ERROR: 'assignment.stopOnCriticalError',
  SUPPORTED_TYPES: 'assignment.supportedTicketTypes',
  CRAWLER_MAX_AGE: 'assignment.crawlerMaxAgeMinutes',
  ENABLE_LIVE: 'assignment.enableLiveMode',
  INSUFFICIENT_RESOURCES: 'assignment.insufficientResources',
  /* Shift-end cutoff: minutes before shift end to stop new assignments */
  CUTOFF_MINUTES_BEFORE_SHIFT_END: 'assignment.cutoffMinutesBeforeShiftEnd',
  /* Max tickets with same system_name per worker — SmartHands */
  MAX_SAME_SYSTEM_SMART_HANDS: 'assignment.maxSameSystemSmartHands',
  /* Max tickets with same system_name per worker — CrossConnect */
  MAX_SAME_SYSTEM_CROSS_CONNECT: 'assignment.maxSameSystemCrossConnect',
  /* Engine status keys */
  ENABLED: 'assignment.enabled',
  LAST_STARTED_AT: 'assignment.lastStartedAt',
  LAST_STARTED_BY: 'assignment.lastStartedBy',
  LAST_STOPPED_AT: 'assignment.lastStoppedAt',
  LAST_STOPPED_BY: 'assignment.lastStoppedBy',
  WRITEBACK_ENABLED: 'writeback.enabled',
  WRITEBACK_MODE: 'writeback.mode',
  WRITEBACK_KILL_SWITCH: 'writeback.killSwitch',
  WRITEBACK_ALLOW_OVERWRITE_EXISTING_ASSIGNEE: 'writeback.allowOverwriteExistingAssignee',
  WRITEBACK_ALLOW_AUTO_UNASSIGN: 'writeback.allowAutoUnassign',
  WRITEBACK_ALLOW_AUTO_REASSIGN: 'writeback.allowAutoReassign',
  WRITEBACK_MAX_EXECUTION_RETRIES: 'writeback.maxExecutionRetries',
  WRITEBACK_REQUIRE_FRESH_CRAWLER_DATA: 'writeback.requireFreshCrawlerData',
  WRITEBACK_MAX_SNAPSHOT_AGE_MINUTES: 'writeback.maxSnapshotAgeMinutes',
  WRITEBACK_QUEUE_SMART_HANDS: 'writeback.queueEnabled.smartHands',
  WRITEBACK_QUEUE_CROSS_CONNECT: 'writeback.queueEnabled.crossConnect',
  WRITEBACK_QUEUE_TROUBLE: 'writeback.queueEnabled.trouble',
  WRITEBACK_QUEUE_DEINSTALL: 'writeback.queueEnabled.deinstall',
  WRITEBACK_ALLOW_OTHER_TEAMS_ASSIGNMENT: 'writeback.allowOtherTeamsAssignment',
  WRITEBACK_REQUIRE_MANUAL_APPROVAL_UNASSIGN: 'writeback.requireManualApprovalForUnassign',
  WRITEBACK_REQUIRE_MANUAL_APPROVAL_REASSIGN: 'writeback.requireManualApprovalForReassign',
  WRITEBACK_PILOT_ENABLED: 'writeback.pilot.enabled',
  WRITEBACK_PILOT_EMPLOYEE_SELECTOR: 'writeback.pilot.employeeSelector',
};
