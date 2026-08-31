/* ================================================ */
/* Assignment Engine — Module Barrel Export          */
/* ================================================ */

// Config
export { TYPE_ALIASES, STATUS_ALIASES, PRIORITY_ALIASES, HANDOVER_ALIASES, ROLE_ALIASES } from './config.js';

// Constants
export {
  TICKET_TYPES, SUPPORTED_TICKET_TYPES,
  TICKET_STATUSES, ACTIVE_STATUSES, CLOSED_STATUSES,
  PRIORITIES, PRIORITY_ORDER,
  DECISION_RESULTS, ENGINE_MODES, RUN_STATUSES,
  TYPE_SORT_ORDER, SETTINGS_KEYS,
  HANDOVER_TYPES, STAFF_ROLES, EXCLUDED_ROLES,
  CRAWLER_MAX_AGE_MS, MAX_SH_PER_WORKER_PER_SYSTEM, SIMILAR_TIME_THRESHOLD_MS, MS_24H,
  PRIORITY_TIERS,
} from './constants.js';

// Errors
export { AssignmentError, NormalizationError, ValidationError, DecisionConflictError } from './errors.js';

// Normalization
export {
  normalizeTicket, validateNormalizedTicket,
  mapType, mapStatus, mapPriority, mapSite, mapDates, mapResponsibility, mapTicketId,
  mapHandoverType, mapScheduledStart, mapSystemName,
} from './normalization/normalizeTicket.js';

// Relevance
export { checkRelevance } from './relevance/checkRelevance.js';

// Candidates
export { loadCandidateWorkers, buildCandidatePool, loadWorkerCurrentTickets, loadLastCrawlerTimestamp, loadExclusionList, loadSubtypeExclusionList } from './candidates/loadCandidates.js';

// Eligibility
export {
  applyEligibilityRules,
  isWorkerAutoAssignable, isAvailable, isNotOnBreak, isNotAbsent,
  isShiftActive, matchesSite, matchesResponsibility,
  checkRole, checkQueueClean,
} from './eligibility/rules.js';

// Priority / Selection
export { sortTickets, selectWorker, resolveWorkerTie, getPriorityTier } from './priority/sortAndSelect.js';

// Rules
export { checkCrawlerFreshness } from './rules/crawlerGuard.js';
export { applyRoleFilter } from './rules/roleFilter.js';
export { checkExclusionList } from './rules/exclusionList.js';
export { routeHandover } from './rules/handoverRouter.js';
export { checkQueuePurity } from './rules/queuePurity.js';
export { evaluateSystemGrouping } from './rules/systemGrouping.js';

// Analytics
export { analyticsTracker } from './analytics/tracker.js';

// Logging
export { buildDecisionLog, buildRunSummary, buildTicketExplanation } from './logging/decisionLog.js';

// Persistence
export { persistAssignmentRun, persistTicketDecision, persistWorkerRotation, applyLiveAssignment } from './persistence/persist.js';

// Repositories
export {
  assignmentRunRepository,
  assignmentDecisionRepository,
  assignmentSettingsRepository,
  assignmentOverrideRepository,
  assignmentRotationRepository,
  assignmentExclusionRepository,
} from './repositories/index.js';

// Services
export { assignmentSettingsService, assignmentExplanationService, assignmentExclusionService } from './services/index.js';

// Engine
export { runAssignmentCycle } from './engine/runAssignmentCycle.js';
export { processTicket } from './engine/processTicket.js';
