/* ================================================ */
/* Assignment Writeback — Audit Log Repository      */
/* Immutable audit trail for every writeback step.  */
/* ================================================ */

import pool from '../../db.js';

export const AUDIT_EVENTS = Object.freeze({
  ACTION_CREATED:               'action_created',
  VALIDATION_STARTED:           'validation_started',
  VALIDATION_PASSED:            'validation_passed',
  VALIDATION_FAILED:            'validation_failed',
  FRESHNESS_CHECK_PASSED:       'freshness_check_passed',
  FRESHNESS_CHECK_FAILED:       'freshness_check_failed',
  CONCURRENCY_LOCK_ACQUIRED:    'concurrency_lock_acquired',
  CONCURRENCY_LOCK_BLOCKED:     'concurrency_lock_blocked',
  EMPLOYEE_MAPPING_VERIFIED:    'employee_mapping_verified',
  EMPLOYEE_MAPPING_FAILED:      'employee_mapping_failed',
  DUPLICATE_EMPLOYEE_BLOCKED:   'duplicate_employee_blocked',
  JARVIS_QUEUE_ROW_FOUND:       'jarvis_queue_row_found',
  JARVIS_QUEUE_ROW_VALIDATION_FAILED: 'jarvis_queue_row_validation_failed',
  TICKET_DETAIL_OPENED:         'ticket_detail_opened',
  TICKET_DETAIL_VALIDATION_PASSED: 'ticket_detail_validation_passed',
  TICKET_DETAIL_VALIDATION_FAILED: 'ticket_detail_validation_failed',
  ASSIGN_DIALOG_OPENED:         'assign_dialog_opened',
  ASSIGN_DIALOG_FAILED:         'assign_dialog_failed',
  STAFF_SEARCH_STARTED:         'staff_search_started',
  STAFF_SEARCH_RESULT_VERIFIED: 'staff_search_result_verified',
  STAFF_SEARCH_NO_MATCH:        'staff_search_no_match',
  STAFF_SEARCH_MULTIPLE_MATCH:  'staff_search_multiple_match',
  ASSIGN_CLICKED:               'assign_clicked',
  UNASSIGN_CLICKED:             'unassign_clicked',
  DIALOG_CLOSED:                'dialog_closed',
  RETURNED_TO_QUEUE:            'returned_to_queue',
  FINAL_OWNER_VERIFIED:         'final_owner_verified',
  FINAL_OWNER_VERIFICATION_FAILED: 'final_owner_verification_failed',
  EXECUTION_SUCCESS:            'execution_success',
  EXECUTION_FAILED:             'execution_failed',
  MANUAL_REVIEW_REQUIRED:       'manual_review_required',
  APPROVED_BY_HUMAN:            'approved_by_human',
  CANCELLED_BY_HUMAN:           'cancelled_by_human',
  KILL_SWITCH_BLOCKED:          'kill_switch_blocked',
  MODE_BLOCKED:                 'mode_blocked',
  ALREADY_CORRECTLY_ASSIGNED:   'already_correctly_assigned',
  SHADOW_VALIDATED:             'shadow_validated',
  STALE_DATA_BLOCKED:           'stale_data_blocked',
  SETTINGS_BLOCKED:             'settings_blocked',
});

export const assignmentAuditRepository = {
  /**
   * Append an immutable audit log entry.
   * Never throws — audit logging must never break execution flow.
   */
  async log({
    assignmentActionId = null,
    ticketId = null,
    activityNumber = null,
    eventType,
    message = null,
    beforeStateJson = null,
    afterStateJson = null,
    validationJson = null,
    screenshotPath = null,
    diagnosticHtmlPath = null,
  }) {
    try {
      await pool.query(
        `INSERT INTO assignment_audit_logs (
          assignment_action_id, ticket_id, activity_number,
          event_type, message,
          before_state_json, after_state_json, validation_json,
          screenshot_path, diagnostic_html_path,
          created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
        [
          assignmentActionId,
          ticketId,
          activityNumber,
          eventType,
          message,
          beforeStateJson ? JSON.stringify(beforeStateJson) : null,
          afterStateJson ? JSON.stringify(afterStateJson) : null,
          validationJson ? JSON.stringify(validationJson) : null,
          screenshotPath,
          diagnosticHtmlPath,
        ]
      );
    } catch (err) {
      console.error('[AssignmentAudit] Failed to write audit log:', err.message, { eventType, activityNumber });
    }
  },

  /**
   * Get all audit logs for a specific action.
   */
  async findByActionId(assignmentActionId) {
    const { rows } = await pool.query(
      `SELECT * FROM assignment_audit_logs
       WHERE assignment_action_id = $1
       ORDER BY created_at ASC`,
      [assignmentActionId]
    );
    return rows;
  },

  /**
   * Get recent audit logs across all actions, optional filter by activity_number.
   */
  async findRecent({ activityNumber, limit = 200, offset = 0 } = {}) {
    if (activityNumber) {
      const { rows } = await pool.query(
        `SELECT * FROM assignment_audit_logs
         WHERE activity_number = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [activityNumber, limit, offset]
      );
      return rows;
    }

    const { rows } = await pool.query(
      `SELECT * FROM assignment_audit_logs
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  },
};
