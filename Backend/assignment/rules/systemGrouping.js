/* ================================================ */
/* Assignment Engine — System Name Grouping         */
/* ================================================ */

import { MAX_SH_PER_WORKER_PER_SYSTEM, SIMILAR_TIME_THRESHOLD_MS } from '../constants.js';
import { getAssignmentRuntimeRules } from '../services/runtimeRules.js';

/**
 * Evaluate system name grouping for a worker/ticket pair.
 *
 * Rules:
 *   Tickets with the same system name should be assigned to the same worker.
 *
 *   SmartHands:    max 3 tickets per worker per system name
 *   CrossConnect:  group freely if remaining times are similar (< 6h diff)
 *
 * @param {object}   worker               - Worker object
 * @param {object}   ticket               - Normalized ticket with .systemName, .type, .dueAt
 * @param {object[]} workerCurrentTickets  - Tickets currently assigned to this worker
 * @param {number}   [now]                - Current time ms (for testing)
 * @returns {{ grouped: boolean, score: number, reason: string, blocked?: boolean }}
 */
export function evaluateSystemGrouping(worker, ticket, workerCurrentTickets = [], now = Date.now()) {
  const runtimeRules = getAssignmentRuntimeRules();
  const maxShPerSystem = Number(runtimeRules.maxShPerSystem || MAX_SH_PER_WORKER_PER_SYSTEM);
  const similarTimeThresholdMs = Number(runtimeRules.similarTimeThresholdMs || SIMILAR_TIME_THRESHOLD_MS);

  if (!ticket.systemName) {
    return {
      grouped: false,
      score: 0,
      reason: 'Ticket has no system name — grouping not applicable',
    };
  }

  const systemTickets = workerCurrentTickets.filter(t =>
    t.systemName && t.systemName.toLowerCase().trim() === ticket.systemName.toLowerCase().trim()
  );

  if (systemTickets.length === 0) {
    return {
      grouped: false,
      score: 0,
      reason: `Worker has no tickets for system "${ticket.systemName}"`,
    };
  }

  // SmartHands: max 3 per worker per system name
  if (ticket.type === 'SmartHands') {
    if (systemTickets.length >= maxShPerSystem) {
      return {
        grouped: false,
        score: -1, // negative = actively blocked
        reason: `SmartHands limit reached: ${systemTickets.length}/${maxShPerSystem} for system "${ticket.systemName}"`,
        blocked: true,
      };
    }
    return {
      grouped: true,
      score: 10 + systemTickets.length,
      reason: `SmartHands grouping: ${systemTickets.length}/${maxShPerSystem} for system "${ticket.systemName}"`,
    };
  }

  // CrossConnect: group freely if remaining times are similar (< 6h diff)
  if (ticket.type === 'CrossConnect') {
    if (!ticket.dueAt) {
      // No due date on incoming ticket → group freely
      return {
        grouped: true,
        score: 10 + systemTickets.length,
        reason: `CrossConnect grouping: no due date — grouping with ${systemTickets.length} existing ticket(s)`,
      };
    }

    const ticketRemaining = new Date(ticket.dueAt).getTime() - now;
    const allSimilar = systemTickets.every(t => {
      if (!t.dueAt) return true;
      const existing = new Date(t.dueAt).getTime() - now;
      return Math.abs(ticketRemaining - existing) < similarTimeThresholdMs;
    });

    if (allSimilar) {
      return {
        grouped: true,
        score: 10 + systemTickets.length,
        reason: `CrossConnect grouping: remaining times are similar (< 6h diff) for system "${ticket.systemName}"`,
      };
    }

    return {
      grouped: false,
      score: 0,
      reason: `CrossConnect remaining times differ by > 6h for system "${ticket.systemName}" — no grouping`,
    };
  }

  // Other ticket types: soft preference for same system name
  return {
    grouped: true,
    score: 5 + systemTickets.length,
    reason: `System name grouping: ${systemTickets.length} existing ticket(s) for "${ticket.systemName}"`,
  };
}
