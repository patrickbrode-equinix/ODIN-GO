/* ================================================ */
/* Assignment Engine — Load Candidate Workers       */
/* ================================================ */

import pool from '../../db.js';
import { getVerificationStatusMap, getVerificationSettings } from '../../services/shiftVerification.js';
import { normalizeName } from '../../lib/nameNorm.js';
import { SUPPORTED_QUEUE_ITEM_TYPES } from '../constants.js';
import { buildWorkerOwnerKeys, normalizeOwnerKey } from '../lib/ownerIdentity.js';
import { ROLE_ALIASES } from '../config.js';

/**
 * Weekplan role ↔ engine role mapping.
 * The weekplan uses slightly different key names than the engine constants.
 */
const WEEKPLAN_TO_ENGINE_ROLE = {
  dispatcher: 'dispatcher',
  dbs_project: 'deutsche_boerse',
  dbs: 'deutsche_boerse',
  deutsche_boerse: 'deutsche_boerse',
  colo: 'normal',          // Kolo has no special assignment restriction (informational)
  normal: 'normal',
  largeorder: 'large_order',
  large_order: 'large_order',
  projekt: 'project',
  project: 'project',
  lead: 'leads',
  leads: 'leads',
  buddy: 'buddy',
  neueinsteiger: 'neustarter',
  neustarter: 'neustarter',
  cc: 'cross_connect',
  crossconnect: 'cross_connect',
  cross_connect: 'cross_connect',
  'cross connect': 'cross_connect',
  support: 'support',
};

const GERMAN_MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const NON_WORKING_SHIFT_CODES = new Set(['ABW', 'FS', 'SEMINAR', 'S']);

const SHIFT_WINDOWS = {
  E1: { startHour: 6, startMinute: 30, endHour: 15, endMinute: 30 },
  E2: { startHour: 7, startMinute: 0, endHour: 16, endMinute: 0 },
  L1: { startHour: 13, startMinute: 0, endHour: 22, endMinute: 0 },
  L2: { startHour: 15, startMinute: 0, endHour: 0, endMinute: 0 },
  N: { startHour: 21, startMinute: 15, endHour: 6, endMinute: 45 },
};

function resolveShiftWindowDefinition(shiftCode) {
  const code = String(shiftCode || '').trim().toUpperCase();
  if (!code) return null;
  if (SHIFT_WINDOWS[code]) return SHIFT_WINDOWS[code];

  const prefix = code.match(/^(E1|E2|L1|L2|N)(?:[^A-Z0-9].*|[A-Z0-9]+)?$/)?.[1];
  return prefix ? SHIFT_WINDOWS[prefix] : null;
}

const LATEST_OVERNIGHT_END_MINUTES = Object.values(SHIFT_WINDOWS).reduce((max, window) => {
  const start = window.startHour * 60 + window.startMinute;
  const end = window.endHour * 60 + window.endMinute;
  if (end <= start) {
    return Math.max(max, end);
  }
  return max;
}, -1);

export function resolveEffectiveWorkerRole(weekplanRole, assignmentRole) {
  if (weekplanRole) {
    const normalizedWeekplanRole = String(weekplanRole || '').trim().toLowerCase();
    return WEEKPLAN_TO_ENGINE_ROLE[normalizedWeekplanRole] || 'normal';
  }

  const normalizedAssignmentRole = String(assignmentRole || '').trim().toLowerCase();
  return ROLE_ALIASES[normalizedAssignmentRole]
    || ROLE_ALIASES[normalizedAssignmentRole.replace(/\s+/g, '_')]
    || 'normal';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toLocalDateString(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function parseLocalDateString(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function normalizePlanningDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) return toLocalDateString(value);

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) return null;
  return toLocalDateString(parsed);
}

function getTodayPlanningContext(now = new Date()) {
  return {
    today: toLocalDateString(now),
    day: now.getDate(),
    monthLabel: `${GERMAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`,
  };
}

export function getPlanningContextsForMoment(now = new Date(), { includeFuture = false, lookaheadHours = 0 } = {}) {
  const current = new Date(now);
  const contexts = [getTodayPlanningContext(current)];
  const minutesNow = current.getHours() * 60 + current.getMinutes();

  if (LATEST_OVERNIGHT_END_MINUTES >= 0 && minutesNow <= LATEST_OVERNIGHT_END_MINUTES) {
    const previous = new Date(now);
    previous.setDate(previous.getDate() - 1);
    contexts.push(getTodayPlanningContext(previous));
  }

  if (includeFuture && Number.isFinite(Number(lookaheadHours)) && Number(lookaheadHours) > 0) {
    const horizon = new Date(current.getTime() + Number(lookaheadHours) * 60 * 60 * 1000);
    const cursor = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    const horizonDate = new Date(horizon.getFullYear(), horizon.getMonth(), horizon.getDate());

    cursor.setDate(cursor.getDate() + 1);
    while (cursor.getTime() <= horizonDate.getTime()) {
      contexts.push(getTodayPlanningContext(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return contexts.filter((context, index) => contexts.findIndex((entry) => entry.today === context.today) === index);
}

function normalizeDisplayName(value) {
  if (!value) return '';
  return String(value).replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildUserDisplayName(row) {
  const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
  return normalizeDisplayName(fullName || row.email || '');
}

function buildLookup(rows, valueKey = 'employee_name') {
  const exact = new Map();
  const byOriginal = new Map();
  const originals = [];

  for (const row of rows) {
    const original = row[valueKey];
    const normalized = normalizeName(original);
    if (!normalized) continue;
    if (!exact.has(normalized)) {
      exact.set(normalized, row);
      byOriginal.set(original, row);
      originals.push(original);
    }
  }

  return { exact, byOriginal, originals };
}

function findLookupMatch(name, lookup) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  const exact = lookup.exact.get(normalized);
  if (exact) return exact;
  return null;
}

export function isWorkingShiftCode(shiftCode) {
  const code = String(shiftCode || '').trim().toUpperCase();
  if (!code) return false;
  return !NON_WORKING_SHIFT_CODES.has(code);
}

export function isShiftCodeActiveNow(shiftCode, now = new Date()) {
  const code = String(shiftCode || '').trim().toUpperCase();
  if (!code || !isWorkingShiftCode(code)) return false;

  const window = resolveShiftWindowDefinition(code);
  if (!window) return true;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const start = window.startHour * 60 + window.startMinute;
  const end = window.endHour * 60 + window.endMinute;

  if (end <= start) {
    return minutesNow >= start || minutesNow <= end;
  }

  return minutesNow >= start && minutesNow <= end;
}

export function getShiftWindowForPlanEntry(shiftCode, planningDate) {
  const code = String(shiftCode || '').trim().toUpperCase();
  const baseDate = parseLocalDateString(planningDate);

  if (!code || !baseDate || !isWorkingShiftCode(code)) {
    return {
      shiftCode: code || null,
      planningDate: normalizePlanningDateKey(planningDate),
      start: null,
      end: null,
      working: false,
    };
  }

  const window = resolveShiftWindowDefinition(code);
  const start = new Date(baseDate);
  const end = new Date(baseDate);

  if (!window) {
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    return {
      shiftCode: code,
      planningDate: toLocalDateString(baseDate),
      start,
      end,
      working: true,
    };
  }

  start.setHours(window.startHour, window.startMinute, 0, 0);
  end.setHours(window.endHour, window.endMinute, 0, 0);

  const startMinutes = window.startHour * 60 + window.startMinute;
  const endMinutes = window.endHour * 60 + window.endMinute;
  if (endMinutes <= startMinutes) {
    end.setDate(end.getDate() + 1);
  }

  return {
    shiftCode: code,
    planningDate: toLocalDateString(baseDate),
    start,
    end,
    working: true,
  };
}

export function isMomentInShiftWindow(moment, shiftWindow) {
  if (!shiftWindow?.start || !shiftWindow?.end) return false;

  const current = moment instanceof Date ? moment : new Date(moment);
  if (isNaN(current.getTime())) return false;

  return current.getTime() >= shiftWindow.start.getTime() && current.getTime() <= shiftWindow.end.getTime();
}

/**
 * Load candidate workers from the relevant weekly-plan contexts and enrich with user metadata.
 * The weekly plan is the source of truth for who is planned; users only provide metadata.
 * Role-based assignment restrictions are only active when the weekplan carries a role.
 *
 * Returns an array of worker objects:
 * { id, name, email, group, site, responsibility, role, weekplanRole, shiftActive, onBreak, absent, autoAssignable, blocked }
 */
export async function loadCandidateWorkers(settings = {}) {
  const now = new Date();
  const currentShiftOnly = settings?.currentShiftOnly !== false && settings?.currentShiftOnly !== 'false';
  const lookaheadHours = Number(settings?.planningWindowHours) || 0;
  const planningContexts = getPlanningContextsForMoment(now, {
    includeFuture: !currentShiftOnly,
    lookaheadHours,
  });

  const shiftQueries = planningContexts.map((context) => (
    pool.query(
      `SELECT employee_name, shift_code
       FROM shifts
       WHERE month = $1 AND day = $2
       ORDER BY employee_name ASC`,
      [context.monthLabel, context.day]
    )
  ));

  const [shiftResults, userRes, roleRes] = await Promise.all([
    Promise.all(shiftQueries),
    pool.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.upn,
        u.employee_id,
        u.entra_object_id,
        u.provisioned_employee_name,
        u.user_group AS "group",
        u.ibx AS site,
        u.department AS responsibility,
        COALESCE(u.assignment_role, 'normal') AS assignment_role,
        COALESCE(u.auto_assignable, true) AS auto_assignable,
        COALESCE(u.blocked, false) AS blocked,
        COALESCE(u.on_break, false) AS on_break,
        COALESCE(u.absent, false) AS absent,
        u.jarvis_display_name,
        u.jarvis_owner_code,
        u.jarvis_initials
      FROM users u
      WHERE u.approved = true
        AND u.is_root = false
      ORDER BY u.id
    `),
    pool.query(
      `SELECT employee_name, date, role_key
       FROM weekplan_roles
       WHERE date = ANY($1::date[])`,
      [planningContexts.map((context) => context.today)]
    ),
  ]);

  const verificationEntries = await Promise.all(
    planningContexts.map(async (context) => {
      try {
        return [context.today, await getVerificationStatusMap(context.today)];
      } catch (err) {
        console.warn(`[CANDIDATES] Failed to load verification status map for ${context.today}:`, err?.message || err);
        return [context.today, new Map()];
      }
    })
  );
  const verificationMapsByDate = new Map(verificationEntries);

  const userRows = userRes.rows.map(row => ({
    ...row,
    display_name: buildUserDisplayName(row),
  }));

  const userLookup = buildLookup(
    userRows.flatMap(row => ([
      { employee_name: row.display_name, ...row },
      row.provisioned_employee_name ? { employee_name: row.provisioned_employee_name, ...row } : null,
      row.email ? { employee_name: row.email, ...row } : null,
      row.upn ? { employee_name: row.upn, ...row } : null,
    ].filter(Boolean)))
  );
  const roleLookupsByDate = new Map(
    planningContexts.map((context) => {
      const rowsForDate = roleRes.rows.filter((row) => normalizePlanningDateKey(row.date) === context.today);
      return [context.today, buildLookup(rowsForDate)];
    })
  );

  const shiftRows = shiftResults.flatMap((result, index) => (
    result.rows.map((row) => ({
      ...row,
      planningDate: planningContexts[index].today,
    }))
  ));

  return shiftRows.map((shiftRow, index) => {
    const plannedEmployeeName = normalizeDisplayName(shiftRow.employee_name);
    const shiftCode = String(shiftRow.shift_code || '').trim().toUpperCase() || null;
    const matchedUser = findLookupMatch(plannedEmployeeName, userLookup);
    const matchedRoleRow = findLookupMatch(plannedEmployeeName, roleLookupsByDate.get(shiftRow.planningDate));
    const weekplanRole = matchedRoleRow?.role_key || null;
    const engineRole = resolveEffectiveWorkerRole(
      weekplanRole,
      matchedUser?.assignment_role || null
    );
    const shiftWindow = getShiftWindowForPlanEntry(shiftCode, shiftRow.planningDate);
    const verificationMap = verificationMapsByDate.get(shiftRow.planningDate) || new Map();

    return {
      id: matchedUser?.id ?? -(index + 1),
      name: matchedUser?.display_name || plannedEmployeeName || `weekly-plan-${index + 1}`,
      email: matchedUser?.email || null,
      group: matchedUser?.group || null,
      site: matchedUser?.site || null,
      responsibility: matchedUser?.responsibility || null,
      role: engineRole,
      userRole: matchedUser?.assignment_role || null,
      weekplanRole,
      shiftCode,
      shiftPlanningDate: shiftRow.planningDate,
      shiftStart: shiftWindow.start ? shiftWindow.start.toISOString() : null,
      shiftEnd: shiftWindow.end ? shiftWindow.end.toISOString() : null,
      shiftActive: isMomentInShiftWindow(now, shiftWindow),
      onBreak: !!matchedUser?.on_break,
      absent: !!matchedUser?.absent || shiftCode === 'ABW',
      autoAssignable: matchedUser ? matchedUser.auto_assignable !== false : true,
      blocked: !!matchedUser?.blocked,
      userMapped: !!matchedUser,
      planningSource: 'weekly_plan',
      plannedEmployeeName,
      jarvisDisplayName: matchedUser?.jarvis_display_name || null,
      jarvisOwnerCode: matchedUser?.jarvis_owner_code || null,
      jarvisInitials: matchedUser?.jarvis_initials || null,
      verificationStatus: verificationMap.get(shiftRow.employee_name)?.status || verificationMap.get(plannedEmployeeName)?.status || null,
    };
  });
}

/**
 * Build the candidate pool from loaded workers.
 * Applies basic filtering (active, not blocked, auto-assignable).
 */
export function buildCandidatePool(workers) {
  return workers;
}

/**
 * Load current active ticket assignments per worker.
 * Returns a Map<workerId, normalizedTicket[]> for the tie-breaking logic.
 *
 * Uses queue_items where owner matches worker name and ticket is active.
 */
export async function loadWorkerCurrentTickets(candidates) {
  const map = new Map();
  for (const c of candidates) {
    map.set(c.id, []);
  }

  if (candidates.length === 0) return map;

  // Build lookup of worker names
  const nameToId = new Map();
  for (const c of candidates) {
    for (const key of buildWorkerOwnerKeys(c)) {
      if (!nameToId.has(key)) nameToId.set(key, c.id);
    }
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        qi.id,
        qi.external_id,
        qi.assigned_worker_id,
        qi.queue_type AS type,
        qi.status,
        qi.severity AS priority,
        qi.system_name,
        qi.commit_date AS due_at,
        qi.sched_start AS scheduled_start,
        qi.first_seen_at AS created_at,
        qi.owner,
        qi.handover_type,
        qi.remaining_hours
      FROM queue_items qi
      WHERE qi.active = true
        AND qi.queue_type = ANY($1::text[])
        AND (
          qi.assigned_worker_id IS NOT NULL
          OR (qi.owner IS NOT NULL AND qi.owner <> '')
        )
      ORDER BY qi.id
    `, [SUPPORTED_QUEUE_ITEM_TYPES]);

    for (const row of rows) {
      const ownerKey = normalizeOwnerKey(row.owner);
      const workerId = map.has(row.assigned_worker_id)
        ? row.assigned_worker_id
        : nameToId.get(ownerKey);
      if (workerId != null && map.has(workerId)) {
        // Create a lightweight normalized ticket for grouping/purity checks
        const { mapType } = await import('../normalization/normalizeTicket.js');
        const typeResult = mapType(row.type);
        map.get(workerId).push({
          id: String(row.id),
          externalId: row.external_id,
          type: typeResult.value,
          priority: row.priority || null,
          systemName: row.system_name || null,
          dueAt: row.due_at ? new Date(row.due_at).toISOString() : null,
          scheduledStart: row.scheduled_start ? new Date(row.scheduled_start).toISOString() : null,
          remainingHours: row.remaining_hours != null ? Number(row.remaining_hours) : null,
        });
      }
    }
  } catch (err) {
    console.warn('[ASSIGNMENT] Could not load worker current tickets:', err.message);
  }

  return map;
}

/**
 * Load the latest crawler timestamp from crawler_runs.
 * Used for the crawler staleness check.
 */
export async function loadLastCrawlerTimestamp() {
  try {
    const { rows } = await pool.query(`
      SELECT snapshot_at
      FROM crawler_runs
      WHERE success = true
      ORDER BY snapshot_at DESC
      LIMIT 1
    `);
    return rows[0]?.snapshot_at || null;
  } catch (err) {
    console.warn('[ASSIGNMENT] Could not load crawler timestamp:', err.message);
    return null;
  }
}

/**
 * Load the manual exclusion list from assignment_exclusion_list.
 */
export async function loadExclusionList() {
  try {
    const { rows } = await pool.query(`
      SELECT system_name
      FROM assignment_exclusion_list
      WHERE active = true
      ORDER BY system_name
    `);
    return rows.map(r => r.system_name);
  } catch (err) {
    console.warn('[ASSIGNMENT] Could not load exclusion list:', err.message);
    return [];
  }
}

/**
 * Load the subtype exclusion list from subtype_exclusions.
 */
export async function loadSubtypeExclusionList() {
  try {
    const { rows } = await pool.query(`
      SELECT subtype
      FROM subtype_exclusions
      ORDER BY subtype
    `);
    return rows.map(r => r.subtype);
  } catch (err) {
    console.warn('[ASSIGNMENT] Could not load subtype exclusion list:', err.message);
    return [];
  }
}
