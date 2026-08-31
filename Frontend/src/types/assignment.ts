/* ================================================ */
/* Assignment Engine — Frontend Type Definitions     */
/* ================================================ */

/* ---- Enums / Literal Types ---- */

export type AssignmentMode = 'shadow' | 'live' | 'dry-run';
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type DecisionResult = 'assigned' | 'manual_review' | 'no_candidate' | 'not_relevant' | 'blocked' | 'error' | 'crawler_stale';
export type TicketType = 'TroubleTicket' | 'SmartHands' | 'CrossConnect' | 'Other' | 'Unknown';
export type TicketStatus = 'open' | 'active' | 'pending' | 'closed' | 'cancelled' | 'unknown';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical' | 'unknown';
export type OverrideType = 'force_assign' | 'force_block' | 'force_manual';

/* ---- Settings ---- */

export interface AssignmentSettings {
  'assignment.mode': AssignmentMode;
  'assignment.siteStrictness': string;
  'assignment.responsibilityStrictness': string;
  'assignment.enableRotationTieBreaker': string;
  'assignment.fallbackTieBreaker': string;
  'assignment.planningWindowHours': string;
  'assignment.currentShiftOnly': string;
  'assignment.maxTicketsPerRun': string;
  'assignment.stopOnCriticalError': string;
  'assignment.supportedTicketTypes': string;
  'assignment.crawlerMaxAgeMinutes': string;
  'assignment.enableLiveMode': string;
  'assignment.enabled': string;
  'assignment.insufficientResources': string;
  'assignment.cutoffMinutesBeforeShiftEnd': string;
  'assignment.maxSameSystemSmartHands': string;
  'assignment.maxSameSystemCrossConnect': string;
  'writeback.enabled': string;
  'writeback.mode': string;
  'writeback.killSwitch': string;
  'writeback.allowOverwriteExistingAssignee': string;
  'writeback.allowAutoUnassign': string;
  'writeback.allowAutoReassign': string;
  'writeback.maxExecutionRetries': string;
  'writeback.requireFreshCrawlerData': string;
  'writeback.maxSnapshotAgeMinutes': string;
  'writeback.queueEnabled.smartHands': string;
  'writeback.queueEnabled.crossConnect': string;
  'writeback.queueEnabled.trouble': string;
  'writeback.queueEnabled.deinstall': string;
  'writeback.allowOtherTeamsAssignment': string;
  'writeback.requireManualApprovalForUnassign': string;
  'writeback.requireManualApprovalForReassign': string;
  'writeback.pilot.enabled': string;
  'writeback.pilot.employeeSelector': string;
  [key: string]: string;
}

export interface AssignmentSettingRow {
  key: string;
  value: string;
  description?: string;
  updated_at?: string;
  updated_by?: string;
}

/* ---- Runs ---- */

export interface AssignmentRun {
  id: number;
  mode: AssignmentMode;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  total_tickets: number;
  relevant: number;
  assigned: number;
  manual_review: number;
  no_candidate: number;
  not_relevant: number;
  blocked: number;
  errors: number;
  triggered_by: string | null;
  summary: Record<string, unknown> | null;
  failure_reason: string | null;
  failure_step: string | null;
  error_category: string | null;
  created_at: string;
}

/* ---- Decisions ---- */

export interface CandidateRef {
  id: number;
  name: string;
  role?: string | null;
  weekplanRole?: string | null;
  shiftCode?: string | null;
  shiftPlanningDate?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  shiftActive?: boolean;
  planningSource?: string | null;
  userMapped?: boolean;
  plannedEmployeeName?: string | null;
  currentLoad?: number | null;
}

export interface ExcludedCandidate {
  id: number;
  name: string;
  reason: string;
  rule?: string;
  role?: string | null;
  weekplanRole?: string | null;
  shiftCode?: string | null;
  shiftPlanningDate?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  shiftActive?: boolean;
  planningSource?: string | null;
  userMapped?: boolean;
  plannedEmployeeName?: string | null;
}

export interface ExcludedCandidateGroup extends CandidateRef {
  rules: string[];
  reasons: string[];
}

export interface DecisionTraceStep {
  key: string;
  label: string;
  status: 'done' | 'pending' | 'skipped';
  reason: string;
  stepOrder?: number;
  stepType?: string;
  inputSummary?: Record<string, unknown> | null;
  outputSummary?: Record<string, unknown> | null;
  timestamp?: string | null;
}

export interface DecisionTraceFactor {
  key: string;
  label: string;
  value: unknown;
  detail?: string | null;
  emphasis?: string | null;
}

export interface DecisionComparedTicket {
  ticketId: string | null;
  displayTicketNumber: string | null;
  ticketType?: string | null;
  ticketPriority?: string | null;
  priorityTier?: number | null;
  rank?: number | null;
  selectedFirstBy?: string | null;
  factors: DecisionTraceFactor[];
}

export interface TicketSelectionTrace {
  prioritizationRank: number | null;
  totalEligibleTickets: number | null;
  totalRemainingTickets: number | null;
  priorityTier: number | null;
  selectedNextReason: string | null;
  prioritizationFactors: DecisionTraceFactor[];
  comparedTickets: DecisionComparedTicket[];
}

export interface CandidateSummaryTrace {
  initialCandidateCount: number;
  excludedCandidateCount: number;
  exclusionEventCount: number;
  survivingCandidateCount: number;
  selectedCandidateCount: number;
}

export interface CandidateRankingEntry {
  employeeId: number | null;
  employeeName: string | null;
  role?: string | null;
  weekplanRole?: string | null;
  shiftCode?: string | null;
  shiftPlanningDate?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  workload?: number | null;
  groupingScore?: number | null;
  queuePure?: boolean | null;
  colleagueScore?: number | null;
  selectionBlocked: boolean;
  blockingReason?: string | null;
  rankingFactors: string[];
  scoreBreakdown: Record<string, unknown>;
  finalRank: number | null;
  selected: boolean;
}

export interface DecisionConfigSnapshot {
  mode?: string | null;
  currentShiftOnly?: boolean | null;
  planningWindowHours?: number | null;
  siteStrictness?: boolean | null;
  responsibilityStrictness?: boolean | null;
  enableRotationTieBreaker?: boolean | null;
  fallbackTieBreaker?: string | null;
  insufficientResources?: boolean | null;
  verificationEnabled?: boolean | null;
  pendingBlocksAssignment?: boolean | null;
}

export interface FinalDecisionTrace {
  result: string;
  assignedWorkerId: number | null;
  assignedWorkerName: string | null;
  tieBreaker?: string | null;
  selectionReason: string | null;
  shortReason: string | null;
  noAssignmentReason: string | null;
}

export interface AssignmentStructuredTrace {
  version: number;
  generatedAt: string | null;
  configSnapshot: DecisionConfigSnapshot;
  ticketSelection: TicketSelectionTrace | null;
  candidateSummary: CandidateSummaryTrace;
  candidateRanking: CandidateRankingEntry[];
  finalDecision: FinalDecisionTrace;
  timeline: DecisionTraceStep[];
}

export interface AssignmentTicketContext {
  queueOrigin: string | null;
  systemName: string | null;
  activity: string | null;
  currentOwner: string | null;
  recommendedOwner: string | null;
  remainingHours: number | null;
  remainingTimeLabel: string | null;
  dueAt: string | null;
  revisedCommitDate: string | null;
  scheduledStart: string | null;
  customerTroubleType: string | null;
  customerName: string | null;
  mode: AssignmentMode | null | string;
  /** Aliases used by getDecisionContext / UI rendering */
  queue?: string | null;
  category?: string | null;
  owner?: string | null;
  remainingTime?: string | null;
}

export interface AssignmentDecision {
  id: number;
  run_id: number;
  ticket_id: string;
  external_id: string | null;
  ticket_type: string | null;
  ticket_status: string | null;
  ticket_priority: string | null;
  ticket_site: string | null;
  result: DecisionResult;
  assigned_worker_id: number | null;
  assigned_worker_name: string | null;
  selection_reason: string | null;
  short_reason: string | null;
  rule_path: string[] | null;
  initial_candidates: CandidateRef[] | null;
  excluded_candidates: ExcludedCandidate[] | null;
  remaining_candidates: CandidateRef[] | null;
  normalization_warnings: string[] | null;
  normalized_ticket: Record<string, unknown> | null;
  raw_ticket: Record<string, unknown> | null;
  error_message: string | null;
  decision_trace?: AssignmentStructuredTrace | null;
  decided_at: string;
  run_mode?: AssignmentMode | null;
}

/* ---- Explanation ---- */

export interface TicketExplanationStructured {
  displayTicketNumber: string | null;
  ticketId: string;
  externalId: string | null;
  queueOrigin: string | null;
  mode?: AssignmentMode | null | string;
  result: DecisionResult;
  shortReason: string | null;
  ticketType: string | null;
  ticketStatus: string | null;
  ticketPriority: string | null;
  ticketSite: string | null;
  ticketContext: AssignmentTicketContext;
  decisionTrace: DecisionTraceStep[];
  traceModel: AssignmentStructuredTrace;
  ticketSelection: TicketSelectionTrace | null;
  candidateSummary: CandidateSummaryTrace;
  candidateRanking: CandidateRankingEntry[];
  configSnapshot: DecisionConfigSnapshot;
  finalDecision: FinalDecisionTrace;
  normalizationWarnings: string[];
  initialCandidates: CandidateRef[];
  excludedCandidates: ExcludedCandidate[];
  excludedCandidateGroups: ExcludedCandidateGroup[];
  remainingCandidates: CandidateRef[];
  assignedWorkerName: string | null;
  assignedWorkerId: number | null;
  selectionReason: string | null;
  rulePath: string[];
  errorMessage: string | null;
  normalizedTicket: Record<string, unknown> | null;
  rawTicket: Record<string, unknown> | null;
}

export interface TicketExplanation {
  found: boolean;
  decision?: AssignmentDecision;
  explanation?: {
    markdown: string;
    structured: TicketExplanationStructured;
  };
  message?: string;
}

/* ---- Overrides ---- */

export interface AssignmentOverride {
  id: number;
  ticket_id: string;
  override_type: OverrideType;
  target_worker_id: number | null;
  reason: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  deactivated_at: string | null;
  deactivated_by: string | null;
}

/* ---- Health ---- */

export interface AssignmentHealth {
  ok: boolean;
  module: string;
  phase: number;
  mode: AssignmentMode;
  enabled?: boolean;
  schedulerRunning?: boolean;
  schedulerBusy?: boolean;
  schedulerIntervalSeconds?: number;
  settingsCount: number;
  lastStartedAt?: string | null;
  lastStartedBy?: string | null;
  lastStoppedAt?: string | null;
  lastStoppedBy?: string | null;
}

/* ---- Filters ---- */

export interface AssignmentFilters {
  runMode?: AssignmentMode;
  runStatus?: RunStatus;
  decisionResult?: DecisionResult;
  selectedRunId?: number;
  dateFrom?: string;
  dateTo?: string;
}
