/* ================================================ */
/* Assignment Engine — API Routes                   */
/* ================================================ */

import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePageAccess } from '../middleware/requirePageAccess.js';
import pool from '../db.js';
import {
  assignmentSettingsService,
  assignmentExplanationService,
  assignmentExclusionService,
  runAssignmentCycle,
  assignmentRunRepository,
  assignmentDecisionRepository,
  assignmentOverrideRepository,
  analyticsTracker,
  checkCrawlerFreshness,
  loadLastCrawlerTimestamp,
} from '../assignment/index.js';
import {
  normalizeLegacyDecisionRow,
  summarizeDecisionResults,
} from '../assignment/lib/reportCompatibility.js';
import { triggerAssignmentSchedulerSoon, getAssignmentSchedulerStatus } from '../services/assignmentScheduler.js';

const router = express.Router();

async function loadLegacyRunDecisions(runId) {
  const { rows } = await pool.query(
    `SELECT * FROM assignment_decisions WHERE run_id = $1 ORDER BY created_at DESC, id DESC`,
    [runId]
  );
  return rows.map(normalizeLegacyDecisionRow);
}

async function attachRunModes(decisions = []) {
  if (!Array.isArray(decisions) || decisions.length === 0) return decisions;

  const runIds = Array.from(new Set(
    decisions
      .map((decision) => Number.parseInt(String(decision?.run_id ?? ''), 10))
      .filter(Number.isInteger)
  ));

  if (runIds.length === 0) return decisions;

  const { rows } = await pool.query(
    `SELECT id, mode FROM assignment_runs WHERE id = ANY($1::int[])`,
    [runIds]
  );
  const runModeMap = new Map(rows.map((row) => [row.id, row.mode]));

  return decisions.map((decision) => ({
    ...decision,
    run_mode: runModeMap.get(decision.run_id) || null,
  }));
}

/* All assignment routes require auth */
router.use(requireAuth);
router.use(requirePageAccess('odin_logic', 'view'));

/* ------------------------------------------------ */
/* HEALTH                                           */
/* ------------------------------------------------ */

router.get('/health', async (req, res) => {
  try {
    const settings = await assignmentSettingsService.getAll();
    const enabled = settings.settings['assignment.enabled'] === 'true';
    const mode = settings.settings['assignment.mode'] || 'shadow';
    const scheduler = getAssignmentSchedulerStatus();
    res.json({
      ok: true,
      module: 'assignment-engine',
      phase: 1,
      mode,
      enabled,
      schedulerRunning: scheduler.running,
      schedulerBusy: scheduler.runInProgress,
      schedulerIntervalSeconds: Math.round(scheduler.intervalMs / 1000),
      settingsCount: settings.raw.length,
      lastStartedAt: settings.settings['assignment.lastStartedAt'] || null,
      lastStartedBy: settings.settings['assignment.lastStartedBy'] || null,
      lastStoppedAt: settings.settings['assignment.lastStoppedAt'] || null,
      lastStoppedBy: settings.settings['assignment.lastStoppedBy'] || null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* SETTINGS                                         */
/* ------------------------------------------------ */

router.get('/settings', async (req, res) => {
  try {
    const { settings, raw } = await assignmentSettingsService.getAll();
    res.json({ ok: true, settings, raw });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/settings', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { updated, rejected } = await assignmentSettingsService.update(
      req.body,
      req.user?.email || 'unknown'
    );
    res.json({ ok: true, updated, rejected });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* ENGINE START / STOP                              */
/* ------------------------------------------------ */

router.post('/engine/start', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { mode } = req.body;
    const user = req.user?.email || 'unknown';
    const validModes = ['shadow', 'live', 'dry-run'];
    if (mode && !validModes.includes(mode)) {
      return res.status(400).json({ ok: false, error: `Invalid mode: ${mode}. Allowed: ${validModes.join(', ')}` });
    }

    const updates = {
      'assignment.enabled': 'true',
      'assignment.lastStartedAt': new Date().toISOString(),
      'assignment.lastStartedBy': user,
    };
    if (mode) {
      updates['assignment.mode'] = mode;
    }

    await assignmentSettingsService.update(updates, user);
    triggerAssignmentSchedulerSoon(1_000);
    const { settings } = await assignmentSettingsService.getAll();

    res.json({
      ok: true,
      enabled: true,
      mode: settings['assignment.mode'],
      lastStartedAt: settings['assignment.lastStartedAt'],
      lastStartedBy: settings['assignment.lastStartedBy'],
    });
  } catch (err) {
    const isLiveModeGate = /enableLiveMode/i.test(err?.message || '');
    const status = isLiveModeGate ? 409 : 500;
    res.status(status).json({
      ok: false,
      error: err.message,
      code: isLiveModeGate ? 'LIVE_MODE_NOT_ENABLED' : 'ENGINE_START_FAILED',
    });
  }
});

router.post('/engine/stop', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const user = req.user?.email || 'unknown';
    await assignmentSettingsService.update({
      'assignment.enabled': 'false',
      'assignment.lastStoppedAt': new Date().toISOString(),
      'assignment.lastStoppedBy': user,
    }, user);

    const { settings } = await assignmentSettingsService.getAll();
    res.json({
      ok: true,
      enabled: false,
      mode: settings['assignment.mode'],
      lastStoppedAt: settings['assignment.lastStoppedAt'],
      lastStoppedBy: settings['assignment.lastStoppedBy'],
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* RUNS                                             */
/* ------------------------------------------------ */

router.post('/runs/execute', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { mode, skipCrawlerCheck } = req.body || {};
    const result = await runAssignmentCycle({
      triggeredBy: req.user?.email || 'manual',
      modeOverride: mode,
      skipCrawlerCheck: skipCrawlerCheck === true,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    const status = /already running/i.test(String(err?.message || '')) ? 409 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

/* Detailed run report with full decision breakdown */
router.get('/runs/:runId/report', async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    const run = await assignmentRunRepository.findById(runId);
    if (!run) return res.status(404).json({ ok: false, error: 'Run not found' });

    // Load all decisions for this run
    const currentDecisions = await attachRunModes(await assignmentDecisionRepository.findAll({ runId, limit: 1000 }));
    const legacyDecisions = currentDecisions.length === 0 ? await attachRunModes(await loadLegacyRunDecisions(runId)) : [];
    const decisionSource = currentDecisions.length > 0 ? 'current' : (legacyDecisions.length > 0 ? 'legacy' : 'none');
    const decisions = decisionSource === 'legacy' ? legacyDecisions : currentDecisions;
    const realDecisions = decisionSource === 'legacy'
      ? decisions
      : decisions.filter(isQueueBackedDecision);
    const syntheticDecisionCount = decisionSource === 'current'
      ? Math.max(decisions.length - realDecisions.length, 0)
      : 0;

    const internalIds = realDecisions
      .map((decision) => parseDecisionInternalTicketId(decision))
      .filter((value) => Number.isInteger(value));
    const externalIds = realDecisions
      .map((decision) => readDecisionDisplayTicketNumber(decision))
      .filter(Boolean);

    const queueLookup = new Map();
    if (internalIds.length > 0 || externalIds.length > 0) {
      const { rows: queueRows } = await pool.query(
        `SELECT id, external_id, queue_type, system_name, customer_trouble_type, subtype
         FROM queue_items
         WHERE ($1::int[] <> '{}'::int[] AND id = ANY($1::int[]))
            OR ($2::text[] <> '{}'::text[] AND external_id = ANY($2::text[]))`,
        [internalIds, externalIds]
      );

      for (const row of queueRows) {
        queueLookup.set(`id:${row.id}`, row);
        if (row.external_id) {
          queueLookup.set(`external:${row.external_id}`, row);
        }
      }
    }

    // Categorize decisions
    const assigned = realDecisions.filter((decision) => decision.result === 'assigned');
    const unassigned = realDecisions.filter((decision) => decision.result !== 'assigned' && decision.result !== 'not_relevant');
    const notRelevant = realDecisions.filter((decision) => decision.result === 'not_relevant');

    // Build summary
    const runSummary = run.summary && typeof run.summary === 'object' ? run.summary : {};
    const summary = summarizeDecisionResults(realDecisions);
    if (Number(runSummary.crawler_stale || 0) > 0) {
      summary.crawler_stale = Number(runSummary.crawler_stale);
    }

    // Validate ticket counts
    const totalProcessed = realDecisions.length;
    const totalAssigned = assigned.length;
    const totalUnassigned = unassigned.length;
    const totalNotRelevant = notRelevant.length;
    const countConsistent = totalProcessed === (totalAssigned + totalUnassigned + totalNotRelevant);
    const presentInQueueDbCount = realDecisions.filter((decision) => Boolean(resolveQueueTicket(decision, queueLookup))).length;
    const missingInQueueDbCount = totalProcessed - presentInQueueDbCount;
    const recordedTotalTickets = Number(run.total_tickets || 0);
    const skipHeaderDecisionValidation = Number(runSummary.crawler_stale || 0) > 0 && totalProcessed === 0;
    const headerMatchesDecisionCount = skipHeaderDecisionValidation ? true : recordedTotalTickets === totalProcessed;

    const validationWarnings = [];
    if (!countConsistent) {
      validationWarnings.push(`Inkonsistenz: ${totalProcessed} ≠ ${totalAssigned} + ${totalUnassigned} + ${totalNotRelevant}`);
    }
    if (!headerMatchesDecisionCount) {
      validationWarnings.push(`Run-Header meldet ${recordedTotalTickets} Tickets, die Decision-Logik enthält aber ${totalProcessed}`);
    }
    if (missingInQueueDbCount > 0) {
      validationWarnings.push(`${missingInQueueDbCount} Tickets sind aktuell nicht mehr in queue_items vorhanden`);
    }

    res.json({
      ok: true,
      report: {
        runId: run.id,
        mode: run.mode,
        status: run.status,
        triggeredBy: run.triggered_by,
        startedAt: run.started_at,
        completedAt: run.finished_at,
        crawlerOverride: Boolean(runSummary.crawlerOverrideActive),
        decisionSource,
        summary,
        validation: {
          totalProcessed,
          totalAssigned,
          totalUnassigned,
          totalNotRelevant,
          countConsistent,
          recordedTotalTickets,
          headerMatchesDecisionCount,
          presentInQueueDbCount,
          missingInQueueDbCount,
          syntheticDecisionCount,
          warning: validationWarnings.length > 0 ? validationWarnings.join(' | ') : null,
        },
        assigned: assigned.map((decision) => buildReportDecision(decision, queueLookup, {
          assignedTo: decision.assigned_worker_name,
          reason: decision.selection_reason || decision.rule_path?.join(' → ') || 'Regelbasierte Zuweisung',
        })),
        unassigned: unassigned.map((decision) => buildReportDecision(decision, queueLookup, {
          result: decision.result,
          reason: decision.selection_reason || decision.error_message || resultToGerman(decision.result),
        })),
        notRelevant: notRelevant.map((decision) => buildReportDecision(decision, queueLookup, {
          result: decision.result,
          reason: decision.selection_reason || 'Nicht relevant für automatische Zuweisung',
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function getDecisionObject(decision, key) {
  const normalized = decision.normalized_ticket || {};
  const raw = decision.raw_ticket || {};

  return decision[key]
    ?? normalized[key]
    ?? raw[key]
    ?? null;
}

function parseDecisionInternalTicketId(decision) {
  const rawValue = decision.ticket_id ?? getDecisionObject(decision, 'id');
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function readDecisionDisplayTicketNumber(decision) {
  return [
    decision.external_id,
    getDecisionObject(decision, 'externalId'),
    getDecisionObject(decision, 'external_id'),
    getDecisionObject(decision, 'ticketNumber'),
    getDecisionObject(decision, 'ticket'),
    getDecisionObject(decision, 'Activity #'),
    getDecisionObject(decision, 'activity_no'),
    decision.ticket_id,
  ].find((value) => value != null && String(value).trim() !== '') || null;
}

function readDecisionSystemName(decision) {
  return [
    getDecisionObject(decision, 'systemName'),
    getDecisionObject(decision, 'system_name'),
  ].find((value) => value != null && String(value).trim() !== '') || null;
}

function readDecisionTicketCategory(decision) {
  return [
    decision.ticket_type,
    getDecisionObject(decision, 'type'),
    getDecisionObject(decision, 'ticket_type'),
    getDecisionObject(decision, 'queue_type'),
    getDecisionObject(decision, 'subtype'),
  ].find((value) => value != null && String(value).trim() !== '') || null;
}

function readDecisionQueueOrigin(decision) {
  return [
    getDecisionObject(decision, 'queue'),
    getDecisionObject(decision, 'queue_type'),
    getDecisionObject(decision, 'type'),
  ].find((value) => value != null && String(value).trim() !== '') || null;
}

function readDecisionSubtype(decision) {
  return [
    getDecisionObject(decision, 'customerTroubleType'),
    getDecisionObject(decision, 'customer_trouble_type'),
    getDecisionObject(decision, 'subtype'),
  ].find((value) => value != null && String(value).trim() !== '') || null;
}

function readDecisionActivity(decision) {
  return [
    getDecisionObject(decision, 'activity'),
    getDecisionObject(decision, 'customerTroubleType'),
    getDecisionObject(decision, 'customer_trouble_type'),
    getDecisionObject(decision, 'Activity'),
    getDecisionObject(decision, 'Activity Type'),
    getDecisionObject(decision, 'Activity Sub Type'),
    getDecisionObject(decision, 'subtype'),
  ].find((value) => value != null && String(value).trim() !== '') || null;
}

function readDecisionCurrentOwner(decision) {
  return [
    getDecisionObject(decision, 'owner'),
    getDecisionObject(decision, 'Owner'),
    getDecisionObject(decision, 'current_owner'),
  ].find((value) => value != null && String(value).trim() !== '') || null;
}

function readDecisionRemainingHours(decision) {
  const parsed = Number(
    getDecisionObject(decision, 'remainingHours')
    ?? getDecisionObject(decision, 'remaining_hours')
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function readDecisionCommitDate(decision) {
  return [
    getDecisionObject(decision, 'dueAt'),
    getDecisionObject(decision, 'due_at'),
    getDecisionObject(decision, 'commit_date'),
    getDecisionObject(decision, 'Commit Date'),
  ].find((value) => value != null && String(value).trim() !== '') || null;
}

function readDecisionRevisedCommitDate(decision) {
  return [
    getDecisionObject(decision, 'revised_commit_date'),
    getDecisionObject(decision, 'revisedCommitDate'),
    getDecisionObject(decision, 'Revised Commit Date'),
  ].find((value) => value != null && String(value).trim() !== '') || null;
}

function readDecisionScheduledStart(decision) {
  return [
    getDecisionObject(decision, 'scheduledStart'),
    getDecisionObject(decision, 'scheduled_start'),
    getDecisionObject(decision, 'sched_start'),
    getDecisionObject(decision, 'Sched. Start'),
  ].find((value) => value != null && String(value).trim() !== '') || null;
}

function isQueueBackedDecision(decision) {
  const internalId = parseDecisionInternalTicketId(decision);
  const displayTicketNumber = readDecisionDisplayTicketNumber(decision);
  return Boolean(internalId || displayTicketNumber);
}

function resolveQueueTicket(decision, queueLookup) {
  const internalId = parseDecisionInternalTicketId(decision);
  const displayTicketNumber = readDecisionDisplayTicketNumber(decision);

  if (internalId && queueLookup.has(`id:${internalId}`)) {
    return queueLookup.get(`id:${internalId}`);
  }
  if (displayTicketNumber && queueLookup.has(`external:${displayTicketNumber}`)) {
    return queueLookup.get(`external:${displayTicketNumber}`);
  }
  return null;
}

function buildReportDecision(decision, queueLookup, extras = {}) {
  const queueTicket = resolveQueueTicket(decision, queueLookup);
  const internalTicketId = parseDecisionInternalTicketId(decision);
  const displayTicketNumber = readDecisionDisplayTicketNumber(decision);
  const remainingHours = readDecisionRemainingHours(decision);

  return {
    decisionId: decision.id,
    ticketId: internalTicketId ? String(internalTicketId) : null,
    displayTicketNumber: displayTicketNumber || (internalTicketId ? String(internalTicketId) : 'Unbekannt'),
    internalTicketId: internalTicketId ? String(internalTicketId) : null,
    mode: decision.run_mode || decision.mode || null,
    queueType: queueTicket?.queue_type || readDecisionQueueOrigin(decision),
    systemName: queueTicket?.system_name || readDecisionSystemName(decision),
    ticketCategory: queueTicket?.queue_type || readDecisionTicketCategory(decision),
    ticketSubtype: queueTicket?.customer_trouble_type || queueTicket?.subtype || readDecisionSubtype(decision),
    activity: readDecisionActivity(decision),
    currentOwner: queueTicket?.owner || readDecisionCurrentOwner(decision),
    recommendedOwner: decision.assigned_worker_name || null,
    remainingHours,
    commitDate: readDecisionCommitDate(decision),
    revisedCommitDate: readDecisionRevisedCommitDate(decision),
    scheduledStart: readDecisionScheduledStart(decision),
    existsInQueueDb: Boolean(queueTicket),
    ...extras,
  };
}

async function loadQueueLookupForDecisions(decisions) {
  const internalIds = decisions
    .map((decision) => parseDecisionInternalTicketId(decision))
    .filter((value) => Number.isInteger(value));
  const externalIds = decisions
    .map((decision) => readDecisionDisplayTicketNumber(decision))
    .filter(Boolean);

  const queueLookup = new Map();
  if (internalIds.length === 0 && externalIds.length === 0) {
    return queueLookup;
  }

  const { rows } = await pool.query(
    `SELECT id, external_id, queue_type, system_name, customer_trouble_type, subtype
     FROM queue_items
     WHERE active = TRUE
       AND (
         ($1::int[] <> '{}'::int[] AND id = ANY($1::int[]))
         OR ($2::text[] <> '{}'::text[] AND external_id = ANY($2::text[]))
       )`,
    [internalIds, externalIds]
  );

  for (const row of rows) {
    queueLookup.set(`id:${row.id}`, row);
    if (row.external_id) {
      queueLookup.set(`external:${row.external_id}`, row);
    }
  }

  return queueLookup;
}

function resultToGerman(result) {
  const map = {
    manual_review: 'Manuelle Prüfung erforderlich',
    no_candidate: 'Kein geeigneter Mitarbeiter verfügbar',
    blocked: 'Ticket manuell blockiert',
    error: 'Fehler bei der Verarbeitung',
    crawler_stale: 'Crawler-Daten veraltet',
    not_relevant: 'Nicht relevant',
    assigned: 'Zugewiesen',
  };
  return map[result] || result;
}

router.get('/runs', async (req, res) => {
  try {
    const { limit = 50, offset = 0, mode, status } = req.query;
    const runs = await assignmentRunRepository.findAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      mode: mode || undefined,
      status: status || undefined,
    });
    const total = await assignmentRunRepository.count({
      mode: mode || undefined,
      status: status || undefined,
    });
    res.json({ ok: true, runs, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/runs/:runId', async (req, res) => {
  try {
    const run = await assignmentRunRepository.findById(parseInt(req.params.runId));
    if (!run) return res.status(404).json({ ok: false, error: 'Run not found' });
    res.json({ ok: true, run });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* DECISIONS                                        */
/* ------------------------------------------------ */

router.get('/decisions', async (req, res) => {
  try {
    const { limit = 100, offset = 0, result, runId, includeHistorical } = req.query;
    let decisions = await attachRunModes(await assignmentDecisionRepository.findAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      result: result || undefined,
      runId: runId ? parseInt(runId) : undefined,
    }));

    if (runId && decisions.length === 0) {
      const legacyDecisions = await attachRunModes(await loadLegacyRunDecisions(parseInt(runId)));
      decisions = result
        ? legacyDecisions.filter((decision) => decision.result === result)
        : legacyDecisions;
    }

    const shouldFilterLiveQueue = includeHistorical !== 'true' && !runId;
    let filteredOutCount = 0;

    if (shouldFilterLiveQueue && decisions.length > 0) {
      const queueLookup = await loadQueueLookupForDecisions(decisions);
      const liveDecisions = decisions.filter((decision) => Boolean(resolveQueueTicket(decision, queueLookup)));
      filteredOutCount = Math.max(decisions.length - liveDecisions.length, 0);
      decisions = liveDecisions;
    }

    res.json({ ok: true, decisions, filteredOutCount });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/decisions/:decisionId', async (req, res) => {
  try {
    const [decision] = await attachRunModes([
      await assignmentDecisionRepository.findById(parseInt(req.params.decisionId)),
    ].filter(Boolean));
    if (!decision) return res.status(404).json({ ok: false, error: 'Decision not found' });
    res.json({ ok: true, decision });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* TICKET EXPLANATION                               */
/* ------------------------------------------------ */

router.get('/tickets/:ticketId/explanation', async (req, res) => {
  try {
    const ticketId = String(req.params.ticketId || '');
    const runId = req.query.runId ? parseInt(req.query.runId) : null;
    const result = await assignmentExplanationService.getTicketExplanation(
      ticketId,
      runId
    );
    if (!result.found) {
      return res.json({
        ticketId,
        runId,
        explanation: null,
        decisionTrace: [],
        message: 'No assignment explanation available yet.',
        found: false,
      });
    }
    res.json({ ticketId, runId, ...result });
  } catch (err) {
    res.json({
      ticketId: String(req.params.ticketId || ''),
      runId: req.query.runId ? parseInt(req.query.runId) : null,
      explanation: null,
      decisionTrace: [],
      message: 'No assignment explanation available yet.',
      found: false,
    });
  }
});

/* ------------------------------------------------ */
/* OVERRIDES                                        */
/* ------------------------------------------------ */

router.get('/overrides', async (req, res) => {
  try {
    const { limit = 100, offset = 0, active } = req.query;
    const overrides = await assignmentOverrideRepository.findAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      active: active !== undefined ? active === 'true' : undefined,
    });
    res.json({ ok: true, overrides });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/overrides', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { ticketId, overrideType, targetWorkerId, reason } = req.body;
    if (!ticketId || !overrideType) {
      return res.status(400).json({ ok: false, error: 'ticketId and overrideType are required' });
    }
    const override = await assignmentOverrideRepository.create({
      ticketId,
      overrideType,
      targetWorkerId: targetWorkerId || null,
      reason: reason || null,
      createdBy: req.user?.email || 'unknown',
    });
    res.json({ ok: true, override });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/overrides/:id/deactivate', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const result = await assignmentOverrideRepository.deactivate(
      parseInt(req.params.id),
      req.user?.email || 'unknown'
    );
    if (!result) return res.status(404).json({ ok: false, error: 'Override not found' });
    res.json({ ok: true, override: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* EXCLUSION LIST (system names)                    */
/* ------------------------------------------------ */

router.get('/exclusions', async (req, res) => {
  try {
    const activeOnly = req.query.active !== 'false';
    const exclusions = await assignmentExclusionService.getAll(activeOnly);
    res.json({ ok: true, exclusions });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/exclusions/available', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH current_system_names AS (
        SELECT btrim(system_name) AS system_name
        FROM queue_items
        WHERE active = true
          AND is_final_closed = false
          AND system_name IS NOT NULL
          AND btrim(system_name) <> ''
      )
      SELECT MIN(system_name) AS system_name
      FROM current_system_names
      GROUP BY LOWER(system_name)
      ORDER BY LOWER(system_name)
    `);
    res.json({ ok: true, systemNames: rows.map((row) => row.system_name) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/exclusions', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { systemName, reason } = req.body;
    if (!systemName) {
      return res.status(400).json({ ok: false, error: 'systemName is required' });
    }
    const entry = await assignmentExclusionService.add({
      systemName,
      reason: reason || null,
      createdBy: req.user?.email || 'unknown',
    });
    res.json({ ok: true, entry });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/exclusions/:id/deactivate', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const result = await assignmentExclusionService.deactivate(parseInt(req.params.id));
    if (!result) return res.status(404).json({ ok: false, error: 'Entry not found' });
    res.json({ ok: true, entry: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/exclusions/:id', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const result = await assignmentExclusionService.remove(parseInt(req.params.id));
    if (!result) return res.status(404).json({ ok: false, error: 'Entry not found' });
    res.json({ ok: true, entry: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* SUBTYPE EXCLUSION LIST                           */
/* ------------------------------------------------ */

router.get('/exclusions/subtypes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subtype_exclusions ORDER BY subtype`
    );
    res.json({ ok: true, exclusions: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/exclusions/subtypes/available', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH subtype_candidates AS (
        SELECT btrim(customer_trouble_type) AS subtype
        FROM queue_items
        WHERE active = true
          AND is_final_closed = false
          AND customer_trouble_type IS NOT NULL
          AND btrim(customer_trouble_type) <> ''
        UNION
        SELECT btrim(subtype) AS subtype
        FROM queue_items
        WHERE active = true
          AND is_final_closed = false
          AND subtype IS NOT NULL
          AND btrim(subtype) <> ''
      )
      SELECT MIN(subtype) AS subtype
      FROM subtype_candidates
      GROUP BY LOWER(subtype)
      ORDER BY LOWER(subtype)
    `);
    res.json({ ok: true, subtypes: rows.map((row) => row.subtype) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/exclusions/subtypes', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { subtype, reason } = req.body;
    if (!subtype || !subtype.trim()) {
      return res.status(400).json({ ok: false, error: 'subtype is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO subtype_exclusions (subtype, reason, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (subtype) DO UPDATE
       SET reason = EXCLUDED.reason,
           created_by = EXCLUDED.created_by
       RETURNING *`,
      [subtype.trim(), reason || null, req.user?.email || 'unknown']
    );

    res.json({ ok: true, entry: rows[0] });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/exclusions/subtypes/:id', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM subtype_exclusions WHERE id = $1 RETURNING *`,
      [parseInt(req.params.id)]
    );
    if (rows.length === 0) return res.status(404).json({ ok: false, error: 'Entry not found' });
    res.json({ ok: true, entry: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* CRAWLER STATUS                                   */
/* ------------------------------------------------ */

router.get('/crawler-status', async (req, res) => {
  try {
    const lastTimestamp = await loadLastCrawlerTimestamp();
    const freshness = checkCrawlerFreshness(lastTimestamp);
    res.json({
      ok: true,
      fresh: freshness.fresh,
      lastCrawlerTimestamp: lastTimestamp,
      reason: freshness.reason,
      staleDurationMs: freshness.staleDurationMs,
      // TV mode safety message
      tvMessage: freshness.fresh ? null : 'No current crawler data',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* ANALYTICS (restricted admin only)                */
/* ------------------------------------------------ */

router.get('/analytics/manual-pickups', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    if (!from || !to) return res.status(400).json({ ok: false, error: 'from and to query params required' });
    const results = await analyticsTracker.getManualPickups({ from, to, limit: parseInt(limit) || 200 });
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/analytics/single-ticket-workers', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ ok: false, error: 'from and to query params required' });
    const results = await analyticsTracker.getSingleTicketWorkers({ from, to });
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/analytics/owner-ranking', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    if (!from || !to) return res.status(400).json({ ok: false, error: 'from and to query params required' });
    const results = await analyticsTracker.getOwnerRanking({ from, to, limit: parseInt(limit) || 50 });
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/analytics/expired-vs-active', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const results = await analyticsTracker.getExpiredVsActive();
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/analytics/manual-pickup', requirePageAccess('settings', 'write'), async (req, res) => {
  try {
    const { ticketId, workerId, workerName } = req.body;
    if (!ticketId || !workerId) return res.status(400).json({ ok: false, error: 'ticketId and workerId required' });
    await analyticsTracker.trackManualPickup({ ticketId, workerId, workerName });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* EMPLOYEE EXCLUSIONS (permanent / temporary)      */
/* ------------------------------------------------ */

router.get('/employee-exclusions', async (req, res) => {
  try {
    const activeOnly = req.query.active !== 'false';
    let sql = 'SELECT * FROM assignment_employee_exclusions';
    if (activeOnly) sql += ' WHERE is_active = TRUE';
    sql += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(sql);
    res.json({ ok: true, exclusions: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/employee-exclusions', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const { employee_name, reason, reason_text, valid_from, valid_to } = req.body;
    if (!employee_name) return res.status(400).json({ ok: false, error: 'employee_name is required' });
    if (!reason) return res.status(400).json({ ok: false, error: 'reason is required' });
    const createdBy = req.user?.email || req.user?.username || 'unknown';
    const { rows } = await pool.query(
      `INSERT INTO assignment_employee_exclusions (employee_name, reason, reason_text, valid_from, valid_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [employee_name.trim(), reason, reason_text || null, valid_from || null, valid_to || null, createdBy]
    );
    res.json({ ok: true, exclusion: rows[0] });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/employee-exclusions/:id/deactivate', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const deactivatedBy = req.user?.email || req.user?.username || 'unknown';
    const { rows } = await pool.query(
      `UPDATE assignment_employee_exclusions SET is_active = FALSE, deactivated_by = $2, deactivated_at = NOW() WHERE id = $1 RETURNING *`,
      [parseInt(req.params.id), deactivatedBy]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, exclusion: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/employee-exclusions/:id', requirePageAccess('odin_logic', 'write'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM assignment_employee_exclusions WHERE id = $1 RETURNING *`,
      [parseInt(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, exclusion: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
