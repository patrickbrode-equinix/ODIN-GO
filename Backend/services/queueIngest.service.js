/* ------------------------------------------------ */
/* services/queueIngest.service.js                  */
/* Business logic for queue snapshot ingestion.     */
/* Maps crawler payloads → DB rows, runs upserts.   */
/* ------------------------------------------------ */

import pool from "../db.js";
import {
  pick,
  pickFromMany,
  canonicalizeQueueType,
  normalizeGroupFromQueueType,
  isClosedStatus,
} from "../lib/queueNormalizer.js";
import {
  parseAnyDateToIso,
  formatRemainingFromCommit,
  remainingHoursFromCommit,
} from "../lib/dateParser.js";

/* ------------------------------------------------ */
/* ROW MAPPERS                                       */
/* ------------------------------------------------ */

/**
 * Map a row from the legacy (old-format object) payload to a DB record.
 * Old format: body.queues = { smartHands: [...], ccInstalls: [...], ... }
 */
export function mapJarvisRowToDb(queueType, row) {
  const externalId =
    queueType === "TroubleTickets"
      ? pick(row, ["Ticket ID", "TICKET_ID", "TicketID", "ticketId", "ticket_id"])
      : pick(row, [
          "Activity #", "ACT_NUM", "ACTIVITY_NO", "ActivityNo",
          "Order #", "ORDER_NUM", "ORDER_ID", "so_number", "SO #",
        ]);

  if (!externalId) return null;

  const commitDate  = pick(row, [
    "Commit Date", "Commit Day", "commit_date", "Commit", "commit",
    "Commit-Datum", "Verbindlicher Termin", "Fälligkeitsdatum", "Due Date",
  ]);
  const revisedDate = pick(row, ["Revised Date", "revised_date", "Revised Commit Date", "RevisedCommitDate"]);
  const chosenCommit = revisedDate || commitDate;

  const remainingTime  = pick(row, ["Remaining Time", "remaining_time", "Restzeit"]) || formatRemainingFromCommit(chosenCommit);
  const remainingHours = remainingHoursFromCommit(chosenCommit);
  const groupKey       = normalizeGroupFromQueueType(queueType);
  const subtype        = pick(row, ["Sub Type", "Subtype", "subtype"]) || groupKey;

  return {
    queue_type:             queueType,
    external_id:            externalId,
    group_key:              groupKey || subtype || "Unknown",
    so_number:              pick(row, ["SO #", "SO", "SO#", "so_number", "Sales Order #", "Sales Order#"]),
    status:                 pick(row, ["Status", "activity_status", "Activity Status"]),
    owner:                  pick(row, ["Owner", "owner", "Besitzer", "Verantwortlich"]),
    severity:               pick(row, ["Severity", "severity"]),
    commit_date:            parseAnyDateToIso(commitDate),
    revised_commit_date:    parseAnyDateToIso(revisedDate),
    dispatch_date:          parseAnyDateToIso(pick(row, ["Dispatch Date", "Dispatch Day", "dispatch_date"])),
    sched_start:            parseAnyDateToIso(pick(row, [
      "Sched. Start", "Sched Start", "Sched. Start ", "SchedStart", "sched_start",
      "Geplanter Start", "Startzeit", "Scheduled Start", "Start Date",
    ])),
    remaining_time_text:    remainingTime || null,
    remaining_hours:        remainingHours,
    subtype,
    system_name:            pick(row, ["System Name", "SystemName", "System", "system_name"]),
    account_name:           pick(row, ["Account Name", "AccountName", "account_name"]),
    customer_trouble_type:  pick(row, [
      "Customer Trouble Type", "customer_trouble_type",
      "Activity Sub Type", "activity_sub_type",
    ]),
    raw_json: row || {},
  };
}

/**
 * Map a new-format ingest item to a DB record.
 * New format: body.queues = [{ queueType, groupKey, items: [...] }]
 */
export function mapIngestItemToDb(queueType, groupKeyFromPayload, item) {
  if (!item) return null;

  const queueTypeCanon = canonicalizeQueueType(queueType);
  if (!queueTypeCanon) return null;

  const externalId = String(item.ticketKey || item.external_id || item.externalId || "").trim();
  if (!externalId) return null;

  const rawLabels  = item?.rawJson?.labels   || item?.raw_json?.labels  || null;
  const rawColIds  = item?.rawJson?.colIds   || item?.raw_json?.colIds  || null;
  const sources    = [rawLabels, rawColIds, item.labels, item.colIds].filter(Boolean);

  const commitDateTxt = String(item.commitDate || "").trim() || pickFromMany(sources, [
    "Commit Date", "Commit Day", "commit_date", "Due Date", "Fälligkeitsdatum", "Verbindlicher Termin",
  ]);

  const revisedDateTxt = String(item.revisedCommitDate || "").trim() || pickFromMany(sources, [
    "Revised Commit Date", "Revised Date", "revised_date", "RevisedCommitDate",
  ]);

  const chosenCommit = revisedDateTxt || commitDateTxt;

  const remainingTimeTxt =
    String(item.remainingTimeText || "").trim() ||
    pickFromMany(sources, ["Remaining Time", "remaining_time", "Restzeit", "Time Remaining", "SLA Remaining"]) ||
    formatRemainingFromCommit(chosenCommit);

  const remainingHours =
    item.remainingHours !== undefined && item.remainingHours !== null && Number.isFinite(Number(item.remainingHours))
      ? Number(item.remainingHours)
      : remainingHoursFromCommit(chosenCommit);

  const owner    = String(item.owner || "").trim() || pickFromMany(sources, ["Owner", "owner", "Assigned To", "Assignee", "Besitzer", "Verantwortlich"]);
  const status   = String(item.status || "").trim() || pickFromMany(sources, ["Status", "activity_status", "Activity Status", "State"]);
  const severity = pickFromMany(sources, ["Severity", "severity"]);

  const schedStartTxt = String(item.schedStart || "").trim() || pickFromMany(sources, [
    "Sched. Start", "Sched Start", "Scheduled Start", "Start Date", "sched_start", "Geplanter Start",
  ]);

  const dispatchTxt = pickFromMany(sources, ["Dispatch Date", "Dispatch Day", "dispatch_date"]);

  const subtype = pickFromMany(sources, [
    "Sub Type", "Subtype", "subtype", "ACTIVITY", "Activity", "activity", "Activity Type", "ActivityType",
  ]) || normalizeGroupFromQueueType(queueTypeCanon) || String(groupKeyFromPayload || "").trim();

  const group_key = normalizeGroupFromQueueType(queueTypeCanon) || subtype || String(groupKeyFromPayload || "").trim() || "Unknown";

  return {
    queue_type:             queueTypeCanon,
    external_id:            externalId,
    group_key,
    so_number:              pickFromMany(sources, ["SO #", "SO", "SO#", "so_number", "Sales Order #", "Sales Order#"]),
    status,
    owner,
    severity,
    commit_date:            parseAnyDateToIso(commitDateTxt),
    revised_commit_date:    parseAnyDateToIso(revisedDateTxt),
    dispatch_date:          parseAnyDateToIso(dispatchTxt),
    sched_start:            parseAnyDateToIso(schedStartTxt),
    remaining_time_text:    remainingTimeTxt,
    remaining_hours:        remainingHours,
    subtype,
    system_name:            pickFromMany(sources, ["System Name", "SystemName", "System", "system_name", "SYSTEM_NAME", "Systemname"]),
    account_name:           pickFromMany(sources, ["Account Name", "AccountName", "account_name"]),
    customer_trouble_type:  pickFromMany(sources, ["Customer Trouble Type", "customer_trouble_type", "Activity Sub Type", "activity_sub_type"]),
    raw_json: {
      ...((item.rawJson && typeof item.rawJson === "object") ? item.rawJson : {}),
      __ingest_meta: { receivedAt: new Date().toISOString() },
    },
  };
}

/* ------------------------------------------------ */
/* PAYLOAD NORMALIZER                               */
/* ------------------------------------------------ */

/**
 * Normalize the snapshot payload into a flat array of items + completeTypes set.
 * Supports both old (object) and new (array) format.
 */
export function normalizePayload(body) {
  const queuesInput     = body.queues;
  const itemsToUpsert   = [];
  const completeTypesSet = new Set();
  const queueMetaByType = normalizeQueueMetaByType(body);

  if (Array.isArray(queuesInput)) {
    for (const q of queuesInput) {
      const qType = canonicalizeQueueType(q?.queueType);
      if (!qType) continue;
      if (q?.complete === true) completeTypesSet.add(qType);
      const gKey = String(q?.groupKey || "").trim();
      if (Array.isArray(q.items)) {
        for (const item of q.items) {
          const m = mapIngestItemToDb(qType, gKey, item);
          if (m) itemsToUpsert.push(m);
        }
      }
    }
  } else if (typeof queuesInput === "object" && queuesInput) {
    const typeMap = { smartHands: "SmartHands", ccInstalls: "CCInstalls", troubleTickets: "TroubleTickets", deinstalls: "Deinstall" };
    for (const [k, qType] of Object.entries(typeMap)) {
      if (Array.isArray(queuesInput[k])) {
        completeTypesSet.add(qType);
        for (const r of queuesInput[k]) {
          const m = mapJarvisRowToDb(qType, r);
          if (m) itemsToUpsert.push(m);
        }
      }
    }
  }

  return {
    itemsToUpsert,
    completeTypes: Array.from(completeTypesSet),
    queueMetaByType,
  };
}

/* ------------------------------------------------ */
/* DB UPSERT                                        */
/* ------------------------------------------------ */

const UPSERT_SQL = `
  INSERT INTO queue_items (
    queue_type, external_id, group_key,
    so_number, status, owner, severity,
    commit_date, revised_commit_date,
    dispatch_date, sched_start,
    remaining_time_text, remaining_hours,
    subtype, system_name, account_name, customer_trouble_type,
    raw_json,
    active, missing_count, closed_at, inactive_reason, is_final_closed,
    first_seen_at, last_seen_at, jarvis_seen_at, updated_at
  ) VALUES (
    $1,$2,$3, $4,$5,$6,$7, $8,$9, $10,$11, $12,$13,
    $14,$15,$16,$17, $18::jsonb,
    true,0,NULL,NULL,false,
    NOW(),NOW(),NOW(),NOW()
  )
  ON CONFLICT (queue_type, external_id) DO UPDATE SET
    group_key              = EXCLUDED.group_key,
    so_number              = COALESCE(NULLIF(EXCLUDED.so_number,''),              queue_items.so_number),
    status                 = COALESCE(NULLIF(EXCLUDED.status,''),                 queue_items.status),
    owner                  = COALESCE(NULLIF(EXCLUDED.owner,''),                  queue_items.owner),
    severity               = COALESCE(NULLIF(EXCLUDED.severity,''),               queue_items.severity),
    commit_date            = COALESCE(EXCLUDED.commit_date,                       queue_items.commit_date),
    revised_commit_date    = COALESCE(EXCLUDED.revised_commit_date,               queue_items.revised_commit_date),
    dispatch_date          = COALESCE(EXCLUDED.dispatch_date,                     queue_items.dispatch_date),
    sched_start            = COALESCE(EXCLUDED.sched_start,                       queue_items.sched_start),
    remaining_time_text    = COALESCE(NULLIF(EXCLUDED.remaining_time_text,''),    queue_items.remaining_time_text),
    remaining_hours        = COALESCE(EXCLUDED.remaining_hours,                   queue_items.remaining_hours),
    subtype                = COALESCE(NULLIF(EXCLUDED.subtype,''),                queue_items.subtype),
    system_name            = COALESCE(NULLIF(EXCLUDED.system_name,''),            queue_items.system_name),
    account_name           = COALESCE(NULLIF(EXCLUDED.account_name,''),           queue_items.account_name),
    customer_trouble_type  = COALESCE(NULLIF(EXCLUDED.customer_trouble_type,''),  queue_items.customer_trouble_type),
    raw_json               = COALESCE(EXCLUDED.raw_json,                          queue_items.raw_json),
    active                 = true,
    missing_count          = 0,
    closed_at              = NULL,
    inactive_reason        = NULL,
    is_final_closed        = false,
    snapshot_removed_at    = NULL,
    snapshot_removed_run_id = NULL,
    last_seen_at           = NOW(),
    jarvis_seen_at         = NOW(),
    updated_at             = NOW()
`;

/**
 * Minimum snapshot ratio threshold.
 * If a complete queue type has fewer tickets than (previous_active * MIN_RATIO),
 * we skip deletion for that queue to protect against partial / broken crawls.
 * E.g. 0.2 = if new snapshot has < 20% of previous, skip deletion for safety.
 */
const SNAPSHOT_MIN_RATIO = 0.2;

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeQueueMetaByType(body = {}) {
  const metaByType = {};
  const queuesMeta = body.queuesMeta;
  const queuesInput = body.queues;

  if (queuesMeta && typeof queuesMeta === "object" && !Array.isArray(queuesMeta)) {
    for (const [rawKey, rawMeta] of Object.entries(queuesMeta)) {
      const qType = canonicalizeQueueType(rawKey);
      if (!qType) continue;

      metaByType[qType] = {
        sourceQueueKey: rawKey,
        complete: rawMeta?.complete === true,
        expected: toFiniteNumber(rawMeta?.expected),
        actual: toFiniteNumber(rawMeta?.actual),
        attempts: toFiniteNumber(rawMeta?.attempts),
      };
    }
  }

  if (Array.isArray(queuesInput)) {
    for (const q of queuesInput) {
      const qType = canonicalizeQueueType(q?.queueType);
      if (!qType) continue;

      const current = metaByType[qType] || {};
      metaByType[qType] = {
        sourceQueueKey: current.sourceQueueKey || q?.queueType || qType,
        complete: current.complete === true || q?.complete === true,
        expected: current.expected ?? toFiniteNumber(q?.expected ?? q?.expectedCount ?? q?.items?.length),
        actual: current.actual ?? toFiniteNumber(q?.actual ?? q?.actualCount ?? q?.items?.length),
        attempts: current.attempts ?? toFiniteNumber(q?.attempts),
      };
    }
  } else if (queuesInput && typeof queuesInput === "object") {
    const typeMap = { smartHands: "SmartHands", ccInstalls: "CCInstalls", troubleTickets: "TroubleTickets", deinstalls: "Deinstall" };
    for (const [rawKey, qType] of Object.entries(typeMap)) {
      if (!Array.isArray(queuesInput[rawKey])) continue;

      const current = metaByType[qType] || {};
      metaByType[qType] = {
        sourceQueueKey: current.sourceQueueKey || rawKey,
        complete: current.complete === true || true,
        expected: current.expected ?? queuesInput[rawKey].length,
        actual: current.actual ?? queuesInput[rawKey].length,
        attempts: current.attempts ?? null,
      };
    }
  }

  return metaByType;
}

export function isCrawlerConfirmedComplete(queueMeta) {
  if (!queueMeta || queueMeta.complete !== true) return false;
  return queueMeta.expected !== null && queueMeta.actual !== null && queueMeta.expected === queueMeta.actual;
}

export function buildDeletionPlan({ completeTypes, beforeCountByType, incomingCountByType, queueMetaByType = {}, minRatio = SNAPSHOT_MIN_RATIO }) {
  const safeForDeletion = new Set();
  const deletionSkipped = {};

  for (const qt of completeTypes) {
    const before = beforeCountByType[qt] || 0;
    const incoming = incomingCountByType[qt] || 0;
    const queueMeta = queueMetaByType[qt] || null;

    if (before === 0) {
      safeForDeletion.add(qt);
      continue;
    }

    if (isCrawlerConfirmedComplete(queueMeta)) {
      safeForDeletion.add(qt);
      continue;
    }

    if (incoming === 0 && before > 5) {
      console.warn(`[CRAWLER INGEST] SAFETY: ${qt} snapshot has 0 items but ${before} were active — skipping deletion (possible broken crawl)`);
      deletionSkipped[qt] = { reason: 'empty_snapshot', before, incoming };
      continue;
    }

    const ratio = before > 0 ? incoming / before : 1;
    if (ratio < minRatio && before > 5) {
      console.warn(`[CRAWLER INGEST] SAFETY: ${qt} snapshot ratio ${(ratio * 100).toFixed(1)}% (${incoming}/${before}) below ${minRatio * 100}% threshold — skipping deletion`);
      deletionSkipped[qt] = { reason: 'low_ratio', ratio: ratio.toFixed(3), before, incoming, threshold: minRatio };
      continue;
    }

    safeForDeletion.add(qt);
  }

  return {
    safeForDeletion,
    deletionSkipped,
  };
}

/**
 * Persist a queue snapshot to the database.
 * Handles upserts, mark-missing logic, expired archive, and run log.
 *
 * Safety: For each complete queue type, validates that the new snapshot
 * is not suspiciously small (< 20% of prior active count). If so, skips
 * deletion for that queue type to prevent mass data loss from broken crawls.
 *
 * @param {object[]} itemsToUpsert - mapped DB rows
 * @param {string[]} completeTypes - queue types that were fully scraped
 * @param {string}   nowIso        - snapshot timestamp ISO string
 * @param {object}   [options]
 * @param {object}   [options.queueMetaByType]
 * @returns {{ processed, active_seen, new_count, gone_count, complete_types, deletionSkipped }}
 */
export async function persistSnapshot(itemsToUpsert, completeTypes, nowIso, options = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const queueMetaByType = options.queueMetaByType || {};

    // ── PRE-SNAPSHOT: count active tickets per queue type ──
    const beforeRes = await client.query(
      `SELECT queue_type, external_id FROM queue_items WHERE active = true AND is_final_closed = false`
    );
    const beforeSet = new Set(beforeRes.rows.map((r) => `${r.queue_type}::${r.external_id}`));

    // Count per queue type BEFORE
    const beforeCountByType = {};
    for (const r of beforeRes.rows) {
      beforeCountByType[r.queue_type] = (beforeCountByType[r.queue_type] || 0) + 1;
    }

    const seenSet = new Set();

    // Count per queue type in INCOMING snapshot
    const incomingCountByType = {};
    for (const it of itemsToUpsert) {
      incomingCountByType[it.queue_type] = (incomingCountByType[it.queue_type] || 0) + 1;
    }

    console.log(`[CRAWLER INGEST] === Snapshot Start ===`);
    console.log(`[CRAWLER INGEST] Complete types: ${completeTypes.join(', ') || '(none)'}`);
    console.log(`[CRAWLER INGEST] Incoming items: ${itemsToUpsert.length}`);
    for (const qt of completeTypes) {
      const before = beforeCountByType[qt] || 0;
      const incoming = incomingCountByType[qt] || 0;
      console.log(`[CRAWLER INGEST]   ${qt}: before=${before} incoming=${incoming}`);
    }

    // ── SNAPSHOT SAFETY: determine which queue types are safe for deletion ──
    const { safeForDeletion, deletionSkipped } = buildDeletionPlan({
      completeTypes,
      beforeCountByType,
      incomingCountByType,
      queueMetaByType,
    });

    // ── UPSERT all items ──
    let upsertCount = 0;
    let updateCount = 0;
    for (const it of itemsToUpsert) {
      seenSet.add(`${it.queue_type}::${it.external_id}`);
      const existed = beforeSet.has(`${it.queue_type}::${it.external_id}`);
      await client.query(UPSERT_SQL, [
        it.queue_type, it.external_id, it.group_key,
        it.so_number || "", it.status || "", it.owner || "", it.severity || "",
        it.commit_date, it.revised_commit_date,
        it.dispatch_date, it.sched_start,
        it.remaining_time_text || "", it.remaining_hours,
        it.subtype || "", it.system_name || "", it.account_name || "", it.customer_trouble_type || "",
        JSON.stringify(it.raw_json || {}),
      ]);
      if (existed) updateCount++;
      else upsertCount++;
    }

    const runRes = await client.query(
      `INSERT INTO crawler_runs (snapshot_at, complete_types_json, total_active, new_count, gone_count, success, error_message, details_json)
       VALUES ($1, $2::jsonb, 0, 0, 0, true, NULL, $3::jsonb) RETURNING id`,
      [
        nowIso,
        JSON.stringify(completeTypes),
        JSON.stringify({
          before_count_by_type: beforeCountByType,
          incoming_count_by_type: incomingCountByType,
          queue_meta_by_type: queueMetaByType,
          safe_for_deletion: Array.from(safeForDeletion),
          deletion_skipped: deletionSkipped,
        }),
      ]
    );
    const runId = runRes.rows?.[0]?.id;

    // ── MARK MISSING (only for complete types that pass safety check) ──
    const candidatesRes = await client.query(
      `SELECT queue_type, external_id, status, missing_count,
              commit_date, revised_commit_date,
              owner, group_key, first_seen_at, last_seen_at,
              remaining_time_text, raw_json
       FROM queue_items WHERE is_final_closed = false`
    );

    let goneCount = 0;
    let archivedCount = 0;
    const goneByType = {};
    const goneItems = [];
    for (const r of candidatesRes.rows) {
      // Only process queue types that were fully scraped AND passed safety check
      if (!safeForDeletion.has(String(r.queue_type))) continue;
      const k = `${r.queue_type}::${r.external_id}`;
      if (seenSet.has(k)) continue;

      // Ticket not in current snapshot → mark inactive immediately
      const newMissing = Number(r.missing_count || 0) + 1;
      const inactive_reason = isClosedStatus(r.status) ? "CLOSED" : "TICKET_GONE";

      await client.query(
        `UPDATE queue_items SET active = false, missing_count = $1, closed_at = COALESCE(closed_at, NOW()),
                inactive_reason = $2, is_final_closed = true,
                snapshot_removed_at = NOW(), snapshot_removed_run_id = $5
         WHERE queue_type = $3 AND external_id = $4`,
        [newMissing, inactive_reason, r.queue_type, r.external_id, runId || null]
      );
      goneCount++;
      goneItems.push(k);
      goneByType[r.queue_type] = (goneByType[r.queue_type] || 0) + 1;

      // Archive to expired_tickets if commit exceeded
      const commitMs =
        (r.revised_commit_date && new Date(r.revised_commit_date).getTime()) ||
        (r.commit_date && new Date(r.commit_date).getTime()) ||
        null;

      if (commitMs !== null && Number.isFinite(commitMs) && commitMs < Date.now()) {
        await client.query(
          `INSERT INTO expired_tickets (
             queue_type, external_id, group_name, owner, status,
             commit_date, revised_commit_date, remaining_time_text,
             first_seen_at, last_seen_at, resolved_at, raw_json
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11::jsonb)
           ON CONFLICT (queue_type, external_id) DO UPDATE SET
             group_name = EXCLUDED.group_name, owner = EXCLUDED.owner, status = EXCLUDED.status,
             commit_date = EXCLUDED.commit_date, revised_commit_date = EXCLUDED.revised_commit_date,
             remaining_time_text = EXCLUDED.remaining_time_text,
             last_seen_at = EXCLUDED.last_seen_at, raw_json = EXCLUDED.raw_json`,
          [
            r.queue_type, r.external_id, r.group_key, r.owner, r.status,
            r.commit_date, r.revised_commit_date, r.remaining_time_text,
            r.first_seen_at, r.last_seen_at, JSON.stringify(r.raw_json || {}),
          ]
        );
        archivedCount++;
      }
    }

    // ── RUN LOG + DELTAS ──
    const newItems  = [...seenSet].filter((k) => !beforeSet.has(k));
    const activeCountRes = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM queue_items WHERE active = true AND is_final_closed = false`
    );
    const activeTotal = activeCountRes.rows?.[0]?.cnt || 0;

    if (runId) {
      await client.query(
        `UPDATE crawler_runs
         SET total_active = $2,
             new_count = $3,
             gone_count = $4,
             details_json = $5::jsonb
         WHERE id = $1`,
        [
          runId,
          activeTotal,
          newItems.length,
          goneItems.length,
          JSON.stringify({
            before_count_by_type: beforeCountByType,
            incoming_count_by_type: incomingCountByType,
            queue_meta_by_type: queueMetaByType,
            safe_for_deletion: Array.from(safeForDeletion),
            deletion_skipped: deletionSkipped,
            inserted_count: upsertCount,
            updated_count: updateCount,
            archived_count: archivedCount,
            gone_by_type: goneByType,
          }),
        ]
      );

      for (const k of newItems) {
        const [queue_type, external_id] = k.split("::");
        await client.query(
          `INSERT INTO crawler_run_deltas (run_id, delta_type, queue_type, external_id, group_name)
           VALUES ($1,'NEW',$2,$3,$4)`,
          [runId, queue_type, external_id, normalizeGroupFromQueueType(queue_type)]
        );
      }
      for (const k of goneItems) {
        const [queue_type, external_id] = k.split("::");
        await client.query(
          `INSERT INTO crawler_run_deltas (run_id, delta_type, queue_type, external_id, group_name)
           VALUES ($1,'GONE',$2,$3,$4)`,
          [runId, queue_type, external_id, normalizeGroupFromQueueType(queue_type)]
        );
      }
    }

    await client.query("COMMIT");

    // ── DETAILED LOG ──
    console.log(`[CRAWLER INGEST] === Snapshot Complete ===`);
    console.log(`[CRAWLER INGEST]   Upserted: ${itemsToUpsert.length} (${upsertCount} new inserts, ${updateCount} updates)`);
    console.log(`[CRAWLER INGEST]   Removed (marked inactive+final_closed): ${goneCount}`);
    if (Object.keys(goneByType).length > 0) {
      for (const [qt, cnt] of Object.entries(goneByType)) {
        console.log(`[CRAWLER INGEST]     ${qt}: ${cnt} tickets removed`);
      }
    }
    console.log(`[CRAWLER INGEST]   Archived to expired_tickets: ${archivedCount}`);
    if (Object.keys(deletionSkipped).length > 0) {
      console.warn(`[CRAWLER INGEST]   Deletion SKIPPED for: ${JSON.stringify(deletionSkipped)}`);
    }
    console.log(`[CRAWLER INGEST]   Run ID: ${runId || '(none)'}`);

    return {
      processed:      itemsToUpsert.length,
      active_seen:    seenSet.size,
      new_count:      newItems.length,
      gone_count:     goneCount,
      complete_types: completeTypes,
      updated_count:  updateCount,
      inserted_count: upsertCount,
      archived_count: archivedCount,
      deletion_skipped: Object.keys(deletionSkipped).length > 0 ? deletionSkipped : undefined,
      gone_by_type:   Object.keys(goneByType).length > 0 ? goneByType : undefined,
    };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }

    // Record failed run
    try {
      await pool.query(
        `INSERT INTO crawler_runs (snapshot_at, complete_types_json, total_active, new_count, gone_count, success, error_message)
         VALUES ($1, $2::jsonb, 0, 0, 0, false, $3)`,
        [new Date().toISOString(), JSON.stringify(completeTypes), String(err?.message || err)]
      );
    } catch { /* ignore */ }

    throw err;
  } finally {
    client.release();
  }
}
