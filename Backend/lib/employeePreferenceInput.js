/* ================================================ */
/* Employee wish input                              */
/* Normalises the wishes an administrator edits for */
/* an employee. Only fields that are present in the */
/* body are changed; everything else keeps its      */
/* stored value.                                    */
/* ================================================ */

const EXCLUDED_CODES = new Set(['HE1', 'HE2', 'HL1', 'HL2']);
// Wishes refer to the base shift: weekend variants and NK are mapped.
const BASE_CODES = { E1SA: 'E1', E1WE: 'E1', E2SA: 'E2', E2WE: 'E2', L1WE: 'L1', NK: 'N', NS: 'N' };

export function sanitizeShiftCodes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((code) => String(code || '').trim().toUpperCase())
    .map((code) => BASE_CODES[code] || code)
    .filter((code) => code && !EXCLUDED_CODES.has(code)))].slice(0, 20);
}

function limit(value, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : null;
}

/** Returns { error } or { values } where values only contains the fields that were sent. */
export function parseAdminPreferenceInput(body = {}, { userId = null } = {}) {
  const values = {};
  if ('preferred_shifts' in body) values.preferred_shifts = sanitizeShiftCodes(body.preferred_shifts);
  if ('unwanted_shifts' in body) values.unwanted_shifts = sanitizeShiftCodes(body.unwanted_shifts);
  if ('blocked_days' in body) {
    values.blocked_days = Array.isArray(body.blocked_days)
      ? [...new Set(body.blocked_days.map((day) => Number.parseInt(String(day), 10)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
      : [];
  }
  if ('preferred_holidays' in body) values.preferred_holidays = Array.isArray(body.preferred_holidays) ? body.preferred_holidays.map(String).slice(0, 30) : [];
  if ('max_nights_per_month' in body) values.max_nights_per_month = limit(body.max_nights_per_month, 21);
  if ('max_weekends_per_month' in body) values.max_weekends_per_month = limit(body.max_weekends_per_month, 3);
  if ('night_model' in body) {
    const model = String(body.night_model || 'SEVEN_DAY').trim().toUpperCase();
    if (!['SEVEN_DAY', 'SHORT'].includes(model)) return { error: 'Ungültiges Nachtschicht-Modell' };
    values.night_model = model;
  }
  if ('preferred_colleagues' in body) {
    const ids = Array.isArray(body.preferred_colleagues)
      ? [...new Set(body.preferred_colleagues.map((id) => Number.parseInt(String(id), 10)).filter((id) => Number.isInteger(id) && id > 0 && id !== userId))]
      : [];
    if (ids.length > 4) return { error: 'Es können maximal vier Wunschkollegen ausgewählt werden.' };
    values.preferred_colleagues = ids;
  }
  if ('monthly_preferences' in body) {
    const source = body.monthly_preferences && typeof body.monthly_preferences === 'object' && !Array.isArray(body.monthly_preferences) ? body.monthly_preferences : {};
    values.monthly_preferences = Object.fromEntries(Object.entries(source)
      .filter(([key, value]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && value && typeof value === 'object')
      .map(([key, value]) => [key, { preferred_shifts: sanitizeShiftCodes(value.preferred_shifts), unwanted_shifts: sanitizeShiftCodes(value.unwanted_shifts) }]));
  }
  return { values };
}
