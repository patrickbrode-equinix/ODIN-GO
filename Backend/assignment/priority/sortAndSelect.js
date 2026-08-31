/* ================================================ */
/* Assignment Engine — Ticket Sorting & Worker      */
/*                     Selection (Deterministic)    */
/* ================================================ */

import { PRIORITY_ORDER, PRIORITY_TIERS } from '../constants.js';
import { evaluateSystemGrouping } from '../rules/systemGrouping.js';
import { checkQueuePurity } from '../rules/queuePurity.js';
import { getAssignmentRuntimeRules } from '../services/runtimeRules.js';
import { assignmentRotationRepository } from '../repositories/index.js';
import pool from '../../db.js';

function getTicketRemainingMs(ticket, now = Date.now()) {
  return ticket.dueAt ? new Date(ticket.dueAt).getTime() - now : Infinity;
}

function getTicketScheduledMs(ticket) {
  return ticket.scheduledStart ? new Date(ticket.scheduledStart).getTime() : Infinity;
}

function getTicketCreatedMs(ticket) {
  return ticket.createdAt ? new Date(ticket.createdAt).getTime() : Infinity;
}

function formatTraceDuration(ms) {
  if (!Number.isFinite(ms) || ms === Infinity) return null;

  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function getPriorityTierLabel(ticket, tier) {
  if (tier === PRIORITY_TIERS.TT_HIGH) {
    return ticket.priority === 'critical'
      ? 'Critical TroubleTicket'
      : 'High TroubleTicket';
  }
  if (tier === PRIORITY_TIERS.TT_MEDIUM) return 'Medium TroubleTicket';
  if (tier === PRIORITY_TIERS.KPI) return 'KPI Queue Ticket';
  if (tier === PRIORITY_TIERS.SCHEDULED) return 'Scheduled Ticket';
  if (tier === PRIORITY_TIERS.TT_LOW) return 'Low TroubleTicket';
  return 'Fallback Tier';
}

function getTicketDisplayNumber(ticket) {
  return ticket.externalId || ticket.id || null;
}

function buildPriorityFactors(ticket, now = Date.now()) {
  const tier = getPriorityTier(ticket);
  const priorityOrder = PRIORITY_ORDER[ticket.priority] ?? 4;
  const remainingMs = getTicketRemainingMs(ticket, now);
  const scheduledMs = getTicketScheduledMs(ticket);
  const createdMs = getTicketCreatedMs(ticket);
  const factors = [
    {
      key: 'priority-tier',
      label: 'Priority tier',
      value: `Tier ${tier}`,
      detail: getPriorityTierLabel(ticket, tier),
      emphasis: 'high',
    },
  ];

  if (tier === PRIORITY_TIERS.TT_HIGH) {
    factors.push({
      key: 'ticket-priority',
      label: 'Ticket priority',
      value: String(ticket.priority || 'unknown'),
      detail: 'Critical ranks ahead of high inside the top TroubleTicket tier',
      emphasis: 'high',
    });
  }

  factors.push({
    key: 'remaining-time',
    label: 'Remaining time',
    value: formatTraceDuration(remainingMs) || 'No due time',
    detail: Number.isFinite(remainingMs) && remainingMs !== Infinity
      ? 'Lower remaining commit time is processed first'
      : 'Tickets without due time fall behind tickets with due time',
    emphasis: 'medium',
  });

  factors.push({
    key: 'scheduled-start',
    label: 'Scheduled start',
    value: ticket.scheduledStart || 'Not scheduled',
    detail: 'Earlier scheduled work starts before later scheduled work',
    emphasis: 'medium',
  });

  factors.push({
    key: 'created-at',
    label: 'Created at',
    value: ticket.createdAt || 'Unknown',
    detail: 'Older tickets win if higher priority signals are equal',
    emphasis: 'low',
  });

  factors.push({
    key: 'stable-ticket-id',
    label: 'Stable fallback',
    value: String(ticket.id || ''),
    detail: 'Stable lexical ticket ID order guarantees reproducible runs',
    emphasis: 'low',
  });

  return {
    tier,
    tierLabel: getPriorityTierLabel(ticket, tier),
    priorityOrder,
    remainingMs: Number.isFinite(remainingMs) && remainingMs !== Infinity ? remainingMs : null,
    remainingLabel: formatTraceDuration(remainingMs),
    scheduledMs: Number.isFinite(scheduledMs) && scheduledMs !== Infinity ? scheduledMs : null,
    createdMs: Number.isFinite(createdMs) && createdMs !== Infinity ? createdMs : null,
    factors,
  };
}

export function buildTicketPrioritySnapshot(ticket, now = Date.now()) {
  const snapshot = buildPriorityFactors(ticket, now);

  return {
    ticketId: String(ticket.id),
    displayTicketNumber: getTicketDisplayNumber(ticket),
    ticketType: ticket.type || null,
    ticketPriority: ticket.priority || null,
    queue: ticket.queue || ticket.type || null,
    priorityTier: snapshot.tier,
    priorityTierLabel: snapshot.tierLabel,
    remainingMinutes: snapshot.remainingMs == null ? null : Math.max(0, Math.round(snapshot.remainingMs / 60000)),
    remainingTimeLabel: snapshot.remainingLabel,
    scheduledStart: ticket.scheduledStart || null,
    createdAt: ticket.createdAt || null,
    factors: snapshot.factors,
  };
}

export function compareTicketsByPriority(a, b, now = Date.now()) {
  // 1. Primary: priority tier
  const aTier = getPriorityTier(a);
  const bTier = getPriorityTier(b);
  if (aTier !== bTier) return aTier - bTier;

  // 2. Within tier 1: critical before high
  if (aTier === PRIORITY_TIERS.TT_HIGH) {
    const aPrio = PRIORITY_ORDER[a.priority] ?? 4;
    const bPrio = PRIORITY_ORDER[b.priority] ?? 4;
    if (aPrio !== bPrio) return aPrio - bPrio;
  }

  // 3. Lowest remaining commit time (due date closest to now first)
  const aRemaining = getTicketRemainingMs(a, now);
  const bRemaining = getTicketRemainingMs(b, now);
  if (aRemaining !== bRemaining) return aRemaining - bRemaining;

  // 4. Earliest scheduled time
  const aSched = getTicketScheduledMs(a);
  const bSched = getTicketScheduledMs(b);
  if (aSched !== bSched) return aSched - bSched;

  // 5. Oldest ticket creation
  if (a.createdAt && b.createdAt) {
    const aCreated = getTicketCreatedMs(a);
    const bCreated = getTicketCreatedMs(b);
    if (aCreated !== bCreated) return aCreated - bCreated;
  } else if (a.createdAt) {
    return -1;
  } else if (b.createdAt) {
    return 1;
  }

  // 6. Stable fallback: ticket ID (lexicographic)
  return String(a.id).localeCompare(String(b.id));
}

export function explainTicketOrderDecision(winner, runnerUp, now = Date.now()) {
  const winnerLabel = getTicketDisplayNumber(winner) || winner.id;
  const runnerUpLabel = getTicketDisplayNumber(runnerUp) || runnerUp.id;
  const winnerTier = getPriorityTier(winner);
  const runnerUpTier = getPriorityTier(runnerUp);

  if (winnerTier !== runnerUpTier) {
    return `${winnerLabel} outranks ${runnerUpLabel} because priority tier ${winnerTier} (${getPriorityTierLabel(winner, winnerTier)}) beats tier ${runnerUpTier} (${getPriorityTierLabel(runnerUp, runnerUpTier)})`;
  }

  if (winnerTier === PRIORITY_TIERS.TT_HIGH) {
    const winnerPriority = PRIORITY_ORDER[winner.priority] ?? 4;
    const runnerUpPriority = PRIORITY_ORDER[runnerUp.priority] ?? 4;
    if (winnerPriority !== runnerUpPriority) {
      return `${winnerLabel} outranks ${runnerUpLabel} because ${winner.priority || 'unknown'} priority beats ${runnerUp.priority || 'unknown'} inside the top TroubleTicket tier`;
    }
  }

  const winnerRemaining = getTicketRemainingMs(winner, now);
  const runnerUpRemaining = getTicketRemainingMs(runnerUp, now);
  if (winnerRemaining !== runnerUpRemaining) {
    return `${winnerLabel} outranks ${runnerUpLabel} because its remaining commit time (${formatTraceDuration(winnerRemaining) || 'n/a'}) is lower than ${formatTraceDuration(runnerUpRemaining) || 'n/a'}`;
  }

  const winnerScheduled = getTicketScheduledMs(winner);
  const runnerUpScheduled = getTicketScheduledMs(runnerUp);
  if (winnerScheduled !== runnerUpScheduled) {
    return `${winnerLabel} outranks ${runnerUpLabel} because its scheduled start is earlier`;
  }

  const winnerCreated = getTicketCreatedMs(winner);
  const runnerUpCreated = getTicketCreatedMs(runnerUp);
  if (winnerCreated !== runnerUpCreated) {
    return `${winnerLabel} outranks ${runnerUpLabel} because it is older and all higher-order factors are equal`;
  }

  return `${winnerLabel} outranks ${runnerUpLabel} by stable lexical ticket ID fallback`;
}

/**
 * Compute the priority tier for a ticket according to the spec:
 *
 *   Tier 1: TroubleTicket High (and Critical)
 *   Tier 2: TroubleTicket Medium
 *   Tier 3: KPI queue tickets (SmartHands, CrossConnect) — sorted by remaining time
 *   Tier 4: Scheduled tickets
 *   Tier 5: TroubleTicket Low
 *   Tier 6: Everything else
 *
 * @param {object} ticket - Normalized ticket
 * @returns {number} Tier number (lower = higher priority)
 */
export function getPriorityTier(ticket) {
  const runtimeRules = getAssignmentRuntimeRules();
  const ticketType = String(ticket.type || '').trim();
  const ticketPriority = String(ticket.priority || 'unknown').trim().toLowerCase();

  for (const rule of runtimeRules.priorityTiers || []) {
    const typeMatch = (rule.types || []).includes(ticketType);
    const priorityMatch = !rule.priorities || rule.priorities.length === 0 || rule.priorities.includes(ticketPriority);
    if (typeMatch && priorityMatch) {
      return rule.tier;
    }
  }

  if (ticketType === 'TroubleTicket') return PRIORITY_TIERS.TT_LOW;
  return PRIORITY_TIERS.OTHER;
}

/**
 * Sort tickets by the spec-defined deterministic priority rules:
 *
 *   Primary: Priority tier (1-6)
 *   Within same tier:
 *     - Lowest remaining commit time (dueAt - now)
 *     - Earliest scheduled time (scheduledStart)
 *     - Oldest ticket creation (createdAt)
 *   Ultimate fallback: ticket ID (lexicographic)
 *
 * Within tier 1: critical before high
 * Within tier 3 (KPI): lowest remaining time first
 *
 * @param {object[]} tickets - Array of normalized tickets
 * @param {number}   [now]   - Current time ms (for testing)
 * @returns {object[]} Sorted copy of the array
 */
export function sortTickets(tickets, now = Date.now()) {
  return [...tickets].sort((a, b) => compareTicketsByPriority(a, b, now));
}

function buildCandidateRankingEntry(entry, finalRank, selected, selectionBlocked) {
  const rankingFactors = [];

  if (selectionBlocked) {
    rankingFactors.push(entry._groupingReason || 'Selection blocked by system grouping policy');
  } else if (entry.groupingGrouped && entry.groupingScore > 0) {
    rankingFactors.push(`System grouping score ${entry.groupingScore}`);
  }

  rankingFactors.push(entry.purityPure ? 'Queue purity preserved' : 'Queue purity neutral');
  rankingFactors.push(`Current workload ${entry.workload}`);

  if (entry.colleagueScore > 0) {
    rankingFactors.push(`Colleague proximity ${entry.colleagueScore}`);
  }

  return {
    employeeId: entry.candidate.id,
    employeeName: entry.candidate.name,
    role: entry.candidate.role || null,
    weekplanRole: entry.candidate.weekplanRole || null,
    shiftCode: entry.candidate.shiftCode || null,
    shiftPlanningDate: entry.candidate.shiftPlanningDate || null,
    shiftStart: entry.candidate.shiftStart || null,
    shiftEnd: entry.candidate.shiftEnd || null,
    workload: entry.workload,
    groupingScore: entry.groupingScore,
    queuePure: entry.purityPure,
    colleagueScore: entry.colleagueScore,
    selectionBlocked,
    blockingReason: selectionBlocked ? (entry._groupingReason || 'Selection blocked by system grouping policy') : null,
    rankingFactors,
    scoreBreakdown: {
      groupingScore: entry.groupingScore,
      queuePure: entry.purityPure,
      workload: entry.workload,
      colleagueScore: entry.colleagueScore,
    },
    finalRank,
    selected,
  };
}

function isExplicitlyEnabled(value) {
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

function getFallbackTieBreaker(settings) {
  const fallback = String(settings?.fallbackTieBreaker || 'stable-id').trim().toLowerCase();
  return fallback === 'random' ? 'random' : 'stable-id';
}

function getRotationSiteKey(ticket, candidates = []) {
  const site = ticket?.site || candidates[0]?.site || '_global';
  return String(site || '_global').trim() || '_global';
}

function moveWinnerToFront(sortedEntries, winner) {
  const ordered = [...sortedEntries];
  const winnerIndex = ordered.findIndex(entry => entry.candidate.id === winner.candidate.id);
  if (winnerIndex > 0) {
    const [selected] = ordered.splice(winnerIndex, 1);
    ordered.unshift(selected);
  }
  return ordered;
}

function pickRoundRobinWinner(tiedEntries, lastAssignedWorkerId) {
  const sorted = [...tiedEntries].sort((a, b) => a.candidate.id - b.candidate.id);
  if (sorted.length === 0) return null;

  if (!Number.isInteger(lastAssignedWorkerId)) {
    return sorted[0];
  }

  const nextHigher = sorted.find(entry => entry.candidate.id > lastAssignedWorkerId);
  if (nextHigher) return nextHigher;
  return sorted[0];
}

async function resolveConfiguredFinalTie(tiedEntries, ticket, settings) {
  const rotationEnabled = isExplicitlyEnabled(settings?.enableRotationTieBreaker);
  const siteKey = getRotationSiteKey(ticket, tiedEntries.map(entry => entry.candidate));

  if (rotationEnabled) {
    try {
      const rotationState = await assignmentRotationRepository.getForSite(siteKey);
      const lastAssignedWorkerId = Number.isInteger(rotationState?.last_assigned_worker_id)
        ? rotationState.last_assigned_worker_id
        : Number.parseInt(rotationState?.last_assigned_worker_id, 10);
      const roundRobinWinner = pickRoundRobinWinner(tiedEntries, lastAssignedWorkerId);
      if (roundRobinWinner) {
        return {
          winner: roundRobinWinner,
          tieBreaker: 'round-robin',
          reason: `round-robin rotation at site ${siteKey}`,
        };
      }
    } catch {
      // Rotation state is best effort only; fall through to fallback tie-breaker.
    }
  }

  const fallbackTieBreaker = getFallbackTieBreaker(settings);
  if (fallbackTieBreaker === 'random') {
    const randomIndex = Math.floor(Math.random() * tiedEntries.length);
    return {
      winner: tiedEntries[randomIndex],
      tieBreaker: 'random',
      reason: 'random fallback among fully equal candidates',
    };
  }

  const stableWinner = [...tiedEntries].sort((a, b) => a.candidate.id - b.candidate.id)[0] || null;
  return {
    winner: stableWinner,
    tieBreaker: 'worker-id',
    reason: 'stable worker ID fallback',
  };
}

/**
 * Load the preferred-colleague graph relevant to a set of candidate workers.
 * Returns a Map<workerId, Set<workerId>> where each entry lists the candidate IDs
 * that the worker has nominated as Wunschkollegen.
 * Only mutual or one-directional links within the candidate pool are returned.
 *
 * @param {object[]} candidates - array of worker objects with id
 * @returns {Promise<Map<number, Set<number>>>}
 */
async function loadColleaguePreferences(candidates) {
  const prefMap = new Map();
  if (!candidates || candidates.length === 0) return prefMap;

  try {
    const candidateIds = candidates.map(c => c.id);
    const nameToId = new Map();
    for (const c of candidates) {
      if (c.name) nameToId.set(c.name.trim(), c.id);
    }

    const { rows } = await pool.query(
      `SELECT user_id, preferred_employee_name FROM preferred_colleagues WHERE user_id = ANY($1)`,
      [candidateIds]
    );

    for (const r of rows) {
      const preferredId = nameToId.get(r.preferred_employee_name?.trim());
      if (preferredId != null && preferredId !== r.user_id) {
        if (!prefMap.has(r.user_id)) prefMap.set(r.user_id, new Set());
        prefMap.get(r.user_id).add(preferredId);
      }
    }
  } catch {
    // Table may not exist yet — ignore, preferences are purely soft
  }

  return prefMap;
}

/**
 * Select the best worker from eligible candidates deterministically.
 *
 * Tie-breaker order (per spec):
 *   1. Least active workload (fewest current tickets)
 *   2. Existing grouped system name (worker already has tickets for this system)
 *   3. Queue purity (worker's queue matches ticket type)
 *   4. Preferred colleague bonus (soft — Wunschkollegen)
 *   5. Configured final tie-breaker: round-robin rotation, random, or stable worker ID
 *
 * @param {object[]} candidates        - Eligible worker objects
 * @param {object}   ticket            - Normalized ticket
 * @param {object}   settings          - Engine settings
 * @param {Map}      workerTicketsMap  - Map<workerId, ticket[]> of current assignments
 * @param {boolean}  insufficientResources - Whether resources are insufficient
 * @param {number}   [now]             - Current time ms
 * @returns {Promise<{ worker: object|null, reason: string, tieBreaker: string|null }>}
 */
export async function selectWorker(candidates, ticket, settings, workerTicketsMap = new Map(), insufficientResources = false, now = Date.now()) {
  const runtimeRules = getAssignmentRuntimeRules();
  if (!candidates || candidates.length === 0) {
    return { worker: null, reason: 'No eligible candidates', tieBreaker: null, ranking: [] };
  }

  if (candidates.length === 1) {
    return {
      worker: candidates[0],
      reason: 'Only one eligible candidate',
      tieBreaker: null,
      ranking: [buildCandidateRankingEntry({
        candidate: candidates[0],
        groupingScore: 0,
        groupingGrouped: false,
        groupingBlocked: false,
        purityPure: true,
        workload: (workerTicketsMap.get(candidates[0].id) || []).length,
        colleagueScore: 0,
        _groupingReason: null,
      }, 1, true, false)],
    };
  }

  // Load preferred-colleague graph for soft tie-breaking
  const prefMap = await loadColleaguePreferences(candidates);

  // Build a set of already-assigned worker IDs (from workerTicketsMap) for colleague proximity
  const assignedWorkerIds = new Set();
  for (const [wId, tickets] of workerTicketsMap.entries()) {
    if (tickets && tickets.length > 0) assignedWorkerIds.add(wId);
  }

  // Score each candidate on the tie-breaking criteria
  const scored = candidates.map(c => {
    const currentTickets = workerTicketsMap.get(c.id) || [];

    // 1. System name grouping score
    const grouping = evaluateSystemGrouping(c, ticket, currentTickets, now);

    // 2. Queue purity score
    const purity = checkQueuePurity(c, ticket, currentTickets, insufficientResources, now);

    // 3. Workload (negative: fewer = better)
    const workload = currentTickets.length;

    // 4. Preferred colleague score (soft)
    //    Count how many of this worker's preferred colleagues are actively assigned.
    //    Higher = slight preference (but never overrides hard rules above).
    let colleagueScore = 0;
    const myPrefs = prefMap.get(c.id);
    if (myPrefs) {
      for (const prefId of myPrefs) {
        if (assignedWorkerIds.has(prefId)) colleagueScore++;
      }
    }
    // Also count reverse: how many other assigned workers nominated this candidate
    for (const [otherId, otherPrefs] of prefMap.entries()) {
      if (otherId !== c.id && otherPrefs.has(c.id) && assignedWorkerIds.has(otherId)) {
        colleagueScore++;
      }
    }

    return {
      candidate: c,
      groupingScore: grouping.score,
      groupingGrouped: grouping.grouped,
      groupingBlocked: grouping.blocked || false,
      purityPure: purity.pure,
      workload,
      colleagueScore,
      // For debugging
      _groupingReason: grouping.reason,
      _purityReason: purity.reason,
    };
  });

  // Remove candidates blocked by system grouping (e.g., SH max 3)
  const unblocked = scored.filter(s => !s.groupingBlocked);
  const sortPool = unblocked.length > 0 ? unblocked : scored;

  // Sort the ranking table by the deterministic scoring dimensions.
  sortPool.sort((a, b) => {
    // 1. Fair distribution within the already role/shift-filtered pool.
    if (runtimeRules.loadBalancing?.enabled !== false && runtimeRules.loadBalancing?.mode === 'least_workload' && a.workload !== b.workload) {
      return a.workload - b.workload;
    }

    // 2. Existing grouped system name (higher score = better)
    if (a.groupingScore !== b.groupingScore) return b.groupingScore - a.groupingScore;

    // 3. Queue purity (pure before impure)
    if (a.purityPure !== b.purityPure) return a.purityPure ? -1 : 1;

    // 4. Preferred colleague bonus (higher = better, soft tiebreaker)
    if (a.colleagueScore !== b.colleagueScore) return b.colleagueScore - a.colleagueScore;

    // 5. Worker ID (deterministic)
    return a.candidate.id - b.candidate.id;
  });

  let finalists = sortPool;
  let tieBreaker = null;
  let finalTieReason = null;

  if (finalists.length > 1 && runtimeRules.loadBalancing?.enabled !== false && runtimeRules.loadBalancing?.mode === 'least_workload') {
    const minimumWorkload = Math.min(...finalists.map(entry => entry.workload));
    finalists = finalists.filter(entry => entry.workload === minimumWorkload);
    if (finalists.length === 1) tieBreaker = 'workload';
  }

  if (finalists.length > 1) {
    const topGroupingScore = Math.max(...finalists.map(entry => entry.groupingScore));
    finalists = finalists.filter(entry => entry.groupingScore === topGroupingScore);
    if (finalists.length === 1) tieBreaker = 'system-grouping';
  }

  if (finalists.length > 1) {
    const prefersPureQueue = finalists.some(entry => entry.purityPure);
    finalists = finalists.filter(entry => entry.purityPure === prefersPureQueue);
    if (finalists.length === 1) tieBreaker = 'queue-purity';
  }

  if (finalists.length > 1) {
    const strongestColleagueScore = Math.max(...finalists.map(entry => entry.colleagueScore));
    finalists = finalists.filter(entry => entry.colleagueScore === strongestColleagueScore);
    if (finalists.length === 1) tieBreaker = 'colleague-preference';
  }

  let winner = finalists[0];
  if (finalists.length > 1) {
    const resolvedTie = await resolveConfiguredFinalTie(finalists, ticket, settings);
    winner = resolvedTie.winner;
    tieBreaker = resolvedTie.tieBreaker;
    finalTieReason = resolvedTie.reason;
  }

  const orderedRanking = moveWinnerToFront(sortPool, winner);
  const rankedSet = new Set(sortPool);
  const ranking = [
    ...orderedRanking.map((entry, index) => buildCandidateRankingEntry(
      entry,
      index + 1,
      entry.candidate.id === winner.candidate.id,
      false,
    )),
    ...scored
      .filter(entry => !rankedSet.has(entry))
      .map(entry => buildCandidateRankingEntry(entry, null, false, true)),
  ];
  const reasons = [];

  if (winner.groupingGrouped && winner.groupingScore > 0) {
    reasons.push(`system grouping (score: ${winner.groupingScore})`);
  }
  if (winner.purityPure) {
    reasons.push('queue purity maintained');
  }
  reasons.push(`workload: ${winner.workload} tickets`);
  if (winner.colleagueScore > 0) {
    reasons.push(`colleague preference: ${winner.colleagueScore}`);
  }
  if (finalTieReason) reasons.push(finalTieReason);
  reasons.push(`worker ID: ${winner.candidate.id}`);

  return {
    worker: winner.candidate,
    reason: `Selected by: ${reasons.join(', ')}`,
    tieBreaker: tieBreaker || 'worker-id',
    ranking,
  };
}

/**
 * @deprecated Use selectWorker with workerTicketsMap instead.
 * Kept for backward compatibility during migration.
 */
export function resolveWorkerTie(tiedCandidates, settings, rotationState, ticket) {
  const sorted = [...tiedCandidates].sort((a, b) => a.id - b.id);
  return { worker: sorted[0], reason: 'Legacy stable ID tie-breaker: lowest worker ID', tieBreaker: 'stable-id' };
}
