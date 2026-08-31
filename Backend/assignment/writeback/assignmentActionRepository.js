/* ================================================ */
/* Assignment Writeback — Action Repository         */
/* Handles all DB operations for assignment_actions */
/* ================================================ */

import pool from '../../db.js';

/* ---- Constants ---- */

export const ACTION_TYPES = Object.freeze({
  ASSIGN: 'assign',
  UNASSIGN: 'unassign',
  REASSIGN: 'reassign',
  NO_OP: 'no_op',
});

export const EXECUTION_MODES = Object.freeze({
  SHADOW_ONLY: 'shadow_only',
  MANUAL_CONFIRM: 'manual_confirm',
  ASSISTED_AUTO: 'assisted_auto',
  FULL_AUTO: 'full_auto',
});

export const EXECUTION_STATUSES = Object.freeze({
  PENDING: 'pending',
  SHADOW_VALIDATED: 'shadow_validated',
  VALIDATION_FAILED: 'validation_failed',
  WAITING_FOR_MANUAL_CONFIRMATION: 'waiting_for_manual_confirmation',
  APPROVED_FOR_EXECUTION: 'approved_for_execution',
  EXECUTING: 'executing',
  ALREADY_CORRECTLY_ASSIGNED: 'already_correctly_assigned',
  ASSIGNED_SUCCESSFULLY: 'assigned_successfully',
  UNASSIGN_REQUIRED: 'unassign_required',
  UNASSIGNING: 'unassigning',
  UNASSIGNED_SUCCESSFULLY: 'unassigned_successfully',
  REASSIGN_REQUIRED: 'reassign_required',
  REASSIGNING: 'reassigning',
  REASSIGNED_SUCCESSFULLY: 'reassigned_successfully',
  BLOCKED_EXISTING_OWNER: 'blocked_existing_owner',
  BLOCKED_HUMAN_OWNER_CONFLICT: 'blocked_human_owner_conflict',
  MANUAL_REVIEW_REQUIRED: 'manual_review_required',
  FAILED_VERIFICATION: 'failed_verification',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
});

/* ---- Repository ---- */

export const assignmentActionRepository = {
  /**
   * Create a new assignment action.
   */
  async create(fields) {
    const {
      ticketId, activityNumber, salesOrderNumber, queueType, subType, systemName,
      currentJarvisOwnerCode, expectedPreviousOwnerCode,
      selectedEmployeeId, selectedEmployeeName, selectedEmployeeEmail,
      selectedEmployeeJarvisDisplayName, selectedEmployeeJarvisOwnerCode, selectedEmployeeJarvisInitials,
      actionType, executionMode, decisionSource, decisionTraceJson,
      hardReassignReason, createdByLogicRunId,
    } = fields;

    const { rows } = await pool.query(
      `INSERT INTO assignment_actions (
        ticket_id, activity_number, sales_order_number, queue_type, sub_type, system_name,
        current_jarvis_owner_code, expected_previous_owner_code,
        selected_employee_id, selected_employee_name, selected_employee_email,
        selected_employee_jarvis_display_name, selected_employee_jarvis_owner_code, selected_employee_jarvis_initials,
        action_type, execution_mode, decision_source, decision_trace_json,
        validation_status, execution_status,
        hard_reassign_reason, created_by_logic_run_id,
        created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,
        $9,$10,$11,
        $12,$13,$14,
        $15,$16,$17,$18,
        'pending','pending',
        $19,$20,
        NOW()
      ) RETURNING *`,
      [
        ticketId || null, activityNumber, salesOrderNumber || null,
        queueType || null, subType || null, systemName || null,
        currentJarvisOwnerCode || null, expectedPreviousOwnerCode || null,
        selectedEmployeeId || null, selectedEmployeeName || null, selectedEmployeeEmail || null,
        selectedEmployeeJarvisDisplayName || null, selectedEmployeeJarvisOwnerCode || null, selectedEmployeeJarvisInitials || null,
        actionType, executionMode, decisionSource || null,
        decisionTraceJson ? JSON.stringify(decisionTraceJson) : null,
        hardReassignReason || null, createdByLogicRunId || null,
      ]
    );
    return rows[0];
  },

  /**
   * Find by id.
   */
  async findById(id) {
    const { rows } = await pool.query(
      `SELECT * FROM assignment_actions WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * Find by activity number — returns all (used for duplicate detection).
   */
  async findByActivityNumber(activityNumber) {
    const { rows } = await pool.query(
      `SELECT * FROM assignment_actions WHERE activity_number = $1 ORDER BY created_at DESC`,
      [activityNumber]
    );
    return rows;
  },

  /**
   * Find all with optional filters and pagination.
   */
  async findAll({ executionStatus, actionType, executionMode, limit = 100, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (executionStatus) { conditions.push(`execution_status = $${idx++}`); params.push(executionStatus); }
    if (actionType) { conditions.push(`action_type = $${idx++}`); params.push(actionType); }
    if (executionMode) { conditions.push(`execution_mode = $${idx++}`); params.push(executionMode); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM assignment_actions ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    return rows;
  },

  /**
   * Update execution status with optimistic locking.
   * Returns null if the lock_version has changed (concurrent update).
   */
  async updateStatus(id, newStatus, extraFields = {}, expectedLockVersion = null) {
    const setParts = [`execution_status = $2`, `lock_version = lock_version + 1`];
    const params = [id, newStatus];
    let idx = 3;

    const allowed = [
      'validation_status', 'validation_errors_json', 'validated_at',
      'approved_at', 'approved_by', 'executed_at', 'failed_at',
      'failure_reason', 'retry_count', 'last_error',
      'external_write_status', 'previous_external_assignee', 'new_external_assignee',
    ];

    for (const [key, val] of Object.entries(extraFields)) {
      if (!allowed.includes(key)) continue;
      setParts.push(`${key} = $${idx++}`);
      params.push(val);
    }

    let lockCondition = '';
    if (expectedLockVersion !== null) {
      lockCondition = ` AND lock_version = $${idx++}`;
      params.push(expectedLockVersion);
    }

    const { rows } = await pool.query(
      `UPDATE assignment_actions
       SET ${setParts.join(', ')}
       WHERE id = $1${lockCondition}
       RETURNING *`,
      params
    );

    return rows[0] || null; // null = lost optimistic lock
  },

  /**
   * Check if any action for this activity_number is currently in an active/executing state.
   * Used to prevent concurrent execution for the same ticket.
   */
  async isLocked(activityNumber) {
    const { rows } = await pool.query(
      `SELECT id FROM assignment_actions
       WHERE activity_number = $1
         AND execution_status IN ('executing','unassigning','reassigning','approved_for_execution')
       LIMIT 1`,
      [activityNumber]
    );
    return rows.length > 0;
  },

  async count({ executionStatus, actionType } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (executionStatus) { conditions.push(`execution_status = $${idx++}`); params.push(executionStatus); }
    if (actionType) { conditions.push(`action_type = $${idx++}`); params.push(actionType); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM assignment_actions ${where}`, params);
    return rows[0].count;
  },
};
