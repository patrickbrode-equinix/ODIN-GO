/* ------------------------------------------------ */
/* INGEST ROUTES – EXCEL UPSERT INTO queue_items     */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { broadcast } from "./sse.js";
import { parseAnyDateToIso } from "../lib/dateParser.js";

const router = express.Router();

router.use(requireAuth);
router.use(requirePageAccess("tickets", "write"));

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
  }
  return null;
}

function parseDate(v) {
  return parseAnyDateToIso(v);
}

function parseNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* POST /api/ingest/excel  { rows: [...] } */
router.post("/excel", async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.json({ success: true, inserted: 0, updated: 0 });

  const client = await db.connect();
  let inserted = 0;
  let updated = 0;

  try {
    await client.query("BEGIN");

    for (const r of rows) {
      const externalId = String(pick(r, ["externalId","External ID","Ticket","ticket","ticketId","id"]) || "").trim();
      if (!externalId) continue;

      const groupKey = String(pick(r, ["group","Group","group_key","groupKey"]) || "unknown").trim();

      const values = {
        externalId,
        groupKey,
        queueType: pick(r, ["queueType","Queue Type","queue_type"]),
        soNumber: pick(r, ["soNumber","SO","SO Number","so_number"]),
        status: pick(r, ["status","Status"]),
        owner: pick(r, ["owner","Owner"]),
        severity: pick(r, ["severity","Severity"]),
        commitDate: parseDate(pick(r, ["commitDate","Commit Date","commit_date"])),
        revised: parseDate(pick(r, ["revisedDate","Revised Commit Date","revised_commit_date"])),
        dispatch: parseDate(pick(r, ["dispatchDate","Dispatch Date","dispatch_date"])),
        schedStart: parseDate(pick(r, ["schedStart","Sched. Start","Sched Start","sched_start"])),
        remainingText: pick(r, ["remainingTime","Remaining","remaining_time_text"]),
        remainingHours: parseNum(pick(r, ["remainingHours","Remaining Hours","remaining_hours"])),
        subtype: pick(r, ["subtype","Subtype"]),
        systemName: pick(r, ["systemName","System","System Name","system_name"]),
        accountName: pick(r, ["accountName","Account","account_name"]),
        customerTroubleType: pick(r, ["customerTroubleType","Trouble Type","customer_trouble_type"]),
        isTFM: Boolean(pick(r, ["isTFM","is_tfm","TFM"])),
      };

      const up = await client.query(
        `
        INSERT INTO queue_items
          (external_id, group_key, queue_type, so_number, status, owner, severity,
           commit_date, revised_commit_date, dispatch_date, sched_start,
           remaining_time_text, remaining_hours, subtype, system_name, account_name,
           customer_trouble_type, is_tfm, excel_seen_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,
           $8,$9,$10,$11,
           $12,$13,$14,$15,$16,
           $17,$18,NOW())
        ON CONFLICT (external_id) DO UPDATE SET
          group_key = EXCLUDED.group_key,
          queue_type = EXCLUDED.queue_type,
          so_number = EXCLUDED.so_number,
          status = EXCLUDED.status,
          owner = EXCLUDED.owner,
          severity = EXCLUDED.severity,
          commit_date = EXCLUDED.commit_date,
          revised_commit_date = EXCLUDED.revised_commit_date,
          dispatch_date = EXCLUDED.dispatch_date,
          sched_start = EXCLUDED.sched_start,
          remaining_time_text = EXCLUDED.remaining_time_text,
          remaining_hours = EXCLUDED.remaining_hours,
          subtype = EXCLUDED.subtype,
          system_name = EXCLUDED.system_name,
          account_name = EXCLUDED.account_name,
          customer_trouble_type = EXCLUDED.customer_trouble_type,
          is_tfm = EXCLUDED.is_tfm,
          excel_seen_at = NOW()
        RETURNING xmax = 0 AS inserted
        `,
        [
          values.externalId,
          values.groupKey,
          values.queueType,
          values.soNumber,
          values.status,
          values.owner,
          values.severity,
          values.commitDate,
          values.revised,
          values.dispatch,
          values.schedStart,
          values.remainingText,
          values.remainingHours,
          values.subtype,
          values.systemName,
          values.accountName,
          values.customerTroubleType,
          values.isTFM,
        ]
      );

      if (up.rows?.[0]?.inserted) inserted += 1;
      else updated += 1;
    }

    await client.query("COMMIT");
    // Broadcast realtime update so dashboards can refresh
    broadcast("ingest_complete", { inserted, updated, ts: new Date().toISOString() });
    res.json({ success: true, inserted, updated });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("INGEST EXCEL ERROR:", e);
    res.status(500).json({ error: "ingest failed" });
  } finally {
    client.release();
  }
});

export default router;
