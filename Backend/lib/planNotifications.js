/* ================================================ */
/* Plan notifications                               */
/* Uses the existing Jarvis notification system     */
/* (jarvis_notifications + recipients): the ODIN GO */
/* extension shows them in its own window.          */
/*                                                  */
/*  - every change of the shift plan -> the person  */
/*    concerned and the admin(s)                    */
/*  - sick / absence planned          -> the admin(s)*/
/* Failures never break the request that caused the */
/* notification.                                    */
/* ================================================ */

import { normalizeName } from './nameNorm.js';

export const PLAN_NOTIFY_ENABLED_KEY = 'shiftplan.plan_notifications_enabled';
export const PLAN_NOTIFY_ADMIN_IDS_KEY = 'shiftplan.plan_notify_admin_user_ids';
/** Shift codes / absence types that mean "sick". */
export const SICK_SHIFT_CODES = new Set(['KRANK', 'S']);
const MAX_LINES = 14;
const VALID_DAYS = 3;

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function parseBoolean(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const text = String(value).replace(/^"|"$/g, '').trim().toLowerCase();
  if (['true', '1', 'yes', 'ja', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'nein', 'off'].includes(text)) return false;
  return fallback;
}

export function formatPlanDate(dateKey) {
  const [year, month, day] = String(dateKey || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return String(dateKey || '');
  const date = new Date(year, month - 1, day);
  return `${WEEKDAYS[date.getDay()]} ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.`;
}

const shiftLabel = (code) => (code ? String(code).toUpperCase() : 'frei');
/** For everybody who may not know about sick leave: KRANK / S read as "Abwesend". */
const neutralLabel = (code) => (SICK_SHIFT_CODES.has(String(code || '').toUpperCase()) || String(code || '').toUpperCase() === 'ABW' ? 'Abwesend' : shiftLabel(code));

async function isEnabled(db) {
  try {
    const { rows } = await db.query('SELECT value FROM app_settings WHERE key = $1 LIMIT 1', [PLAN_NOTIFY_ENABLED_KEY]);
    return parseBoolean(rows[0]?.value, true);
  } catch {
    return true;
  }
}

async function loadUsers(db) {
  const { rows } = await db.query(
    `SELECT id, first_name, last_name, provisioned_employee_name, login_name
       FROM users WHERE approved = TRUE AND is_root = FALSE`
  );
  return rows;
}

function userNameKeys(user) {
  const first = String(user.first_name || '').trim();
  const last = String(user.last_name || '').trim();
  return [user.provisioned_employee_name, `${first} ${last}`, `${last} ${first}`, `${last}, ${first}`]
    .map((value) => normalizeName(String(value || '')))
    .filter(Boolean);
}

/** employee name of the plan -> user id (only exact normalized matches, never guessed). */
export async function resolveEmployeeUserIds(db, employeeNames) {
  const result = new Map();
  if (!employeeNames.length) return result;
  const users = await loadUsers(db);
  const byKey = new Map();
  for (const user of users) for (const key of userNameKeys(user)) if (!byKey.has(key)) byKey.set(key, user.id);
  for (const name of employeeNames) {
    const id = byKey.get(normalizeName(name));
    if (id) result.set(name, id);
  }
  return result;
}

/** Admin recipients: the users picked in the admin settings; without a pick Patrick Brode (the plan owner). */
export async function loadAdminRecipientIds(db) {
  const users = await loadUsers(db);
  let configured = [];
  try {
    const { rows } = await db.query('SELECT value FROM app_settings WHERE key = $1 LIMIT 1', [PLAN_NOTIFY_ADMIN_IDS_KEY]);
    const parsed = JSON.parse(String(rows[0]?.value ?? '[]'));
    if (Array.isArray(parsed)) configured = parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  } catch { /* nothing configured */ }
  const valid = new Set(users.map((user) => user.id));
  const picked = configured.filter((id) => valid.has(id));
  if (picked.length > 0) return picked;
  const owner = users.find((user) => userNameKeys(user).includes('patrick brode'));
  return owner ? [owner.id] : [];
}

export async function createPlanNotification(db, { title, body, recipientIds, createdBy, kind = 'notification' }) {
  const ids = [...new Set(recipientIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return null;
  const { rows } = await db.query(
    `INSERT INTO jarvis_notifications (title, body, recurrence, notification_kind, start_at, end_at, created_by)
     VALUES ($1, $2, 'once', $3, NOW(), NOW() + ($4 || ' days')::interval, $5)
     RETURNING id`,
    [title, body, kind, String(VALID_DAYS), createdBy || 'Dienstplan']
  );
  const id = rows[0]?.id;
  if (!id) return null;
  for (const userId of ids) {
    await db.query('INSERT INTO jarvis_notification_recipients (notification_id, user_id) VALUES ($1, $2)', [id, userId]);
  }
  return id;
}

function limitLines(lines) {
  if (lines.length <= MAX_LINES) return lines;
  return [...lines.slice(0, MAX_LINES), `… und ${lines.length - MAX_LINES} weitere Änderungen`];
}

/**
 * changes: [{ employee_name, date: 'YYYY-MM-DD', old_value, new_value }]
 * Sends: one notification per affected employee, one summary for the admin(s), and a sick notice for the admin(s).
 */
export async function notifyShiftChanges({ db, changes, actor = 'Unbekannt', actorUserId = null }) {
  try {
    const real = (Array.isArray(changes) ? changes : []).filter((change) => change?.employee_name && (change.old_value || null) !== (change.new_value || null));
    if (real.length === 0 || !(await isEnabled(db))) return { sent: 0 };

    const byEmployee = new Map();
    for (const change of real) {
      if (!byEmployee.has(change.employee_name)) byEmployee.set(change.employee_name, []);
      byEmployee.get(change.employee_name).push(change);
    }
    for (const list of byEmployee.values()) list.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const userIds = await resolveEmployeeUserIds(db, [...byEmployee.keys()]);
    const adminIds = await loadAdminRecipientIds(db);
    let sent = 0;

    // 1. the people concerned (not the person who made the change)
    for (const [employee, list] of byEmployee) {
      const userId = userIds.get(employee);
      if (!userId || userId === actorUserId) continue;
      const lines = limitLines(list.map((change) => `${formatPlanDate(change.date)}: ${neutralLabel(change.old_value)} → ${neutralLabel(change.new_value)}`));
      if (await createPlanNotification(db, {
        title: 'Dein Dienstplan wurde geändert',
        body: `${lines.join('\n')}\n\nGeändert von ${actor}.`,
        recipientIds: [userId],
        createdBy: actor,
      })) sent += 1;
    }

    // 2. the admin(s): everything in one message
    const adminTargets = adminIds.filter((id) => id !== actorUserId);
    if (adminTargets.length > 0) {
      const lines = limitLines(real
        .slice()
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.employee_name).localeCompare(String(b.employee_name), 'de'))
        .map((change) => `${change.employee_name} · ${formatPlanDate(change.date)}: ${shiftLabel(change.old_value)} → ${shiftLabel(change.new_value)}`));
      if (await createPlanNotification(db, {
        title: `Dienstplan geändert (${real.length} ${real.length === 1 ? 'Änderung' : 'Änderungen'})`,
        body: `${lines.join('\n')}\n\nGeändert von ${actor}.`,
        recipientIds: adminTargets,
        createdBy: actor,
      })) sent += 1;
    }

    // 3. sick: its own notice for the admin(s)
    const sick = real.filter((change) => SICK_SHIFT_CODES.has(String(change.new_value || '').toUpperCase()));
    if (sick.length > 0 && adminIds.length > 0) {
      sent += (await notifySickAbsence({
        db,
        entries: sick.map((change) => ({ employee_name: change.employee_name, start_date: change.date, end_date: change.date })),
        actor,
        adminIds,
      })).sent;
    }
    return { sent };
  } catch (error) {
    console.error('Plan notifications failed:', error.message);
    return { sent: 0, error: error.message };
  }
}

/** Somebody is sick / planned as absent: the admin(s) are told. entries: [{ employee_name, start_date, end_date }] */
export async function notifySickAbsence({ db, entries, actor = 'Unbekannt', adminIds = null }) {
  try {
    if (!entries?.length || !(await isEnabled(db))) return { sent: 0 };
    const recipients = adminIds ?? await loadAdminRecipientIds(db);
    if (recipients.length === 0) return { sent: 0 };
    const merged = new Map();
    for (const entry of entries) {
      const list = merged.get(entry.employee_name) || [];
      list.push(entry);
      merged.set(entry.employee_name, list);
    }
    const lines = [...merged.entries()].map(([name, list]) => {
      const dates = list.map((entry) => (entry.start_date === entry.end_date
        ? formatPlanDate(entry.start_date)
        : `${formatPlanDate(entry.start_date)} bis ${formatPlanDate(entry.end_date)}`));
      return `${name}: ${dates.join(', ')}`;
    });
    const id = await createPlanNotification(db, {
      title: merged.size === 1 ? `Krankmeldung: ${[...merged.keys()][0]}` : `Krankmeldungen (${merged.size} Personen)`,
      body: `${limitLines(lines).join('\n')}\n\nAls abwesend (krank) geplant von ${actor}. Bitte Besetzung prüfen.`,
      recipientIds: recipients,
      createdBy: actor,
      kind: 'instruction',
    });
    return { sent: id ? 1 : 0 };
  } catch (error) {
    console.error('Sick notification failed:', error.message);
    return { sent: 0, error: error.message };
  }
}

/**
 * A draft was activated. If the month already had a live plan, only the differences are sent (like normal changes);
 * a month without a live plan is announced as "published".
 * previous / next: arrays of { employee_name, day, shift_code }.
 */
export async function notifyPlanActivated({ db, year, month, monthLabel, previous, next, actor = 'Unbekannt', actorUserId = null }) {
  try {
    const key = (entry) => `${entry.employee_name}|${Number(entry.day)}`;
    const before = new Map((previous || []).map((entry) => [key(entry), entry.shift_code]));
    const after = new Map((next || []).map((entry) => [key(entry), entry.shift_code]));
    const pad = (value) => String(value).padStart(2, '0');

    if (before.size > 0) {
      const changes = [];
      for (const cell of new Set([...before.keys(), ...after.keys()])) {
        const [employee, day] = cell.split('|');
        const oldValue = before.get(cell) || null;
        const newValue = after.get(cell) || null;
        if (oldValue === newValue) continue;
        changes.push({ employee_name: employee, date: `${year}-${pad(month)}-${pad(day)}`, old_value: oldValue, new_value: newValue });
      }
      return notifyShiftChanges({ db, changes, actor, actorUserId });
    }

    if (!(await isEnabled(db))) return { sent: 0 };
    const counts = new Map();
    for (const entry of next || []) counts.set(entry.employee_name, (counts.get(entry.employee_name) || 0) + 1);
    const userIds = await resolveEmployeeUserIds(db, [...counts.keys()]);
    let sent = 0;
    for (const [employee, count] of counts) {
      const userId = userIds.get(employee);
      if (!userId || userId === actorUserId) continue;
      if (await createPlanNotification(db, {
        title: `Dienstplan ${monthLabel} ist veröffentlicht`,
        body: `Für dich sind ${count} Schichten eingeplant. Bitte im Dienstplan prüfen.\n\nVeröffentlicht von ${actor}.`,
        recipientIds: [userId],
        createdBy: actor,
      })) sent += 1;
    }
    const admins = (await loadAdminRecipientIds(db)).filter((id) => id !== actorUserId);
    if (admins.length > 0 && await createPlanNotification(db, {
      title: `Dienstplan ${monthLabel} wurde veröffentlicht`,
      body: `${counts.size} Mitarbeiter, ${(next || []).length} Schichten.\n\nVeröffentlicht von ${actor}.`,
      recipientIds: admins,
      createdBy: actor,
    })) sent += 1;
    return { sent };
  } catch (error) {
    console.error('Plan activation notifications failed:', error.message);
    return { sent: 0, error: error.message };
  }
}
