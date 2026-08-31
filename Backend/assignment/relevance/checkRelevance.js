/* ================================================ */
/* Assignment Engine — Relevance Check              */
/* ================================================ */

import { ACTIVE_STATUSES, CLOSED_STATUSES } from '../constants.js';

/**
 * Check whether a normalized ticket is relevant for assignment processing.
 * Returns { relevant: boolean, reason: string }
 */
export function checkRelevance(ticket, settings = {}) {
  const supportedTypes = settings.supportedTicketTypes
    ? settings.supportedTicketTypes.split(',').map(t => t.trim())
    : ['TroubleTicket', 'SmartHands', 'CrossConnect', 'Scheduled', 'Other'];
  const temporalReference = ticket.scheduledStart || ticket.dueAt;

  // Closed tickets are not relevant
  if (CLOSED_STATUSES.includes(ticket.status)) {
    return { relevant: false, reason: `Ticket status "${ticket.status}" is closed/cancelled` };
  }

  // Only active statuses
  if (!ACTIVE_STATUSES.includes(ticket.status)) {
    return { relevant: false, reason: `Ticket status "${ticket.status}" is not an active status` };
  }

  // Manual hold
  if (ticket.manualHold) {
    return { relevant: false, reason: 'Ticket is on manual hold' };
  }

  // Not auto-assignable
  if (!ticket.autoAssignable) {
    return { relevant: false, reason: 'Ticket is not auto-assignable' };
  }

  // Unsupported type
  if (!supportedTypes.includes(ticket.type)) {
    if (ticket.type === 'Unknown') {
      // Unknown type => manual_review (handled differently)
      return { relevant: true, reason: 'Unknown type — will route to manual_review' };
    }
    return { relevant: false, reason: `Ticket type "${ticket.type}" is not supported` };
  }

  // Planning window check
  if (settings.planningWindowHours && temporalReference) {
    const windowMs = Number(settings.planningWindowHours) * 60 * 60 * 1000;
    const now = Date.now();
    const dueTime = new Date(temporalReference).getTime();
    // Tickets already overdue are RELEVANT (urgent)
    // Tickets beyond the planning window are not actively processed
    if (dueTime > now + windowMs) {
      return { relevant: false, reason: `Ticket start/due date is beyond planning window (${settings.planningWindowHours}h)` };
    }
  }

  // Missing critical fields => still relevant but will go to manual_review
  if (!ticket.id) {
    return { relevant: false, reason: 'Ticket has no ID' };
  }

  return { relevant: true, reason: 'Ticket is relevant for assignment' };
}
