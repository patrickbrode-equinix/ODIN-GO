/* ================================================ */
/* Assignment Engine — Process Single Ticket        */
/* ================================================ */

import { validateNormalizedTicket } from '../normalization/normalizeTicket.js';
import { checkRelevance } from '../relevance/checkRelevance.js';
import { applyEligibilityRules } from '../eligibility/rules.js';
import { selectWorker } from '../priority/sortAndSelect.js';
import { buildDecisionLog } from '../logging/decisionLog.js';
import { persistTicketDecision, persistWorkerRotation, applyLiveAssignment } from '../persistence/persist.js';
import { assignmentOverrideRepository } from '../repositories/index.js';
import { checkExclusionList } from '../rules/exclusionList.js';
import { routeHandover } from '../rules/handoverRouter.js';
import { analyticsTracker } from '../analytics/tracker.js';
import { notifyDispatcherManualReview, notifyTicketAssignedToTeams } from '../../services/teamsMessaging.js';
import { readTicketOwnerCandidates, resolveActiveExistingOwner } from '../lib/ownerIdentity.js';

function isExplicitlyEnabled(value) {
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

export function shouldSendAssignmentNotificationAfterAssignment({ mode, liveAssignment } = {}) {
  return mode !== 'live' || liveAssignment?.applied === true;
}

function buildDecisionConfigSnapshot(settings = {}) {
  return {
    mode: settings.mode || settings.executionMode || null,
    currentShiftOnly: settings.currentShiftOnly ?? null,
    planningWindowHours: settings.planningWindowHours ?? null,
    siteStrictness: settings.siteStrictness ?? null,
    responsibilityStrictness: settings.responsibilityStrictness ?? null,
    enableRotationTieBreaker: settings.enableRotationTieBreaker ?? null,
    fallbackTieBreaker: settings.fallbackTieBreaker ?? null,
    insufficientResources: settings.insufficientResources ?? null,
    verificationEnabled: settings.verificationEnabled ?? null,
    pendingBlocksAssignment: settings.pendingBlocksAssignment ?? null,
  };
}

function createDecisionTraceInput(traceContext, settings, overrides = {}) {
  return {
    ticketSelection: traceContext?.ticketSelection || null,
    configSnapshot: traceContext?.configSnapshot || buildDecisionConfigSnapshot(settings),
    ...overrides,
  };
}

function buildNoCandidateReason(ticket, initialCandidates, excludedCandidates) {
  if (initialCandidates.length === 0) {
    return 'Keine Mitarbeiter aus der Wochenplanung für das aktuelle Zeitfenster gefunden';
  }

  const rules = new Set(excludedCandidates.map(candidate => candidate.rule).filter(Boolean));

  if (rules.size === 1 && rules.has('hasUserMapping')) {
    return 'Mitarbeiter aus der Wochenplanung konnten keinem freigegebenen ODIN-Benutzer zugeordnet werden';
  }

  if (rules.size === 1 && rules.has('roleFilter')) {
    return `Für Tickettyp ${ticket.type} blieb nach Rollenprüfung kein zulässiger Kandidat übrig`;
  }

  if (rules.size === 1 && rules.has('isShiftActive')) {
    if (excludedCandidates.some((candidate) => String(candidate.reason || '').includes('Schichtinstanz'))) {
      return 'Das Ticket liegt außerhalb der aktuell aktiven Schichtinstanz; zukünftige Schichten werden hart ausgeschlossen';
    }
    return 'Alle Mitarbeiter aus der Wochenplanung liegen außerhalb der aktuell aktiven Schichtinstanz';
  }

  if (rules.has('hasUserMapping') && rules.has('roleFilter')) {
    return 'Rollen- oder Benutzermapping aus der Wochenplanung ist unvollständig';
  }

  return 'Alle Mitarbeiter aus der Wochenplanung wurden durch Berechtigungs-, Rollen- oder Ausnahme-Regeln ausgeschlossen';
}

/**
 * Process a single normalized ticket through the full assignment pipeline.
 *
 * Steps:
 *   1. Validate normalized ticket
 *   2. Check relevance
 *   3. Check manual overrides
 *   4. Check exclusion list (system name)
 *   5. Route handover (Workload/Terminated/OtherTeams)
 *   6. Apply hard eligibility rules (role, shift, site, responsibility, capacity)
 *   7. Select worker (system grouping → queue purity → workload → colleague signal → worker ID)
 *   8. Build decision log
 *   9. Persist decision + analytics
 *
 * @param {object}  ticket           - NormalizedTicket
 * @param {object[]} candidatePool   - Pre-loaded candidate workers
 * @param {object}  settings         - Engine config
 * @param {number}  runId            - Current run ID
 * @param {Map}     workerTicketsMap - Map<workerId, ticket[]> of current assignments
 * @param {string[]} exclusionList   - System names to exclude
 * @param {string[]} subtypeExclusionList - Subtypes (customer_trouble_type) to exclude
 * @returns {object} Decision log
 */
export async function processTicket(ticket, candidatePool, settings, runId, workerTicketsMap = new Map(), exclusionList = [], subtypeExclusionList = [], traceContext = null) {
  const now = Date.now();
  const insufficientResources = settings.insufficientResources === 'true' || settings.insufficientResources === true;

  try {
    // 1. Validate
    const validationIssues = validateNormalizedTicket(ticket);
    if (validationIssues.length > 0) {
      const log = buildDecisionLog({
        ticket,
        result: 'manual_review',
        assignedWorker: null,
        selectionReason: `Validation issues: ${validationIssues.join('; ')}`,
        rulePath: ['validate'],
        initialCandidates: [],
        excludedCandidates: [],
        remainingCandidates: [],
        decisionTraceInput: createDecisionTraceInput(traceContext, settings),
      });
      await persistTicketDecision(runId, log);
      return log;
    }

    // 2. Relevance check
    const relevance = checkRelevance(ticket, settings);
    if (!relevance.relevant) {
      const log = buildDecisionLog({
        ticket,
        result: 'not_relevant',
        assignedWorker: null,
        selectionReason: relevance.reason,
        rulePath: ['relevance'],
        initialCandidates: [],
        excludedCandidates: [],
        remainingCandidates: [],
        decisionTraceInput: createDecisionTraceInput(traceContext, settings),
      });
      await persistTicketDecision(runId, log);
      return log;
    }

    // 3. Check manual overrides
    const overrides = await assignmentOverrideRepository.findActive(ticket.id);
    if (overrides.length > 0) {
      const override = overrides[0];
      if (override.override_type === 'force_block') {
        const log = buildDecisionLog({
          ticket,
          result: 'blocked',
          assignedWorker: null,
          selectionReason: `Manual override: ${override.reason || 'blocked by operator'}`,
          rulePath: ['relevance', 'override'],
          initialCandidates: [],
          excludedCandidates: [],
          remainingCandidates: [],
          decisionTraceInput: createDecisionTraceInput(traceContext, settings),
        });
        await persistTicketDecision(runId, log);
        return log;
      }
      if (override.override_type === 'force_manual') {
        const log = buildDecisionLog({
          ticket,
          result: 'manual_review',
          assignedWorker: null,
          selectionReason: `Manual override: ${override.reason || 'forced to manual review'}`,
          rulePath: ['relevance', 'override'],
          initialCandidates: [],
          excludedCandidates: [],
          remainingCandidates: [],
          decisionTraceInput: createDecisionTraceInput(traceContext, settings),
        });
        await persistTicketDecision(runId, log);
        return log;
      }
      // force_assign is handled below after eligibility
    }

    // 4. Check exclusion list (system name)
    const exclusionResult = checkExclusionList(ticket, exclusionList);
    if (exclusionResult.excluded) {
      const log = buildDecisionLog({
        ticket,
        result: 'manual_review',
        assignedWorker: null,
        selectionReason: exclusionResult.reason,
        rulePath: ['relevance', 'override-check', 'exclusion-list'],
        initialCandidates: [],
        excludedCandidates: [],
        remainingCandidates: [],
        decisionTraceInput: createDecisionTraceInput(traceContext, settings),
      });
      await persistTicketDecision(runId, log);
      try {
        await notifyDispatcherManualReview({
          ticket,
          reason: exclusionResult.reason,
          category: 'system_exclusion',
          mode: settings.mode,
        });
      } catch (notificationError) {
        console.warn(`[ASSIGNMENT] Dispatcher notification failed for ticket ${ticket?.id}:`, notificationError.message);
      }
      return log;
    }

    // 4b. Check subtype exclusion list (customer_trouble_type)
    const subtypeCandidates = [
      ticket.customerTroubleType,
      ticket.raw?.customer_trouble_type,
      ticket.raw?.customerTroubleType,
      ticket.raw?.subtype,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    if (subtypeExclusionList.length > 0 && subtypeCandidates.length > 0) {
      const subtypeMatch = subtypeCandidates.find((candidate) =>
        subtypeExclusionList.some((entry) => entry.toLowerCase().trim() === candidate.toLowerCase().trim())
      );

      if (subtypeMatch) {
        const log = buildDecisionLog({
          ticket,
          result: 'manual_review',
          assignedWorker: null,
          selectionReason: `Subtype "${subtypeMatch}" is on the subtype exclusion list → manual review`,
          rulePath: ['relevance', 'override-check', 'exclusion-list', 'subtype-exclusion'],
          initialCandidates: [],
          excludedCandidates: [],
          remainingCandidates: [],
          decisionTraceInput: createDecisionTraceInput(traceContext, settings),
        });
        await persistTicketDecision(runId, log);
        try {
          await notifyDispatcherManualReview({
            ticket,
            reason: `Subtype "${subtypeMatch}" is on the subtype exclusion list → manual review`,
            category: 'subtype_exclusion',
            mode: settings.mode,
          });
        } catch (notificationError) {
          console.warn(`[ASSIGNMENT] Dispatcher notification failed for ticket ${ticket?.id}:`, notificationError.message);
        }
        return log;
      }
    }

    // 5. Route handover type
    const handoverResult = routeHandover(ticket);
    if (handoverResult.action === 'manual_review') {
      const log = buildDecisionLog({
        ticket,
        result: 'manual_review',
        assignedWorker: null,
        selectionReason: handoverResult.reason,
        rulePath: ['relevance', 'override-check', 'exclusion-list', 'handover-routing'],
        initialCandidates: [],
        excludedCandidates: [],
        remainingCandidates: [],
        decisionTraceInput: createDecisionTraceInput(traceContext, settings),
      });
      await persistTicketDecision(runId, log);
      return log;
    }

    // Apply handover effect: Terminated → treat as Scheduled
    if (handoverResult.action === 'scheduled') {
      ticket = { ...ticket, type: 'Scheduled', _handoverOverride: true };
    }

    // Unknown type => manual_review
    if (ticket.type === 'Unknown') {
      const log = buildDecisionLog({
        ticket,
        result: 'manual_review',
        assignedWorker: null,
        selectionReason: `Unknown ticket type "${ticket.rawType}" — cannot auto-assign`,
        rulePath: ['relevance', 'override-check', 'exclusion-list', 'handover-routing', 'type-check'],
        initialCandidates: candidatePool.map(c => ({ id: c.id, name: c.name })),
        excludedCandidates: [],
        remainingCandidates: [],
        decisionTraceInput: createDecisionTraceInput(traceContext, settings),
      });
      await persistTicketDecision(runId, log);
      return log;
    }

    // 6. Candidates
    const initialCandidates = [...candidatePool];

    const activeExistingOwner = resolveActiveExistingOwner(ticket, initialCandidates);
    if (activeExistingOwner) {
      const existingOwnerCandidates = readTicketOwnerCandidates(ticket);
      const existingOwnerLabel = existingOwnerCandidates[0] || activeExistingOwner.name;
      const log = buildDecisionLog({
        ticket,
        result: 'blocked',
        assignedWorker: null,
        selectionReason: `Ticket hat bereits einen aktiven Owner (${existingOwnerLabel} → ${activeExistingOwner.name}) in der laufenden Schicht`,
        rulePath: ['relevance', 'override-check', 'exclusion-list', 'handover-routing', 'type-check', 'existing-owner-active'],
        initialCandidates,
        excludedCandidates: [],
        remainingCandidates: [],
        decisionTraceInput: createDecisionTraceInput(traceContext, settings, {
          existingOwner: {
            rawOwner: existingOwnerLabel,
            matchedWorkerId: activeExistingOwner.id,
            matchedWorkerName: activeExistingOwner.name,
          },
        }),
      });
      await persistTicketDecision(runId, log);
      return log;
    }

    const emptyPoolReason = buildNoCandidateReason(ticket, initialCandidates, []);
    if (initialCandidates.length === 0) {
      const log = buildDecisionLog({
        ticket,
        result: 'no_candidate',
        assignedWorker: null,
        selectionReason: emptyPoolReason,
        rulePath: ['relevance', 'override-check', 'exclusion-list', 'handover-routing', 'type-check', 'candidates'],
        initialCandidates: [],
        excludedCandidates: [],
        remainingCandidates: [],
        decisionTraceInput: createDecisionTraceInput(traceContext, settings, {
          noAssignmentReason: emptyPoolReason,
        }),
      });
      await persistTicketDecision(runId, log);
      return log;
    }

    // 7. Apply hard eligibility rules before ranking begins
    const excludedCandidates = [];
    const eligibleCandidates = [];
    const allRulesChecked = [];

    for (const worker of initialCandidates) {
      const workerTickets = workerTicketsMap.get(worker.id) || [];
      const result = applyEligibilityRules(worker, ticket, settings, workerTickets, insufficientResources, now);
      allRulesChecked.push(...result.checkedRules);
      if (result.eligible) {
        eligibleCandidates.push(worker);
      } else {
        for (const excl of result.exclusions) {
          excludedCandidates.push({
            id: worker.id,
            name: worker.name,
            reason: excl.reason,
            rule: excl.rule,
            role: worker.role,
            weekplanRole: worker.weekplanRole || null,
            shiftCode: worker.shiftCode || null,
            shiftActive: worker.shiftActive !== false,
            planningSource: worker.planningSource || null,
            userMapped: worker.userMapped !== false,
            plannedEmployeeName: worker.plannedEmployeeName || worker.name,
          });
        }
      }
    }

    // Deduplicate rule names
    const rulePath = [
      'relevance', 'override-check', 'exclusion-list', 'handover-routing', 'type-check',
      'eligibility', ...new Set(allRulesChecked),
    ];

    const noCandidateReason = buildNoCandidateReason(ticket, initialCandidates, excludedCandidates);
    if (eligibleCandidates.length === 0) {
      const log = buildDecisionLog({
        ticket,
        result: 'no_candidate',
        assignedWorker: null,
        selectionReason: noCandidateReason,
        rulePath,
        initialCandidates,
        excludedCandidates,
        remainingCandidates: [],
        decisionTraceInput: createDecisionTraceInput(traceContext, settings, {
          noAssignmentReason: noCandidateReason,
        }),
      });
      await persistTicketDecision(runId, log);
      return log;
    }

    // 8. Select worker using spec tie-breaking
    const selection = await selectWorker(eligibleCandidates, ticket, settings, workerTicketsMap, insufficientResources, now);

    if (!selection.worker) {
      const log = buildDecisionLog({
        ticket,
        result: 'manual_review',
        assignedWorker: null,
        selectionReason: selection.reason || 'Could not determine a unique worker',
        rulePath: [...rulePath, 'worker-selection'],
        initialCandidates,
        excludedCandidates,
        remainingCandidates: eligibleCandidates,
        decisionTraceInput: createDecisionTraceInput(traceContext, settings, {
          candidateRanking: selection.ranking || [],
        }),
      });
      await persistTicketDecision(runId, log);
      return log;
    }

    // 9. Build decision
    const finalRulePath = [...rulePath, 'worker-selection'];
    if (selection.tieBreaker) finalRulePath.push(`tie-breaker:${selection.tieBreaker}`);

    const log = buildDecisionLog({
      ticket,
      result: 'assigned',
      assignedWorker: selection.worker,
      selectionReason: selection.reason,
      rulePath: finalRulePath,
      initialCandidates,
      excludedCandidates,
      remainingCandidates: eligibleCandidates,
      decisionTraceInput: createDecisionTraceInput(traceContext, settings, {
        candidateRanking: selection.ranking || [],
        selectionTieBreaker: selection.tieBreaker || null,
      }),
    });

    // Persist decision
    await persistTicketDecision(runId, log);

    // Update worker's ticket map (so subsequent tickets see this assignment)
    const workerTickets = workerTicketsMap.get(selection.worker.id) || [];
    workerTickets.push({
      id: ticket.id,
      externalId: ticket.externalId,
      type: ticket.type,
      priority: ticket.priority,
      systemName: ticket.systemName,
      dueAt: ticket.dueAt,
      scheduledStart: ticket.scheduledStart,
    });
    workerTicketsMap.set(selection.worker.id, workerTickets);

    // Apply live assignment (no-op in shadow mode)
    const liveAssignment = await applyLiveAssignment(ticket, selection.worker, settings.mode);

    if (settings.mode === 'live' && liveAssignment?.applied && isExplicitlyEnabled(settings.enableRotationTieBreaker)) {
      try {
        await persistWorkerRotation(ticket.site || selection.worker.site || '_global', selection.worker.id);
      } catch (_) {
        // Rotation persistence is best effort and must not break the assignment itself.
      }
    }

    // Track analytics
    try {
      await analyticsTracker.trackAssignment({
        ticketId: ticket.id,
        workerId: selection.worker.id,
        workerName: selection.worker.name,
        ticketType: ticket.type,
        result: 'assigned',
      });
    } catch (_) { /* best effort */ }

    let notificationStatus = { skipped: true, reason: 'notification_not_attempted' };
    if (shouldSendAssignmentNotificationAfterAssignment({ mode: settings.mode, liveAssignment })) {
      try {
        notificationStatus = await notifyTicketAssignedToTeams({
          ticket,
          worker: selection.worker,
          mode: settings.mode,
          runId,
          assignedBy: settings.triggeredBy || settings.triggered_by || 'ODIN',
        });
      } catch (notificationError) {
        notificationStatus = {
          success: false,
          sent: false,
          reason: notificationError instanceof Error ? notificationError.message : String(notificationError),
        };
        console.warn(`[ASSIGNMENT] Teams assignment notification failed for ticket ${ticket?.id}:`, notificationStatus.reason);
      }
    } else {
      notificationStatus = { skipped: true, reason: liveAssignment?.reason || 'live_assignment_not_applied' };
    }
    log.notificationStatus = notificationStatus;

    return log;

  } catch (err) {
    console.error(`[ASSIGNMENT] Error processing ticket ${ticket?.id}:`, err.message);
    const log = buildDecisionLog({
      ticket: ticket || { id: 'unknown', normalizationWarnings: [], raw: {} },
      result: 'error',
      assignedWorker: null,
      selectionReason: null,
      rulePath: ['error'],
      initialCandidates: [],
      excludedCandidates: [],
      remainingCandidates: [],
      errorMessage: err.message,
      decisionTraceInput: createDecisionTraceInput(traceContext, settings),
    });
    try { await persistTicketDecision(runId, log); } catch (_) { /* best effort */ }
    return log;
  }
}
