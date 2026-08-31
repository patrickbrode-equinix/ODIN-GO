/* ================================================ */
/* Assignment Engine — Queue Purity (Clean Rule)    */
/* ================================================ */

import { MS_24H } from '../constants.js';
import { getAssignmentRuntimeRules } from '../services/runtimeRules.js';

function hasMatchingSystemName(ticket, workerCurrentTickets = []) {
  const incomingSystem = String(ticket?.systemName || '').trim().toLowerCase();
  if (!incomingSystem) return true;

  const currentSystems = workerCurrentTickets
    .map((entry) => String(entry?.systemName || '').trim().toLowerCase())
    .filter(Boolean);

  return currentSystems.length === 0 || currentSystems.every((systemName) => systemName === incomingSystem);
}

function hasMatchingPriority(ticket, workerCurrentTickets = []) {
  const incomingPriority = String(ticket?.priority || '').trim().toLowerCase();
  if (!incomingPriority) return true;

  const currentPriorities = workerCurrentTickets
    .map((entry) => String(entry?.priority || '').trim().toLowerCase())
    .filter(Boolean);

  return currentPriorities.length === 0 || currentPriorities.every((priority) => priority === incomingPriority);
}

/**
 * Enforce queue purity: ticket types should not mix per worker.
 *
 * Rules:
 *   SmartHands workers   → only SmartHands
 *   CrossConnect workers → only CrossConnect
 *
 * Exception:
 *   If resources are insufficient AND CrossConnect remaining time > 24h,
 *   then the worker may also receive Trouble Tickets.
 *
 * @param {object}   worker               - Worker object
 * @param {object}   ticket               - Normalized ticket
 * @param {object[]} workerCurrentTickets  - Tickets currently assigned to this worker
 * @param {boolean}  insufficientResources - System-wide insufficient resources flag
 * @param {number}   [now]                - Current time ms (for testing)
 * @returns {{ pure: boolean, reason: string }}
 */
export function checkQueuePurity(worker, ticket, workerCurrentTickets = [], insufficientResources = false, now = Date.now()) {
  const runtimeRules = getAssignmentRuntimeRules();

  if (!workerCurrentTickets || workerCurrentTickets.length === 0) {
    return {
      pure: true,
      reason: 'Worker has no current tickets — queue is clean',
    };
  }

  const currentTypes = new Set(workerCurrentTickets.map(t => t.type));

  // Worker currently has SmartHands tickets
  if (currentTypes.has('SmartHands')) {
    if (ticket.type === 'SmartHands') {
      return { pure: true, reason: 'SmartHands worker receives SmartHands ticket — queue pure' };
    }
    return {
      pure: false,
      reason: `Worker has SmartHands tickets — cannot mix with "${ticket.type}"`,
    };
  }

  // Worker currently has CrossConnect tickets
  if (currentTypes.has('CrossConnect')) {
    if (ticket.type === 'CrossConnect') {
      return { pure: true, reason: 'CrossConnect worker receives CrossConnect ticket — queue pure' };
    }

    const ccRules = runtimeRules.crossConnectOnly || {};
    const allowedMixedTypes = new Set((ccRules.allowMixedTypes || []).map((entry) => String(entry || '').trim()));
    const canMixWithIncomingType = allowedMixedTypes.has(ticket.type);
    const canUseTroubleTicketException = (
      ticket.type === 'TroubleTicket'
      && ccRules.allowTroubleTicketWhenResourcesTight !== false
      && insufficientResources
    );
    const requiresAdditionalMatchChecks = canMixWithIncomingType || canUseTroubleTicketException;

    if (requiresAdditionalMatchChecks && ccRules.sameSystemOnly && !hasMatchingSystemName(ticket, workerCurrentTickets.filter((entry) => entry.type === 'CrossConnect'))) {
      return {
        pure: false,
        reason: `CrossConnect-Zusatzregel verlangt gleiches System — Ticket ${ticket.type} passt nicht zum bestehenden CC-System`,
      };
    }

    if (requiresAdditionalMatchChecks && ccRules.samePriorityOnly && !hasMatchingPriority(ticket, workerCurrentTickets.filter((entry) => entry.type === 'CrossConnect'))) {
      return {
        pure: false,
        reason: `CrossConnect-Zusatzregel verlangt gleiche Priorität — Ticket ${ticket.type} passt nicht zu den bestehenden CC-Prioritäten`,
      };
    }

    // Exception: insufficient resources + TroubleTicket + all CC remaining > configured threshold
    if (
      ticket.type === 'TroubleTicket'
      && canUseTroubleTicketException
    ) {
      const thresholdMs = Number(ccRules.minRemainingHoursForTroubleTicket || 24) * 3600000;
      const allCcHaveTime = workerCurrentTickets
        .filter(t => t.type === 'CrossConnect')
        .every(t => {
          if (!t.dueAt) return true; // no due date → assume time is available
          return new Date(t.dueAt).getTime() - now > thresholdMs;
        });

      if (allCcHaveTime) {
        return {
          pure: true,
          reason: `Exception: insufficient resources, all CC remaining > ${Math.round(thresholdMs / MS_24H * 24)}h — accepting TroubleTicket`,
        };
      }
    }

    if (canMixWithIncomingType) {
      return {
        pure: true,
        reason: `CrossConnect-Zusatzregel erlaubt Mischung mit "${ticket.type}"`,
      };
    }

    return {
      pure: false,
      reason: `Worker has CrossConnect tickets — cannot mix with "${ticket.type}"`,
    };
  }

  // Worker has TroubleTicket(s) — can also receive Scheduled
  if (currentTypes.has('TroubleTicket')) {
    if (ticket.type === 'TroubleTicket' || ticket.type === 'Scheduled') {
      return { pure: true, reason: `TroubleTicket worker can also receive "${ticket.type}" — queue compatible` };
    }
    return {
      pure: false,
      reason: `Worker has TroubleTicket — cannot mix with "${ticket.type}"`,
    };
  }

  // Worker has Scheduled tickets — can receive TroubleTicket and Scheduled
  if (currentTypes.has('Scheduled')) {
    if (ticket.type === 'TroubleTicket' || ticket.type === 'Scheduled') {
      return { pure: true, reason: `Scheduled worker can also receive "${ticket.type}"` };
    }
    return {
      pure: false,
      reason: `Worker has Scheduled tickets — cannot mix with "${ticket.type}"`,
    };
  }

  // Default: no conflict detected
  return { pure: true, reason: 'No queue purity conflict detected' };
}
