/* ================================================ */
/* Assignment Writeback — API Routes                */
/* /api/assignment-actions                          */
/* ================================================ */

import express from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePageAccess } from '../middleware/requirePageAccess.js';
import { assignmentActionRepository, ACTION_TYPES } from '../assignment/writeback/assignmentActionRepository.js';
import { assignmentAuditRepository } from '../assignment/writeback/assignmentAuditRepository.js';
import {
  validateAssignmentAction,
  approveAssignmentAction,
  executeAssignmentAction,
  cancelAssignmentAction,
  reconcileAssignmentState,
} from '../assignment/writeback/AssignmentExecutionService.js';
import { MockJarvisUiAdapter } from '../assignment/writeback/JarvisUiAdapter.js';
import { loadWritebackSettings } from '../assignment/writeback/writebackSettings.js';
import { loadEmployeeWithJarvisFields } from '../assignment/writeback/employeeMapper.js';

const router = express.Router();

router.use(requireAuth);
router.use(requirePageAccess('odin_logic', 'view'));

function firstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function buildWritebackBlockedResponse({
  reason,
  message,
  ticketId,
  executionStatus,
  action = null,
  validation = null,
}) {
  return {
    error: 'WRITEBACK_BLOCKED',
    reason,
    message,
    ticketId: ticketId == null ? null : String(ticketId),
    executionStatus,
    ...(action ? { action } : {}),
    ...(validation ? { validation } : {}),
  };
}

function classifyValidationBlock(errors = []) {
  const text = errors.join('; ');
  const lower = text.toLowerCase();

  if (lower.includes('stale') || lower.includes('fresh')) {
    return {
      reason: 'stale_crawler_snapshot',
      message: 'Stale crawler snapshot. Please refresh Jarvis data before writeback.',
      executionStatus: 'validation_failed',
    };
  }
  if (lower.includes('eligible') || lower.includes('mapping') || lower.includes('jarvis identity') || lower.includes('pilot')) {
    return {
      reason: 'employee_not_eligible',
      message: text || 'Employee is not eligible for writeback.',
      executionStatus: 'validation_failed',
    };
  }
  if (lower.includes('owner') || lower.includes('conflict') || lower.includes('overwrite')) {
    return {
      reason: 'existing_owner_detected',
      message: text || 'Existing owner detected. Manual review is required.',
      executionStatus: 'blocked_existing_owner',
    };
  }
  if (lower.includes('manual')) {
    return {
      reason: 'manual_confirmation_required',
      message: text || 'Manual confirmation required before writeback.',
      executionStatus: 'waiting_for_manual_confirmation',
    };
  }

  return {
    reason: 'writeback_validation_failed',
    message: text || 'Writeback safety validation blocked execution.',
    executionStatus: 'validation_failed',
  };
}

async function loadRunningWritebackAction(activityNumber) {
  const { rows } = await pool.query(
    `SELECT *
       FROM assignment_actions
      WHERE activity_number = $1
        AND execution_status IN ('executing','unassigning','reassigning')
      ORDER BY created_at DESC
      LIMIT 1`,
    [activityNumber]
  );
  return rows[0] || null;
}

function employeeDisplayName(employee) {
  return firstText(
    employee?.name,
    [employee?.first_name, employee?.last_name].filter(Boolean).join(' '),
    employee?.email
  );
}

function ticketActivityNumber(ticket) {
  return firstText(ticket.external_id, ticket.activity, ticket.activity_no, ticket.id);
}

function buildTicketActionFields({ ticket, employee, actionType, settings, requestedBy, currentOwnerCode = null, reason = null }) {
  return {
    ticketId: String(ticket.id),
    activityNumber: ticketActivityNumber(ticket),
    salesOrderNumber: firstText(ticket.sales_order, ticket.salesorder, ticket.salesOrder, ticket.so_number),
    queueType: firstText(ticket.queue_type),
    subType: firstText(ticket.customer_trouble_type, ticket.subtype),
    systemName: firstText(ticket.system_name),
    currentJarvisOwnerCode: currentOwnerCode,
    expectedPreviousOwnerCode: currentOwnerCode,
    selectedEmployeeId: actionType === ACTION_TYPES.UNASSIGN ? null : employee?.id,
    selectedEmployeeName: actionType === ACTION_TYPES.UNASSIGN ? null : employeeDisplayName(employee),
    selectedEmployeeEmail: actionType === ACTION_TYPES.UNASSIGN ? null : firstText(employee?.email),
    selectedEmployeeJarvisDisplayName: actionType === ACTION_TYPES.UNASSIGN ? null : firstText(employee?.jarvis_display_name),
    selectedEmployeeJarvisOwnerCode: actionType === ACTION_TYPES.UNASSIGN ? null : firstText(employee?.jarvis_owner_code),
    selectedEmployeeJarvisInitials: actionType === ACTION_TYPES.UNASSIGN ? null : firstText(employee?.jarvis_initials),
    actionType,
    executionMode: settings.mode,
    decisionSource: actionType === ACTION_TYPES.UNASSIGN ? 'tickets_tab_reset' : 'tickets_tab_writeback',
    decisionTraceJson: {
      queueItemId: ticket.id,
      requestedBy,
      source: 'tickets_tab',
      reason,
      odinOwner: ticket.owner || null,
      assignedWorkerId: ticket.assigned_worker_id || null,
    },
    hardReassignReason: reason,
  };
}

async function loadQueueItem(queueItemId) {
  const { rows } = await pool.query(
    `SELECT * FROM queue_items WHERE id = $1 AND active = TRUE`,
    [queueItemId]
  );
  return rows[0] || null;
}

async function loadAssignedEmployee(ticket) {
  if (ticket.assigned_worker_id) {
    return loadEmployeeWithJarvisFields(ticket.assigned_worker_id);
  }

  const activityNumber = ticketActivityNumber(ticket);
  const { rows } = await pool.query(
    `SELECT assigned_worker_id
       FROM assignment_ticket_decisions
      WHERE result = 'assigned'
        AND assigned_worker_id IS NOT NULL
        AND (ticket_id = $1 OR ticket_id = $2)
      ORDER BY decided_at DESC
      LIMIT 1`,
    [String(ticket.id), activityNumber]
  );

  return rows[0]?.assigned_worker_id
    ? loadEmployeeWithJarvisFields(rows[0].assigned_worker_id)
    : null;
}

async function validateCreatedAction(action) {
  try {
    return await validateAssignmentAction(action.id);
  } catch (err) {
    return { valid: false, errors: [err.message] };
  }
}

async function loadOdinAssignedTickets() {
  const { rows } = await pool.query(
    `SELECT qi.*,
            NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS employee_name,
            u.email AS employee_email,
            u.first_name AS employee_first_name,
            u.last_name AS employee_last_name,
            u.jarvis_display_name AS employee_jarvis_display_name,
            u.jarvis_owner_code AS employee_jarvis_owner_code,
            u.jarvis_initials AS employee_jarvis_initials
       FROM queue_items qi
       LEFT JOIN users u ON u.id = qi.assigned_worker_id
      WHERE qi.active = TRUE
        AND qi.assigned_worker_id IS NOT NULL
      ORDER BY qi.id ASC`
  );
  return rows;
}

function employeeFromAssignedTicket(row) {
  return {
    id: row.assigned_worker_id,
    name: row.employee_name,
    email: row.employee_email,
    first_name: row.employee_first_name,
    last_name: row.employee_last_name,
    jarvis_display_name: row.employee_jarvis_display_name,
    jarvis_owner_code: row.employee_jarvis_owner_code,
    jarvis_initials: row.employee_jarvis_initials,
  };
}

function publicWritebackEmployee(employee) {
  return {
    id: employee.id,
    name: employeeDisplayName(employee),
    email: firstText(employee.email),
    jarvisDisplayName: firstText(employee.jarvis_display_name),
    jarvisOwnerCode: firstText(employee.jarvis_owner_code),
    jarvisInitials: firstText(employee.jarvis_initials),
    assignmentEligible: employee.assignment_eligible !== false,
    autoAssignable: employee.auto_assignable !== false,
    blocked: employee.blocked === true,
  };
}

/* ─────────────────────────────────────── */
/* GET /api/assignment-actions             */
/* List all actions with optional filters  */
/* ─────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const { executionStatus, actionType, executionMode, limit = '100', offset = '0' } = req.query;
    const actions = await assignmentActionRepository.findAll({
      executionStatus: executionStatus || undefined,
      actionType: actionType || undefined,
      executionMode: executionMode || undefined,
      limit: Math.min(parseInt(limit, 10) || 100, 500),
      offset: parseInt(offset, 10) || 0,
    });
    const settings = await loadWritebackSettings();
    res.json({
      actions,
      settings: {
        mode: settings.mode,
        enabled: settings.enabled,
        killSwitch: settings.killSwitch,
      },
    });
  } catch (err) {
    console.error('[assignment-actions] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to load assignment actions' });
  }
});

/* ─────────────────────────────────────── */
/* GET /api/assignment-actions/audit       */
/* Global audit log                        */
/* ─────────────────────────────────────── */
router.get('/audit', async (req, res) => {
  try {
    const { activityNumber, limit = '200', offset = '0' } = req.query;
    const logs = await assignmentAuditRepository.findRecent({
      activityNumber: activityNumber || undefined,
      limit: Math.min(parseInt(limit, 10) || 200, 1000),
      offset: parseInt(offset, 10) || 0,
    });
    res.json({ logs });
  } catch (err) {
    console.error('[assignment-actions] GET /audit error:', err.message);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

/* ─────────────────────────────────────── */
/* POST /api/assignment-actions/reconcile  */
/* Compare snapshot state with ODIN state  */
/* ─────────────────────────────────────── */
/* --------------------------------------- */
/* GET /api/assignment-actions/writeback-employees */
/* Employees selectable for manual ODIN writeback testing. */
/* --------------------------------------- */
router.get('/writeback-employees', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         id,
         NULLIF(trim(concat_ws(' ', first_name, last_name)), '') AS name,
         first_name,
         last_name,
         email,
         auto_assignable,
         assignment_eligible,
         blocked,
         jarvis_display_name,
         jarvis_owner_code,
         jarvis_initials
       FROM users
       WHERE is_root = FALSE
         AND COALESCE(approved, TRUE) = TRUE
         AND NULLIF(trim(COALESCE(jarvis_display_name, '')), '') IS NOT NULL
         AND NULLIF(trim(COALESCE(jarvis_owner_code, '')), '') IS NOT NULL
       ORDER BY LOWER(NULLIF(trim(concat_ws(' ', first_name, last_name)), '')), id ASC`
    );

    res.json({ employees: rows.map(publicWritebackEmployee) });
  } catch (err) {
    console.error('[assignment-actions] GET /writeback-employees error:', err.message);
    res.status(500).json({ error: 'Failed to load writeback employees' });
  }
});

router.post('/reconcile', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const result = await reconcileAssignmentState();
    res.json(result);
  } catch (err) {
    console.error('[assignment-actions] POST /reconcile error:', err.message);
    res.status(500).json({ error: 'Reconcile failed', detail: err.message });
  }
});

/* --------------------------------------- */
/* POST /api/assignment-actions/tickets/:queueItemId/writeback */
/* Create and validate a writeback action from the Tickets tab. */
/* --------------------------------------- */
router.post('/tickets/:queueItemId/writeback', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const queueItemId = parseInt(req.params.queueItemId, 10);
    if (!Number.isInteger(queueItemId)) return res.status(400).json({ error: 'Invalid queue item id' });

    const ticket = await loadQueueItem(queueItemId);
    if (!ticket) return res.status(404).json({ error: 'Queue ticket not found' });

    const employee = await loadAssignedEmployee(ticket);
    if (!employee) {
      return res.status(409).json({
        error: 'Ticket has no ODIN-assigned employee to write back',
        code: 'NO_ODIN_ASSIGNEE',
      });
    }

    const settings = await loadWritebackSettings();
    if (!settings.enabled) {
      return res.status(409).json(buildWritebackBlockedResponse({
        reason: 'writeback_disabled',
        message: 'Assignment writeback is disabled in settings.',
        ticketId: queueItemId,
        executionStatus: 'skipped',
      }));
    }
    if (settings.mode === 'shadow_only') {
      return res.status(409).json(buildWritebackBlockedResponse({
        reason: 'shadow_only_mode',
        message: 'Shadow mode is active. Jarvis will not be changed.',
        ticketId: queueItemId,
        executionStatus: 'shadow_validated',
      }));
    }

    const runningAction = await loadRunningWritebackAction(ticketActivityNumber(ticket));
    if (runningAction) {
      return res.status(409).json(buildWritebackBlockedResponse({
        reason: 'execution_already_running',
        message: 'A writeback execution is already running for this ticket.',
        ticketId: queueItemId,
        executionStatus: 'executing',
        action: runningAction,
      }));
    }

    const requestedBy = req.user?.name || req.user?.email || 'unknown';
    const action = await assignmentActionRepository.create(buildTicketActionFields({
      ticket,
      employee,
      actionType: ACTION_TYPES.ASSIGN,
      settings,
      requestedBy,
      reason: 'manual_ticket_writeback',
    }));
    const validation = await validateCreatedAction(action);
    const hydratedAction = await assignmentActionRepository.findById(action.id);

    if (validation && validation.valid === false) {
      const block = classifyValidationBlock(validation.errors || []);
      return res.status(409).json(buildWritebackBlockedResponse({
        ...block,
        ticketId: queueItemId,
        action: hydratedAction,
        validation,
      }));
    }

    res.status(201).json({
      ok: true,
      action: hydratedAction,
      validation,
      execution: {
        attempted: false,
        reason: hydratedAction?.execution_status === 'approved_for_execution'
          ? 'Writeback action is approved. The Jarvis crawler will pick it up and execute it from the active Jarvis tab.'
          : 'Writeback action was created, but it is not yet approved for crawler execution.',
      },
    });
  } catch (err) {
    console.error('[assignment-actions] POST /tickets/:queueItemId/writeback error:', err.message);
    res.status(500).json({ error: 'Ticket writeback failed', detail: err.message });
  }
});

/* --------------------------------------- */
/* POST /api/assignment-actions/tickets/:queueItemId/odin-owner */
/* Set a local ODIN owner so a single ticket can be tested before broad rollout. */
/* --------------------------------------- */
router.post('/tickets/:queueItemId/odin-owner', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const queueItemId = parseInt(req.params.queueItemId, 10);
    const employeeId = parseInt(req.body?.employeeId, 10);
    if (!Number.isInteger(queueItemId)) return res.status(400).json({ error: 'Invalid queue item id' });
    if (!Number.isInteger(employeeId)) return res.status(400).json({ error: 'employeeId is required' });

    const ticket = await loadQueueItem(queueItemId);
    if (!ticket) return res.status(404).json({ error: 'Queue ticket not found' });

    const employee = await loadEmployeeWithJarvisFields(employeeId);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const jarvisOwnerCode = firstText(employee.jarvis_owner_code);
    const jarvisDisplayName = firstText(employee.jarvis_display_name);
    if (!jarvisOwnerCode || !jarvisDisplayName) {
      return res.status(409).json(buildWritebackBlockedResponse({
        reason: 'employee_not_eligible',
        message: 'Employee has no complete Jarvis mapping. Configure Jarvis display name and owner code first.',
        ticketId: queueItemId,
        executionStatus: 'skipped',
      }));
    }

    const ownerValue = jarvisOwnerCode || jarvisDisplayName || employeeDisplayName(employee);
    const { rows } = await pool.query(
      `UPDATE queue_items
          SET assigned_worker_id = $2,
              assigned_at = NOW(),
              owner = $3,
              updated_at = NOW()
        WHERE id = $1
          AND active = TRUE
        RETURNING *`,
      [queueItemId, employeeId, ownerValue]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Queue ticket not found' });

    res.json({
      ok: true,
      ticket: rows[0],
      employee: publicWritebackEmployee(employee),
      message: `ODIN test owner set to ${employeeDisplayName(employee) || jarvisDisplayName}. Use writeback to let the crawler update Jarvis.`,
    });
  } catch (err) {
    console.error('[assignment-actions] POST /tickets/:queueItemId/odin-owner error:', err.message);
    res.status(500).json({ error: 'Failed to set ODIN ticket owner', detail: err.message });
  }
});

/* --------------------------------------- */
/* POST /api/assignment-actions/tickets/reset-all */
/* Reset all active ODIN ticket assignments and prepare Jarvis unassign actions. */
/* --------------------------------------- */
router.post('/tickets/reset-all', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const tickets = await loadOdinAssignedTickets();
    if (tickets.length === 0) {
      return res.json({
        ok: true,
        resetCount: 0,
        actionCount: 0,
        validationFailedCount: 0,
        actions: [],
        message: 'No active ODIN ticket assignments found.',
      });
    }

    const settings = await loadWritebackSettings();
    const requestedBy = req.user?.name || req.user?.email || 'unknown';
    const actions = [];
    const validations = [];

    for (const ticket of tickets) {
      const employee = employeeFromAssignedTicket(ticket);
      const jarvisOwnerCode = firstText(employee.jarvis_owner_code);
      if (!jarvisOwnerCode) continue;

      const action = await assignmentActionRepository.create(buildTicketActionFields({
        ticket,
        employee,
        actionType: ACTION_TYPES.UNASSIGN,
        settings,
        requestedBy,
        currentOwnerCode: jarvisOwnerCode,
        reason: 'odin_bulk_reset_requested',
      }));
      const validation = await validateCreatedAction(action);
      validations.push(validation);
      actions.push(await assignmentActionRepository.findById(action.id));
    }

    const { rows } = await pool.query(
      `UPDATE queue_items
          SET assigned_worker_id = NULL,
              assigned_at = NULL,
              owner = NULL,
              updated_at = NOW()
        WHERE active = TRUE
          AND assigned_worker_id IS NOT NULL
        RETURNING id`
    );

    const validationFailedCount = validations.filter((validation) => validation && !validation.valid).length;

    res.json({
      ok: true,
      resetCount: rows.length,
      actionCount: actions.length,
      validationFailedCount,
      actions: actions.slice(0, 20),
      message: actions.length > 0
        ? 'ODIN assignments reset and Jarvis unassign actions prepared.'
        : 'ODIN assignments reset. No Jarvis owner codes were available for unassign actions.',
    });
  } catch (err) {
    console.error('[assignment-actions] POST /tickets/reset-all error:', err.message);
    res.status(500).json({ error: 'Bulk ticket assignment reset failed', detail: err.message });
  }
});

/* --------------------------------------- */
/* POST /api/assignment-actions/tickets/:queueItemId/reset */
/* Reset ODIN's local assignment and prepare an optional Jarvis unassign action. */
/* --------------------------------------- */
router.post('/tickets/:queueItemId/reset', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const queueItemId = parseInt(req.params.queueItemId, 10);
    if (!Number.isInteger(queueItemId)) return res.status(400).json({ error: 'Invalid queue item id' });

    const ticket = await loadQueueItem(queueItemId);
    if (!ticket) return res.status(404).json({ error: 'Queue ticket not found' });
    if (!ticket.assigned_worker_id) {
      return res.status(409).json({ error: 'Ticket has no ODIN assignment to reset', code: 'NO_ODIN_ASSIGNMENT' });
    }

    const employee = await loadEmployeeWithJarvisFields(ticket.assigned_worker_id);
    const employeeName = employeeDisplayName(employee);
    const jarvisDisplayName = firstText(employee?.jarvis_display_name);
    const jarvisOwnerCode = firstText(employee?.jarvis_owner_code);
    const settings = await loadWritebackSettings();
    const requestedBy = req.user?.name || req.user?.email || 'unknown';

    const { rows } = await pool.query(
      `UPDATE queue_items
          SET assigned_worker_id = NULL,
              assigned_at = NULL,
              owner = CASE
                WHEN LOWER(COALESCE(owner, '')) IN (LOWER(COALESCE($2, '')), LOWER(COALESCE($3, '')), LOWER(COALESCE($4, '')))
                  THEN NULL
                ELSE owner
              END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [queueItemId, employeeName, jarvisDisplayName, jarvisOwnerCode]
    );

    let action = null;
    let validation = null;
    if (jarvisOwnerCode) {
      action = await assignmentActionRepository.create(buildTicketActionFields({
        ticket,
        employee,
        actionType: ACTION_TYPES.UNASSIGN,
        settings,
        requestedBy,
        currentOwnerCode: jarvisOwnerCode,
        reason: 'odin_reset_requested',
      }));
      validation = await validateCreatedAction(action);
      action = await assignmentActionRepository.findById(action.id);
    }

    res.json({
      ok: true,
      ticket: rows[0],
      action,
      validation,
      message: action
        ? 'ODIN assignment reset and Jarvis unassign action prepared.'
        : 'ODIN assignment reset. No Jarvis owner code was available for an unassign action.',
    });
  } catch (err) {
    console.error('[assignment-actions] POST /tickets/:queueItemId/reset error:', err.message);
    res.status(500).json({ error: 'Ticket assignment reset failed', detail: err.message });
  }
});

/* ─────────────────────────────────────── */
/* GET /api/assignment-actions/:id         */
/* Get a single action with its audit log  */
/* ─────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const action = await assignmentActionRepository.findById(id);
    if (!action) return res.status(404).json({ error: 'Assignment action not found' });

    const auditLogs = await assignmentAuditRepository.findByActionId(id);
    res.json({ action, auditLogs });
  } catch (err) {
    console.error('[assignment-actions] GET /:id error:', err.message);
    res.status(500).json({ error: 'Failed to load assignment action' });
  }
});

/* ─────────────────────────────────────── */
/* POST /api/assignment-actions/:id/validate */
/* ─────────────────────────────────────── */
router.post('/:id/validate', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const result = await validateAssignmentAction(id);
    res.json(result);
  } catch (err) {
    console.error('[assignment-actions] POST /:id/validate error:', err.message);
    res.status(500).json({ error: 'Validation failed', detail: err.message });
  }
});

/* ─────────────────────────────────────── */
/* POST /api/assignment-actions/:id/approve */
/* ─────────────────────────────────────── */
router.post('/:id/approve', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const approvedBy = req.user?.name || req.user?.email || 'unknown';
    const result = await approveAssignmentAction(id, approvedBy);
    res.json(result);
  } catch (err) {
    console.error('[assignment-actions] POST /:id/approve error:', err.message);
    if (err.message.includes('Cannot approve')) return res.status(409).json({ error: err.message });
    res.status(500).json({ error: 'Approval failed', detail: err.message });
  }
});

/* ─────────────────────────────────────── */
/* POST /api/assignment-actions/:id/execute */
/* ─────────────────────────────────────── */
router.post('/:id/execute', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    // Settings check
    const settings = await loadWritebackSettings();
    if (!settings.enabled) {
      return res.status(403).json({ error: 'Assignment writeback is disabled (writeback.enabled=false)' });
    }
    if (settings.killSwitch) {
      return res.status(403).json({ error: 'Assignment writeback kill switch is active' });
    }
    if (settings.mode === 'shadow_only') {
      return res.status(403).json({
        error: 'Shadow mode active: ODIN would apply this assignment, but Jarvis will not be changed',
        mode: 'shadow_only',
      });
    }

    const allowMockAdapter = process.env.WRITEBACK_USE_MOCK_ADAPTER === 'true' || process.env.NODE_ENV === 'test';
    if (!allowMockAdapter) {
      return res.status(501).json({
        error: 'Direct backend writeback execution is disabled',
        code: 'WRITEBACK_EXECUTION_OWNED_BY_CRAWLER',
        detail: 'Jarvis writeback is executed by the Chrome crawler because only the crawler runs inside the Jarvis browser tab.',
      });
    }

    const adapter = new MockJarvisUiAdapter();
    const result = await executeAssignmentAction(id, adapter);
    res.json(result);
  } catch (err) {
    console.error('[assignment-actions] POST /:id/execute error:', err.message);
    if (err.message.includes('not in an executable status')) return res.status(409).json({ error: err.message });
    res.status(500).json({ error: 'Execution failed', detail: err.message });
  }
});

/* ─────────────────────────────────────── */
/* POST /api/assignment-actions/:id/cancel  */
/* ─────────────────────────────────────── */
router.post('/:id/cancel', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const cancelledBy = req.user?.name || req.user?.email || 'unknown';
    const result = await cancelAssignmentAction(id, cancelledBy);
    res.json(result);
  } catch (err) {
    console.error('[assignment-actions] POST /:id/cancel error:', err.message);
    if (err.message.includes('Cannot cancel')) return res.status(409).json({ error: err.message });
    res.status(500).json({ error: 'Cancel failed', detail: err.message });
  }
});

/* ─────────────────────────────────────── */
/* GET /api/assignment-actions/:id/audit   */
/* Audit log for a specific action         */
/* ─────────────────────────────────────── */
router.get('/:id/audit', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const action = await assignmentActionRepository.findById(id);
    if (!action) return res.status(404).json({ error: 'Assignment action not found' });

    const logs = await assignmentAuditRepository.findByActionId(id);
    res.json({ action, logs });
  } catch (err) {
    console.error('[assignment-actions] GET /:id/audit error:', err.message);
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});

export default router;
