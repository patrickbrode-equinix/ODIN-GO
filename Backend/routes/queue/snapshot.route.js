/* ------------------------------------------------ */
/* routes/queue/snapshot.route.js                   */
/* Thin HTTP handler for POST /api/queue/snapshot   */
/* All business logic delegated to queueIngest.service.js */
/* ------------------------------------------------ */

import express from "express";
import { config } from "../../config/index.js";
import { normalizePayload, persistSnapshot } from "../../services/queueIngest.service.js";
import { assignmentActionRepository, EXECUTION_STATUSES } from "../../assignment/writeback/assignmentActionRepository.js";
import { assignmentAuditRepository, AUDIT_EVENTS } from "../../assignment/writeback/assignmentAuditRepository.js";

const router = express.Router();

/* ------------------------------------------------ */
/* INGEST KEY GUARD                                 */
/* ------------------------------------------------ */

function requireIngestKey(req, res) {
  const expected = config.QUEUE_INGEST_KEY ? String(config.QUEUE_INGEST_KEY).trim() : "";

  if (!expected) {
    if (config.isProd) {
      console.error("[SEC] QUEUE_INGEST_KEY not set in production — rejecting ingest");
      res.status(401).json({ ok: false, error: "Ingest key not configured on server" });
      return false;
    }
    if (process.env.ALLOW_INSECURE_INGEST !== "true") {
      console.warn("[SEC] No QUEUE_INGEST_KEY set. Add ALLOW_INSECURE_INGEST=true to permit keyless ingest in dev.");
      res.status(401).json({ ok: false, error: "Ingest key required. Set ALLOW_INSECURE_INGEST=true in dev to bypass." });
      return false;
    }
    console.warn("[SEC] ALLOW_INSECURE_INGEST=true — accepting keyless ingest (dev only)");
    return true;
  }

  const rawHeader = req.header("X-OES-INGEST-KEY");
  const got = String(rawHeader || "").trim();
  const missingHeader = rawHeader === undefined || rawHeader === null || String(rawHeader).trim() === "";
  if (!got || got !== expected) {
    console.warn(
      `[SEC] Ingest key rejected — ip=${req.ip} missingHeader=${missingHeader} receivedLen=${got.length} expectedLen=${expected.length}`
    );
    res.status(401).json({
      ok: false,
      error: "Unauthorized ingest",
      missingHeader,
      headerKeyLength: got.length,
      expectedKeySet: !!expected,
    });
    return false;
  }
  return true;
}

/* ------------------------------------------------ */
/* POST /snapshot                                   */
/* ------------------------------------------------ */

// Quick connectivity test — no auth needed, no DB access.
// Usage: POST /api/queue/snapshot with body { "ping": true }
router.post("/snapshot", async (req, res) => {
  const body = req.body || {};

  if (body.ping === true) {
    return res.json({ ok: true, pong: true, ts: new Date().toISOString() });
  }

  if (!requireIngestKey(req, res)) return;

  const nowIso = String(body.jarvisSeenAt || body.generatedAt || new Date().toISOString());
  const keys   = Object.keys(body);

  console.log(`\n[CRAWLER INGEST] Received payload. Keys: ${JSON.stringify(keys)} ContentType: ${req.headers["content-type"] || "(none)"}`);

  // Validate: body.queues must be present (object or array)
  if (!body.queues || typeof body.queues !== "object") {
    console.warn(`[CRAWLER INGEST] 400: 'queues' key missing or not an object. gotKeys=${JSON.stringify(keys)}`);
    return res.status(400).json({
      ok: false,
      error: "invalid_payload",
      gotKeys: keys,
      expected: "body.queues must be an object {smartHands,troubleTickets,ccInstalls} or an array of {queueType,items}",
    });
  }

  try {
    const { itemsToUpsert, completeTypes, queueMetaByType } = normalizePayload(body);
    const result = await persistSnapshot(itemsToUpsert, completeTypes, nowIso, { queueMetaByType });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("QUEUE SNAPSHOT ERROR:", err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

function executionStatusForAction(actionType) {
  if (actionType === "unassign") return EXECUTION_STATUSES.UNASSIGNING;
  if (actionType === "reassign") return EXECUTION_STATUSES.REASSIGNING;
  return EXECUTION_STATUSES.EXECUTING;
}

function successStatusForAction(actionType) {
  if (actionType === "unassign") return EXECUTION_STATUSES.UNASSIGNED_SUCCESSFULLY;
  if (actionType === "reassign") return EXECUTION_STATUSES.REASSIGNED_SUCCESSFULLY;
  return EXECUTION_STATUSES.ASSIGNED_SUCCESSFULLY;
}

/* ------------------------------------------------ */
/* CRAWLER WRITEBACK JOBS                           */
/* The Chrome crawler owns Jarvis UI access.        */
/* ------------------------------------------------ */

router.get("/writeback/next", async (req, res) => {
  if (!requireIngestKey(req, res)) return;

  try {
    const actions = await assignmentActionRepository.findAll({
      executionStatus: EXECUTION_STATUSES.APPROVED_FOR_EXECUTION,
      limit: 10,
      offset: 0,
    });

    const action = actions.find((item) => item.execution_mode !== "shadow_only");
    if (!action) return res.json({ ok: true, job: null });

    const executingStatus = executionStatusForAction(action.action_type);
    const claimed = await assignmentActionRepository.updateStatus(
      action.id,
      executingStatus,
      {},
      action.lock_version
    );

    if (!claimed) {
      return res.status(409).json({ ok: false, error: "Writeback job was claimed by another crawler" });
    }

    await assignmentAuditRepository.log({
      assignmentActionId: claimed.id,
      ticketId: claimed.ticket_id,
      activityNumber: claimed.activity_number,
      eventType: AUDIT_EVENTS.CONCURRENCY_LOCK_ACQUIRED,
      message: "Crawler claimed writeback job for Jarvis execution",
      afterStateJson: { executionStatus: executingStatus },
    });

    res.json({
      ok: true,
      job: {
        id: claimed.id,
        actionType: claimed.action_type,
        ticketId: claimed.ticket_id,
        activityNumber: claimed.activity_number,
        salesOrderNumber: claimed.sales_order_number,
        queueType: claimed.queue_type,
        subType: claimed.sub_type,
        systemName: claimed.system_name,
        expectedPreviousOwnerCode: claimed.expected_previous_owner_code,
        currentJarvisOwnerCode: claimed.current_jarvis_owner_code,
        selectedEmployeeName: claimed.selected_employee_name,
        selectedEmployeeJarvisDisplayName: claimed.selected_employee_jarvis_display_name,
        selectedEmployeeJarvisOwnerCode: claimed.selected_employee_jarvis_owner_code,
        selectedEmployeeJarvisInitials: claimed.selected_employee_jarvis_initials,
      },
    });
  } catch (err) {
    console.error("[CRAWLER WRITEBACK] next error:", err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

router.post("/writeback/:id/result", async (req, res) => {
  if (!requireIngestKey(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "Invalid writeback id" });

  try {
    const action = await assignmentActionRepository.findById(id);
    if (!action) return res.status(404).json({ ok: false, error: "Writeback action not found" });

    const body = req.body || {};
    const success = body.success === true;
    const nextStatus = success ? successStatusForAction(action.action_type) : EXECUTION_STATUSES.FAILED;
    const resultFields = success
      ? {
          executed_at: new Date(),
          external_write_status: "crawler_success",
          previous_external_assignee: body.previousExternalAssignee || action.expected_previous_owner_code || null,
          new_external_assignee: body.actualOwnerCode || action.selected_employee_jarvis_owner_code || null,
        }
      : {
          failed_at: new Date(),
          external_write_status: "crawler_failed",
          failure_reason: body.reason || "Crawler writeback failed",
          last_error: body.error || body.reason || "Crawler writeback failed",
        };

    const updated = await assignmentActionRepository.updateStatus(id, nextStatus, resultFields);
    await assignmentAuditRepository.log({
      assignmentActionId: action.id,
      ticketId: action.ticket_id,
      activityNumber: action.activity_number,
      eventType: success ? AUDIT_EVENTS.EXECUTION_SUCCESS : AUDIT_EVENTS.EXECUTION_FAILED,
      message: success ? "Crawler completed Jarvis writeback" : `Crawler writeback failed: ${body.reason || body.error || "unknown"}`,
      afterStateJson: {
        status: nextStatus,
        actualOwnerCode: body.actualOwnerCode || null,
        details: body.details || null,
      },
      validationJson: Array.isArray(body.steps) ? { steps: body.steps } : null,
    });

    res.json({ ok: true, action: updated || (await assignmentActionRepository.findById(id)) });
  } catch (err) {
    console.error("[CRAWLER WRITEBACK] result error:", err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

export default router;
