/* ------------------------------------------------ */
/* ODIN ASSIGNMENT ENGINE – MAIN ORCHESTRATOR       */
/* Shadow Mode: evaluate + log, never mutate owners. */
/* ------------------------------------------------ */

import db from "../db.js";
import { prioritizeTickets } from "./prioritize.js";
import { filterCandidates, rankCandidates, findDispatcher } from "./filterCandidates.js";
import { DECISION_TYPE, DEFAULT_CONFIG, HANDOVER_TYPE } from "./constants.js";
import { loadUnifiedLegacyEngineConfig } from "../services/assignmentConfigStore.js";

/* ------------------------------------------------ */
/* CONFIG LOADER                                    */
/* ------------------------------------------------ */

/**
 * Load engine configuration from assignment_config table.
 * Falls back to DEFAULT_CONFIG for missing keys.
 */
export async function loadConfig() {
  try {
    return await loadUnifiedLegacyEngineConfig();
  } catch (err) {
    console.error("[ENGINE] Failed to load config, using defaults:", err.message);
    return { ...DEFAULT_CONFIG };
  }
}

/* ------------------------------------------------ */
/* STALE CRAWLER CHECK                              */
/* ------------------------------------------------ */

/**
 * Check if crawler data is stale (no successful run within threshold).
 * @param {number} thresholdMinutes
 * @returns {{ stale: boolean, lastRunAt: string|null, minutesAgo: number|null }}
 */
export async function checkCrawlerStaleness(thresholdMinutes) {
  const res = await db.query(`
    SELECT snapshot_at
    FROM crawler_runs
    WHERE success = true
    ORDER BY snapshot_at DESC
    LIMIT 1
  `);

  if (res.rows.length === 0) {
    return { stale: true, lastRunAt: null, minutesAgo: null };
  }

  const lastRun = new Date(res.rows[0].snapshot_at);
  const minutesAgo = (Date.now() - lastRun.getTime()) / 60000;

  return {
    stale: minutesAgo > thresholdMinutes,
    lastRunAt: lastRun.toISOString(),
    minutesAgo: Math.round(minutesAgo * 10) / 10,
  };
}

/* ------------------------------------------------ */
/* CANDIDATE BUILDER                                */
/* ------------------------------------------------ */

/**
 * Build candidate list from shift + role data for a given date + shift type.
 */
async function buildCandidates(date, shiftCodes) {
  // 1. Get employees on shift today
  const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const day = date.getDate();

  const shiftRes = await db.query(
    `SELECT employee_name, shift_code FROM shifts
     WHERE month = $1 AND day = $2`,
    [monthStr, day]
  );

  // 2. Get roles for today
  const dateStr = date.toISOString().split("T")[0];
  const rolesRes = await db.query(
    `SELECT employee_name, role_code FROM employee_shift_roles
     WHERE date = $1`,
    [dateStr]
  );

  const roleMap = {};
  for (const r of rolesRes.rows) {
    if (!roleMap[r.employee_name]) roleMap[r.employee_name] = [];
    roleMap[r.employee_name].push(r.role_code);
  }

  // 3. Get current ticket assignments (owner → queue_type mapping)
  const ownerRes = await db.query(
    `SELECT owner, queue_type, system_name FROM queue_items
     WHERE active = true AND owner IS NOT NULL AND owner != ''`
  );

  const ownerData = {};
  for (const r of ownerRes.rows) {
    if (!ownerData[r.owner]) ownerData[r.owner] = { types: new Set(), systemNames: [], count: 0 };
    ownerData[r.owner].types.add(r.queue_type);
    if (r.system_name) ownerData[r.owner].systemNames.push(r.system_name);
    ownerData[r.owner].count++;
  }

  // 4. Build candidate objects
  const candidates = [];
  for (const row of shiftRes.rows) {
    const name = row.employee_name;
    const shift = mapShiftCode(row.shift_code);
    const od = ownerData[name];
    const types = od ? [...od.types] : [];

    candidates.push({
      name,
      shift,
      roles: roleMap[name] || [],
      currentQueueType: types.length === 1 ? types[0] : null,
      assignedCount: od?.count || 0,
      assignedSystemNames: od?.systemNames || [],
    });
  }

  return candidates;
}

function mapShiftCode(code) {
  const c = (code || "").trim().toUpperCase();
  if (c === "ABW" || c === "FS") return "ABW";
  if (c === "N") return "N";
  if (c === "E1" || c === "E2" || c === "F") return "F";
  if (c === "L1" || c === "L2" || c === "S") return "S";
  return "F";
}

/* ------------------------------------------------ */
/* MANUAL EXCLUSION LOADER                          */
/* ------------------------------------------------ */

async function loadManualExclusions() {
  const res = await db.query(`
    SELECT system_name
    FROM assignment_exclusion_list
    WHERE active = true
    ORDER BY system_name
  `);
  return new Set(res.rows.map((r) => r.system_name));
}

/* ------------------------------------------------ */
/* OTHER TEAMS HANDOVER TICKETS                     */
/* ------------------------------------------------ */

async function getOtherTeamsHandoverTicketIds() {
  const res = await db.query(
    `SELECT ticket_id FROM ticket_handovers
     WHERE type = $1 AND status = 'open'`,
    [HANDOVER_TYPE.OTHER_TEAMS]
  );
  return new Set(res.rows.map((r) => r.ticket_id));
}

/* ------------------------------------------------ */
/* MAIN ENGINE RUN                                  */
/* ------------------------------------------------ */

/**
 * Execute a single assignment engine run (Shadow Mode).
 *
 * @param {{ triggeredBy?: string }} options
 * @returns {{ runId: number, summary: object }}
 */
export async function runAssignmentEngine(options = {}) {
  const config = await loadConfig();
  const triggerType = options.triggeredBy || "manual";
  const triggeredByUser = options.triggeredByUser || null;

  // 1. Create run record
  const runRes = await db.query(
    `INSERT INTO assignment_runs (mode, status, trigger_type, config_snapshot, created_by)
     VALUES ($1, 'running', $2, $3::jsonb, $4) RETURNING id`,
    [config.engine_mode, triggerType, JSON.stringify(config), triggeredByUser]
  );
  const runId = runRes.rows[0].id;

  try {
    // 2. Stale crawler check (HARD RULE)
    const staleness = await checkCrawlerStaleness(config.stale_threshold_minutes);
    if (staleness.stale) {
      await db.query(
        `UPDATE assignment_runs SET status = 'completed', finished_at = NOW(),
         error_message = $1, crawler_snapshot_at = $2
         WHERE id = $3`,
        [`Crawler-Daten veraltet (letzter Run: ${staleness.minutesAgo ?? "nie"} min)`, staleness.lastRunAt, runId]
      );
      return {
        runId,
        summary: {
          status: "aborted_stale",
          message: "Keine Zuweisung: Crawler-Daten älter als erlaubt",
          staleness,
        },
      };
    }

    // 3. Load tickets, exclusions, handovers
    const ticketRes = await db.query(
      `SELECT * FROM queue_items WHERE active = true AND is_final_closed = false`
    );
    const tickets = ticketRes.rows;
    const manualExclusions = await loadManualExclusions();
    const otherTeamsTicketIds = await getOtherTeamsHandoverTicketIds();

    // 4. Build candidates
    const today = new Date();
    const candidates = await buildCandidates(today);

    // 5. Prioritize
    const prioritized = prioritizeTickets(tickets, manualExclusions);

    // 6. Process each ticket
    let assignedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const { ticket, score } of prioritized) {
      try {
        // Skip excluded tickets
        if (score.excluded) {
          await insertDecision(runId, ticket, score, DECISION_TYPE.SKIPPED_MANUAL_EXCLUSION, null, [], [{ candidate: "-", reason: score.exclusionReason }], score.exclusionReason, score.reason);
          skippedCount++;
          continue;
        }

        // Other Teams Handover → assign to dispatcher
        const ticketId = ticket.external_id;
        if (otherTeamsTicketIds.has(ticketId)) {
          const dispatcher = findDispatcher(candidates);
          if (dispatcher) {
            await insertDecision(runId, ticket, score, DECISION_TYPE.ASSIGNED, dispatcher.name, [dispatcher], [], "Other Teams Handover → Dispatcher", `Ticket ${ticketId} ist Other Teams Handover, zugewiesen an Dispatcher ${dispatcher.name}`);
            assignedCount++;
          } else {
            await insertDecision(runId, ticket, score, DECISION_TYPE.SKIPPED_NO_CANDIDATES, null, [], [{ candidate: "-", reason: "Kein Dispatcher in aktueller Schicht" }], "Other Teams Handover: kein Dispatcher verfügbar", "Kein Dispatcher gefunden");
            skippedCount++;
          }
          continue;
        }

        // Normal assignment
        const { eligible, excluded } = filterCandidates(ticket, candidates, config);

        if (eligible.length === 0) {
          await insertDecision(runId, ticket, score, DECISION_TYPE.SKIPPED_NO_CANDIDATES, null, [], excluded, "Keine geeigneten Kandidaten", `Alle ${candidates.length} Kandidaten ausgeschlossen`);
          skippedCount++;
          continue;
        }

        const ranked = rankCandidates(ticket, eligible, config);
        const bestCandidate = ranked[0];

        await insertDecision(
          runId, ticket, score,
          DECISION_TYPE.ASSIGNED,
          bestCandidate.name,
          ranked.slice(0, 5), // top 5 for audit
          excluded,
          `Bester Kandidat: ${bestCandidate.name} (${bestCandidate.assignedCount} Tickets)`,
          `Tier ${score.tier}: ${score.reason} → ${bestCandidate.name} (${eligible.length} von ${candidates.length} Kandidaten eligible)`
        );
        assignedCount++;

      } catch (ticketErr) {
        errorCount++;
        console.error(`[ENGINE] Error processing ticket ${ticket.external_id}:`, ticketErr.message);
        try {
          await insertDecision(runId, ticket, score, DECISION_TYPE.ERROR, null, [], [], `Fehler: ${ticketErr.message}`, ticketErr.message);
        } catch { /* ignore logging failure */ }
      }
    }

    // 7. Finalize run
    await db.query(
      `UPDATE assignment_runs SET
         status = 'completed',
         finished_at = NOW(),
         crawler_snapshot_at = $1,
         total_tickets = $2,
         assigned_count = $3,
         skipped_count = $4,
         error_count = $5
       WHERE id = $6`,
      [staleness.lastRunAt, tickets.length, assignedCount, skippedCount, errorCount, runId]
    );

    return {
      runId,
      summary: {
        status: "completed",
        mode: config.engine_mode,
        totalTickets: tickets.length,
        assigned: assignedCount,
        skipped: skippedCount,
        errors: errorCount,
        crawlerSnapshot: staleness.lastRunAt,
      },
    };

  } catch (err) {
    console.error("[ENGINE] Run failed:", err);
    await db.query(
      `UPDATE assignment_runs SET status = 'failed', finished_at = NOW(), error_message = $1 WHERE id = $2`,
      [String(err.message), runId]
    );
    return { runId, summary: { status: "failed", error: err.message } };
  }
}

/* ------------------------------------------------ */
/* DECISION INSERT HELPER                          */
/* ------------------------------------------------ */

async function insertDecision(runId, ticket, score, decisionType, assignedTo, candidatesEvaluated, exclusionReasons, decidingRule, explanation) {
  await db.query(
    `INSERT INTO assignment_decisions
       (run_id, ticket_external_id, queue_type, system_name,
        priority_score, priority_reason,
        assigned_to, decision_type,
        candidates_evaluated, exclusion_reasons,
        deciding_rule, explanation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)`,
    [
      runId,
      ticket.external_id,
      ticket.queue_type,
      ticket.system_name || null,
      score.tier,
      score.reason,
      assignedTo,
      decisionType,
      JSON.stringify(candidatesEvaluated.map((c) => ({
        name: c.name,
        shift: c.shift,
        roles: c.roles,
        assignedCount: c.assignedCount,
      }))),
      JSON.stringify(exclusionReasons),
      decidingRule,
      explanation,
    ]
  );
}
