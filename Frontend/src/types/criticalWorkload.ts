export interface CriticalWorkloadSummary {
  ttHigh: number;
  ttMedium: number;
  expedites: number;
  lt24h: number;
  lt72h: number;
  unassignedCritical: number;
  blocked: number;
  totalCritical: number;
}

export interface CriticalWorkloadRunSummary {
  id: number;
  mode: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  summary: Record<string, unknown> | null;
}

export interface CriticalWorkloadShiftWindow {
  code: string;
  start: string;
  end: string;
}

export interface CriticalWorkloadStep {
  step: string;
  status: 'passed' | 'pending' | 'warning' | 'failed';
  title: string;
  message: string | null;
  beforeCount: number | null;
  afterCount: number | null;
}

export interface CriticalWorkloadCandidateEvaluation {
  employeeId: string | null;
  name: string | null;
  eligible: boolean;
  score: number | null;
  finalRank: number | null;
  selected: boolean;
  reasons: string[];
}

export interface CriticalWorkloadExcludedCandidate {
  employeeId: string | null;
  name: string | null;
  excluded: boolean;
  reasonCode: string;
  reasonLabel: string;
}

export interface CriticalWorkloadEngineer {
  employeeId: string | null;
  name: string;
}

export interface CriticalWorkloadAssignmentVisualization {
  mode: 'enterprise' | 'gamified_wheel' | 'gamified_slot';
  animationSpeed: 'slow' | 'normal' | 'fast';
  celebrationIntensity: 'low' | 'medium' | 'high';
  autoFallbackToEnterprise: boolean;
  confettiEnabled: boolean;
  applauseEnabled: boolean;
  displayReasoningAfterAnimation: boolean;
}

export interface CriticalWorkloadTicket {
  ticketId: string;
  activityId: string | null;
  ticketNumber: string | null;
  ticketType: string;
  priority: string | null;
  severity: string | null;
  status: string | null;
  systemName: string | null;
  owner: string | null;
  revisedCommitDate: string | null;
  remainingTimeMinutes: number | null;
  scheduledWindow: string | null;
  isExpedite: boolean;
  isTroubleTicket: boolean;
  criticalityLevel: 'critical' | 'high' | 'medium' | null;
  criticalityReason: string | null;
  criticalityReasonCode: string | null;
  prioritySource: string | null;
  priorityBucket: number | null;
  odinStatus: 'ASSIGNED' | 'BLOCKED' | 'EXCLUDED' | 'RETRY_PENDING' | 'ANALYZING';
  selectedEngineer: CriticalWorkloadEngineer | null;
  assignmentResult: string | null;
  assignmentReasonSummary: string | null;
  decisionSteps: CriticalWorkloadStep[];
  candidateEvaluations: CriticalWorkloadCandidateEvaluation[];
  excludedCandidates: CriticalWorkloadExcludedCandidate[];
  nextAction: string | null;
  runId: number | null;
  runMode: string | null;
  traceAvailable: boolean;
}

export interface CriticalWorkloadSnapshot {
  generatedAt: string;
  criticalWindowHours: number;
  assignmentVisualization: CriticalWorkloadAssignmentVisualization;
  logicStatus: 'LIVE' | 'SHADOW' | 'OFFLINE' | 'ERROR';
  latestRun: CriticalWorkloadRunSummary | null;
  crawler: {
    lastUpdate: string | null;
    isStale: boolean;
    ageMinutes: number | null;
    thresholdMinutes: number;
  };
  shiftplan: {
    lastUpdate: string | null;
  };
  shift: {
    current: CriticalWorkloadShiftWindow | null;
    next: CriticalWorkloadShiftWindow | null;
    remainingShiftTimeMinutes: number | null;
  };
  teams: {
    configured: boolean;
    active: boolean;
    sentToday: number;
  };
  summary: CriticalWorkloadSummary;
  tickets: CriticalWorkloadTicket[];
}