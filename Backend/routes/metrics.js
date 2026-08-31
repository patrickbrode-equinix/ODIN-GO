/* ------------------------------------------------ */
/* METRICS – SYSTEM + PROCESS (ESM)                  */
/* ------------------------------------------------ */

import express from "express";
import os from "os";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function bytesToMB(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10; // 1 decimal
}

function cpuSnapshot() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.irq + t.idle;
  }

  return { idle, total };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sampleCpuUsagePct(sampleMs = 200) {
  const a = cpuSnapshot();
  await sleep(sampleMs);
  const b = cpuSnapshot();

  const idleDelta = b.idle - a.idle;
  const totalDelta = b.total - a.total;

  if (totalDelta <= 0) return null;

  const usage = 1 - idleDelta / totalDelta; // 0..1
  return Math.round(usage * 1000) / 10; // 1 decimal
}

/* ------------------------------------------------ */
/* GET /api/metrics                                  */
/* ------------------------------------------------ */

// Header metrics are global UI data, so authenticated users need access even
// when they are not currently allowed to open the dashboard page itself.
router.get("/", requireAuth, async (req, res) => {
  try {
    const mem = process.memoryUsage();

    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    const cpuCount = os.cpus().length || 1;
    const [l1, l5, l15] = os.loadavg();

    const [cpuUsagePct, dbStats, userStats, ticketStats] = await Promise.all([
      sampleCpuUsagePct(200).catch(() => null),
      db.query(
        `SELECT
           pg_database_size(current_database()) AS size_bytes,
           pg_size_pretty(pg_database_size(current_database())) AS size_pretty,
           COUNT(*) FILTER (WHERE datname = current_database())::int AS connection_count
         FROM pg_stat_activity`
      ).catch(() => ({ rows: [{}] })),
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE approved = TRUE)::int AS total_approved,
           COUNT(*) FILTER (
             WHERE approved = TRUE
               AND last_seen_at IS NOT NULL
               AND last_seen_at >= NOW() - INTERVAL '15 minutes'
           )::int AS online_count
         FROM users`
      ).catch(() => ({ rows: [{}] })),
      db.query(
        `SELECT COUNT(*) FILTER (WHERE active = TRUE)::int AS active_count
         FROM queue_items`
      ).catch(() => ({ rows: [{}] })),
    ]);

  const dbRow = dbStats.rows[0] || {};
  const userRow = userStats.rows[0] || {};
  const ticketRow = ticketStats.rows[0] || {};
  const onlineCount = Number.parseInt(String(userRow.online_count ?? 0), 10) || 0;
  const activeTickets = Number.parseInt(String(ticketRow.active_count ?? 0), 10) || 0;
    const loadPct1 = cpuCount > 0 ? Math.round((l1 / cpuCount) * 1000) / 10 : 0;
    const utilizationPct = Math.round((((cpuUsagePct || 0) + Math.max(loadPct1, 0) + Math.max(Math.round((used / total) * 1000) / 10, 0)) / 3) * 10) / 10;

    res.json({
      uptimeSec: Math.round(process.uptime()),
      process: {
        rssMB: bytesToMB(mem.rss),
        heapUsedMB: bytesToMB(mem.heapUsed),
        heapTotalMB: bytesToMB(mem.heapTotal),
      },
      system: {
        platform: process.platform,
        cpuCount,
        memTotalMB: bytesToMB(total),
        memFreeMB: bytesToMB(free),
        memUsedMB: bytesToMB(used),
        memUsedPct: Math.round((used / total) * 1000) / 10,
        cpuUsagePct,
        loadavg: {
          load1: Math.round(l1 * 100) / 100,
          load5: Math.round(l5 * 100) / 100,
          load15: Math.round(l15 * 100) / 100,
        },
        loadPct: {
          load1: Math.round((l1 / cpuCount) * 1000) / 10,
          load5: Math.round((l5 / cpuCount) * 1000) / 10,
          load15: Math.round((l15 / cpuCount) * 1000) / 10,
        },
      },
      users: {
        onlineCount,
        totalApproved: Number.parseInt(String(userRow.total_approved ?? 0), 10) || 0,
        recentWindowMinutes: 15,
      },
      database: {
        sizeMB: bytesToMB(Number.parseInt(String(dbRow.size_bytes ?? 0), 10) || 0),
        sizePretty: dbRow.size_pretty || null,
        connectionCount: Number.parseInt(String(dbRow.connection_count ?? 0), 10) || 0,
      },
      tickets: {
        activeCount: activeTickets,
        perOnlineUser: onlineCount > 0 ? Math.round((activeTickets / onlineCount) * 10) / 10 : null,
      },
      utilization: {
        overallPct: Number.isFinite(utilizationPct) ? utilizationPct : null,
        systemLoadPct: Number.isFinite(loadPct1) ? loadPct1 : null,
      },
      pid: process.pid,
      node: process.version,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[METRICS] Error:", err);
    res.status(500).json({ message: "Metrics konnten nicht geladen werden.", error: err.message });
  }
});

export default router;
