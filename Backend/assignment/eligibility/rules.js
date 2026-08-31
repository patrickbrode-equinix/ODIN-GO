/* ================================================ */
/* Assignment Engine — Eligibility Rules            */
/* ================================================ */

import { applyRoleFilter } from '../rules/roleFilter.js';
import { checkQueuePurity } from '../rules/queuePurity.js';
import { evaluateTicketCapacity } from '../rules/ticketCapacity.js';
import { isMomentInShiftWindow, isShiftCodeActiveNow } from '../candidates/loadCandidates.js';

/**
 * Each rule function returns:
 *   { eligible: boolean, rule: string, reason: string }
 */

/**
 * Check shift verification status.
 * Workers who haven't confirmed availability (pending/sick/wrong_shift/absent)
 * are excluded from automatic assignment when the feature is active.
 */
export function isVerified(worker, settings = {}) {
  // Feature disabled or no verification data loaded → skip rule
  if (!settings.verificationEnabled) {
    return { eligible: true, rule: 'isVerified', reason: 'Verification feature is disabled' };
  }

  const status = worker.verificationStatus;

  // No verification record yet → treat based on config
  if (!status || status === 'no_record') {
    if (settings.pendingBlocksAssignment === true || settings.pendingBlocksAssignment === 'true') {
      return {
        eligible: false,
        rule: 'isVerified',
        reason: `${worker.name} hat sich noch nicht verifiziert (kein Eintrag) — Zuweisung blockiert`,
      };
    }
    return { eligible: true, rule: 'isVerified', reason: 'No verification record; assignment allowed by config' };
  }

  if (status === 'verified') {
    return { eligible: true, rule: 'isVerified', reason: `${worker.name} ist verifiziert und verfügbar` };
  }

  if (status === 'pending') {
    if (settings.pendingBlocksAssignment === true || settings.pendingBlocksAssignment === 'true') {
      return {
        eligible: false,
        rule: 'isVerified',
        reason: `${worker.name} hat die Verfügbarkeit noch nicht bestätigt (Pending)`,
      };
    }
    return { eligible: true, rule: 'isVerified', reason: `${worker.name} is pending but assignment allowed by config` };
  }

  // sick, wrong_shift, absent, no_response, failed → always block
  return {
    eligible: false,
    rule: 'isVerified',
    reason: `${worker.name} Verifizierungsstatus ist '${status}' — nicht für Zuweisung freigegeben`,
  };
}

export function isWorkerAutoAssignable(worker) {
  if (!worker.autoAssignable) {
    return { eligible: false, rule: 'isWorkerAutoAssignable', reason: `${worker.name} is not auto-assignable` };
  }
  return { eligible: true, rule: 'isWorkerAutoAssignable', reason: 'Worker is auto-assignable' };
}

function isShadowExecution(settings) {
  return settings?.executionMode === 'shadow' || settings?.executionMode === 'dry-run';
}

export function hasUserMapping(worker, settings = {}) {
  if (worker.userMapped === false) {
    if (isShadowExecution(settings)) {
      return {
        eligible: true,
        rule: 'hasUserMapping',
        reason: `${worker.plannedEmployeeName || worker.name} wird im Shadow-Modus trotz fehlender ODIN-Benutzerzuordnung aus dem Wochenplan berücksichtigt`,
      };
    }
    return {
      eligible: false,
      rule: 'hasUserMapping',
      reason: `${worker.plannedEmployeeName || worker.name} ist im Wochenplan vorhanden, konnte aber keinem freigegebenen ODIN-Benutzer zugeordnet werden`,
    };
  }
  return { eligible: true, rule: 'hasUserMapping', reason: 'Worker is linked to an approved ODIN user' };
}

export function isAvailable(worker) {
  if (worker.blocked) {
    return { eligible: false, rule: 'isAvailable', reason: `${worker.name} is blocked` };
  }
  return { eligible: true, rule: 'isAvailable', reason: 'Worker is available' };
}

export function isNotOnBreak(worker) {
  if (worker.onBreak) {
    return { eligible: false, rule: 'isNotOnBreak', reason: `${worker.name} is on break` };
  }
  return { eligible: true, rule: 'isNotOnBreak', reason: 'Worker is not on break' };
}

export function isNotAbsent(worker) {
  if (worker.absent) {
    return { eligible: false, rule: 'isNotAbsent', reason: `${worker.name} is absent` };
  }
  return { eligible: true, rule: 'isNotAbsent', reason: 'Worker is not absent' };
}

export function isShiftActive(worker, ticket, settingsOrNow = {}, nowOverride = Date.now()) {
  const settings = (settingsOrNow instanceof Date || typeof settingsOrNow === 'number' || typeof settingsOrNow === 'string')
    ? {}
    : (settingsOrNow || {});
  const now = (settingsOrNow instanceof Date || typeof settingsOrNow === 'number' || typeof settingsOrNow === 'string')
    ? settingsOrNow
    : nowOverride;
  const currentMoment = now instanceof Date ? now : new Date(now);
  const scheduledReference = ticket?.scheduledStart || (ticket?.type === 'Scheduled' ? ticket?.dueAt : null);
  const hasShiftWindow = worker?.shiftStart && worker?.shiftEnd;
  const currentShiftOnly = settings?.currentShiftOnly !== false && settings?.currentShiftOnly !== 'false';

  if (hasShiftWindow) {
    const shiftStart = new Date(worker.shiftStart);
    const shiftEnd = new Date(worker.shiftEnd);
    const shiftWindow = {
      start: isNaN(shiftStart.getTime()) ? null : shiftStart,
      end: isNaN(shiftEnd.getTime()) ? null : shiftEnd,
    };

    if (scheduledReference) {
      const scheduledAt = new Date(scheduledReference);
      if (!isNaN(scheduledAt.getTime()) && !isMomentInShiftWindow(scheduledAt, shiftWindow)) {
        return {
          eligible: false,
          rule: 'isShiftActive',
          reason: `${worker.name} liegt mit Schichtinstanz ${worker.shiftStart} bis ${worker.shiftEnd} außerhalb des Ticket-Starts ${scheduledAt.toISOString()}`,
        };
      }

      if (!currentShiftOnly && !isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > currentMoment.getTime()) {
        return {
          eligible: true,
          rule: 'isShiftActive',
          reason: `Worker is planned for the future shift instance ${worker.shiftStart} to ${worker.shiftEnd}`,
        };
      }
    }

    if (!isMomentInShiftWindow(currentMoment, shiftWindow) || worker.shiftActive === false) {
      return {
        eligible: false,
        rule: 'isShiftActive',
        reason: `${worker.name} ist nicht Teil der aktuell aktiven Schichtinstanz (${worker.shiftStart} bis ${worker.shiftEnd})`,
      };
    }

    return { eligible: true, rule: 'isShiftActive', reason: 'Worker is on the current active shift instance' };
  }

  if (worker.shiftCode && scheduledReference) {
    const scheduledAt = new Date(scheduledReference);
    if (!isNaN(scheduledAt.getTime()) && !isShiftCodeActiveNow(worker.shiftCode, scheduledAt)) {
      return {
        eligible: false,
        rule: 'isShiftActive',
        reason: `${worker.name} ist für den Ticket-Start ${scheduledAt.toISOString()} laut Wochenplanung nicht im aktiven Schichtfenster (${worker.shiftCode})`,
      };
    }

    if (!currentShiftOnly && !isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > currentMoment.getTime()) {
      return {
        eligible: true,
        rule: 'isShiftActive',
        reason: `${worker.name} ist für das zukünftige Ticket laut geplantem Schichtfenster (${worker.shiftCode}) zulässig`,
      };
    }
  }

  if (worker.shiftActive === false) {
    const shiftLabel = worker.shiftCode ? ` (${worker.shiftCode})` : '';
    return { eligible: false, rule: 'isShiftActive', reason: `${worker.name} ist laut Wochenplanung aktuell nicht im aktiven Schichtfenster${shiftLabel}` };
  }
  return { eligible: true, rule: 'isShiftActive', reason: 'Worker is on active shift' };
}

export function matchesSite(worker, ticket, settings) {
  if (settings.siteStrictness !== 'true' && settings.siteStrictness !== true) {
    return { eligible: true, rule: 'matchesSite', reason: 'Site strictness is disabled' };
  }
  if (!ticket.site) {
    return { eligible: true, rule: 'matchesSite', reason: 'Ticket has no site — skipping site check' };
  }
  if (!worker.site) {
    if (worker.userMapped === false && isShadowExecution(settings)) {
      return {
        eligible: true,
        rule: 'matchesSite',
        reason: `${worker.plannedEmployeeName || worker.name} hat keine ODIN-Site-Stammdaten, wird im Shadow-Modus aber trotzdem bewertet`,
      };
    }
    return { eligible: false, rule: 'matchesSite', reason: `${worker.name} has no site assigned (ticket requires ${ticket.site})` };
  }
  const workerSite = worker.site.toLowerCase().trim();
  const ticketSite = ticket.site.toLowerCase().trim();
  if (workerSite !== ticketSite) {
    return { eligible: false, rule: 'matchesSite', reason: `${worker.name} site "${worker.site}" does not match ticket site "${ticket.site}"` };
  }
  return { eligible: true, rule: 'matchesSite', reason: `Site matches: ${worker.site}` };
}

export function matchesResponsibility(worker, ticket, settings) {
  if (settings.responsibilityStrictness !== 'true' && settings.responsibilityStrictness !== true) {
    return { eligible: true, rule: 'matchesResponsibility', reason: 'Responsibility strictness is disabled' };
  }
  if (!ticket.responsibility) {
    return { eligible: true, rule: 'matchesResponsibility', reason: 'Ticket has no responsibility — skipping check' };
  }
  if (!worker.responsibility) {
    if (worker.userMapped === false && isShadowExecution(settings)) {
      return {
        eligible: true,
        rule: 'matchesResponsibility',
        reason: `${worker.plannedEmployeeName || worker.name} hat keine ODIN-Responsibility-Stammdaten, wird im Shadow-Modus aber trotzdem bewertet`,
      };
    }
    return { eligible: false, rule: 'matchesResponsibility', reason: `${worker.name} has no responsibility assigned (ticket requires ${ticket.responsibility})` };
  }
  const wResp = worker.responsibility.toLowerCase().trim();
  const tResp = ticket.responsibility.toLowerCase().trim();
  if (wResp !== tResp) {
    return { eligible: false, rule: 'matchesResponsibility', reason: `${worker.name} responsibility "${worker.responsibility}" does not match ticket "${ticket.responsibility}"` };
  }
  return { eligible: true, rule: 'matchesResponsibility', reason: `Responsibility matches: ${worker.responsibility}` };
}

/**
 * Apply role-based filtering rules.
 * Wraps the spec role filter into the eligibility framework.
 */
export function checkRole(worker, ticket, now = Date.now()) {
  return applyRoleFilter(worker, ticket, now);
}

/**
 * Apply queue purity rule.
 * Wraps the queue purity check into the eligibility framework.
 */
export function checkQueueClean(worker, ticket, workerCurrentTickets = [], insufficientResources = false, now = Date.now()) {
  const result = checkQueuePurity(worker, ticket, workerCurrentTickets, insufficientResources, now);
  return {
    eligible: result.pure,
    rule: 'queuePurity',
    reason: result.reason,
  };
}

export function checkTicketCapacity(worker, ticket, workerCurrentTickets = []) {
  return evaluateTicketCapacity(worker, ticket, workerCurrentTickets);
}

/**
 * Check if the worker's shift is too close to ending.
 * If cutoffMinutesBeforeShiftEnd is set, no new tickets should be assigned
 * to workers whose shift ends within that many minutes.
 */
export function isNotNearShiftEnd(worker, settings = {}, now = Date.now()) {
  const cutoffMinutes = parseInt(settings.cutoffMinutesBeforeShiftEnd, 10);
  if (!cutoffMinutes || cutoffMinutes <= 0) {
    return { eligible: true, rule: 'isNotNearShiftEnd', reason: 'Shift-end cutoff is disabled (0 or not set)' };
  }
  if (!worker.shiftEnd) {
    return { eligible: true, rule: 'isNotNearShiftEnd', reason: 'Worker has no shift end time — skipping cutoff check' };
  }
  const shiftEnd = new Date(worker.shiftEnd);
  if (isNaN(shiftEnd.getTime())) {
    return { eligible: true, rule: 'isNotNearShiftEnd', reason: 'Worker shift end is not a valid date — skipping cutoff check' };
  }
  const currentMoment = now instanceof Date ? now : new Date(now);
  const cutoffMs = cutoffMinutes * 60 * 1000;
  const cutoffTime = new Date(shiftEnd.getTime() - cutoffMs);
  if (currentMoment >= cutoffTime) {
    return {
      eligible: false,
      rule: 'isNotNearShiftEnd',
      reason: `${worker.name} Schichtende in weniger als ${cutoffMinutes} Min. (${shiftEnd.toISOString()}) — keine neuen Zuweisungen`,
    };
  }
  return { eligible: true, rule: 'isNotNearShiftEnd', reason: `Worker shift ends at ${shiftEnd.toISOString()}, still ${cutoffMinutes}+ min remaining` };
}

/**
 * Check if the worker already has too many tickets with the same system_name
 * for a given ticket type (SmartHands / CrossConnect).
 * Uses type-specific configurable limits.
 */
export function checkSameSystemLimit(worker, ticket, workerCurrentTickets = [], settings = {}) {
  if (!ticket.systemName) {
    return { eligible: true, rule: 'sameSystemLimit', reason: 'Ticket has no system_name — skipping same-system limit' };
  }

  const ticketType = (ticket.type || '').toLowerCase();
  let maxLimit = 0;
  if (ticketType === 'smarthands') {
    maxLimit = parseInt(settings.maxSameSystemSmartHands, 10) || 3;
  } else if (ticketType === 'crossconnect') {
    maxLimit = parseInt(settings.maxSameSystemCrossConnect, 10) || 2;
  } else {
    return { eligible: true, rule: 'sameSystemLimit', reason: `No same-system limit configured for type ${ticket.type}` };
  }

  const sameSystemCount = workerCurrentTickets.filter(
    (t) => t.systemName && t.systemName.toLowerCase() === ticket.systemName.toLowerCase()
  ).length;

  if (sameSystemCount >= maxLimit) {
    return {
      eligible: false,
      rule: 'sameSystemLimit',
      reason: `${worker.name} hat bereits ${sameSystemCount}/${maxLimit} Tickets für System "${ticket.systemName}" (${ticket.type})`,
    };
  }

  return {
    eligible: true,
    rule: 'sameSystemLimit',
    reason: `Worker has ${sameSystemCount}/${maxLimit} tickets for system "${ticket.systemName}" (${ticket.type})`,
  };
}

/**
 * Apply all eligibility rules to a single worker for a given ticket.
 * Returns { eligible, exclusions: [{rule, reason}] }
 *
 * @param {object} worker               - Worker object (with .role, .shiftActive, etc.)
 * @param {object} ticket               - Normalized ticket
 * @param {object} settings             - Engine config
 * @param {object[]} workerCurrentTickets - Current tickets assigned to this worker
 * @param {boolean} insufficientResources - Global insufficient resources flag
 * @param {number} [now]                 - Current time ms
 */
export function applyEligibilityRules(worker, ticket, settings, workerCurrentTickets = [], insufficientResources = false, now = Date.now()) {
  const rules = [
    () => hasUserMapping(worker, settings),
    () => isWorkerAutoAssignable(worker),
    () => isAvailable(worker),
    () => isNotOnBreak(worker),
    () => isNotAbsent(worker),
    () => isVerified(worker, settings),
    () => isShiftActive(worker, ticket, settings, now),
    () => isNotNearShiftEnd(worker, settings, now),
    () => checkRole(worker, ticket, now),
    () => matchesSite(worker, ticket, settings),
    () => matchesResponsibility(worker, ticket, settings),
    () => checkTicketCapacity(worker, ticket, workerCurrentTickets),
    () => checkSameSystemLimit(worker, ticket, workerCurrentTickets, settings),
  ];

  const exclusions = [];
  const checkedRules = [];

  for (const ruleFn of rules) {
    const result = ruleFn();
    checkedRules.push(result.rule);
    if (!result.eligible) {
      exclusions.push({ rule: result.rule, reason: result.reason });
    }
  }

  return {
    eligible: exclusions.length === 0,
    exclusions,
    checkedRules,
  };
}
