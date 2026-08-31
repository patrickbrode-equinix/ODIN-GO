/* ================================================ */
/* Assignment Writeback — JarvisAssignmentExecutor  */
/* Orchestrates the full assign/unassign/reassign   */
/* flow via JarvisUiAdapter with audit at every     */
/* step. Never makes dangerous assumptions.         */
/* ================================================ */

import { assignmentActionRepository, EXECUTION_STATUSES } from './assignmentActionRepository.js';
import { assignmentAuditRepository, AUDIT_EVENTS } from './assignmentAuditRepository.js';
import { normalizeJarvisDisplayName } from './employeeMapper.js';

const ALLOWED_TICKET_STATUSES = ['Open', 'open', 'Active', 'active', 'In Progress', 'in_progress'];

/* ---- Helpers ---- */

async function audit(action, eventType, message, extra = {}) {
  await assignmentAuditRepository.log({
    assignmentActionId: action.id,
    ticketId: action.ticket_id,
    activityNumber: action.activity_number,
    eventType,
    message,
    ...extra,
  });
}

async function abortWithManualReview(action, reason, diagnostics = {}) {
  await assignmentActionRepository.updateStatus(
    action.id,
    EXECUTION_STATUSES.MANUAL_REVIEW_REQUIRED,
    { failure_reason: reason, failed_at: new Date() }
  );
  await audit(action, AUDIT_EVENTS.MANUAL_REVIEW_REQUIRED, reason, {
    validationJson: diagnostics,
  });
  return { success: false, status: EXECUTION_STATUSES.MANUAL_REVIEW_REQUIRED, reason };
}

async function abortWithFailure(action, reason, diagnostics = {}) {
  await assignmentActionRepository.updateStatus(
    action.id,
    EXECUTION_STATUSES.FAILED,
    { failure_reason: reason, failed_at: new Date() }
  );
  await audit(action, AUDIT_EVENTS.EXECUTION_FAILED, reason, {
    validationJson: diagnostics,
  });
  return { success: false, status: EXECUTION_STATUSES.FAILED, reason };
}

/* ================================================ */
/* ASSIGN FLOW                                      */
/* ================================================ */

/**
 * Execute a safe assign: open queue → find row → validate → open ticket →
 * open dialog → search staff → click Assign → verify queue Owner.
 */
async function executeAssign(action, adapter) {
  const {
    activity_number, sales_order_number, queue_type,
    sub_type, system_name,
    selected_employee_jarvis_display_name,
    selected_employee_jarvis_owner_code,
    selected_employee_jarvis_initials,
  } = action;

  // Load aliases if available (stored as JSON in action's decision_trace)
  const aliases = action.decision_trace_json?.jarvisDisplayNameAliases || [];

  // Step 1: Open queue
  await adapter.openQueue(queue_type);

  // Step 2: Find and validate queue row
  const row = await adapter.findQueueRow({
    activityNumber: activity_number,
    salesOrderNumber: sales_order_number,
    expectedSubType: sub_type,
    expectOwnerEmpty: true,
  });

  if (!row.found) {
    return abortWithManualReview(action, `Activity # ${activity_number} not found in queue`, row);
  }
  if (row.rowCount > 1) {
    return abortWithManualReview(action, `Activity # ${activity_number} appears ${row.rowCount} times — ambiguous`, row);
  }
  if (row.validationErrors.length > 0) {
    return abortWithManualReview(action, `Queue row validation failed: ${row.validationErrors.join('; ')}`, row);
  }
  if (row.ownerCode) {
    return abortWithManualReview(action,
      `Assign action blocked: ticket already has owner ${row.ownerCode} in queue`, row);
  }
  if (sales_order_number && row.salesOrderNumber && row.salesOrderNumber !== sales_order_number) {
    return abortWithManualReview(action,
      `SO # mismatch: expected ${sales_order_number}, got ${row.salesOrderNumber}`, row);
  }
  if (!ALLOWED_TICKET_STATUSES.includes(row.status)) {
    return abortWithManualReview(action, `Ticket status not allowed for assignment: ${row.status}`, row);
  }

  await audit(action, AUDIT_EVENTS.JARVIS_QUEUE_ROW_FOUND,
    `Queue row found and validated for Activity # ${activity_number}`, { afterStateJson: row });

  // Step 3: Open ticket detail
  const detail = await adapter.openTicketDetail({
    activityNumber: activity_number,
    salesOrderNumber: sales_order_number,
  });

  if (!detail.opened) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action, `Failed to open ticket detail: ${detail.validationErrors.join('; ')}`,
      { ...detail, ...diag });
  }
  if (detail.activityNumber !== activity_number) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `Ticket detail opened with wrong Activity #: expected ${activity_number}, got ${detail.activityNumber}`,
      { ...detail, ...diag });
  }
  if (!ALLOWED_TICKET_STATUSES.includes(detail.status)) {
    return abortWithManualReview(action, `Ticket detail status not allowed: ${detail.status}`, detail);
  }

  await audit(action, AUDIT_EVENTS.TICKET_DETAIL_OPENED,
    `Ticket detail opened and header validated`, { afterStateJson: detail });
  await audit(action, AUDIT_EVENTS.TICKET_DETAIL_VALIDATION_PASSED,
    'Ticket detail header matches expected values');

  // Step 4: Open assign dialog
  const dialog = await adapter.openAssignDialog();
  if (!dialog.opened) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `Assign Activity dialog did not open: ${dialog.validationErrors.join('; ')}`, { ...dialog, ...diag });
  }

  await audit(action, AUDIT_EVENTS.ASSIGN_DIALOG_OPENED, 'Assign Activity dialog opened with Staff tab active');

  // Step 5: Search for employee
  await audit(action, AUDIT_EVENTS.STAFF_SEARCH_STARTED,
    `Searching for: ${selected_employee_jarvis_display_name}`);

  const search = await adapter.searchStaffInDialog({
    jarvisDisplayName: selected_employee_jarvis_display_name,
    jarvisDisplayNameAliases: aliases,
  });

  if (!search.found) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `Target employee "${selected_employee_jarvis_display_name}" not found in Assign Activity dialog`,
      { ...search, ...diag });
  }
  if (search.matchCount > 1) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `Multiple employees matched "${selected_employee_jarvis_display_name}" — ambiguous`,
      { ...search, ...diag });
  }

  const normalizedMatch = normalizeJarvisDisplayName(search.matchedName || '');
  const normalizedExpected = normalizeJarvisDisplayName(selected_employee_jarvis_display_name || '');
  const aliasMatch = aliases.some(a => normalizeJarvisDisplayName(a) === normalizedMatch);
  if (normalizedMatch !== normalizedExpected && !aliasMatch) {
    return abortWithManualReview(action,
      `Staff row name "${search.matchedName}" does not match expected "${selected_employee_jarvis_display_name}" (normalized: "${normalizedMatch}" vs "${normalizedExpected}")`,
      search);
  }

  await audit(action, AUDIT_EVENTS.STAFF_SEARCH_RESULT_VERIFIED,
    `Staff row verified: ${search.matchedName}`, { afterStateJson: search });

  // Step 6: Click Assign
  await assignmentActionRepository.updateStatus(action.id, EXECUTION_STATUSES.EXECUTING);

  const assignResult = await adapter.clickAssign();
  if (!assignResult.clicked) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `Assign button click failed: ${assignResult.validationErrors.join('; ')}`,
      { ...assignResult, ...diag });
  }

  await audit(action, AUDIT_EVENTS.ASSIGN_CLICKED, 'Assign button clicked');

  // Step 7: Return to queue and verify
  const backResult = await adapter.returnToQueue();
  if (!backResult.returned) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `Failed to return to queue after assign: ${backResult.validationErrors.join('; ')}`,
      { ...backResult, ...diag });
  }

  await audit(action, AUDIT_EVENTS.RETURNED_TO_QUEUE, 'Returned to queue after assign');

  // Step 8: Final verification — queue row Owner must equal expected owner code
  const verify = await adapter.verifyQueueOwner({
    activityNumber: activity_number,
    expectedOwnerCode: selected_employee_jarvis_owner_code,
  });

  if (!verify.verified) {
    const diag = await adapter.captureDiagnostics();
    await assignmentActionRepository.updateStatus(
      action.id,
      EXECUTION_STATUSES.FAILED_VERIFICATION,
      {
        failure_reason: `Final queue verification failed: expected ${selected_employee_jarvis_owner_code}, got ${verify.actualOwnerCode}`,
        failed_at: new Date(),
      }
    );
    await audit(action, AUDIT_EVENTS.FINAL_OWNER_VERIFICATION_FAILED,
      `Queue Owner column is "${verify.actualOwnerCode}", expected "${selected_employee_jarvis_owner_code}"`,
      { validationJson: { ...verify, ...diag } });
    return { success: false, status: EXECUTION_STATUSES.FAILED_VERIFICATION, reason: verify.validationErrors.join('; ') };
  }

  await audit(action, AUDIT_EVENTS.FINAL_OWNER_VERIFIED,
    `Queue Owner confirmed as ${selected_employee_jarvis_owner_code}`,
    { afterStateJson: { ownerCode: selected_employee_jarvis_owner_code } });

  await assignmentActionRepository.updateStatus(
    action.id,
    EXECUTION_STATUSES.ASSIGNED_SUCCESSFULLY,
    { executed_at: new Date(), new_external_assignee: selected_employee_jarvis_owner_code }
  );

  await audit(action, AUDIT_EVENTS.EXECUTION_SUCCESS,
    `Ticket ${activity_number} successfully assigned to ${selected_employee_jarvis_display_name} (${selected_employee_jarvis_owner_code})`);

  return { success: true, status: EXECUTION_STATUSES.ASSIGNED_SUCCESSFULLY };
}

/* ================================================ */
/* UNASSIGN FLOW                                    */
/* ================================================ */

/**
 * Execute a safe unassign: validate hard reason → open queue → find row →
 * validate current owner → open ticket → open dialog → verify assigned row →
 * click UnAssign → close dialog → verify queue empty.
 */
async function executeUnassign(action, adapter) {
  const {
    activity_number, sales_order_number, queue_type,
    expected_previous_owner_code, hard_reassign_reason,
  } = action;

  // Step 1: Open queue
  await adapter.openQueue(queue_type);

  // Step 2: Find queue row and verify current owner
  const row = await adapter.findQueueRow({
    activityNumber: activity_number,
    salesOrderNumber: sales_order_number,
    expectOwnerCode: expected_previous_owner_code,
  });

  if (!row.found) {
    return abortWithManualReview(action, `Activity # ${activity_number} not found in queue`, row);
  }
  if (row.rowCount > 1) {
    return abortWithManualReview(action, `Activity # ${activity_number} appears ${row.rowCount} times — ambiguous`, row);
  }
  if (!row.ownerCode) {
    return abortWithManualReview(action, `Unassign action: ticket has no owner in queue`, row);
  }
  if (
    expected_previous_owner_code &&
    row.ownerCode.toLowerCase() !== expected_previous_owner_code.toLowerCase()
  ) {
    return abortWithManualReview(action,
      `Owner mismatch: expected ${expected_previous_owner_code}, queue shows ${row.ownerCode} — possible human change`,
      row);
  }
  if (sales_order_number && row.salesOrderNumber && row.salesOrderNumber !== sales_order_number) {
    return abortWithManualReview(action,
      `SO # mismatch: expected ${sales_order_number}, got ${row.salesOrderNumber}`, row);
  }

  await audit(action, AUDIT_EVENTS.JARVIS_QUEUE_ROW_FOUND,
    `Queue row found, current owner: ${row.ownerCode}`, { afterStateJson: row });

  // Step 3: Open ticket detail
  const detail = await adapter.openTicketDetail({
    activityNumber: activity_number,
    salesOrderNumber: sales_order_number,
  });

  if (!detail.opened || detail.activityNumber !== activity_number) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `Ticket detail validation failed for unassign: ${detail.validationErrors.join('; ')}`,
      { ...detail, ...diag });
  }

  await audit(action, AUDIT_EVENTS.TICKET_DETAIL_VALIDATION_PASSED, 'Ticket detail validated for unassign');

  // Step 4: Open assign dialog
  const dialog = await adapter.openAssignDialog();
  if (!dialog.opened) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `Assign Activity dialog did not open for unassign: ${dialog.validationErrors.join('; ')}`,
      { ...dialog, ...diag });
  }

  await audit(action, AUDIT_EVENTS.ASSIGN_DIALOG_OPENED, 'Assign Activity dialog opened for unassign');

  // Step 5: Find currently assigned row (must have check mark + UnAssign button)
  const assigned = await adapter.findCurrentlyAssignedRow({
    expectedOwnerCode: expected_previous_owner_code,
    expectedJarvisDisplayName: action.expected_previous_owner_display_name || '',
  });

  if (!assigned.found) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `UnAssign button not found for expected owner ${expected_previous_owner_code} — cannot safely unassign`,
      { ...assigned, ...diag });
  }

  await audit(action, AUDIT_EVENTS.STAFF_SEARCH_RESULT_VERIFIED,
    `Currently assigned row found: ${assigned.matchedName}`, { afterStateJson: assigned });

  // Step 6: Click UnAssign
  await assignmentActionRepository.updateStatus(action.id, EXECUTION_STATUSES.UNASSIGNING);

  const unassignResult = await adapter.clickUnAssign();
  if (!unassignResult.clicked) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `UnAssign button click failed: ${unassignResult.validationErrors.join('; ')}`,
      { ...unassignResult, ...diag });
  }

  await audit(action, AUDIT_EVENTS.UNASSIGN_CLICKED, 'UnAssign button clicked');

  // Step 7: Close dialog (UnAssign does NOT auto-close)
  const closeResult = await adapter.closeAssignDialog();
  if (!closeResult.closed) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `Failed to close Assign Activity dialog after UnAssign: ${closeResult.validationErrors.join('; ')}`,
      { ...closeResult, ...diag });
  }

  await audit(action, AUDIT_EVENTS.DIALOG_CLOSED, 'Assign Activity dialog closed after UnAssign');

  // Step 8: Return to queue
  const backResult = await adapter.returnToQueue();
  if (!backResult.returned) {
    const diag = await adapter.captureDiagnostics();
    return abortWithManualReview(action,
      `Failed to return to queue after unassign`, { ...backResult, ...diag });
  }

  await audit(action, AUDIT_EVENTS.RETURNED_TO_QUEUE, 'Returned to queue after unassign');

  // Step 9: Final verification — Owner column must be empty
  const verify = await adapter.verifyQueueOwnerEmpty({ activityNumber: activity_number });

  if (!verify.verified) {
    const diag = await adapter.captureDiagnostics();
    await assignmentActionRepository.updateStatus(
      action.id,
      EXECUTION_STATUSES.FAILED_VERIFICATION,
      { failure_reason: `Final unassign verification failed: owner still shows ${verify.actualOwnerCode}`, failed_at: new Date() }
    );
    await audit(action, AUDIT_EVENTS.FINAL_OWNER_VERIFICATION_FAILED,
      `Owner column still shows "${verify.actualOwnerCode}" after unassign`,
      { validationJson: { ...verify, ...diag } });
    return { success: false, status: EXECUTION_STATUSES.FAILED_VERIFICATION, reason: `Owner not cleared: ${verify.actualOwnerCode}` };
  }

  await audit(action, AUDIT_EVENTS.FINAL_OWNER_VERIFIED, 'Queue Owner confirmed empty after unassign');

  await assignmentActionRepository.updateStatus(
    action.id,
    EXECUTION_STATUSES.UNASSIGNED_SUCCESSFULLY,
    { executed_at: new Date(), previous_external_assignee: expected_previous_owner_code }
  );

  await audit(action, AUDIT_EVENTS.EXECUTION_SUCCESS,
    `Ticket ${activity_number} successfully unassigned (was: ${expected_previous_owner_code})`);

  return { success: true, status: EXECUTION_STATUSES.UNASSIGNED_SUCCESSFULLY };
}

/* ================================================ */
/* REASSIGN FLOW                                    */
/* Reassign = verified unassign then verified assign */
/* ================================================ */

async function executeReassign(action, adapter) {
  await assignmentActionRepository.updateStatus(action.id, EXECUTION_STATUSES.REASSIGNING);

  // Phase 1: Unassign old owner
  const unassignResult = await executeUnassign(action, adapter);

  if (!unassignResult.success) {
    // Propagate the failure — audit already written inside executeUnassign
    return { success: false, status: unassignResult.status, reason: `Reassign phase 1 (unassign) failed: ${unassignResult.reason}` };
  }

  // Verify unassign actually cleared the owner before proceeding
  const midVerify = await adapter.verifyQueueOwnerEmpty({ activityNumber: action.activity_number });
  if (!midVerify.verified) {
    const diag = await adapter.captureDiagnostics();
    await abortWithManualReview(action,
      `Reassign: unassign phase succeeded but ticket still has owner ${midVerify.actualOwnerCode} — CANNOT proceed with assign`,
      { ...midVerify, ...diag });
    return { success: false, status: EXECUTION_STATUSES.MANUAL_REVIEW_REQUIRED, reason: 'Unassign phase did not clear owner' };
  }

  // Phase 2: Assign new employee
  const assignResult = await executeAssign(action, adapter);

  if (!assignResult.success) {
    // Unassign succeeded but assign failed — ticket is now unassigned — MUST flag this clearly
    await audit(action, AUDIT_EVENTS.MANUAL_REVIEW_REQUIRED,
      `CRITICAL: Reassign phase 2 (assign) failed after successful unassign. Ticket ${action.activity_number} is NOW UNASSIGNED. Old owner: ${action.expected_previous_owner_code}. New assignment failed: ${assignResult.reason}`);
    return { success: false, status: assignResult.status, reason: `Reassign phase 2 (assign) failed after successful unassign. Ticket is currently unassigned.` };
  }

  // Both phases verified — update to reassigned_successfully
  await assignmentActionRepository.updateStatus(
    action.id,
    EXECUTION_STATUSES.REASSIGNED_SUCCESSFULLY,
    { executed_at: new Date() }
  );

  await audit(action, AUDIT_EVENTS.EXECUTION_SUCCESS,
    `Ticket ${action.activity_number} successfully reassigned from ${action.expected_previous_owner_code} to ${action.selected_employee_jarvis_owner_code}`);

  return { success: true, status: EXECUTION_STATUSES.REASSIGNED_SUCCESSFULLY };
}

/* ================================================ */
/* MAIN EXECUTOR                                    */
/* ================================================ */

export class JarvisAssignmentExecutor {
  constructor(adapter) {
    if (!adapter) throw new Error('JarvisAssignmentExecutor: adapter is required');
    this.adapter = adapter;
  }

  /**
   * Execute an assignment action. Dispatches to the correct flow.
   * @param {object} action - Full assignment_actions row
   * @returns {Promise<{ success: boolean, status: string, reason?: string }>}
   */
  async execute(action) {
    if (!action) throw new Error('execute: action is required');

    const { action_type } = action;

    try {
      if (action_type === 'assign') {
        return await executeAssign(action, this.adapter);
      } else if (action_type === 'unassign') {
        return await executeUnassign(action, this.adapter);
      } else if (action_type === 'reassign') {
        return await executeReassign(action, this.adapter);
      } else if (action_type === 'no_op') {
        await assignmentActionRepository.updateStatus(action.id, EXECUTION_STATUSES.SKIPPED);
        await audit(action, AUDIT_EVENTS.EXECUTION_SUCCESS, 'Action is no_op — skipped');
        return { success: true, status: EXECUTION_STATUSES.SKIPPED };
      } else {
        return abortWithFailure(action, `Unknown action_type: ${action_type}`);
      }
    } catch (err) {
      // Unexpected error — try to capture diagnostics
      let diag = { screenshotPath: null, diagnosticHtmlPath: null };
      try { diag = await this.adapter.captureDiagnostics(); } catch (_) {}

      const reason = `Unexpected executor error: ${err.message}`;
      await abortWithFailure(action, reason, diag);
      return { success: false, status: EXECUTION_STATUSES.FAILED, reason };
    } finally {
      try { await this.adapter.cleanup(); } catch (_) {}
    }
  }
}
