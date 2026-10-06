/* Pure input sanitisers for shift definitions (modes, free days, short-night series). */

export const MAX_SHIFT_MODES = 5;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toClock(value, fallback) {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(value ?? '').trim());
  const candidate = match ? `${match[1]}:${match[2]}` : '';
  return TIME_PATTERN.test(candidate) ? candidate : fallback;
}

/**
 * Sanitises the `modes` array sent by the admin UI. Returns a plain array that can be
 * JSON.stringify-ed into the JSONB column. An empty/invalid input yields [] (the
 * runtime falls back to a "Standard" mode via normalizeShiftModes).
 * Shape: { id, label, start_time, end_time, duration_hours, free_days_after }
 */
export function sanitizeShiftModes(input, fallback = {}) {
  if (!Array.isArray(input)) return [];
  const fallbackStart = toClock(fallback.start_time, '00:00');
  const fallbackEnd = toClock(fallback.end_time, '00:00');
  const fallbackDuration = Number(fallback.duration_hours);
  const seen = new Set();
  const result = [];
  input.forEach((mode, index) => {
    if (!mode || typeof mode !== 'object') return;
    let id = Number.parseInt(String(mode.id), 10);
    if (!Number.isInteger(id) || id < 1 || id > 1000000) id = index + 1;
    if (seen.has(id)) return;
    seen.add(id);
    const label = String(mode.label ?? '').trim().slice(0, 60) || `Modus ${index + 1}`;
    const rawDuration = Number.parseFloat(String(mode.duration_hours));
    const duration = Number.isFinite(rawDuration)
      ? rawDuration
      : (Number.isFinite(fallbackDuration) ? fallbackDuration : 0);
    result.push({
      id,
      label,
      start_time: toClock(mode.start_time, fallbackStart),
      end_time: toClock(mode.end_time, fallbackEnd),
      duration_hours: Math.round(Math.max(0, Math.min(24, duration)) * 100) / 100,
      free_days_after: clampInt(mode.free_days_after, 0, 14, 0),
    });
  });
  return result.slice(0, MAX_SHIFT_MODES);
}

/** 0..14 or null (= use the global rules). */
export function normalizeFreeDaysAfter(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(14, parsed));
}

/** Short-night block length, 1..7, default 3. */
export function normalizeShortNightSeriesDays(value, fallback = 3) {
  return clampInt(value, 1, 7, fallback);
}
