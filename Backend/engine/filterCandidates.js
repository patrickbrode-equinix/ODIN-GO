/* ------------------------------------------------ */
/* ODIN ASSIGNMENT ENGINE – CANDIDATE FILTERING     */
/* Role-based, sort-purity, exclusion logic.        */
/* ------------------------------------------------ */

import { QUEUE_TYPE, NO_TICKET_ROLES, HANDOVER_TYPE } from "./constants.js";

/**
 * @typedef {object} Candidate
 * @property {string} name
 * @property {string} shift - F | S | N | ABW
 * @property {string[]} roles - role codes assigned for the day
 * @property {string|null} currentQueueType - queue_type of currently assigned tickets (for sort purity)
 * @property {number} assignedCount - current ticket count
 * @property {string[]} assignedSystemNames - system_names of currently assigned tickets
 */

/**
 * Filter candidates for a specific ticket.
 * Returns { eligible: Candidate[], excluded: { candidate: string, reason: string }[] }
 *
 * @param {object} ticket - queue_items row
 * @param {Candidate[]} candidates - all available employees for the shift
 * @param {object} config - engine config values
 * @returns {{ eligible: Candidate[], excluded: { candidate: string, reason: string }[] }}
 */
export function filterCandidates(ticket, candidates, config = {}) {
  const queueType = ticket.queue_type || "";
  const systemName = (ticket.system_name || "").trim();
  const remainingHours = ticket.remaining_hours != null ? Number(ticket.remaining_hours) : null;

  const maxTicketsSH = config.max_tickets_per_person_sh ?? 3;

  const eligible = [];
  const excluded = [];

  for (const c of candidates) {
    const roles = c.roles || [];

    // ── 1. ABW (absent) → never eligible
    if (c.shift === "ABW") {
      excluded.push({ candidate: c.name, reason: "Abwesend (ABW)" });
      continue;
    }

    // ── 2. No-Ticket roles → skip
    const hasBlockingRole = roles.some((r) => NO_TICKET_ROLES.includes(r));
    if (hasBlockingRole) {
      const blockingRoles = roles.filter((r) => NO_TICKET_ROLES.includes(r));
      excluded.push({ candidate: c.name, reason: `Rolle blockiert Auto-Zuweisung: ${blockingRoles.join(", ")}` });
      continue;
    }

    // ── 3. Deutsche Börse role → only TT or CC >24h remaining
    if (roles.includes("deutsche_boerse")) {
      if (queueType === QUEUE_TYPE.TROUBLE_TICKETS) {
        // allowed
      } else if (queueType === QUEUE_TYPE.CROSS_CONNECT && remainingHours != null && remainingHours > 24) {
        // allowed
      } else {
        excluded.push({ candidate: c.name, reason: `Deutsche Börse: darf nur TT oder CC >24h (aktuell ${queueType}, Restzeit ${remainingHours?.toFixed(1) ?? "unbekannt"}h)` });
        continue;
      }
    }

    // ── 4. Cross Connect role → only CC tickets
    if (roles.includes("crossconnect")) {
      if (queueType !== QUEUE_TYPE.CROSS_CONNECT) {
        excluded.push({ candidate: c.name, reason: `CrossConnect-Rolle: darf nur CC-Tickets (aktuell ${queueType})` });
        continue;
      }
    }

    // ── 5. Sortenreinheit (sort purity)
    // If currently working SH → no CC, and vice versa
    if (c.currentQueueType) {
      if (c.currentQueueType === QUEUE_TYPE.SMART_HANDS && queueType === QUEUE_TYPE.CROSS_CONNECT) {
        excluded.push({ candidate: c.name, reason: "Sortenreinheit: bearbeitet aktuell Smart Hands, kein CC" });
        continue;
      }
      if (c.currentQueueType === QUEUE_TYPE.CROSS_CONNECT && queueType === QUEUE_TYPE.SMART_HANDS) {
        excluded.push({ candidate: c.name, reason: "Sortenreinheit: bearbeitet aktuell Cross Connect, kein SH" });
        continue;
      }
    }

    // ── 6. Max tickets per person (Smart Hands)
    if (queueType === QUEUE_TYPE.SMART_HANDS && c.assignedCount >= maxTicketsSH) {
      excluded.push({ candidate: c.name, reason: `Max SH-Tickets erreicht (${c.assignedCount}/${maxTicketsSH})` });
      continue;
    }

    // ── Passed all filters
    eligible.push(c);
  }

  return { eligible, excluded };
}

/**
 * Rank eligible candidates for a ticket (best first).
 * Applies system-name grouping preference.
 *
 * @param {object} ticket
 * @param {Candidate[]} eligible
 * @param {object} config
 * @returns {Candidate[]} - sorted best-first
 */
export function rankCandidates(ticket, eligible, config = {}) {
  const systemName = (ticket.system_name || "").trim();
  const queueType = ticket.queue_type || "";
  const remainingHours = ticket.remaining_hours != null ? Number(ticket.remaining_hours) : null;
  const similarThreshold = config.similar_remaining_hours_threshold ?? 6;

  return [...eligible].sort((a, b) => {
    // Prefer candidate already working on same system_name
    const aHasSystem = systemName && a.assignedSystemNames?.includes(systemName) ? 0 : 1;
    const bHasSystem = systemName && b.assignedSystemNames?.includes(systemName) ? 0 : 1;
    if (aHasSystem !== bHasSystem) return aHasSystem - bHasSystem;

    // Prefer candidate with fewer current tickets (load balancing)
    if (a.assignedCount !== b.assignedCount) return a.assignedCount - b.assignedCount;

    // Alphabetical as final tiebreaker (deterministic)
    return a.name.localeCompare(b.name);
  });
}

/**
 * Determine the dispatcher for "Other Teams" handover tickets.
 *
 * @param {Candidate[]} candidates
 * @returns {Candidate|null}
 */
export function findDispatcher(candidates) {
  return candidates.find((c) => c.roles?.includes("dispatcher")) || null;
}
