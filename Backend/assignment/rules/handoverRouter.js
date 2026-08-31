/* ================================================ */
/* Assignment Engine — Handover Routing             */
/* ================================================ */

import { HANDOVER_TYPES } from '../constants.js';

/**
 * Route a ticket based on its handover type.
 *
 * Rules:
 *   Workload Handover    → treat as normal open ticket next shift
 *   Terminated Handover  → treat as scheduled ticket
 *   OtherTeams Handover  → assign to dispatcher only, never to normal staff
 *
 * @param {object} ticket - Normalized ticket with .handoverType
 * @returns {{ action: string, reason: string, effectiveType: string }}
 */
export function routeHandover(ticket) {
  if (!ticket.handoverType) {
    return {
      action: 'normal',
      reason: 'No handover type — process as normal ticket',
      effectiveType: ticket.type,
    };
  }

  const ht = ticket.handoverType.toLowerCase().trim();

  switch (ht) {
    case HANDOVER_TYPES.WORKLOAD:
      return {
        action: 'normal',
        reason: 'Workload handover — treat as normal open ticket for next shift',
        effectiveType: ticket.type,
      };

    case HANDOVER_TYPES.TERMINATED:
      return {
        action: 'scheduled',
        reason: 'Terminated handover — treat as scheduled ticket',
        effectiveType: 'Scheduled',
      };

    case HANDOVER_TYPES.OTHER_TEAMS:
      return {
        action: 'dispatcher_only',
        reason: 'OtherTeams handover — assign to dispatcher only, never to normal staff',
        effectiveType: ticket.type,
      };

    default:
      return {
        action: 'manual_review',
        reason: `Unknown handover type "${ticket.handoverType}" — requires manual review`,
        effectiveType: ticket.type,
      };
  }
}
