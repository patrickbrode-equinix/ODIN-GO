/* ------------------------------------------------ */
/* TICKET AUDIT – ADMIN ONLY STATISTICS             */
/* Manuelle Übernahmen & Bearbeitungsstatistik       */
/* ------------------------------------------------ */

import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { config } from "../config/index.js";

const router = express.Router();
const TZ = config.OPERATIONAL_TIMEZONE;
const SHIFT_MONTH_INDEX = {
  januar: 1,
  january: 1,
  jan: 1,
  februar: 2,
  february: 2,
  feb: 2,
  märz: 3,
  maerz: 3,
  mrz: 3,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mai: 5,
  may: 5,
  juni: 6,
  june: 6,
  jun: 6,
  juli: 7,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  oktober: 10,
  october: 10,
  okt: 10,
  oct: 10,
  november: 11,
  nov: 11,
  dezember: 12,
  december: 12,
  dez: 12,
  dec: 12,
};
const WELLBEING_OFF_CODES = new Set(["", "FS", "ABW", "K", "U", "VACATION", "SICK", "TRAINING", "OFF", "FREI"]);

router.use(requireAuth);

function normalizeLevel(raw) {
  const level = String(raw || "").toLowerCase().trim();
  if (level === "write") return 2;
  if (level === "view") return 1;
  return 0;
}

function requireTicketAuditAccess(req, res, next) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (user.is_root === true) {
    return next();
  }
  if (user.approved !== true) {
    return res.status(403).json({ code: "ACCOUNT_NOT_APPROVED", message: "Account wartet auf Freigabe" });
  }

  const ticketAuditLevel = normalizeLevel(user.accessPolicy?.ticket_audit);
  const dashboardLevel = normalizeLevel(user.accessPolicy?.dashboard);
  if (Math.max(ticketAuditLevel, dashboardLevel) < 1) {
    return res.status(403).json({ code: "INSUFFICIENT_PERMISSION", message: "Access denied (ticket-audit:view)" });
  }

  return next();
}

function requireLocalAdminOnly(req, res, next) {
  if (req.user?.is_root === true) {
    return next();
  }

  return res.status(403).json({
    code: "LOCAL_ADMIN_ONLY",
    message: "Access denied (local-admin only)",
  });
}

router.use(requireTicketAuditAccess);

function buildAssignedDecisionMatchClause(queueAlias = "qi", decisionAlias = "atd") {
  return `(
    ${decisionAlias}.ticket_id = ${queueAlias}.id::text
    OR (
      ${decisionAlias}.external_id IS NOT NULL
      AND ${decisionAlias}.external_id = ${queueAlias}.external_id
      AND (${decisionAlias}.ticket_type IS NULL OR ${decisionAlias}.ticket_type = ${queueAlias}.queue_type)
    )
  )`;
}

/* ------------------------------------------------ */
/* HELPER: Parse time range from query params       */
/* range = month | quarter | year | custom          */
/* from / to = YYYY-MM-DD (for custom)              */
/* ------------------------------------------------ */
function parseDateRange(q) {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  if (q.range === "custom" && q.from && q.to) {
    const from = String(q.from).slice(0, 10);
    const to = String(q.to).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }

  switch (q.range) {
    case "quarter": {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterMonth, 1);
      return { from: start.toISOString().split("T")[0], to: todayStr };
    }
    case "year": {
      return { from: `${now.getFullYear()}-01-01`, to: todayStr };
    }
    case "month":
    default: {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      return { from: `${y}-${m}-01`, to: todayStr };
    }
  }
}

function toInt(value) {
  return Number.parseInt(String(value || 0), 10) || 0;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDateKey(value, days) {
  const next = new Date(`${value}T00:00:00`);
  next.setDate(next.getDate() + days);
  return formatDateKey(next);
}

function parseShiftMonthLabel(label) {
  const raw = String(label || "").trim();
  const [monthToken, yearToken] = raw.split(/\s+/);
  const month = SHIFT_MONTH_INDEX[String(monthToken || "").toLowerCase()];
  const year = Number.parseInt(String(yearToken || ""), 10);
  if (!month || !Number.isInteger(year)) return null;
  return { month, year };
}

function buildShiftDateKey(label, day) {
  const parsed = parseShiftMonthLabel(label);
  const dayNumber = Number.parseInt(String(day || ""), 10);
  if (!parsed || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function buildHolidaySet(years, state = "DE") {
  const dates = new Set();

  for (const year of years) {
    const easter = easterSunday(year);
    const holidays = [
      new Date(year, 0, 1),
      addDays(easter, -2),
      addDays(easter, 1),
      new Date(year, 4, 1),
      addDays(easter, 39),
      addDays(easter, 50),
      new Date(year, 9, 3),
      new Date(year, 11, 25),
      new Date(year, 11, 26),
    ];

    if (String(state || "DE").toUpperCase() === "HE") {
      holidays.push(addDays(easter, 60));
    }

    for (const holiday of holidays) {
      dates.add(formatDateKey(holiday));
    }
  }

  return dates;
}

function getYearsInRange(from, to) {
  const years = [];
  const startYear = Number.parseInt(String(from || "").slice(0, 4), 10);
  const endYear = Number.parseInt(String(to || "").slice(0, 4), 10);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) return years;
  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }
  return years;
}

function isWeekendDateKey(value) {
  const date = new Date(`${value}T00:00:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function normalizeShiftCode(value) {
  return String(value || "").trim().toUpperCase();
}

function isNightShift(code) {
  return code === "N" || code === "NIGHT";
}

function isLateShift(code) {
  return code.startsWith("L") || code.startsWith("HL") || code === "LATE";
}

function isEarlyShift(code) {
  return code.startsWith("E") || code === "EARLY";
}

function isWorkingShift(code) {
  return !WELLBEING_OFF_CODES.has(code);
}

function computeMaxStreak(workDates) {
  if (!workDates.length) return 0;
  const sorted = [...new Set(workDates)].sort();
  let current = 0;
  let max = 0;
  let previous = null;

  for (const entry of sorted) {
    if (previous && shiftDateKey(previous, 1) === entry) {
      current += 1;
    } else {
      current = 1;
    }
    max = Math.max(max, current);
    previous = entry;
  }

  return max;
}

function buildHourBuckets(rows, valueKey = "count") {
  const map = new Map(
    rows.map((row) => [
      Number.parseInt(String(row.hour || 0), 10),
      Number.parseInt(String(row[valueKey] || 0), 10) || 0,
    ])
  );

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    count: map.get(hour) || 0,
  }));
}

const QUEUE_BUCKET_SQL = `
  CASE
    WHEN LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%smart hand%'
      OR LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%smarthand%'
      THEN 'Smart Hands'
    WHEN LOWER(COALESCE(qi.queue_type, '')) LIKE '%trouble%'
      THEN 'Trouble Tickets'
    WHEN LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%cross%connect%'
      THEN 'Cross Connect'
    ELSE COALESCE(NULLIF(qi.queue_type, ''), 'Other')
  END
`;

/* ------------------------------------------------ */
/* GET /api/stats/audit/summary                     */
/* KPI summary for the selected time range          */
/* ------------------------------------------------ */
router.get("/summary", async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const assignedDecisionMatch = buildAssignedDecisionMatchClause();

    // 1. Total tickets with owner in range
    const totalOwned = await query(`
      SELECT COUNT(DISTINCT qi.id) AS count
      FROM queue_items qi
      WHERE qi.owner IS NOT NULL AND qi.owner != ''
        AND qi.last_seen_at >= $1::date
        AND qi.first_seen_at < $2::date + INTERVAL '1 day'
    `, [from, to]);

    // 2. Tickets auto-assigned by ODIN in range
    const autoAssigned = await query(`
      SELECT COUNT(DISTINCT COALESCE(NULLIF(atd.external_id, ''), atd.ticket_id)) AS count
      FROM assignment_ticket_decisions atd
      WHERE atd.result = 'assigned'
        AND atd.decided_at >= $1::date
        AND atd.decided_at < $2::date + INTERVAL '1 day'
    `, [from, to]);

    // 3. Tickets with owner but NO auto-assignment (manual takeover)
    const manualTakeover = await query(`
      SELECT COUNT(DISTINCT qi.id) AS count
      FROM queue_items qi
      WHERE qi.owner IS NOT NULL AND qi.owner != ''
        AND qi.last_seen_at >= $1::date
        AND qi.first_seen_at < $2::date + INTERVAL '1 day'
        AND NOT EXISTS (
          SELECT 1 FROM assignment_ticket_decisions atd
          WHERE ${assignedDecisionMatch}
            AND atd.result = 'assigned'
        )
    `, [from, to]);

    // 4. Distinct workers with manual takeovers
    const manualWorkers = await query(`
      SELECT COUNT(DISTINCT qi.owner) AS count
      FROM queue_items qi
      WHERE qi.owner IS NOT NULL AND qi.owner != ''
        AND qi.last_seen_at >= $1::date
        AND qi.first_seen_at < $2::date + INTERVAL '1 day'
        AND NOT EXISTS (
          SELECT 1 FROM assignment_ticket_decisions atd
          WHERE ${assignedDecisionMatch}
            AND atd.result = 'assigned'
        )
    `, [from, to]);

    // 5. Closed tickets in range
    const closedCount = await query(`
      SELECT COUNT(*) AS count
      FROM queue_items
      WHERE closed_at >= $1::date
        AND closed_at < $2::date + INTERVAL '1 day'
    `, [from, to]);

    res.json({
      from,
      to,
      totalOwned: parseInt(totalOwned.rows[0]?.count || 0),
      autoAssigned: parseInt(autoAssigned.rows[0]?.count || 0),
      manualTakeover: parseInt(manualTakeover.rows[0]?.count || 0),
      manualWorkers: parseInt(manualWorkers.rows[0]?.count || 0),
      closedTickets: parseInt(closedCount.rows[0]?.count || 0),
    });
  } catch (err) {
    console.error("AUDIT SUMMARY ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/* ------------------------------------------------ */
/* GET /api/stats/audit/manual-takeovers            */
/* Per-worker manual takeover statistics             */
/* ------------------------------------------------ */
router.get("/manual-takeovers", async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const assignedDecisionMatch = buildAssignedDecisionMatchClause();

    const result = await query(`
      SELECT
        qi.owner AS worker,
        COUNT(DISTINCT qi.id) AS count,
        MAX(qi.last_seen_at) AS last_takeover,
        ARRAY_AGG(DISTINCT COALESCE(qi.queue_type, 'Unbekannt')) AS ticket_types
      FROM queue_items qi
      WHERE qi.owner IS NOT NULL AND qi.owner != ''
        AND qi.last_seen_at >= $1::date
        AND qi.first_seen_at < $2::date + INTERVAL '1 day'
        AND NOT EXISTS (
          SELECT 1 FROM assignment_ticket_decisions atd
          WHERE ${assignedDecisionMatch}
            AND atd.result = 'assigned'
        )
      GROUP BY qi.owner
      ORDER BY count DESC
    `, [from, to]);

    // Also get the total per-worker for percentage
    const totalPerWorker = await query(`
      SELECT qi.owner, COUNT(DISTINCT qi.id) AS total
      FROM queue_items qi
      WHERE qi.owner IS NOT NULL AND qi.owner != ''
        AND qi.last_seen_at >= $1::date
        AND qi.first_seen_at < $2::date + INTERVAL '1 day'
      GROUP BY qi.owner
    `, [from, to]);

    const totalMap = {};
    for (const r of totalPerWorker.rows) {
      totalMap[r.owner] = parseInt(r.total);
    }

    const rows = result.rows.map(r => ({
      worker: r.worker,
      count: parseInt(r.count),
      total: totalMap[r.worker] || parseInt(r.count),
      percentage: totalMap[r.worker]
        ? Math.round((parseInt(r.count) / totalMap[r.worker]) * 100)
        : 100,
      lastTakeover: r.last_takeover,
      ticketTypes: r.ticket_types?.filter(t => t) || [],
    }));

    res.json(rows);
  } catch (err) {
    console.error("AUDIT MANUAL TAKEOVERS ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/* ------------------------------------------------ */
/* GET /api/stats/audit/worker-activity             */
/* Per-worker ticket activity statistics             */
/* ------------------------------------------------ */
router.get("/worker-activity", async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);

    const result = await query(`
      SELECT
        qi.owner AS worker,
        COUNT(DISTINCT qi.id) AS total,
        COUNT(DISTINCT qi.id) FILTER (
          WHERE LOWER(COALESCE(qi.queue_type,'')) LIKE '%smart hand%'
             OR LOWER(COALESCE(qi.queue_type,'') || ' ' || COALESCE(qi.subtype,'')) LIKE '%smarthand%'
        ) AS sh,
        COUNT(DISTINCT qi.id) FILTER (
          WHERE LOWER(COALESCE(qi.queue_type,'')) LIKE '%trouble%'
        ) AS tt,
        COUNT(DISTINCT qi.id) FILTER (
          WHERE LOWER(COALESCE(qi.queue_type,'') || ' ' || COALESCE(qi.subtype,'')) LIKE '%cross%connect%'
        ) AS cc,
        COUNT(DISTINCT qi.id) FILTER (
          WHERE qi.closed_at IS NOT NULL
        ) AS closed
      FROM queue_items qi
      WHERE qi.owner IS NOT NULL AND qi.owner != ''
        AND qi.last_seen_at >= $1::date
        AND qi.first_seen_at < $2::date + INTERVAL '1 day'
      GROUP BY qi.owner
      ORDER BY total DESC
    `, [from, to]);

    const rows = result.rows.map(r => ({
      worker: r.worker,
      total: parseInt(r.total),
      sh: parseInt(r.sh),
      tt: parseInt(r.tt),
      cc: parseInt(r.cc),
      closed: parseInt(r.closed),
    }));

    res.json(rows);
  } catch (err) {
    console.error("AUDIT WORKER ACTIVITY ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/dashboard-analytics", async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const assignedDecisionMatch = buildAssignedDecisionMatchClause();

    const [
      summaryResult,
      dispatchHourResult,
      closedHourResult,
      troubleDispatchHourResult,
      overdueByQueueResult,
      ownerRankingResult,
      closerRankingResult,
      manualTakeoverResult,
    ] = await Promise.all([
      query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE qi.dispatch_date >= $1::date
                AND qi.dispatch_date < $2::date + INTERVAL '1 day'
            ) AS dispatch_total,
            COUNT(*) FILTER (
              WHERE qi.closed_at >= $1::date
                AND qi.closed_at < $2::date + INTERVAL '1 day'
            ) AS closed_total,
            COUNT(*) FILTER (
              WHERE qi.active = true
                AND COALESCE(qi.revised_commit_date, qi.commit_date) IS NOT NULL
                AND COALESCE(qi.revised_commit_date, qi.commit_date) < NOW()
            ) AS overdue_active,
            COUNT(*) FILTER (
              WHERE qi.active = true
                AND qi.owner IS NOT NULL
                AND btrim(qi.owner) <> ''
            ) AS active_owned,
            COUNT(*) FILTER (
              WHERE qi.active = true
                AND (qi.owner IS NULL OR btrim(qi.owner) = '')
            ) AS active_unassigned,
            COUNT(DISTINCT qi.owner) FILTER (
              WHERE qi.active = true
                AND qi.owner IS NOT NULL
                AND btrim(qi.owner) <> ''
            ) AS active_owners,
            COUNT(*) FILTER (
              WHERE qi.active = true
                AND COALESCE(qi.revised_commit_date, qi.commit_date) IS NOT NULL
                AND COALESCE(qi.revised_commit_date, qi.commit_date) >= NOW()
            ) AS on_track_active
          FROM queue_items qi
        `,
        [from, to]
      ),
      query(
        `
          SELECT
            EXTRACT(HOUR FROM qi.dispatch_date AT TIME ZONE '${TZ}')::int AS hour,
            COUNT(*)::int AS count
          FROM queue_items qi
          WHERE qi.dispatch_date >= $1::date
            AND qi.dispatch_date < $2::date + INTERVAL '1 day'
          GROUP BY hour
          ORDER BY hour
        `,
        [from, to]
      ),
      query(
        `
          SELECT
            EXTRACT(HOUR FROM qi.closed_at AT TIME ZONE '${TZ}')::int AS hour,
            COUNT(*)::int AS count
          FROM queue_items qi
          WHERE qi.closed_at >= $1::date
            AND qi.closed_at < $2::date + INTERVAL '1 day'
          GROUP BY hour
          ORDER BY hour
        `,
        [from, to]
      ),
      query(
        `
          SELECT
            EXTRACT(HOUR FROM qi.dispatch_date AT TIME ZONE '${TZ}')::int AS hour,
            COUNT(*)::int AS count
          FROM queue_items qi
          WHERE qi.dispatch_date >= $1::date
            AND qi.dispatch_date < $2::date + INTERVAL '1 day'
            AND LOWER(COALESCE(qi.queue_type, '')) LIKE '%trouble%'
          GROUP BY hour
          ORDER BY hour
        `,
        [from, to]
      ),
      query(
        `
          SELECT
            ${QUEUE_BUCKET_SQL} AS queue_label,
            COUNT(*)::int AS count
          FROM queue_items qi
          WHERE qi.active = true
            AND COALESCE(qi.revised_commit_date, qi.commit_date) IS NOT NULL
            AND COALESCE(qi.revised_commit_date, qi.commit_date) < NOW()
          GROUP BY queue_label
          ORDER BY count DESC, queue_label ASC
        `
      ),
      query(
        `
          SELECT
            qi.owner AS worker,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%smart hand%'
                 OR LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%smarthand%'
            )::int AS sh,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(qi.queue_type, '')) LIKE '%trouble%'
            )::int AS tt,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%cross%connect%'
            )::int AS cc
          FROM queue_items qi
          WHERE qi.active = true
            AND qi.owner IS NOT NULL
            AND btrim(qi.owner) <> ''
          GROUP BY qi.owner
          ORDER BY total DESC, qi.owner ASC
        `
      ),
      query(
        `
          SELECT
            qi.owner AS worker,
            COUNT(*)::int AS closed,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%smart hand%'
                 OR LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%smarthand%'
            )::int AS sh,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(qi.queue_type, '')) LIKE '%trouble%'
            )::int AS tt,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%cross%connect%'
            )::int AS cc
          FROM queue_items qi
          WHERE qi.closed_at >= $1::date
            AND qi.closed_at < $2::date + INTERVAL '1 day'
            AND qi.owner IS NOT NULL
            AND btrim(qi.owner) <> ''
          GROUP BY qi.owner
          ORDER BY closed DESC, qi.owner ASC
        `,
        [from, to]
      ),
      query(
        `
          SELECT
            qi.owner AS worker,
            COUNT(DISTINCT qi.id)::int AS count,
            COUNT(DISTINCT qi.id) FILTER (
              WHERE qi.last_seen_at >= $1::date
                AND qi.first_seen_at < $2::date + INTERVAL '1 day'
            )::int AS total,
            MAX(qi.last_seen_at) AS last_takeover,
            ARRAY_AGG(DISTINCT ${QUEUE_BUCKET_SQL}) AS ticket_types
          FROM queue_items qi
          WHERE qi.owner IS NOT NULL
            AND btrim(qi.owner) <> ''
            AND qi.last_seen_at >= $1::date
            AND qi.first_seen_at < $2::date + INTERVAL '1 day'
            AND NOT EXISTS (
              SELECT 1
              FROM assignment_ticket_decisions atd
              WHERE ${assignedDecisionMatch}
                AND atd.result = 'assigned'
            )
          GROUP BY qi.owner
          ORDER BY count DESC, qi.owner ASC
        `,
        [from, to]
      ),
    ]);

    const summary = summaryResult.rows[0] || {};
    const manualTakeovers = manualTakeoverResult.rows.map((row) => {
      const count = toInt(row.count);
      const total = toInt(row.total) || count;
      return {
        worker: row.worker,
        count,
        total,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        lastTakeover: row.last_takeover || null,
        ticketTypes: Array.isArray(row.ticket_types) ? row.ticket_types.filter(Boolean) : [],
      };
    });

    res.json({
      from,
      to,
      summary: {
        dispatchTotal: toInt(summary.dispatch_total),
        closedTotal: toInt(summary.closed_total),
        overdueActive: toInt(summary.overdue_active),
        onTrackActive: toInt(summary.on_track_active),
        activeOwned: toInt(summary.active_owned),
        activeUnassigned: toInt(summary.active_unassigned),
        activeOwners: toInt(summary.active_owners),
      },
      tickets: {
        dispatchByHour: buildHourBuckets(dispatchHourResult.rows),
        closedByHour: buildHourBuckets(closedHourResult.rows),
        troubleDispatchByHour: buildHourBuckets(troubleDispatchHourResult.rows),
        overdueByQueue: overdueByQueueResult.rows.map((row) => ({
          queue: row.queue_label,
          count: toInt(row.count),
        })),
      },
      team: {
        ownerRanking: ownerRankingResult.rows.map((row) => ({
          worker: row.worker,
          total: toInt(row.total),
          sh: toInt(row.sh),
          tt: toInt(row.tt),
          cc: toInt(row.cc),
        })),
        closerRanking: closerRankingResult.rows.map((row) => ({
          worker: row.worker,
          closed: toInt(row.closed),
          sh: toInt(row.sh),
          tt: toInt(row.tt),
          cc: toInt(row.cc),
        })),
        manualTakeovers,
      },
    });
  } catch (err) {
    console.error("AUDIT DASHBOARD ANALYTICS ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/wellbeing-analytics", async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const years = getYearsInRange(from, to);
    const configResult = await query(`SELECT * FROM wellbeing_config WHERE scope = 'global' LIMIT 1`);
    const wellbeingConfig = configResult.rows[0] || {
      night_threshold: 4,
      weekend_threshold: 2,
      streak_threshold: 7,
    };

    const shiftRows = years.length
      ? await query(
        `
          SELECT employee_name, day, shift_code, month
          FROM shifts
          WHERE ${years.map((_, index) => `month ILIKE $${index + 1}`).join(" OR ")}
        `,
        years.map((year) => `%${year}%`)
      )
      : { rows: [] };

    const holidaySet = buildHolidaySet(years, String(req.query.state || "DE").toUpperCase());
    const byWorker = new Map();

    for (const row of shiftRows.rows) {
      const dateKey = buildShiftDateKey(row.month, row.day);
      if (!dateKey || dateKey < from || dateKey > to) continue;

      const shiftCode = normalizeShiftCode(row.shift_code);
      const worker = String(row.employee_name || "").trim();
      if (!worker) continue;

      const current = byWorker.get(worker) || {
        worker,
        nightCount: 0,
        weekendCount: 0,
        holidayCount: 0,
        lateCount: 0,
        earlyCount: 0,
        absentCount: 0,
        totalAssignments: 0,
        workDates: [],
      };

      const workingShift = isWorkingShift(shiftCode);
      if (workingShift) {
        current.totalAssignments += 1;
        current.workDates.push(dateKey);
      } else {
        current.absentCount += 1;
      }
      if (isNightShift(shiftCode)) current.nightCount += 1;
      if (isLateShift(shiftCode)) current.lateCount += 1;
      if (isEarlyShift(shiftCode)) current.earlyCount += 1;
      if (workingShift && isWeekendDateKey(dateKey)) current.weekendCount += 1;
      if (workingShift && holidaySet.has(dateKey)) current.holidayCount += 1;

      byWorker.set(worker, current);
    }

    const rows = Array.from(byWorker.values())
      .map((entry) => {
        const maxStreak = computeMaxStreak(entry.workDates);
        const totalSpecialShifts = entry.nightCount + entry.lateCount + entry.weekendCount + entry.holidayCount;
        const burdenScore = Math.round(
          entry.nightCount * 3.2
          + entry.holidayCount * 2.6
          + entry.weekendCount * 2.1
          + entry.lateCount * 1.4
          + Math.max(0, maxStreak - (wellbeingConfig.streak_threshold || 7)) * 1.8
        );

        return {
          worker: entry.worker,
          nightCount: entry.nightCount,
          weekendCount: entry.weekendCount,
          holidayCount: entry.holidayCount,
          lateCount: entry.lateCount,
          earlyCount: entry.earlyCount,
          absentCount: entry.absentCount,
          totalAssignments: entry.totalAssignments,
          totalSpecialShifts,
          maxStreak,
          burdenScore,
        };
      })
      .sort((left, right) => (
        right.burdenScore - left.burdenScore
        || right.totalSpecialShifts - left.totalSpecialShifts
        || right.totalAssignments - left.totalAssignments
        || left.worker.localeCompare(right.worker)
      ));

    const summary = rows.reduce((accumulator, row) => ({
      employeeCount: accumulator.employeeCount + 1,
      totalNight: accumulator.totalNight + row.nightCount,
      totalWeekend: accumulator.totalWeekend + row.weekendCount,
      totalHoliday: accumulator.totalHoliday + row.holidayCount,
      totalLate: accumulator.totalLate + row.lateCount,
      totalAbsent: accumulator.totalAbsent + row.absentCount,
      averageBurden: accumulator.averageBurden + row.burdenScore,
      maxBurden: Math.max(accumulator.maxBurden, row.burdenScore),
    }), {
      employeeCount: 0,
      totalNight: 0,
      totalWeekend: 0,
      totalHoliday: 0,
      totalLate: 0,
      totalAbsent: 0,
      averageBurden: 0,
      maxBurden: 0,
    });

    res.json({
      from,
      to,
      config: {
        nightThreshold: toInt(wellbeingConfig.night_threshold),
        weekendThreshold: toInt(wellbeingConfig.weekend_threshold),
        streakThreshold: toInt(wellbeingConfig.streak_threshold),
      },
      summary: {
        ...summary,
        averageBurden: summary.employeeCount > 0 ? Number((summary.averageBurden / summary.employeeCount).toFixed(1)) : 0,
        highestBurdenWorker: rows[0]?.worker || null,
      },
      rows,
    });
  } catch (err) {
    console.error("AUDIT WELLBEING ANALYTICS ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/employee-drilldown", async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const worker = String(req.query.worker || "").trim();
    if (!worker) {
      return res.status(400).json({ error: "worker query param is required" });
    }

    const assignedDecisionMatch = buildAssignedDecisionMatchClause();

    const [summaryResult, closedTimelineResult, manualTimelineResult] = await Promise.all([
      query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE qi.active = true
            )::int AS active_owned,
            COUNT(*) FILTER (
              WHERE qi.closed_at >= $1::date
                AND qi.closed_at < $2::date + INTERVAL '1 day'
            )::int AS closed_total,
            COUNT(*) FILTER (
              WHERE qi.closed_at >= $1::date
                AND qi.closed_at < $2::date + INTERVAL '1 day'
                AND (
                  LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%smart hand%'
                  OR LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%smarthand%'
                )
            )::int AS sh,
            COUNT(*) FILTER (
              WHERE qi.closed_at >= $1::date
                AND qi.closed_at < $2::date + INTERVAL '1 day'
                AND LOWER(COALESCE(qi.queue_type, '')) LIKE '%trouble%'
            )::int AS tt,
            COUNT(*) FILTER (
              WHERE qi.closed_at >= $1::date
                AND qi.closed_at < $2::date + INTERVAL '1 day'
                AND LOWER(COALESCE(qi.queue_type, '') || ' ' || COALESCE(qi.subtype, '')) LIKE '%cross%connect%'
            )::int AS cc,
            COUNT(DISTINCT qi.id) FILTER (
              WHERE qi.last_seen_at >= $1::date
                AND qi.first_seen_at < $2::date + INTERVAL '1 day'
                AND NOT EXISTS (
                  SELECT 1
                  FROM assignment_ticket_decisions atd
                  WHERE ${assignedDecisionMatch}
                    AND atd.result = 'assigned'
                )
            )::int AS manual_takeovers
          FROM queue_items qi
          WHERE qi.owner = $3
        `,
        [from, to, worker]
      ),
      query(
        `
          SELECT
            DATE(qi.closed_at AT TIME ZONE '${TZ}') AS day,
            COUNT(*)::int AS count
          FROM queue_items qi
          WHERE qi.owner = $3
            AND qi.closed_at >= $1::date
            AND qi.closed_at < $2::date + INTERVAL '1 day'
          GROUP BY day
          ORDER BY day ASC
        `,
        [from, to, worker]
      ),
      query(
        `
          SELECT
            DATE(qi.last_seen_at AT TIME ZONE '${TZ}') AS day,
            COUNT(DISTINCT qi.id)::int AS count
          FROM queue_items qi
          WHERE qi.owner = $3
            AND qi.last_seen_at >= $1::date
            AND qi.first_seen_at < $2::date + INTERVAL '1 day'
            AND NOT EXISTS (
              SELECT 1
              FROM assignment_ticket_decisions atd
              WHERE ${assignedDecisionMatch}
                AND atd.result = 'assigned'
            )
          GROUP BY day
          ORDER BY day ASC
        `,
        [from, to, worker]
      ),
    ]);

    const summary = summaryResult.rows[0] || {};

    res.json({
      from,
      to,
      worker,
      summary: {
        activeOwned: toInt(summary.active_owned),
        closedTotal: toInt(summary.closed_total),
        sh: toInt(summary.sh),
        tt: toInt(summary.tt),
        cc: toInt(summary.cc),
        manualTakeovers: toInt(summary.manual_takeovers),
      },
      closedByDay: closedTimelineResult.rows.map((row) => ({
        day: row.day,
        count: toInt(row.count),
      })),
      manualByDay: manualTimelineResult.rows.map((row) => ({
        day: row.day,
        count: toInt(row.count),
      })),
    });
  } catch (err) {
    console.error("AUDIT EMPLOYEE DRILLDOWN ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/local-admin-employee-analytics", requireLocalAdminOnly, async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);

    const [workersResult, timelineResult] = await Promise.all([
      query(`
        SELECT
          qi.owner AS worker,
          COUNT(DISTINCT qi.id) AS total,
          COUNT(DISTINCT qi.id) FILTER (
            WHERE LOWER(COALESCE(qi.queue_type,'')) LIKE '%smart hand%'
               OR LOWER(COALESCE(qi.queue_type,'') || ' ' || COALESCE(qi.subtype,'')) LIKE '%smarthand%'
          ) AS sh,
          COUNT(DISTINCT qi.id) FILTER (
            WHERE LOWER(COALESCE(qi.queue_type,'')) LIKE '%trouble%'
          ) AS tt,
          COUNT(DISTINCT qi.id) FILTER (
            WHERE LOWER(COALESCE(qi.queue_type,'') || ' ' || COALESCE(qi.subtype,'')) LIKE '%cross%connect%'
          ) AS cc,
          COUNT(DISTINCT qi.id) FILTER (
            WHERE qi.closed_at IS NOT NULL
          ) AS closed
        FROM queue_items qi
        WHERE qi.owner IS NOT NULL AND qi.owner != ''
          AND qi.last_seen_at >= $1::date
          AND qi.first_seen_at < $2::date + INTERVAL '1 day'
        GROUP BY qi.owner
        ORDER BY total DESC, qi.owner ASC
      `, [from, to]),
      query(`
        SELECT
          DATE(COALESCE(qi.closed_at, qi.last_seen_at, qi.dispatch_date, qi.first_seen_at) AT TIME ZONE '${TZ}') AS day,
          qi.owner AS worker,
          COUNT(DISTINCT qi.id) AS count
        FROM queue_items qi
        WHERE qi.owner IS NOT NULL AND qi.owner != ''
          AND COALESCE(qi.closed_at, qi.last_seen_at, qi.dispatch_date, qi.first_seen_at) >= $1::date
          AND COALESCE(qi.closed_at, qi.last_seen_at, qi.dispatch_date, qi.first_seen_at) < $2::date + INTERVAL '1 day'
        GROUP BY day, qi.owner
        ORDER BY day ASC, count DESC, qi.owner ASC
      `, [from, to]),
    ]);

    res.json({
      from,
      to,
      workers: workersResult.rows.map((row) => ({
        worker: row.worker,
        total: parseInt(row.total, 10),
        sh: parseInt(row.sh, 10),
        tt: parseInt(row.tt, 10),
        cc: parseInt(row.cc, 10),
        closed: parseInt(row.closed, 10),
      })),
      timeline: timelineResult.rows.map((row) => ({
        day: row.day,
        worker: row.worker,
        count: parseInt(row.count, 10),
      })),
    });
  } catch (err) {
    console.error("AUDIT LOCAL ADMIN ANALYTICS ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
