/* ================================================ */
/* Assignment Writeback — Frontend Type Definitions  */
/* ================================================ */

export type WritebackMode =
  | 'shadow_only'
  | 'manual_confirm'
  | 'assisted_auto'
  | 'full_auto';

export type ActionType = 'assign' | 'unassign' | 'reassign' | 'no_op';

export type ExecutionStatus =
  | 'pending'
  | 'shadow_validated'
  | 'validation_failed'
  | 'waiting_for_manual_confirmation'
  | 'approved_for_execution'
  | 'executing'
  | 'already_correctly_assigned'
  | 'assigned_successfully'
  | 'unassign_required'
  | 'unassigning'
  | 'unassigned_successfully'
  | 'reassign_required'
  | 'reassigning'
  | 'reassigned_successfully'
  | 'blocked_existing_owner'
  | 'blocked_human_owner_conflict'
  | 'manual_review_required'
  | 'failed_verification'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type ValidationStatus = 'pending' | 'passed' | 'failed';

export interface AssignmentAction {
  id: number;
  ticket_id: string | null;
  activity_number: string;
  sales_order_number: string | null;
  queue_type: string | null;
  sub_type: string | null;
  system_name: string | null;
  current_jarvis_owner_code: string | null;
  expected_previous_owner_code: string | null;
  selected_employee_id: number | null;
  selected_employee_name: string | null;
  selected_employee_email: string | null;
  selected_employee_jarvis_display_name: string | null;
  selected_employee_jarvis_owner_code: string | null;
  selected_employee_jarvis_initials: string | null;
  action_type: ActionType;
  execution_mode: WritebackMode;
  decision_source: string | null;
  decision_trace_json: Record<string, unknown> | null;
  validation_status: ValidationStatus;
  validation_errors_json: string[] | null;
  execution_status: ExecutionStatus;
  external_write_status: string | null;
  previous_external_assignee: string | null;
  new_external_assignee: string | null;
  hard_reassign_reason: string | null;
  created_at: string;
  validated_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  executed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  retry_count: number;
  last_error: string | null;
  created_by_logic_run_id: number | null;
  lock_version: number;
}

export interface AssignmentAuditLog {
  id: number;
  assignment_action_id: number | null;
  ticket_id: string | null;
  activity_number: string | null;
  event_type: string;
  message: string | null;
  before_state_json: Record<string, unknown> | null;
  after_state_json: Record<string, unknown> | null;
  validation_json: Record<string, unknown> | null;
  screenshot_path: string | null;
  diagnostic_html_path: string | null;
  created_at: string;
}

export interface WritebackSettings {
  enabled: boolean;
  mode: WritebackMode;
  killSwitch: boolean;
  allowOverwriteExistingAssignee: boolean;
  allowAutoUnassign: boolean;
  allowAutoReassign: boolean;
  maxExecutionRetries: number;
  requireFreshCrawlerData: boolean;
  maxSnapshotAgeMinutes: number;
  queueEnabled: {
    smartHands: boolean;
    crossConnect: boolean;
    trouble: boolean;
    deinstall: boolean;
  };
  allowOtherTeamsAssignment: boolean;
  requireManualApprovalForUnassign: boolean;
  requireManualApprovalForReassign: boolean;
  raw: Record<string, string>;
}

export interface ReconcileItem {
  activityNumber: string;
  state:
    | 'unassigned_no_action'
    | 'assigned_no_action'
    | 'pending_assignment'
    | 'correctly_assigned'
    | 'unknown_owner_conflict'
    | 'owner_ineligible'
    | 'human_conflict'
    | 'missing_from_snapshot';
  jarvisOwner: string | null;
  action?: AssignmentAction;
  message?: string;
  hardReason?: string;
  ownerEmployee?: { id: number; name: string };
}

export interface ReconcileResult {
  snapshotCount: number;
  actionCount: number;
  items: ReconcileItem[];
  settings: { mode: WritebackMode; enabled: boolean; killSwitch: boolean };
  error?: string;
}
