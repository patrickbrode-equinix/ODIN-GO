/* ------------------------------------------------ */
/* ODIN ASSIGNMENT ENGINE – TICKET PRIORITIZATION   */
/* Deterministic scoring per specification.          */
/* ------------------------------------------------ */

import { QUEUE_TYPE, PRIORITY_TIER } from "./constants.js";

/**
 * Assigns a priority tier + sub-score to a single ticket.
 *
 * Rules (strict order):
 *   1. TT High    → tier 1
 *   2. TT Medium  → tier 2
 *   3. KPI SH/CC by remaining time  → tier 3
 *   4. Scheduled  → tier 4
 *   5. TT Low     → tier 5
 *   6. Remaining SH + CC by remaining time → tier 6
 *
 * Sub-score within a tier: lower remaining_hours = higher urgency.
 *
 * @param {object} ticket - queue_items row
 * @param {Set<string>} manualExclusions - set of system_name blocked from auto-assign
 * @returns {{ tier: number, subScore: number, reason: string, excluded: boolean, exclusionReason: string|null }}
 */
export function scoreTicket(ticket, manualExclusions = new Set()) {
  const queueType = ticket.queue_type || "";
  const severity = (ticket.severity || "").toLowerCase().trim();
  const status = (ticket.status || "").toLowerCase().trim();
  const systemName = (ticket.system_name || "").trim();
  const remainingHours = ticket.remaining_hours != null ? Number(ticket.remaining_hours) : null;
  const schedStart = ticket.sched_start;

  // Check manual exclusion
  if (systemName && manualExclusions.has(systemName)) {
    return {
      tier: 999,
      subScore: 0,
      reason: "Manuell ausgeschlossen (System Name auf Ausnahmeliste)",
      excluded: true,
      exclusionReason: `System Name "${systemName}" auf manueller Ausnahmeliste`,
    };
  }

  // Check if ticket is already owned/closed
  if (status.includes("closed") || status.includes("completed") || status.includes("cancelled")) {
    return {
      tier: 999,
      subScore: 0,
      reason: "Ticket geschlossen/abgeschlossen",
      excluded: true,
      exclusionReason: `Status: ${ticket.status}`,
    };
  }

  // Remaining hours → sub-score (lower = more urgent = better rank)
  // Use a high default so tickets without remaining time sort last within their tier
  const subScore = remainingHours != null && Number.isFinite(remainingHours)
    ? remainingHours
    : 99999;

  // Trouble Tickets by severity
  if (queueType === QUEUE_TYPE.TROUBLE_TICKETS) {
    if (severity === "high" || severity === "1" || severity === "critical") {
      return { tier: PRIORITY_TIER.TT_HIGH, subScore, reason: "Trouble Ticket High", excluded: false, exclusionReason: null };
    }
    if (severity === "medium" || severity === "2") {
      return { tier: PRIORITY_TIER.TT_MEDIUM, subScore, reason: "Trouble Ticket Medium", excluded: false, exclusionReason: null };
    }
    if (severity === "low" || severity === "3" || severity === "4") {
      return { tier: PRIORITY_TIER.TT_LOW, subScore, reason: "Trouble Ticket Low", excluded: false, exclusionReason: null };
    }
    // Unknown severity → treat as medium
    return { tier: PRIORITY_TIER.TT_MEDIUM, subScore, reason: `Trouble Ticket (Severity: ${severity || "unbekannt"})`, excluded: false, exclusionReason: null };
  }

  // Scheduled tickets (have sched_start in the future)
  if (schedStart) {
    const schedMs = new Date(schedStart).getTime();
    if (Number.isFinite(schedMs) && schedMs > Date.now()) {
      return { tier: PRIORITY_TIER.SCHEDULED, subScore, reason: "Scheduled Ticket", excluded: false, exclusionReason: null };
    }
  }

  // KPI-relevant SH / CC: tickets with remaining_hours defined and relevant
  if (queueType === QUEUE_TYPE.SMART_HANDS || queueType === QUEUE_TYPE.CROSS_CONNECT) {
    // KPI-relevant = has commit date based remaining time tracking
    if (remainingHours != null && Number.isFinite(remainingHours)) {
      return { tier: PRIORITY_TIER.KPI_REMAINING, subScore, reason: `KPI ${queueType} (Restzeit: ${remainingHours.toFixed(1)}h)`, excluded: false, exclusionReason: null };
    }

    // No remaining time → lowest SH/CC tier
    return { tier: PRIORITY_TIER.REMAINING_SH_CC, subScore, reason: `${queueType} (ohne Restzeit)`, excluded: false, exclusionReason: null };
  }

  // Fallback for unknown queue types
  return { tier: PRIORITY_TIER.REMAINING_SH_CC, subScore: 99999, reason: `Sonstiges Ticket (${queueType})`, excluded: false, exclusionReason: null };
}

/**
 * Sort tickets by priority (tier asc, then subScore asc = lowest remaining time first).
 *
 * @param {object[]} tickets - array of queue_items rows
 * @param {Set<string>} manualExclusions
 * @returns {{ ticket: object, score: object }[]}
 */
export function prioritizeTickets(tickets, manualExclusions = new Set()) {
  const scored = tickets.map((t) => ({
    ticket: t,
    score: scoreTicket(t, manualExclusions),
  }));

  scored.sort((a, b) => {
    if (a.score.tier !== b.score.tier) return a.score.tier - b.score.tier;
    return a.score.subScore - b.score.subScore;
  });

  return scored;
}
