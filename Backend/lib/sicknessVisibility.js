/* ================================================ */
/* Sickness privacy                                 */
/* Only admins and the people picked in the shift   */
/* plan settings see that an absence is a sick      */
/* leave. Everybody else only sees "Abwesend".      */
/* ================================================ */

export const SICK_VISIBLE_IDS_KEY = 'shiftplan.plan_notify_admin_user_ids';
/** Plan codes that stand for sick leave. */
export const SICK_PLAN_CODES = new Set(['KRANK', 'S']);
/** Neutral replacements shown to everybody without access. */
export const MASKED_PLAN_CODE = 'ABW';
export const MASKED_ABSENCE_TYPE = 'ABSENT';

export async function loadSickVisibleIds(db) {
  try {
    const { rows } = await db.query('SELECT value FROM app_settings WHERE key = $1 LIMIT 1', [SICK_VISIBLE_IDS_KEY]);
    const parsed = JSON.parse(String(rows[0]?.value ?? '[]'));
    return Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
  } catch {
    return [];
  }
}

/** Admins (unlocked admin session) and the selected people may see sick leave. */
export async function canSeeSickness(db, user) {
  if (!user) return false;
  if (user.is_admin === true || user.is_root === true) return true;
  const ids = await loadSickVisibleIds(db);
  return ids.includes(Number(user.id));
}

/** schedule: { employee: { day: code } } -> sick codes become ABW (new object, input untouched). */
export function maskScheduleSickness(schedule) {
  const masked = {};
  for (const [employee, days] of Object.entries(schedule || {})) {
    const copy = {};
    for (const [day, code] of Object.entries(days || {})) {
      copy[day] = SICK_PLAN_CODES.has(String(code || '').trim().toUpperCase()) ? MASKED_PLAN_CODE : code;
    }
    masked[employee] = copy;
  }
  return masked;
}

/** absence rows: type SICK becomes the neutral type, the note is removed. */
export function maskAbsenceRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => (
    String(row?.type || '').toUpperCase() === 'SICK' ? { ...row, type: MASKED_ABSENCE_TYPE, note: null } : row
  ));
}
