/* ================================================ */
/* Assignment Engine — Run Assignment Cycle         */
/* ================================================ */

import pool from '../../db.js';
import { assignmentRunRepository } from '../repositories/index.js';
import { assignmentSettingsService } from '../services/index.js';
import { refreshAssignmentRuntimeRules } from '../services/runtimeRules.js';
import { getVerificationSettings } from '../../services/shiftVerification.js';
import { normalizeTicket } from '../normalization/normalizeTicket.js';
import { checkRelevance } from '../relevance/checkRelevance.js';
import { sortTickets, buildTicketPrioritySnapshot, explainTicketOrderDecision } from '../priority/sortAndSelect.js';
import { loadCandidateWorkers, buildCandidatePool, loadWorkerCurrentTickets, loadLastCrawlerTimestamp, loadExclusionList, loadSubtypeExclusionList } from '../candidates/loadCandidates.js';
import { processTicket } from './processTicket.js';
import { persistAssignmentRun, persistTicketDecision } from '../persistence/persist.js';
import { buildRunSummary, buildDecisionLog } from '../logging/decisionLog.js';
import { checkCrawlerFreshness } from '../rules/crawlerGuard.js';
import { routeHandover } from '../rules/handoverRouter.js';
import { AssignmentError } from '../errors.js';
import { CRAWLER_MAX_AGE_MS, SUPPORTED_QUEUE_ITEM_TYPES } from '../constants.js';

const ASSIGNMENT_RUN_ADVISORY_LOCK_KEY = 17042026;

async function acquireAssignmentRunLock() {
  const { rows } = await pool.query(
    `SELECT pg_try_advisory_lock($1) AS locked`,
    [ASSIGNMENT_RUN_ADVISORY_LOCK_KEY],
  );
  return rows[0]?.locked === true;
}

async function releaseAssignmentRunLock() {
  await pool.query(
    `SELECT pg_advisory_unlock($1)`,
    [ASSIGNMENT_RUN_ADVISORY_LOCK_KEY],
  );
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

function buildTicketSelectionTraceMap(sortedTickets, now = Date.now()) {
  const selectionMap = new Map();

  for (let index = 0; index < sortedTickets.length; index++) {
    const ticket = sortedTickets[index];
    const remaining = sortedTickets.slice(index);
    const ticketSnapshot = buildTicketPrioritySnapshot(ticket, now);
    const comparedTickets = remaining.slice(1, 4).map((candidate, candidateIndex) => ({
      ...buildTicketPrioritySnapshot(candidate, now),
      rank: index + candidateIndex + 2,
      selectedFirstBy: explainTicketOrderDecision(ticket, candidate, now),
    }));

    selectionMap.set(String(ticket.id), {
      prioritizationRank: index + 1,
      totalEligibleTickets: sortedTickets.length,
      totalRemainingTickets: remaining.length,
      priorityTier: ticketSnapshot.priorityTier,
      selectedNextReason: comparedTickets[0]?.selectedFirstBy || 'Only eligible ticket remaining after relevance filtering',
      prioritizationFactors: ticketSnapshot.factors,
      comparedTickets,
    });
  }

  return selectionMap;
}

/**
 * Run a complete assignment cycle.
 *
 * Full pipeline:
 *   1.  Create run record
 *   2.  Load settings
 *   3.  CRAWLER STALENESS CHECK (global safety rule)
 *   4.  Load raw tickets
 *   5.  Normalize tickets (incl. handover type, system name, scheduled)
 *   6.  Route handovers (Terminated → Scheduled)
 *   7.  Filter by relevance
 *   8.  Sort by spec priority tiers
 *   9.  Load candidate workers + current workloads
 *   10. Load exclusion list
 *   11. Process each ticket
 *   12. Finalize run
 *
 * Supports ENGINE_MODES: shadow, live, dry-run
 *
 * @param {object} options
 * @param {string} options.triggeredBy - Who triggered this run
 * @param {string} [options.modeOverride] - Override mode
 * @returns {object} Run summary
 */
export async function runAssignmentCycle({ triggeredBy, modeOverride, skipCrawlerCheck } = {}) {
  let run = null;
  const decisions = [];
  let summaryExtras = {};
  let lockAcquired = false;

  try {
    lockAcquired = await acquireAssignmentRunLock();
    if (!lockAcquired) {
      throw new AssignmentError('Another assignment cycle is already running');
    }

    // 1. Load settings
    const settings = await assignmentSettingsService.getEngineConfig();
    await refreshAssignmentRuntimeRules();
    const mode = modeOverride || settings.mode;

    // Enrich with verification settings for eligibility rules
    let verificationCfg = {};
    try { verificationCfg = await getVerificationSettings(); } catch { /* non-fatal */ }
    const executionSettings = {
      ...settings,
      mode,
      executionMode: mode,
      verificationEnabled: verificationCfg.enabled || false,
      pendingBlocksAssignment: verificationCfg.pendingBlocksAssignment,
    };

    // Live mode safety: only allow if explicitly enabled
    if (mode === 'live') {
      const liveEnabled = settings.enableLiveMode === 'true' || settings.enableLiveMode === true;
      if (!liveEnabled) {
        throw new AssignmentError('Live mode is not enabled. Set assignment.enableLiveMode = true to activate.');
      }
    }

    // 2. Create run
    run = await assignmentRunRepository.create({ mode, triggeredBy: triggeredBy || 'system' });
    console.log(`[ASSIGNMENT] Run #${run.id} started (mode: ${mode}, triggered by: ${triggeredBy || 'system'})`);

    // 3. CRAWLER STALENESS CHECK — Global Safety Rule
    // Can be skipped for dry-run/shadow mode when explicitly requested
    const lastCrawlerTimestamp = await loadLastCrawlerTimestamp();
    const defaultCrawlerMaxAgeMinutes = Math.round(CRAWLER_MAX_AGE_MS / (60 * 1000));
    const maxAgeMs = (parseInt(executionSettings.crawlerMaxAgeMinutes) || defaultCrawlerMaxAgeMinutes) * 60 * 1000;
    const freshness = checkCrawlerFreshness(lastCrawlerTimestamp, Date.now(), maxAgeMs);

    const crawlerOverrideActive = skipCrawlerCheck && (mode === 'shadow' || mode === 'dry-run');
    if (crawlerOverrideActive) {
      summaryExtras = { crawlerOverrideActive: true };
    }

    if (!freshness.fresh && !crawlerOverrideActive) {
      console.warn(`[ASSIGNMENT] CRAWLER STALE: ${freshness.reason}`);
      decisions.push({
        ticketId: '_crawler_guard',
        result: 'crawler_stale',
        shortReason: freshness.reason,
      });
      summaryExtras = {
        ...summaryExtras,
        crawlerStale: true,
        crawler_stale: 1,
      };
      await persistAssignmentRun(run.id, decisions, 'failed', {
        failureReason: 'Crawler-Daten zu alt – die zuletzt empfangenen Ticketdaten überschreiten das erlaubte Maximalalter.',
        failureStep: 'crawler_freshness_check',
        errorCategory: 'controlled_stop',
        summaryExtras,
        totalTicketsOverride: 0,
        relevantTicketsOverride: 0,
      });
      return {
        runId: run.id,
        mode,
        status: 'failed',
        crawlerStale: true,
        crawlerReason: freshness.reason,
        totalTickets: 0,
        decisions,
        summary: buildRunSummary([], summaryExtras),
      };
    }

    // 4. Load raw tickets from queue_items
    const { rows: rawTickets } = await pool.query(`
      SELECT * FROM queue_items
      WHERE active = true
        AND is_final_closed = false
        AND queue_type = ANY($2::text[])
        AND external_id IS NOT NULL
        AND btrim(external_id) <> ''
      ORDER BY id
      LIMIT $1
    `, [parseInt(executionSettings.maxTicketsPerRun) || 500, SUPPORTED_QUEUE_ITEM_TYPES]);

    console.log(`[ASSIGNMENT] Loaded ${rawTickets.length} raw tickets`);

    if (rawTickets.length === 0) {
      console.warn(`[ASSIGNMENT] Run #${run.id}: 0 active tickets in queue_items — nothing to process`);
      await persistAssignmentRun(run.id, [], 'completed', { summaryExtras });
      return {
        runId: run.id,
        mode,
        status: 'completed',
        persisted: false,
        simulation: mode !== 'live',
        totalTickets: 0,
        relevantTickets: 0,
        notRelevantTickets: 0,
        decisions: [],
        summary: buildRunSummary([], summaryExtras),
        warnings: ['Keine aktiven Tickets in der Datenbank gefunden — prüfe ob der Crawler aktuelle Daten geliefert hat'],
      };
    }

    // 5. Normalize tickets
    const normalized = rawTickets.map(raw => normalizeTicket(raw));

    // 6. Route handovers: Terminated → Scheduled type
    const routed = normalized.map(ticket => {
      const hr = routeHandover(ticket);
      if (hr.action === 'scheduled') {
        return { ...ticket, type: 'Scheduled', _handoverOverride: true };
      }
      return ticket;
    });

    // 7. Filter by relevance (keep not-relevant for logging)
    const relevant = [];
    const notRelevant = [];
    for (const ticket of routed) {
      const rel = checkRelevance(ticket, executionSettings);
      if (rel.relevant) {
        relevant.push(ticket);
      } else {
        notRelevant.push({ ticket, reason: rel.reason });
      }
    }

    console.log(`[ASSIGNMENT] ${relevant.length} relevant, ${notRelevant.length} not relevant`);

    // 8. Sort relevant tickets by spec priority tiers
    const priorityNow = Date.now();
    const sorted = sortTickets(relevant, priorityNow);
    const ticketSelectionTraceMap = buildTicketSelectionTraceMap(sorted, priorityNow);

    // 9. Load candidate workers + current workloads
    const allWorkers = await loadCandidateWorkers(executionSettings);
    const candidatePool = buildCandidatePool(allWorkers);
    const workerTicketsMap = await loadWorkerCurrentTickets(candidatePool);
    const decisionConfigSnapshot = buildDecisionConfigSnapshot(executionSettings);

    summaryExtras = {
      ...summaryExtras,
      rawQueueTicketCount: rawTickets.length,
      loadedEmployeesFromWeeklyPlan: allWorkers.length,
      loadedRolesFromWeeklyPlan: allWorkers.filter(worker => !!worker.weekplanRole).length,
      loadedCandidatesInCurrentWindow: candidatePool.filter(worker => worker.shiftActive !== false).length,
      unmappedWeeklyPlanEmployees: allWorkers.filter(worker => worker.userMapped === false).length,
    };

    console.log(`[ASSIGNMENT] ${allWorkers.length} workers loaded, ${candidatePool.length} in candidate pool`);

    // 10. Load exclusion list
    const exclusionList = await loadExclusionList();
    const subtypeExclusionList = await loadSubtypeExclusionList();

    // 11. Process each ticket
    // First, log not-relevant tickets
    for (const { ticket, reason } of notRelevant) {
      const log = buildDecisionLog({
        ticket,
        result: 'not_relevant',
        assignedWorker: null,
        selectionReason: reason,
        rulePath: ['relevance'],
        initialCandidates: [],
        excludedCandidates: [],
        remainingCandidates: [],
        decisionTraceInput: {
          configSnapshot: decisionConfigSnapshot,
        },
      });
      decisions.push(log);
      await persistTicketDecision(run.id, log);
    }

    // Process relevant tickets in priority order
    const stopOnError = executionSettings.stopOnCriticalError === 'true';
    for (const ticket of sorted) {
      try {
        const decision = await processTicket(
          ticket,
          candidatePool,
          executionSettings,
          run.id,
          workerTicketsMap,
          exclusionList,
          subtypeExclusionList,
          {
            configSnapshot: decisionConfigSnapshot,
            ticketSelection: ticketSelectionTraceMap.get(String(ticket.id)) || null,
          },
        );
        decisions.push(decision);
      } catch (err) {
        console.error(`[ASSIGNMENT] Critical error processing ticket ${ticket.id}:`, err.message);
        decisions.push({ ticketId: ticket.id, result: 'error', errorMessage: err.message });
        if (stopOnError) {
          console.warn(`[ASSIGNMENT] Stopping run due to stopOnCriticalError`);
          const summary = buildRunSummary(decisions, summaryExtras);
          await persistAssignmentRun(run.id, decisions, 'failed', {
            failureReason: `Run wegen kritischem Fehler gestoppt: ${err.message}`,
            failureStep: 'ticket_processing',
            errorCategory: 'critical_error_stop',
            summaryExtras,
          });
          return {
            runId: run.id,
            mode,
            status: 'failed',
            totalTickets: rawTickets.length,
            relevantTickets: relevant.length,
            decisions,
            summary,
          };
        }
      }
    }

    // 12. Finalize run
    const summary = buildRunSummary(decisions, summaryExtras);
    await persistAssignmentRun(run.id, decisions, 'completed', { summaryExtras });

    // Determine honest success evaluation
    const isSimulation = mode === 'shadow' || mode === 'dry-run';
    const hasAssignments = summary.assigned > 0;
    const hasErrors = summary.error > 0;
    const qualifiedStatus = hasErrors && !hasAssignments ? 'completed_with_errors' : 'completed';

    console.log(`[ASSIGNMENT] Run #${run.id} completed (${mode}): ${JSON.stringify(summary)}`);
    if (isSimulation) {
      console.log(`[ASSIGNMENT] Mode "${mode}" — decisions logged but NO ticket assignments persisted to queue_items`);
    }
    if (!hasAssignments && relevant.length > 0) {
      console.warn(`[ASSIGNMENT] WARNING: ${relevant.length} relevant tickets but 0 assigned — check eligibility rules and candidate pool`);
    }

    return {
      runId: run.id,
      mode,
      status: qualifiedStatus,
      persisted: mode === 'live',
      simulation: isSimulation,
      simulationNote: isSimulation
        ? `${mode === 'shadow' ? 'Shadow' : 'Dry-Run'}-Modus: Entscheidungen wurden protokolliert, aber KEINE Ticketzuweisungen in queue_items geschrieben.`
        : undefined,
      crawlerOverride: crawlerOverrideActive || false,
      crawlerOverrideWarning: crawlerOverrideActive
        ? 'Crawler-Aktualitätsprüfung wurde übersprungen. Ergebnisse basieren möglicherweise auf veralteten Daten.'
        : undefined,
      totalTickets: rawTickets.length,
      relevantTickets: relevant.length,
      notRelevantTickets: notRelevant.length,
      decisions,
      summary,
      warnings: [
        ...((!hasAssignments && relevant.length > 0) ? [`Keine Zuweisungen trotz ${relevant.length} relevanter Tickets — prüfe Kandidatenpool und Berechtigungsregeln`] : []),
        ...(hasErrors ? [`${summary.error} Tickets mit Fehlern`] : []),
        ...((rawTickets.length === 0) ? ['Keine aktiven Tickets in der Datenbank gefunden'] : []),
      ].filter(Boolean),
    };

  } catch (err) {
    console.error(`[ASSIGNMENT] Run failed:`, err.message);
    if (run) {
      try {
        await persistAssignmentRun(run.id, decisions, 'failed', {
          failureReason: err.message,
          failureStep: 'engine_execution',
          errorCategory: 'technical_error',
          summaryExtras,
        });
      } catch (_) { /* best effort */ }
    }
    throw err;
  } finally {
    if (lockAcquired) {
      try {
        await releaseAssignmentRunLock();
      } catch (unlockErr) {
        console.warn('[ASSIGNMENT] Could not release advisory lock:', unlockErr?.message || unlockErr);
      }
    }
  }
}
