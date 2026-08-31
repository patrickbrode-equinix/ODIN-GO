/* ------------------------------------------------ */
/* TV PUBLIC ROUTES – /api/tv/*                     */
/* NO AUTH REQUIRED – read-only, kiosk-safe         */
/* ------------------------------------------------ */
/*
 * Security posture:
 *  - All endpoints are GET / read-only.
 *  - No sensitive user/personnel data is exposed.
 *  - Mutating endpoints (POST/PUT/DELETE) are NOT present here.
 *  - The full app remains protected; only /api/tv/* is public.
 *  - Optional: set TV_KEY env var to require X-TV-KEY header
 *    (recommended for corp-network deployments where the TV URL
 *     should not be accessible by anyone without the key).
 */

import express from "express";
import { query } from "../db.js";
import {
  buildEmptyCriticalWorkloadSnapshot,
  getCriticalWorkloadSnapshot,
} from "../assignment/services/criticalWorkload.js";
import { getVerificationStatusMap } from "../services/shiftVerification.js";
import { resolveTvNightScheduleDate } from "../lib/tvSchedule.js";

function normalizeTvEmployeeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[,._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const router = express.Router();

/* ------------------------------------------------ */
/* OPTIONAL: TV_KEY secret header guard             */
/* If TV_KEY env var is set, all /api/tv/* requests */
/* must include header:  X-TV-KEY: <value>          */
/* ------------------------------------------------ */
const TV_KEY = process.env.TV_KEY || null;

function tvKeyGuard(req, res, next) {
  if (!TV_KEY) return next(); // no key configured → open
  const provided = req.headers["x-tv-key"] || req.query["tv_key"];
  if (provided === TV_KEY) return next();
  return res.status(403).json({ error: "TV_KEY required" });
}

router.use(tvKeyGuard);

/* ------------------------------------------------ */
/* GET /api/tv/health                               */
/* ------------------------------------------------ */
router.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

/* ------------------------------------------------ */
/* GET /api/tv/tickets                              */
/* Mirrors /api/queue/tickets – read-only           */
/* ------------------------------------------------ */
router.get("/tickets", async (req, res) => {
  try {
    const { queueType, limit } = req.query;

    let sql = `SELECT * FROM queue_items WHERE active = TRUE`;
    const params = [];

    if (queueType) {
      params.push(queueType);
      sql += ` AND queue_type = $${params.length}`;
    }

    sql += ` ORDER BY group_key ASC, id ASC`;

    if (limit) {
      const lim = parseInt(limit, 10);
      if (!isNaN(lim) && lim > 0 && lim <= 500) {
        params.push(lim);
        sql += ` LIMIT $${params.length}`;
      }
    }

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("[TV] /tickets error:", err.message);
    res.json([]); // never 500 for TV – return empty array
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/info-entries                         */
/* Mirrors /api/dashboard/info-entries – read-only  */
/* ------------------------------------------------ */
router.get("/info-entries", async (_req, res) => {
  try {
    const result = await query(
      `SELECT * FROM dashboard_info_entries
       WHERE delete_at IS NULL OR delete_at > NOW()
       ORDER BY created_at DESC`
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error("[TV] /info-entries error:", err.message);
    res.json({ data: [] }); // never 500 for TV
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/projects                             */
/* Mirrors /api/projects – read-only, no auth       */
/* ------------------------------------------------ */
router.get("/projects", async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, name, responsible, expected_done, progress, description, status, creator, created_at
       FROM projects
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[TV] /projects error:", err.message);
    res.json([]); // never 500 for TV
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/schedules/today                      */
/* Returns today's shift assignments (early/late/   */
/* night) directly from DB – no auth, self-         */
/* hydrating for TV screen on fresh browser.        */
/* ------------------------------------------------ */
const GERMAN_MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Shift categories known to TV (matches frontend shiftTypes). */
const TV_SHIFT_TYPES = {
  E1: { label: "E1", color: "bg-orange-500", name: "Frühschicht",  time: "06:30-15:30" },
  E2: { label: "E2", color: "bg-orange-600", name: "Frühschicht",  time: "07:00-16:00" },
  L1: { label: "L1", color: "bg-yellow-500", name: "Spätschicht",  time: "13:00-22:00" },
  L2: { label: "L2", color: "bg-yellow-600", name: "Spätschicht",  time: "15:00-00:00" },
  N:  { label: "N",  color: "bg-blue-600",   name: "Nachtschicht", time: "21:15-06:45" },
  DBS:    { label: "DBS",    color: "bg-fuchsia-600", name: "DBS",       time: "—" },
  FS:     { label: "FS",     color: "bg-cyan-500",    name: "Freischicht", time: "—" },
  ABW:    { label: "ABW",    color: "bg-gray-500",    name: "Abwesend",   time: "—" },
  SEMINAR:{ label: "S",      color: "bg-purple-600",  name: "Seminar",    time: "08:00-16:00" },
};

function currentLocalDateKey(base = new Date()) {
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

router.get("/schedules/today", async (_req, res) => {
  try {
    const today = new Date();
    const day   = today.getDate();
    const monthLabel = `${GERMAN_MONTHS[today.getMonth()]} ${today.getFullYear()}`;
    const todayKey = currentLocalDateKey(today);
    const nightScheduleDate = resolveTvNightScheduleDate(today);
    const nightDay = nightScheduleDate.getDate();
    const nightMonthLabel = `${GERMAN_MONTHS[nightScheduleDate.getMonth()]} ${nightScheduleDate.getFullYear()}`;
    const nightDateKey = currentLocalDateKey(nightScheduleDate);

    const result = await query(
      `SELECT employee_name, shift_code
       FROM shifts
       WHERE month = $1 AND day = $2
       ORDER BY employee_name ASC`,
      [monthLabel, day]
    );
    let scheduleRows = result.rows || [];
    if (nightDateKey !== todayKey) {
      const previousNightResult = await query(
        `SELECT employee_name, shift_code
         FROM shifts
         WHERE month = $1 AND day = $2 AND shift_code = 'N'
         ORDER BY employee_name ASC`,
        [nightMonthLabel, nightDay]
      );
      scheduleRows = [
        ...scheduleRows.filter((row) => row.shift_code !== "N"),
        ...(previousNightResult.rows || []),
      ];
    }

    const early = [];
    const late  = [];
    const night = [];

    // Load verification status map (non-blocking)
    let verifyMap = new Map();
    let nightVerifyMap = new Map();
    try { verifyMap = await getVerificationStatusMap(today); } catch { /* non-fatal for TV */ }
    if (nightDateKey !== todayKey) {
      try { nightVerifyMap = await getVerificationStatusMap(nightScheduleDate); } catch { /* non-fatal for TV */ }
    } else {
      nightVerifyMap = verifyMap;
    }

    // Load weekplan roles for today (non-blocking) so TV can mirror dashboard role badges.
    let roleMap = new Map();
    let userMetaMap = new Map();
    try {
      const roleResult = await query(
        `SELECT employee_name, role_key, comment, date::text AS date_key
         FROM weekplan_roles
         WHERE date = ANY($1::date[])`,
        [[...new Set([todayKey, nightDateKey])]]
      );

      roleMap = new Map(
        (roleResult.rows || [])
          .filter((row) => row?.employee_name && row?.role_key)
          .flatMap((row) => {
            const rawName = String(row.employee_name).trim();
            const normalizedName = rawName.replace(",", "").trim();
            const value = row.comment ? `${row.role_key}|${row.comment}` : row.role_key;
            const dateKey = String(row.date_key || todayKey);
            return [
              [`${dateKey}|${rawName}`, value],
              [`${dateKey}|${normalizedName}`, value],
            ];
          })
      );
    } catch {
      roleMap = new Map();
    }

    try {
      const userResult = await query(
        `SELECT first_name, last_name, email, jarvis_display_name, jarvis_owner_code, jarvis_initials
         FROM users
         WHERE approved = TRUE
           AND is_root = FALSE`
      );

      userMetaMap = new Map(
        (userResult.rows || []).flatMap((row) => {
          const displayName = `${row.first_name || ""} ${row.last_name || ""}`.replace(/\s+/g, " ").trim();
          const reverseDisplayName = `${row.last_name || ""} ${row.first_name || ""}`.replace(/\s+/g, " ").trim();
          const keys = [displayName, reverseDisplayName, row.jarvis_display_name, row.email]
            .map((value) => normalizeTvEmployeeKey(value))
            .filter(Boolean);

          return keys.map((key) => [key, {
            jarvisDisplayName: row.jarvis_display_name || null,
            jarvisOwnerCode: row.jarvis_owner_code || null,
            jarvisInitials: row.jarvis_initials || null,
          }]);
        })
      );
    } catch {
      userMetaMap = new Map();
    }

    for (const row of scheduleRows) {
      const code = row.shift_code;
      const info = TV_SHIFT_TYPES[code];
      if (!info) continue; // skip unknown / FS / ABW for shift panels

      // "Nachname, Vorname" → "Nachname Vorname"
      const name = String(row.employee_name ?? "").replace(",", "").trim();
      const rowDateKey = code === "N" ? nightDateKey : todayKey;
      const rowVerifyMap = code === "N" ? nightVerifyMap : verifyMap;
      const vStatus = rowVerifyMap.get(row.employee_name)?.status || rowVerifyMap.get(name)?.status || null;
      const weekplanRole = roleMap.get(`${rowDateKey}|${String(row.employee_name ?? "").trim()}`) || roleMap.get(`${rowDateKey}|${name}`) || null;
      const userMeta = userMetaMap.get(normalizeTvEmployeeKey(name)) || null;
      const entry = {
        name,
        shift: code,
        time: info.time,
        info,
        verificationStatus: vStatus,
        weekplanRole,
        jarvisDisplayName: userMeta?.jarvisDisplayName || null,
        jarvisOwnerCode: userMeta?.jarvisOwnerCode || null,
        jarvisInitials: userMeta?.jarvisInitials || null,
      };

      if (code === "E1" || code === "E2") early.push(entry);
      else if (code === "L1" || code === "L2") late.push(entry);
      else if (code === "N") night.push(entry);
    }

    res.json({
      early,
      late,
      night,
      dataFresh: true,
      monthLabel,
      day,
    });
  } catch (err) {
    console.error("[TV] /schedules/today error:", err.message);
    // Return safe default – never 500 for TV
    res.json({ early: [], late: [], night: [], dataFresh: false });
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/events/images                        */
/* Public read-only events images for TV kiosk.    */
/* ------------------------------------------------ */
router.get("/events/images", async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, filename, original_name, url_path, created_at
       FROM events_images
       WHERE is_visible = TRUE
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[TV] /events/images error:", err.message);
    res.json([]); // never 500 for TV
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/handover                             */
/* Public read-only handover list for TV kiosk.    */
/* Only non-completed items are returned.           */
/* ------------------------------------------------ */
router.get("/handover", async (_req, res) => {
  try {
    function _pad(n) { return String(n).padStart(2, "0"); }
    function _buildCommitAt(commitDate, commitTime) {
      if (!commitDate || !commitTime) return null;
      try {
        const d = new Date(commitDate);
        const yyyy = d.getFullYear();
        const mm = _pad(d.getMonth() + 1);
        const dd = _pad(d.getDate());
        let hh = "00", min = "00";
        if (typeof commitTime === "string") [hh, min] = commitTime.split(":");
        return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
      } catch { return null; }
    }

    const result = await query(`
      SELECT
        id,
        ticketnumber  AS "ticketNumber",
        customername  AS "customerName",
        priority,
        type,
        ticket_type   AS "ticketType",
        activity,
        system_name   AS "systemName",
        remaining_time AS "remainingTime",
        start_datetime AS "startDatetime",
        target_team   AS "targetTeam",
        assignee_name AS "assigneeName",
        due_datetime  AS "dueDatetime",
        recurrence,
        area,
        description,
        commitdate,
        committime,
        status,
        createdby     AS "createdBy",
        created_at    AS "createdAt",
        takenby       AS "takenBy"
      FROM handover
      WHERE status != 'Erledigt'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const rows = result.rows.map((h) => ({
      id: h.id,
      ticketNumber:  h.ticketNumber  || "",
      customerName:  h.customerName  || "",
      priority:      h.priority      || "Low",
      type:          h.type          || "Workload",
      ticketType:    h.ticketType    || "",
      activity:      h.activity      || "",
      systemName:    h.systemName    || "",
      remainingTime: h.remainingTime || "",
      startDatetime: h.startDatetime || null,
      targetTeam:    h.targetTeam    || "",
      assigneeName:  h.assigneeName  || "",
      dueDatetime:   h.dueDatetime   || null,
      recurrence:    h.recurrence    || "",
      area:          h.area          || "",
      description:   h.description   || "",
      commitAt:      _buildCommitAt(h.commitdate, h.committime),
      status:        h.status        || "Offen",
      createdBy:     h.createdBy     || "",
      createdAt:     h.createdAt,
      takenBy:       h.takenBy       || null,
      files:         [],
    }));

    res.json(rows);
  } catch (err) {
    console.error("[TV] /handover error:", err.message);
    res.json([]); // never 500 for TV
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/crawler-meta                         */
/* Public read-only crawler status for TV staleness */
/* check — mirrors /api/commit/meta.               */
/* ------------------------------------------------ */
router.get("/crawler-meta", async (_req, res) => {
  try {
    const runRes = await query(`
      SELECT snapshot_at
      FROM crawler_runs
      WHERE success = true
      ORDER BY snapshot_at DESC
      LIMIT 1
    `);
    const lastUpdate = runRes.rows[0]?.snapshot_at || null;

    const countRes = await query(`
      SELECT COUNT(*) as cnt FROM queue_items WHERE active = true
    `);
    const count = parseInt(countRes.rows[0]?.cnt, 10) || 0;

    res.json({ lastUpdate, count });
  } catch (err) {
    console.error("[TV] /crawler-meta error:", err.message);
    res.json({ lastUpdate: null, count: 0 });
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/critical-workload                    */
/* Shared critical workload snapshot for the kiosk  */
/* command center. Returns a safe empty snapshot on */
/* failure so TV rotation never crashes.            */
/* ------------------------------------------------ */
router.get("/critical-workload", async (_req, res) => {
  try {
    const snapshot = await getCriticalWorkloadSnapshot({ queryFn: query });
    res.json(snapshot);
  } catch (err) {
    console.error("[TV] /critical-workload error:", err.message);
    res.json(buildEmptyCriticalWorkloadSnapshot());
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/shiftplan-last-upload                */
/* Public read-only last shiftplan upload timestamp */
/* ------------------------------------------------ */
router.get("/shiftplan-last-upload", async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT uploaded_at, uploaded_by FROM shiftplan_upload_log ORDER BY uploaded_at DESC LIMIT 1`
    );
    res.json(rows[0] || null);
  } catch (err) {
    // Table might not exist yet
    res.json(null);
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/assignment-trace                     */
/* Returns the latest ASSIGNED decision in a TV-    */
/* friendly format for the Assignment Hero Slide.   */
/* ------------------------------------------------ */

/**
 * Map a raw DB priority tier label to a human-friendly German label.
 */
function mapPriorityLabel(type, priority) {
  const t = (type || '').toLowerCase();
  const p = (priority || '').toLowerCase();
  if (t.includes('trouble') && (p === 'high' || p === 'critical')) return 'TT High';
  if (t.includes('trouble') && p === 'medium') return 'TT Medium';
  if (t.includes('trouble') && p === 'low') return 'TT Low';
  if (t.includes('smart') || t === 'smarthands') return 'SmartHands';
  if (t.includes('cross') || t === 'crossconnect') return 'CrossConnect';
  if (t === 'scheduled') return 'Scheduled';
  return type || 'Ticket';
}

/**
 * Map a ticket type to short code for badge display.
 */
function mapTicketTypeCode(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('trouble')) return 'TT';
  if (t.includes('smart') || t === 'smarthands') return 'SH';
  if (t.includes('cross') || t === 'crossconnect') return 'CC';
  if (t === 'scheduled') return 'SCHED';
  return 'OTHER';
}

function formatModeLabel(mode) {
  if (mode === 'live') return 'Live';
  if (mode === 'shadow') return 'Shadow';
  if (mode === 'dry-run') return 'Dry-Run';
  return String(mode || 'Unbekannt');
}

/**
 * Build TV-friendly decision steps from the rule_path array.
 */
function buildDecisionSteps(rulePath) {
  const stepsDef = [
    { key: 'ticket-recognized',    label: 'Ticket erkannt',                icon: 'scan' },
    { key: 'ticket-classified',    label: 'Ticket klassifiziert',          icon: 'tag' },
    { key: 'priority-determined',  label: 'Priorität bestimmt',            icon: 'signal' },
    { key: 'candidates-loaded',    label: 'Verfügbare Mitarbeiter geladen', icon: 'users' },
    { key: 'role-rules-applied',   label: 'Rollenregeln angewendet',       icon: 'shield' },
    { key: 'cluster-checked',      label: 'System-Cluster geprüft',        icon: 'server' },
    { key: 'workload-compared',    label: 'Arbeitslast verglichen',        icon: 'scale' },
    { key: 'candidate-selected',   label: 'Finalen Kandidaten gewählt',    icon: 'check' },
  ];

  const path = (rulePath || []).map(r => r.toLowerCase());

  return stepsDef.map(step => {
    let status = 'pending';
    let reason = '';

    switch (step.key) {
      case 'ticket-recognized':
        status = 'done';
        reason = 'Ticket-Daten validiert';
        break;
      case 'ticket-classified':
        status = path.includes('relevance') ? 'done' : 'pending';
        reason = path.includes('relevance') ? 'Relevanz bestätigt' : '';
        break;
      case 'priority-determined':
        status = path.includes('relevance') ? 'done' : 'pending';
        reason = 'Priorisierung abgeschlossen';
        break;
      case 'candidates-loaded':
        status = path.includes('eligibility') ? 'done' : 'pending';
        reason = 'Kandidatenpool geladen';
        break;
      case 'role-rules-applied':
        if (path.some(p => p.includes('role') || p.includes('eligible') || p === 'eligibility')) {
          status = 'done';
          reason = 'Alle Rollenregeln geprüft';
        }
        break;
      case 'cluster-checked':
        if (path.some(p => p.includes('system-grouping') || p.includes('tie-breaker:system'))) {
          status = 'done';
          reason = 'System-Cluster-Prüfung abgeschlossen';
        } else if (path.includes('worker-selection')) {
          status = 'done';
          reason = 'Kein Cluster-Vorteil ermittelt';
        }
        break;
      case 'workload-compared':
        status = path.includes('worker-selection') ? 'done' : 'pending';
        reason = path.includes('worker-selection') ? 'Auslastung bewertet' : '';
        break;
      case 'candidate-selected':
        status = path.includes('worker-selection') ? 'done' : 'pending';
        reason = path.includes('worker-selection') ? 'Entscheidung getroffen' : '';
        break;
    }

    return { key: step.key, label: step.label, icon: step.icon, status, reason };
  });
}

/**
 * Build a candidate state label (German, neutral).
 */
function buildCandidateState(excl) {
  if (!excl || !excl.rule) return { state: 'eligible', reason: 'Verfügbar und regelkonform' };

  const rule = (excl.rule || '').toLowerCase();
  const reason = excl.reason || '';

  if (rule.includes('role') || rule.includes('rolefilter')) {
    if (reason.toLowerCase().includes('dispatcher')) return { state: 'excluded', reason: 'Durch Dispatcher-Regel ausgeschlossen' };
    if (reason.toLowerCase().includes('large')) return { state: 'excluded', reason: 'Large Order aktiv' };
    if (reason.toLowerCase().includes('project') || reason.toLowerCase().includes('projekt')) return { state: 'excluded', reason: 'Projekt-Regel greift' };
    if (reason.toLowerCase().includes('lead')) return { state: 'excluded', reason: 'Durch Leads-Regel ausgeschlossen' };
    if (reason.toLowerCase().includes('cross')) return { state: 'excluded', reason: 'Cross-Connect-only Regel greift' };
    if (reason.toLowerCase().includes('dbs') || reason.toLowerCase().includes('börse') || reason.toLowerCase().includes('deutsche')) return { state: 'excluded', reason: 'DBS Project Regel greift' };
    return { state: 'excluded', reason: 'Durch Rollenregel ausgeschlossen' };
  }
  if (rule.includes('queuepurity') || rule.includes('queue')) return { state: 'excluded', reason: 'Queue-Reinheit nicht erfüllt' };
  if (rule.includes('absent')) return { state: 'excluded', reason: 'Aktuell nicht verfügbar (abwesend)' };
  if (rule.includes('break')) return { state: 'excluded', reason: 'Aktuell in Pause' };
  if (rule.includes('shift')) return { state: 'excluded', reason: 'Nicht in aktiver Schicht' };
  if (rule.includes('site')) return { state: 'excluded', reason: 'Standort stimmt nicht überein' };
  if (rule.includes('blocked')) return { state: 'excluded', reason: 'Aktuell nicht verfügbar' };
  if (rule.includes('auto')) return { state: 'excluded', reason: 'Nicht für Auto-Zuweisung freigegeben' };

  return { state: 'excluded', reason: reason || 'Durch Regel ausgeschlossen' };
}

/**
 * Build final assignment reasons (German, neutral, rule-based).
 */
function buildFinalReasons(selectionReason, tieBreaker) {
  const reasons = ['Verfügbar und regelkonform'];
  const sel = (selectionReason || '').toLowerCase();

  if (sel.includes('system grouping')) reasons.push('System-Cluster-Vorteil');
  if (sel.includes('queue purity')) reasons.push('Queue-Reinheit gewahrt');
  if (sel.includes('workload')) {
    const match = sel.match(/workload:\s*(\d+)/);
    if (match) reasons.push(`Aktuelle Auslastung: ${match[1]} Tickets`);
    else reasons.push('Passende Auslastung');
  }
  if (sel.includes('only one')) reasons.push('Einziger regelkonformer Kandidat');

  reasons.push('Bester Fit laut aktueller ODIN-Logik');
  return reasons;
}

function groupCandidateReasons(excludedCandidates = []) {
  const grouped = new Map();

  for (const entry of excludedCandidates || []) {
    const key = `${entry.id}:${entry.name || ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        employeeId: entry.id,
        employeeName: entry.name,
        shiftLabel: entry.shiftCode || null,
        roles: [entry.weekplanRole || entry.role].filter(Boolean),
        reasons: [],
        rules: [],
      });
    }

    const current = grouped.get(key);
    if (entry.reason && !current.reasons.includes(entry.reason)) current.reasons.push(entry.reason);
    if (entry.rule && !current.rules.includes(entry.rule)) current.rules.push(entry.rule);
    const roleLabel = entry.weekplanRole || entry.role;
    if (roleLabel && !current.roles.includes(roleLabel)) current.roles.push(roleLabel);
  }

  return Array.from(grouped.values());
}

router.get("/assignment-trace", async (_req, res) => {
  try {
    const { rows: automationRows } = await query(
      `SELECT key, value FROM assignment_settings WHERE key IN ('assignment.enabled', 'assignment.mode')`
    );
    const automationMap = Object.fromEntries(automationRows.map((row) => [row.key, row.value]));
    const automationEnabled = automationMap['assignment.enabled'] === 'true';
    const activeMode = automationMap['assignment.mode'] || null;

    if (!automationEnabled) {
      return res.json({ available: false, trace: null });
    }

    // Get the most recent assigned decision that is still backed by an active queue ticket.
    const decisionRes = await query(`
      SELECT d.*,
             r.started_at AS run_started_at,
             r.mode AS run_mode,
             r.status AS run_status,
             q.id AS live_queue_id
      FROM assignment_ticket_decisions d
      JOIN assignment_runs r ON r.id = d.run_id
      LEFT JOIN queue_items q
        ON q.active = TRUE
       AND (
         q.external_id = d.external_id
         OR q.external_id = d.ticket_id
         OR q.id::text = d.ticket_id
       )
      WHERE d.result = 'assigned'
        AND r.status = 'completed'
        AND ($1::text IS NULL OR r.mode = $1)
      ORDER BY d.decided_at DESC
      LIMIT 25
    `, [activeMode]);

    const liveDecision = decisionRes.rows.find((row) => row.live_queue_id != null) || null;

    if (!liveDecision) {
      return res.json({ available: false, trace: null });
    }

    const d = liveDecision;

    // Parse JSONB fields
    const normalizedTicket = typeof d.normalized_ticket === 'string' ? JSON.parse(d.normalized_ticket) : (d.normalized_ticket || {});
    const rulePath = typeof d.rule_path === 'string' ? JSON.parse(d.rule_path) : (d.rule_path || []);
    const initialCandidates = typeof d.initial_candidates === 'string' ? JSON.parse(d.initial_candidates) : (d.initial_candidates || []);
    const excludedCandidates = typeof d.excluded_candidates === 'string' ? JSON.parse(d.excluded_candidates) : (d.excluded_candidates || []);
    const remainingCandidates = typeof d.remaining_candidates === 'string' ? JSON.parse(d.remaining_candidates) : (d.remaining_candidates || []);

    // Build the ticket info
    const ticketType = d.ticket_type || normalizedTicket.type || '';
    const ticketPriority = d.ticket_priority || normalizedTicket.priority || '';
    const typeCode = mapTicketTypeCode(ticketType);
    const priorityLabel = mapPriorityLabel(ticketType, ticketPriority);

    // Compute remaining time from dueAt
    let restTimeLabel = null;
    if (normalizedTicket.dueAt) {
      const dueMs = new Date(normalizedTicket.dueAt).getTime();
      const nowMs = Date.now();
      const diffMs = dueMs - nowMs;
      if (diffMs > 0) {
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        restTimeLabel = `${h}h ${m}min`;
      } else {
        restTimeLabel = 'Überfällig';
      }
    }

    // Build ticket object
    const ticket = {
      id: d.ticket_id || normalizedTicket.id,
      externalId: d.external_id || normalizedTicket.externalId,
      typeCode,
      type: ticketType,
      activity: normalizedTicket.activity || normalizedTicket.subtype || d.external_id || '',
      systemName: normalizedTicket.systemName || '',
      restTime: restTimeLabel,
      schedStart: normalizedTicket.scheduledStart || null,
      revisedCommitDate: normalizedTicket.dueAt || null,
      priorityLabel,
      priority: ticketPriority,
      status: d.ticket_status || normalizedTicket.status || '',
      mode: d.run_mode || activeMode || null,
    };

    // Build classification
    const classification = {
      ticketType: typeCode,
      priorityClass: ticketPriority,
      scheduled: ticketType === 'Scheduled',
      expedite: ticketPriority === 'critical' || ticketPriority === 'high',
      clusterCandidate: (d.selection_reason || '').toLowerCase().includes('system grouping'),
    };

    // Build decision steps from rule path
    const decisionSteps = buildDecisionSteps(rulePath);

    // Build candidate pool
    const excludedMap = new Map();
    const groupedExcludedCandidates = groupCandidateReasons(excludedCandidates);
    for (const excl of groupedExcludedCandidates) {
      excludedMap.set(excl.employeeId, excl);
    }
    const remainingSet = new Set(remainingCandidates.map(c => c.id));

    // Try to get current workload per worker
    let workerWorkloads = new Map();
    try {
      const workloadRes = await query(`
        SELECT assigned_worker_id, COUNT(*) AS cnt
        FROM assignment_ticket_decisions
        WHERE run_id = $1 AND result = 'assigned' AND assigned_worker_id IS NOT NULL
        GROUP BY assigned_worker_id
      `, [d.run_id]);
      for (const row of workloadRes.rows) {
        workerWorkloads.set(row.assigned_worker_id, parseInt(row.cnt) || 0);
      }
    } catch (_) { /* best effort */ }

    // Try to get shift info for workers
    let workerShifts = new Map();
    try {
      const today = new Date();
      const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
      const monthLabel = `${MONTHS_DE[today.getMonth()]} ${today.getFullYear()}`;
      const day = today.getDate();
      const shiftRes = await query(`SELECT employee_name, shift_code FROM shifts WHERE month = $1 AND day = $2`, [monthLabel, day]);
      for (const row of shiftRes.rows) {
        workerShifts.set(row.employee_name.replace(",", "").trim().toLowerCase(), row.shift_code);
      }
    } catch (_) { /* best effort */ }

    const candidatePool = initialCandidates.map(c => {
      const excl = excludedMap.get(c.id);
      const isRemaining = remainingSet.has(c.id);
      const isSelected = c.id === d.assigned_worker_id;
      const stateInfo = excl
        ? buildCandidateState({ rule: excl.rules[0], reason: excl.reasons[0] })
        : { state: isRemaining ? 'eligible' : 'checked', reason: isRemaining ? 'Verfügbar und regelkonform' : 'Geprüft' };
      const nameLower = (c.name || '').toLowerCase();
      const shiftCode = workerShifts.get(nameLower) || null;

      return {
        employeeId: c.id,
        employeeName: c.name,
        shiftLabel: shiftCode || null,
        roles: excl?.roles || [c.weekplanRole || c.role].filter(Boolean),
        currentLoad: workerWorkloads.get(c.id) || 0,
        state: isSelected ? 'selected' : stateInfo.state,
        reason: isSelected ? 'Ausgewählt durch ODIN-Logik' : (excl?.reasons?.join(' | ') || stateInfo.reason),
      };
    });

    // Build selected candidate
    const selectedCandidate = {
      employeeId: d.assigned_worker_id,
      employeeName: d.assigned_worker_name,
      shiftLabel: workerShifts.get((d.assigned_worker_name || '').toLowerCase()) || null,
      roles: [],
      currentLoad: workerWorkloads.get(d.assigned_worker_id) || 0,
    };

    // Build final reasons
    const finalReasons = buildFinalReasons(d.selection_reason, null);

    // Build strategy info from selection_reason and rule_path
    const selReason = (d.selection_reason || '').toLowerCase();
    const tieBreakerFromPath = (rulePath || []).find(p => typeof p === 'string' && p.startsWith('tie-breaker:'));
    const tieBreaker = tieBreakerFromPath ? tieBreakerFromPath.replace('tie-breaker:', '') : null;
    const strategySteps = [];
    if (selReason.includes('system grouping')) strategySteps.push({ key: 'system-grouping', label: 'System-Cluster', active: true });
    else strategySteps.push({ key: 'system-grouping', label: 'System-Cluster', active: false });
    if (selReason.includes('queue purity')) strategySteps.push({ key: 'queue-purity', label: 'Queue-Reinheit', active: true });
    else strategySteps.push({ key: 'queue-purity', label: 'Queue-Reinheit', active: false });
    strategySteps.push({ key: 'workload', label: 'Geringste Auslastung', active: true });
    if (selReason.includes('colleague preference')) strategySteps.push({ key: 'colleague-pref', label: 'Wunschkollege', active: true });
    else strategySteps.push({ key: 'colleague-pref', label: 'Wunschkollege', active: false });
    strategySteps.push({ key: 'worker-id', label: 'Deterministischer Fallback', active: tieBreaker === 'worker-id' || !tieBreaker });

    // Build candidate stats
    const eligibleCount = candidatePool.filter(c => c.state === 'eligible' || c.state === 'selected').length;
    const excludedCount = candidatePool.filter(c => c.state === 'excluded').length;
    const candidateStats = {
      total: initialCandidates.length,
      eligible: eligibleCount,
      excluded: excludedCount,
    };

    // Get ticket pool size (how many tickets were in this run)
    let ticketPoolSize = 0;
    try {
      const poolRes = await query(
        `SELECT COUNT(*) AS cnt FROM assignment_ticket_decisions WHERE run_id = $1`,
        [d.run_id]
      );
      ticketPoolSize = parseInt(poolRes.rows[0]?.cnt) || 0;
    } catch (_) { /* best effort */ }

    // Assemble trace
    const trace = {
      ticket,
      classification,
      decisionSteps,
      candidatePool,
      selectedCandidate,
      finalReasons,
      mode: d.run_mode || activeMode || null,
      modeLabel: formatModeLabel(d.run_mode || activeMode),
      decidedAt: d.decided_at,
      runId: d.run_id,
      strategy: {
        label: 'Deterministische Multi-Faktor-Selektion',
        tieBreaker: tieBreaker || 'worker-id',
        steps: strategySteps,
      },
      candidateStats,
      ticketPoolSize,
    };

    res.json({ available: true, trace });
  } catch (err) {
    console.error("[TV] /assignment-trace error:", err.message);
    res.json({ available: false, trace: null }); // never 500 for TV
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/teams-status                         */
/* Public read-only Teams notification status for   */
/* TV header display. No sensitive data exposed.    */
/* ------------------------------------------------ */
router.get("/teams-status", async (_req, res) => {
  try {
    const hasWebhook = !!(process.env.TEAMS_CHANNEL_WEBHOOK || process.env.TEAMS_PERSONAL_WEBHOOK);
    const hasBotKey = !!process.env.BOT_INTERNAL_API_KEY;
    const hasGraph = !!(
      (process.env.GRAPH_CLIENT_ID || process.env.CLIENT_ID || process.env.BOT_ID)
      && (process.env.GRAPH_CLIENT_SECRET || process.env.CLIENT_SECRET || process.env.CLIENT_PASSWORD)
      && (process.env.GRAPH_TENANT_ID || process.env.TENANT_ID || process.env.BOT_TENANT_ID)
      && (process.env.BOT_APP_ID || process.env.TEAMS_APP_ID)
    );
    const configured = hasWebhook || hasBotKey || hasGraph;

    let sentToday = 0;
    try {
      const { rows } = await query(
        `SELECT COUNT(*) as cnt FROM teams_message_log WHERE status = 'sent' AND sent_at >= CURRENT_DATE`
      );
      sentToday = parseInt(rows[0]?.cnt, 10) || 0;
    } catch { /* table may not exist */ }

    res.json({ configured, active: configured, sentToday });
  } catch (err) {
    console.error("[TV] /teams-status error:", err.message);
    res.json({ configured: false, active: false, sentToday: 0 });
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/automation-status                    */
/* Public read-only assignment engine status for    */
/* TV header display. No sensitive data exposed.    */
/* ------------------------------------------------ */
router.get("/automation-status", async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT key, value FROM assignment_settings WHERE key IN ('assignment.enabled', 'assignment.mode')`
    );
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const enabled = map['assignment.enabled'] === 'true';
    const mode = map['assignment.mode'] || 'shadow';
    res.json({ enabled, mode });
  } catch (err) {
    console.error("[TV] /automation-status error:", err.message);
    res.json({ enabled: false, mode: 'unknown' });
  }
});

/* ------------------------------------------------ */
/* GET /api/tv/polls                                */
/* Active (non-closed, non-expired) polls with      */
/* aggregated vote counts per option                */
/* ------------------------------------------------ */
router.get("/polls", async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        p.id, p.title, p.description, p.options, p.ends_at, p.closed,
        p.created_at, p.created_by,
        COALESCE(vc.vote_count, 0)::int AS vote_count
      FROM polls p
      LEFT JOIN (
        SELECT poll_id, COUNT(*) AS vote_count FROM poll_votes GROUP BY poll_id
      ) vc ON vc.poll_id = p.id
      WHERE p.closed = FALSE AND p.archived = FALSE
        AND (p.ends_at IS NULL OR p.ends_at > NOW())
      ORDER BY p.created_at DESC
      LIMIT 10
    `);

    // Aggregate votes per option for each poll
    const pollIds = rows.map(r => r.id);
    let voteMap = {};
    if (pollIds.length > 0) {
      const { rows: voteRows } = await query(`
        SELECT poll_id, option_index, COUNT(*)::int AS count
        FROM poll_votes
        WHERE poll_id = ANY($1)
        GROUP BY poll_id, option_index
        ORDER BY poll_id, option_index
      `, [pollIds]);
      for (const v of voteRows) {
        if (!voteMap[v.poll_id]) voteMap[v.poll_id] = [];
        voteMap[v.poll_id].push({ option_index: v.option_index, count: v.count });
      }
    }

    const enriched = rows.map(p => ({
      ...p,
      options: typeof p.options === "string" ? JSON.parse(p.options) : p.options,
      votes: voteMap[p.id] || [],
    }));

    res.json(enriched);
  } catch (err) {
    console.error("[TV] /polls error:", err.message);
    res.json([]);
  }
});

export default router;
