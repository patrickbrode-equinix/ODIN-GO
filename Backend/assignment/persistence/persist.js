/* ================================================ */
/* Assignment Engine — Persistence Layer            */
/* ================================================ */

import {
  assignmentRunRepository,
  assignmentDecisionRepository,
  assignmentRotationRepository,
} from '../repositories/index.js';
import { resolveTicketIdentity } from '../lib/ticketIdentity.js';

/**
 * Persist a complete assignment run (header).
 */
export async function persistAssignmentRun(runId, decisions, status = 'completed', { failureReason, failureStep, errorCategory, summaryExtras, totalTicketsOverride, relevantTicketsOverride } = {}) {
  const counts = { assigned: 0, manual_review: 0, no_candidate: 0, not_relevant: 0, blocked: 0, error: 0, crawler_stale: 0 };
  for (const d of decisions) {
    if (counts[d.result] !== undefined) counts[d.result]++;
  }

  const totalTickets = Number.isInteger(totalTicketsOverride) ? totalTicketsOverride : decisions.length;
  const relevantTickets = Number.isInteger(relevantTicketsOverride)
    ? relevantTicketsOverride
    : Math.max(totalTickets - counts.not_relevant - counts.crawler_stale, 0);

  const summary = {
    totalDecisions: totalTickets,
    ...counts,
    finishedAt: new Date().toISOString(),
    ...(summaryExtras || {}),
  };

  return assignmentRunRepository.finish(runId, {
    status,
    totalTickets,
    relevant: relevantTickets,
    assigned: counts.assigned,
    manualReview: counts.manual_review,
    noCandidate: counts.no_candidate,
    notRelevant: counts.not_relevant,
    blocked: counts.blocked,
    errors: counts.error,
    summary,
    failureReason: failureReason || null,
    failureStep: failureStep || null,
    errorCategory: errorCategory || null,
  });
}

/**
 * Persist a single ticket decision.
 */
export async function persistTicketDecision(runId, decisionLog) {
  return assignmentDecisionRepository.create({
    runId,
    ticketId: decisionLog.ticketId,
    externalId: decisionLog.externalId,
    ticketType: decisionLog.ticketType,
    ticketStatus: decisionLog.ticketStatus,
    ticketPriority: decisionLog.ticketPriority,
    ticketSite: decisionLog.ticketSite,
    result: decisionLog.result,
    assignedWorkerId: decisionLog.assignedWorkerId,
    assignedWorkerName: decisionLog.assignedWorkerName,
    selectionReason: decisionLog.selectionReason,
    shortReason: decisionLog.shortReason,
    rulePath: decisionLog.rulePath,
    initialCandidates: decisionLog.initialCandidates,
    excludedCandidates: decisionLog.excludedCandidates,
    remainingCandidates: decisionLog.remainingCandidates,
    normalizationWarnings: decisionLog.normalizationWarnings,
    normalizedTicket: decisionLog.normalizedTicket,
    rawTicket: decisionLog.rawTicket,
    errorMessage: decisionLog.errorMessage,
    decisionTrace: decisionLog.decisionTrace,
  });
}

/**
 * Update the rotation state after an assignment.
 */
export async function persistWorkerRotation(site, workerId) {
  return assignmentRotationRepository.update(site || '_global', workerId);
}

/**
 * In live mode: apply actual ticket assignment in the DB.
 * In shadow mode: this is a no-op — only logs decisions.
 */
export async function applyLiveAssignment(ticket, worker, mode) {
  if (mode !== 'live') {
    return { applied: false, reason: `${mode} mode — no live assignment written` };
  }

  try {
    // Import pool lazily to avoid circular deps
    const { default: pool } = await import('../../db.js');
    const identity = resolveTicketIdentity(ticket);

    if (identity.internalId == null && (!identity.externalId || !identity.queueType)) {
      return {
        applied: false,
        reason: 'Live assignment skipped: no reliable queue_items identifier available',
      };
    }

    let result = null;

    if (identity.internalId != null) {
      result = await pool.query(
        `UPDATE queue_items
         SET assigned_worker_id = $1, assigned_at = NOW(), owner = $2, updated_at = NOW()
         WHERE id = $3`,
        [worker.id, worker.name, identity.internalId]
      );
    }

    if ((result?.rowCount || 0) === 0 && identity.externalId && identity.queueType) {
      result = await pool.query(
        `UPDATE queue_items
         SET assigned_worker_id = $1, assigned_at = NOW(), owner = $2, updated_at = NOW()
         WHERE queue_type = $3 AND external_id = $4`,
        [worker.id, worker.name, identity.queueType, identity.externalId]
      );
    }

    if ((result?.rowCount || 0) !== 1) {
      const ticketLabel = identity.externalId || String(identity.internalId || ticket.id || 'unknown');
      const rowCount = result?.rowCount || 0;
      console.error(`[ASSIGNMENT] LIVE assignment validation failed for ticket ${ticketLabel}: updated ${rowCount} queue_items rows`);
      return {
        applied: false,
        reason: `Live assignment validation failed: ${rowCount} queue_items rows updated`,
      };
    }

    const ticketLabel = identity.externalId || String(identity.internalId || ticket.id || 'unknown');
    console.log(`[ASSIGNMENT] LIVE: Ticket ${ticketLabel} assigned to ${worker.name} (ID: ${worker.id})`);
    return { applied: true, reason: `Live assignment: ${ticketLabel} → ${worker.name}` };
  } catch (err) {
    console.error(`[ASSIGNMENT] LIVE assignment failed for ticket ${ticket.id}:`, err.message);
    return { applied: false, reason: `Live assignment failed: ${err.message}` };
  }
}
