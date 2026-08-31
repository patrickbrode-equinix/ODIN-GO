/* ================================================ */
/* Assignment Writeback — ExecutionService          */
/* Validates actions, checks guards, dispatches to  */
/* JarvisAssignmentExecutor when safe.              */
/* ================================================ */

import pool from '../../db.js';
import { assignmentActionRepository, EXECUTION_STATUSES, EXECUTION_MODES } from './assignmentActionRepository.js';
import { assignmentAuditRepository, AUDIT_EVENTS } from './assignmentAuditRepository.js';
import {
  loadWritebackSettings,
  checkWritebackGlobalGuards,
  checkQueueWritebackEnabled,
  checkWritebackPilotEmployee,
} from './writebackSettings.js';
import {
  loadEmployeeWithJarvisFields,
  validateEmployeeJarvisMapping,
  checkJarvisDuplicates,
  resolveHardUnassignReason,
  resolveEmployeeByOwnerCode,
} from './employeeMapper.js';
import { JarvisAssignmentExecutor } from './JarvisAssignmentExecutor.js';
import { checkCrawlerFreshness } from '../rules/crawlerGuard.js';

const ALLOWED_TICKET_STATUSES_FOR_WRITEBACK = ['open', 'active', 'Open', 'Active', 'pending', 'Pending', 'In Progress', 'in_progress'];

/* ---- helpers ---- */

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

async function getLatestCrawlerTimestamp() {
  try {
    const { rows } = await pool.query(
      `SELECT snapshot_at FROM snapshots ORDER BY snapshot_at DESC LIMIT 1`
    );
    return rows[0]?.snapshot_at || null;
  } catch {
    return null;
  }
}

/* ================================================ */
/* VALIDATE                                         */
/* ================================================ */

/**
 * Validate an assignment action — checks all guards without writing to Jarvis.
 * Sets validation_status to 'passed' or 'failed'.
 */
export async function validateAssignmentAction(actionId) {
  const action = await assignmentActionRepository.findById(actionId);
  if (!action) throw new Error(`validateAssignmentAction: action ${actionId} not found`);

  await audit(action, AUDIT_EVENTS.VALIDATION_STARTED, 'Validation started');

  const errors = [];
  const settings = await loadWritebackSettings();

  // Guard 1: kill switch
  const globalGuard = checkWritebackGlobalGuards(settings);
  if (!globalGuard.allowed) {
    errors.push(globalGuard.reason);
    await audit(action, AUDIT_EVENTS.KILL_SWITCH_BLOCKED, globalGuard.reason);
  }

  // Guard 2: queue writeback enabled
  const queueGuard = checkQueueWritebackEnabled(settings, action.queue_type);
  if (!queueGuard.allowed) {
    errors.push(queueGuard.reason);
  }

  // Guard 3: crawler freshness
  if (settings.requireFreshCrawlerData) {
    const lastTs = await getLatestCrawlerTimestamp();
    const freshnessResult = checkCrawlerFreshness(
      lastTs,
      Date.now(),
      settings.maxSnapshotAgeMinutes * 60 * 1000
    );
    if (!freshnessResult.fresh) {
      errors.push(`Crawler data stale: ${freshnessResult.reason}`);
      await audit(action, AUDIT_EVENTS.FRESHNESS_CHECK_FAILED, freshnessResult.reason);
    } else {
      await audit(action, AUDIT_EVENTS.FRESHNESS_CHECK_PASSED, freshnessResult.reason);
    }
  }

  // Guard 4: no concurrent execution for same ticket
  const locked = await assignmentActionRepository.isLocked(action.activity_number);
  if (locked) {
    errors.push(`Concurrent execution lock: another action for ${action.activity_number} is already in progress`);
    await audit(action, AUDIT_EVENTS.CONCURRENCY_LOCK_BLOCKED,
      `Activity # ${action.activity_number} is locked by another executing action`);
  }

  // Guard 5: employee Jarvis identity
  if (action.selected_employee_id) {
    const employee = await loadEmployeeWithJarvisFields(action.selected_employee_id);
    if (!employee) {
      errors.push(`Selected employee (id=${action.selected_employee_id}) not found in ODIN`);
    } else {
      const pilotGuard = checkWritebackPilotEmployee(settings, action, employee);
      if (!pilotGuard.allowed) {
        errors.push(pilotGuard.reason);
        await audit(action, AUDIT_EVENTS.MANUAL_REVIEW_REQUIRED, pilotGuard.reason, {
          validationJson: { pilotMode: true, selector: settings.pilot?.employeeSelector || null },
        });
      }

      const mappingResult = validateEmployeeJarvisMapping(employee);
      if (!mappingResult.valid) {
        errors.push(...mappingResult.errors);
        await audit(action, AUDIT_EVENTS.EMPLOYEE_MAPPING_FAILED,
          mappingResult.errors.join('; '));
      } else {
        await audit(action, AUDIT_EVENTS.EMPLOYEE_MAPPING_VERIFIED,
          `Employee Jarvis mapping OK: ${employee.jarvis_display_name} / ${employee.jarvis_owner_code}`);
      }

      // Guard 6: no duplicate Jarvis identity
      const dupResult = await checkJarvisDuplicates(action.selected_employee_id);
      if (!dupResult.safe) {
        errors.push(dupResult.reason);
        await audit(action, AUDIT_EVENTS.DUPLICATE_EMPLOYEE_BLOCKED, dupResult.reason);
      }

      // Guard 7: employee eligibility at validation time
      if (!employee.assignment_eligible || employee.blocked || !employee.auto_assignable) {
        errors.push(`Employee ${employee.name} is not eligible for assignment at validation time`);
      }
    }
  } else {
    const pilotGuard = checkWritebackPilotEmployee(settings, action, null);
    if (!pilotGuard.allowed) {
      errors.push(pilotGuard.reason);
      await audit(action, AUDIT_EVENTS.MANUAL_REVIEW_REQUIRED, pilotGuard.reason, {
        validationJson: { pilotMode: true, selector: settings.pilot?.employeeSelector || null },
      });
    }
  }

  // Guard 8: for unassign/reassign — check if current owner is known to ODIN
  if (action.action_type === 'unassign' || action.action_type === 'reassign') {
    if (action.current_jarvis_owner_code) {
      const ownerEmployee = await resolveEmployeeByOwnerCode(action.current_jarvis_owner_code);
      if (!ownerEmployee) {
        errors.push(`Current Jarvis owner ${action.current_jarvis_owner_code} is unknown to ODIN — manual review required`);
        await audit(action, AUDIT_EVENTS.MANUAL_REVIEW_REQUIRED,
          `Blocked: current Jarvis owner ${action.current_jarvis_owner_code} is unknown to ODIN`);
      } else {
        // Guard 9: hard reason required for unassign/reassign
        const hardReason = resolveHardUnassignReason(ownerEmployee, action.queue_type);
        if (!hardReason.hasHardReason && action.action_type !== 'no_op') {
          const modeAllows = settings.mode === EXECUTION_MODES.FULL_AUTO;
          if (modeAllows) {
            errors.push(`No hard unassign/reassign reason for ${ownerEmployee.name} — workload-only change is not a valid reason`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    await assignmentActionRepository.updateStatus(action.id, EXECUTION_STATUSES.VALIDATION_FAILED, {
      validation_status: 'failed',
      validation_errors_json: errors,
      validated_at: new Date(),
    });
    await audit(action, AUDIT_EVENTS.VALIDATION_FAILED, `Validation failed with ${errors.length} error(s)`, {
      validationJson: { errors },
    });
    return { valid: false, errors };
  }

  // Passed
  const nextStatus = settings.mode === EXECUTION_MODES.SHADOW_ONLY
    ? EXECUTION_STATUSES.SHADOW_VALIDATED
    : EXECUTION_STATUSES.APPROVED_FOR_EXECUTION;

  await assignmentActionRepository.updateStatus(action.id, nextStatus, {
    validation_status: 'passed',
    validated_at: new Date(),
  });

  if (settings.mode === EXECUTION_MODES.SHADOW_ONLY) {
    await audit(action, AUDIT_EVENTS.SHADOW_VALIDATED,
      'Shadow mode: validation passed, Jarvis will NOT be modified');
  } else {
    await audit(action, AUDIT_EVENTS.VALIDATION_PASSED, 'Validation passed — action ready for execution');
  }

  return { valid: true, errors: [] };
}

/* ================================================ */
/* APPROVE                                          */
/* ================================================ */

export async function approveAssignmentAction(actionId, approvedBy) {
  const action = await assignmentActionRepository.findById(actionId);
  if (!action) throw new Error(`approveAssignmentAction: action ${actionId} not found`);

  const allowedStatuses = [
    EXECUTION_STATUSES.SHADOW_VALIDATED,
    EXECUTION_STATUSES.VALIDATION_FAILED,  // re-validate before approve in some cases
    EXECUTION_STATUSES.WAITING_FOR_MANUAL_CONFIRMATION,
    EXECUTION_STATUSES.MANUAL_REVIEW_REQUIRED,
  ];

  if (!allowedStatuses.includes(action.execution_status)) {
    throw new Error(`Cannot approve action in status: ${action.execution_status}`);
  }

  await assignmentActionRepository.updateStatus(action.id, EXECUTION_STATUSES.APPROVED_FOR_EXECUTION, {
    approved_at: new Date(),
    approved_by: approvedBy,
  });

  await audit(action, AUDIT_EVENTS.APPROVED_BY_HUMAN,
    `Action approved by ${approvedBy}`,
    { afterStateJson: { approvedBy, approvedAt: new Date().toISOString() } });

  return { approved: true };
}

/* ================================================ */
/* EXECUTE                                          */
/* ================================================ */

/**
 * Execute an approved assignment action.
 * Guards are re-checked at execution time (freshness, kill switch, concurrency).
 */
export async function executeAssignmentAction(actionId, adapter) {
  const action = await assignmentActionRepository.findById(actionId);
  if (!action) throw new Error(`executeAssignmentAction: action ${actionId} not found`);

  const settings = await loadWritebackSettings();

  // Re-check kill switch
  const globalGuard = checkWritebackGlobalGuards(settings);
  if (!globalGuard.allowed) {
    await assignmentActionRepository.updateStatus(action.id, EXECUTION_STATUSES.BLOCKED_EXISTING_OWNER, {
      failure_reason: globalGuard.reason,
    });
    await audit(action, AUDIT_EVENTS.KILL_SWITCH_BLOCKED, globalGuard.reason);
    return { success: false, reason: globalGuard.reason };
  }

  // Shadow mode: never write
  if (settings.mode === EXECUTION_MODES.SHADOW_ONLY) {
    await audit(action, AUDIT_EVENTS.MODE_BLOCKED,
      'Shadow mode active: ODIN would apply this assignment, but Jarvis will not be changed');
    return { success: false, status: EXECUTION_STATUSES.SHADOW_VALIDATED,
      reason: 'Shadow mode active: ODIN would apply this assignment, but Jarvis will not be changed' };
  }

  // Pilot mode is re-checked at execution time so old approvals cannot bypass a later restriction.
  let selectedEmployee = null;
  if (action.selected_employee_id) {
    selectedEmployee = await loadEmployeeWithJarvisFields(action.selected_employee_id);
  }
  const pilotGuard = checkWritebackPilotEmployee(settings, action, selectedEmployee);
  if (!pilotGuard.allowed) {
    await assignmentActionRepository.updateStatus(action.id, EXECUTION_STATUSES.MANUAL_REVIEW_REQUIRED, {
      failure_reason: pilotGuard.reason,
    });
    await audit(action, AUDIT_EVENTS.MANUAL_REVIEW_REQUIRED, pilotGuard.reason, {
      validationJson: { pilotMode: true, selector: settings.pilot?.employeeSelector || null },
    });
    return { success: false, status: EXECUTION_STATUSES.MANUAL_REVIEW_REQUIRED, reason: pilotGuard.reason };
  }

  // Must be approved
  const executableStatuses = [
    EXECUTION_STATUSES.APPROVED_FOR_EXECUTION,
    EXECUTION_STATUSES.SHADOW_VALIDATED,
  ];
  if (!executableStatuses.includes(action.execution_status)) {
    throw new Error(`Action ${actionId} is not in an executable status (current: ${action.execution_status})`);
  }

  // Re-check freshness
  if (settings.requireFreshCrawlerData) {
    const lastTs = await getLatestCrawlerTimestamp();
    const freshness = checkCrawlerFreshness(lastTs, Date.now(), settings.maxSnapshotAgeMinutes * 60 * 1000);
    if (!freshness.fresh) {
      await assignmentActionRepository.updateStatus(action.id, EXECUTION_STATUSES.FAILED, {
        failure_reason: freshness.reason, failed_at: new Date(),
      });
      await audit(action, AUDIT_EVENTS.STALE_DATA_BLOCKED, freshness.reason);
      return { success: false, reason: freshness.reason };
    }
  }

  // Re-check concurrency lock
  const locked = await assignmentActionRepository.isLocked(action.activity_number);
  if (locked) {
    const reason = `Concurrent execution lock: another action for ${action.activity_number} is already running`;
    await audit(action, AUDIT_EVENTS.CONCURRENCY_LOCK_BLOCKED, reason);
    return { success: false, reason };
  }

  // Delegate to executor
  const executor = new JarvisAssignmentExecutor(adapter);
  return executor.execute(action);
}

/* ================================================ */
/* CANCEL                                           */
/* ================================================ */

export async function cancelAssignmentAction(actionId, cancelledBy) {
  const action = await assignmentActionRepository.findById(actionId);
  if (!action) throw new Error(`cancelAssignmentAction: action ${actionId} not found`);

  const nonCancellableStatuses = [
    EXECUTION_STATUSES.EXECUTING, EXECUTION_STATUSES.UNASSIGNING, EXECUTION_STATUSES.REASSIGNING,
    EXECUTION_STATUSES.ASSIGNED_SUCCESSFULLY, EXECUTION_STATUSES.UNASSIGNED_SUCCESSFULLY,
    EXECUTION_STATUSES.REASSIGNED_SUCCESSFULLY, EXECUTION_STATUSES.CANCELLED,
  ];
  if (nonCancellableStatuses.includes(action.execution_status)) {
    throw new Error(`Cannot cancel action in status: ${action.execution_status}`);
  }

  await assignmentActionRepository.updateStatus(action.id, EXECUTION_STATUSES.CANCELLED);
  await audit(action, AUDIT_EVENTS.CANCELLED_BY_HUMAN,
    `Action cancelled by ${cancelledBy}`);

  return { cancelled: true };
}

/* ================================================ */
/* RECONCILE                                        */
/* ================================================ */

/**
 * Reconcile: compare latest Jarvis snapshot state with ODIN assignment state.
 * Returns a list of discrepancies without automatically executing anything.
 */
export async function reconcileAssignmentState() {
  const settings = await loadWritebackSettings();

  // Load all active queue items from latest snapshot
  let snapshotItems = [];
  try {
    const { rows } = await pool.query(
      `SELECT qi.external_id, qi.owner, qi.queue_type, qi.status, qi.ticket_type
       FROM queue_items qi
       WHERE qi.status NOT IN ('closed','cancelled','Closed','Cancelled')
       ORDER BY qi.external_id ASC`
    );
    snapshotItems = rows;
  } catch (err) {
    return { error: `Failed to load snapshot items: ${err.message}`, items: [] };
  }

  // Load recent (non-terminal) assignment actions
  const { rows: actions } = await pool.query(
    `SELECT * FROM assignment_actions
     WHERE execution_status NOT IN ('cancelled','skipped','assigned_successfully',
       'unassigned_successfully','reassigned_successfully','failed','failed_verification')
     ORDER BY created_at DESC`
  );

  const actionsByActivity = new Map();
  for (const a of actions) {
    actionsByActivity.set(a.activity_number, a);
  }

  const results = [];

  for (const item of snapshotItems) {
    const actNum = item.external_id;
    const jarvisOwner = item.owner || null;
    const action = actionsByActivity.get(actNum);

    if (!action) {
      if (!jarvisOwner) {
        results.push({ activityNumber: actNum, state: 'unassigned_no_action', jarvisOwner: null });
      } else {
        results.push({ activityNumber: actNum, state: 'assigned_no_action', jarvisOwner });
      }
      continue;
    }

    const expectedOwner = action.selected_employee_jarvis_owner_code;

    if (!jarvisOwner && action.action_type === 'assign') {
      results.push({ activityNumber: actNum, state: 'pending_assignment', jarvisOwner: null, action });
    } else if (jarvisOwner && jarvisOwner === expectedOwner) {
      results.push({ activityNumber: actNum, state: 'correctly_assigned', jarvisOwner, action });
    } else if (jarvisOwner && jarvisOwner !== expectedOwner) {
      // Check if current owner is known
      const ownerEmployee = await resolveEmployeeByOwnerCode(jarvisOwner);
      if (!ownerEmployee) {
        results.push({ activityNumber: actNum, state: 'unknown_owner_conflict', jarvisOwner, action,
          message: `Jarvis owner ${jarvisOwner} is unknown to ODIN` });
      } else {
        const hardReason = resolveHardUnassignReason(ownerEmployee, item.queue_type);
        if (hardReason.hasHardReason) {
          results.push({ activityNumber: actNum, state: 'owner_ineligible', jarvisOwner,
            action, hardReason: hardReason.reason, ownerEmployee: { id: ownerEmployee.id, name: ownerEmployee.name } });
        } else {
          results.push({ activityNumber: actNum, state: 'human_conflict', jarvisOwner, action,
            message: `Human or different assignment detected` });
        }
      }
    }
  }

  // Check for actions with activity numbers no longer in snapshot
  for (const [actNum, action] of actionsByActivity) {
    if (!snapshotItems.find(i => i.external_id === actNum)) {
      results.push({ activityNumber: actNum, state: 'missing_from_snapshot', action,
        message: 'Ticket no longer in latest crawler snapshot' });
    }
  }

  return {
    snapshotCount: snapshotItems.length,
    actionCount: actions.length,
    items: results,
    settings: { mode: settings.mode, enabled: settings.enabled, killSwitch: settings.killSwitch },
  };
}
