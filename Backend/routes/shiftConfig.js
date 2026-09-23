/* ================================================ */
/* Shift Configuration API Routes                   */
/* CRUD for shift definitions, rotation rules,      */
/* fairness rules, planning config, exclusions      */
/* ================================================ */

import express from 'express';
import { requireAuth, requireVerifiedIdentity } from '../middleware/authMiddleware.js';
import { requirePageAccess } from '../middleware/requirePageAccess.js';
import pool from '../db.js';
import { ensureShiftplanSchema } from '../lib/ensureShiftplanSchema.js';

const router = express.Router();
router.use(requireAuth);
router.use(async (_req, _res, next) => {
  try {
    await ensureShiftplanSchema();
    next();
  } catch (error) {
    next(error);
  }
});

function normalizeFixedShiftType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'early' || normalized === 'late' || normalized === 'night') return normalized;
  return null;
}

function requireRootAdmin(req, res, next) {
  if (req.user?.is_root === true) return next();
  return res.status(403).json({ ok: false, error: 'Dieser Bereich ist nur für den Administrator verfügbar' });
}

// PostgreSQL TIME columns are returned as HH:MM:SS; clients often send them back unchanged.
function normalizeClockTime(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(value ?? '').trim());
  return match ? `${match[1]}:${match[2]}` : value;
}

function validateShiftDefinitionInput(input = {}) {
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const duration = Number.parseFloat(String(input.duration_hours ?? 8));
  const minStaff = Number.parseInt(String(input.min_staff ?? 1), 10);
  const maxStaff = Number.parseInt(String(input.max_staff ?? 5), 10);
  const shiftType = String(input.shift_type || 'early').trim().toLowerCase();
  const allowedTypes = new Set(['early', 'late', 'night', 'special', 'free', 'absent']);
  const days = Array.isArray(input.applicable_days) ? input.applicable_days : [0, 1, 2, 3, 4, 5, 6];

  if (!timePattern.test(String(input.start_time || '')) || !timePattern.test(String(input.end_time || ''))) return 'Ungültige Schichtzeit';
  if (!Number.isFinite(duration) || duration <= 0 || duration > 24) return 'Ungültige Schichtdauer';
  if (!Number.isInteger(minStaff) || minStaff < 0 || !Number.isInteger(maxStaff) || maxStaff < minStaff) return 'Mindestbesetzung darf die maximale Besetzung nicht überschreiten';
  if (!allowedTypes.has(shiftType)) return 'Ungültiger Schichttyp';
  if (!days.every((day) => Number.isInteger(Number(day)) && Number(day) >= 0 && Number(day) <= 6)) return 'Ungültige Wochentage';
  return null;
}

function normalizeWeekdays(value, fallback = [1, 2, 3, 4, 5]) {
  const source = Array.isArray(value) ? value : fallback;
  const normalized = [...new Set(source
    .map((day) => Number.parseInt(String(day), 10))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return normalized.length > 0 ? normalized : fallback;
}

function getDurationHours({ startTime, endTime, startDayOffset = 0, endDayOffset = 0 }) {
  const toMinutes = (value) => {
    const [hours, minutes] = String(value || '').split(':').map(Number);
    return hours * 60 + minutes;
  };
  const start = toMinutes(startTime) + Number(startDayOffset || 0) * 1440;
  let end = toMinutes(endTime) + Number(endDayOffset || 0) * 1440;
  if (end <= start) end += 1440;
  return Number(((end - start) / 60).toFixed(2));
}

function validateDayOverride(input = {}) {
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const weekday = Number.parseInt(String(input.weekday), 10);
  const startDayOffset = Number.parseInt(String(input.start_day_offset ?? 0), 10);
  const endDayOffset = Number.parseInt(String(input.end_day_offset ?? 0), 10);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return 'Ungültiger Wochentag';
  if (!timePattern.test(String(input.start_time || '')) || !timePattern.test(String(input.end_time || ''))) return 'Ungültige Schichtzeit';
  if (![0, 1].includes(startDayOffset) || ![0, 1].includes(endDayOffset)) return 'Ungültiger Tagesversatz';
  const durationHours = getDurationHours({ startTime: input.start_time, endTime: input.end_time, startDayOffset, endDayOffset });
  if (durationHours <= 0 || durationHours > 24) return 'Die Schichtdauer muss zwischen 0 und 24 Stunden liegen';
  return null;
}

function parseEmployeeAccessPool(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function comparableEmployeeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

async function canUseBlockedWeekdayPreferences(user) {
  const { rows } = await pool.query(
    "SELECT value FROM app_settings WHERE key = 'shiftplan.blocked_weekday_employee_pool' LIMIT 1"
  );
  const allowedEmployees = parseEmployeeAccessPool(rows[0]?.value);
  if (allowedEmployees.length === 0) return false;

  const candidates = [user?.displayName];
  if (user?.id) {
    const userResult = await pool.query(
      'SELECT first_name, last_name, provisioned_employee_name FROM users WHERE id = $1 LIMIT 1',
      [user.id]
    );
    const localUser = userResult.rows[0];
    if (localUser) {
      candidates.push(
        localUser.provisioned_employee_name,
        [localUser.first_name, localUser.last_name].filter(Boolean).join(' '),
        [localUser.last_name, localUser.first_name].filter(Boolean).join(', '),
      );
    }
  }

  const allowed = new Set(allowedEmployees.map(comparableEmployeeName).filter(Boolean));
  return candidates.some((candidate) => allowed.has(comparableEmployeeName(candidate)));
}

/* ------------------------------------------------ */
/* SHIFT DEFINITIONS                                */
/* ------------------------------------------------ */

router.get('/definitions', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT definition.*, COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'weekday', override.weekday,
            'start_time', override.start_time,
            'end_time', override.end_time,
            'start_day_offset', override.start_day_offset,
            'end_day_offset', override.end_day_offset,
            'duration_hours', override.duration_hours
          ) ORDER BY override.weekday
        ) FILTER (WHERE override.id IS NOT NULL),
        '[]'::jsonb
      ) AS day_overrides
      FROM shift_definitions definition
      LEFT JOIN shift_definition_day_overrides override ON override.shift_definition_id = definition.id
      GROUP BY definition.id
      ORDER BY definition.sort_order, definition.code
    `);
    res.json({ ok: true, definitions: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/definitions/:id/day-overrides/:weekday', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const weekday = Number.parseInt(req.params.weekday, 10);
    const input = {
      ...req.body,
      weekday,
      start_time: normalizeClockTime(req.body?.start_time),
      end_time: normalizeClockTime(req.body?.end_time),
    };
    const validationError = validateDayOverride(input);
    if (validationError) return res.status(400).json({ ok: false, error: validationError });

    const definitionRes = await pool.query('SELECT id FROM shift_definitions WHERE id = $1', [id]);
    if (!definitionRes.rows.length) return res.status(404).json({ ok: false, error: 'Definition nicht gefunden' });
    const startDayOffset = Number.parseInt(String(input.start_day_offset ?? 0), 10);
    const endDayOffset = Number.parseInt(String(input.end_day_offset ?? 0), 10);
    const durationHours = getDurationHours({
      startTime: input.start_time,
      endTime: input.end_time,
      startDayOffset,
      endDayOffset,
    });
    const { rows } = await pool.query(
      `INSERT INTO shift_definition_day_overrides (
         shift_definition_id, weekday, start_time, end_time, start_day_offset, end_day_offset, duration_hours, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (shift_definition_id, weekday) DO UPDATE SET
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         start_day_offset = EXCLUDED.start_day_offset,
         end_day_offset = EXCLUDED.end_day_offset,
         duration_hours = EXCLUDED.duration_hours,
         updated_at = NOW()
       RETURNING weekday, start_time, end_time, start_day_offset, end_day_offset, duration_hours`,
      [id, weekday, input.start_time, input.end_time, startDayOffset, endDayOffset, durationHours]
    );
    res.json({ ok: true, override: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/definitions/:id/day-overrides/:weekday', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM shift_definition_day_overrides WHERE shift_definition_id = $1 AND weekday = $2 RETURNING weekday',
      [Number.parseInt(req.params.id, 10), Number.parseInt(req.params.weekday, 10)]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Tagesausnahme nicht gefunden' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* SHORT NIGHT OPTIONS                               */
/* ------------------------------------------------ */

router.get('/short-night-options', async (_req, res) => {
  try {
    const [rotationResult, definitionResult] = await Promise.all([
      pool.query('SELECT short_night_mode_enabled, short_night_free_days_after FROM shift_rotation_rules WHERE id = 1'),
      pool.query("SELECT id, code, name, short_name, start_time, end_time, start_day_offset, end_day_offset, duration_hours, series_days, color_hex FROM shift_definitions WHERE UPPER(code) = 'NK' LIMIT 1"),
    ]);
    const definition = definitionResult.rows[0] || null;
    res.json({
      ok: true,
      options: {
        enabled: Boolean(rotationResult.rows[0]?.short_night_mode_enabled),
        free_days_after: Number(rotationResult.rows[0]?.short_night_free_days_after ?? 2),
        start_time: String(definition?.start_time || '21:45').slice(0, 5),
        end_time: String(definition?.end_time || '06:45').slice(0, 5),
        start_day_offset: Number(definition?.start_day_offset ?? 0),
        end_day_offset: Number(definition?.end_day_offset ?? 1),
        duration_hours: Number(definition?.duration_hours ?? 9),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/short-night-options', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  let client;
  try {
    const start_time = String(req.body?.start_time || '21:45').slice(0, 5);
    const end_time = String(req.body?.end_time || '06:45').slice(0, 5);
    const free_days_after = Math.max(0, Math.min(14, Number.parseInt(String(req.body?.free_days_after), 10) || 0));
    const enabled = Boolean(req.body?.enabled);
    const validationError = validateShiftDefinitionInput({
      shift_type: 'night', start_time, end_time, duration_hours: getDurationHours({ startTime: start_time, endTime: end_time, startDayOffset: 0, endDayOffset: 1 }), min_staff: 1, max_staff: 3, applicable_days: [0, 1, 2, 3, 4, 5, 6],
    });
    if (validationError) return res.status(400).json({ ok: false, error: validationError });

    const duration_hours = getDurationHours({ startTime: start_time, endTime: end_time, startDayOffset: 0, endDayOffset: 1 });
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      'UPDATE shift_rotation_rules SET short_night_mode_enabled = $1, short_night_free_days_after = $2, updated_at = NOW() WHERE id = 1',
      [enabled, free_days_after]
    );
    const { rows } = await client.query(
      `INSERT INTO shift_definitions (code, name, short_name, shift_type, start_time, end_time, start_day_offset, end_day_offset, duration_hours, series_days, min_staff, max_staff, color_hex, is_active, sort_order, applicable_days)
       VALUES ('NK', 'Kurze Nachtschicht', 'NK', 'night', $1, $2, 0, 1, $3, 3, 1, 3, '#2563eb', $4, 999, '[0,1,2,3,4,5,6]'::jsonb)
       ON CONFLICT (code) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, start_day_offset = 0, end_day_offset = 1, duration_hours = EXCLUDED.duration_hours, series_days = 3, color_hex = EXCLUDED.color_hex, is_active = EXCLUDED.is_active
       RETURNING *`,
      [start_time, end_time, duration_hours, enabled]
    );
    await client.query('COMMIT');
    res.json({ ok: true, options: { enabled, free_days_after, start_time, end_time, start_day_offset: 0, end_day_offset: 1, duration_hours }, definition: rows[0] });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client?.release();
  }
});

router.put('/definitions/:id', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const { name, short_name, shift_type, start_day_offset, end_day_offset, duration_hours, series_days, min_staff, max_staff, color_hex, is_active, sort_order, applicable_days } = req.body;
    const start_time = normalizeClockTime(req.body?.start_time);
    const end_time = normalizeClockTime(req.body?.end_time);
    const id = parseInt(req.params.id);
    const validationError = validateShiftDefinitionInput({ shift_type, start_time, end_time, duration_hours, min_staff, max_staff, applicable_days });
    if (validationError) return res.status(400).json({ ok: false, error: validationError });
    const normalizedApplicableDays = Array.isArray(applicable_days) ? applicable_days : [0, 1, 2, 3, 4, 5, 6];
    const normalizedStartDayOffset = Number.isInteger(Number(start_day_offset)) ? Number(start_day_offset) : 0;
    const normalizedEndDayOffset = Number.isInteger(Number(end_day_offset)) ? Number(end_day_offset) : 0;
    const normalizedSeriesDays = Math.max(Number.parseInt(String(series_days ?? 1), 10) || 1, 1);
    const { rows } = await pool.query(
      `UPDATE shift_definitions
       SET name=$2,
           short_name=$3,
           shift_type=$4,
           start_time=$5,
           end_time=$6,
           start_day_offset=$7,
           end_day_offset=$8,
           duration_hours=$9,
           series_days=$10,
           min_staff=$11,
           max_staff=$12,
           color_hex=$13,
           is_active=$14,
           sort_order=$15,
           applicable_days=$16::jsonb,
           updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id, name, short_name, shift_type, start_time, end_time, normalizedStartDayOffset, normalizedEndDayOffset, duration_hours, normalizedSeriesDays, min_staff, max_staff, color_hex, is_active, sort_order, JSON.stringify(normalizedApplicableDays)]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Definition nicht gefunden' });
    res.json({ ok: true, definition: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/definitions', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const { code, name, short_name, shift_type, start_day_offset, end_day_offset, duration_hours, series_days, min_staff, max_staff, color_hex, sort_order, applicable_days } = req.body;
    const start_time = normalizeClockTime(req.body?.start_time);
    const end_time = normalizeClockTime(req.body?.end_time);
    if (!code || !name) return res.status(400).json({ ok: false, error: 'Code und Name erforderlich' });
    const validationError = validateShiftDefinitionInput({ shift_type, start_time, end_time, duration_hours, min_staff, max_staff, applicable_days });
    if (validationError) return res.status(400).json({ ok: false, error: validationError });
    const normalizedApplicableDays = Array.isArray(applicable_days) ? applicable_days : [0, 1, 2, 3, 4, 5, 6];
    const normalizedStartDayOffset = Number.isInteger(Number(start_day_offset)) ? Number(start_day_offset) : 0;
    const normalizedEndDayOffset = Number.isInteger(Number(end_day_offset)) ? Number(end_day_offset) : 0;
    const normalizedSeriesDays = Math.max(Number.parseInt(String(series_days ?? 1), 10) || 1, 1);
    const { rows } = await pool.query(
      `INSERT INTO shift_definitions (
         code, name, short_name, shift_type, start_time, end_time,
         start_day_offset, end_day_offset, duration_hours, series_days, min_staff,
         max_staff, color_hex, sort_order, applicable_days
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
       RETURNING *`,
      [code, name, short_name || code, shift_type || 'early', start_time, end_time, normalizedStartDayOffset, normalizedEndDayOffset, duration_hours || 8, normalizedSeriesDays, min_staff || 1, max_staff || 5, color_hex || '#3b82f6', sort_order || 0, JSON.stringify(normalizedApplicableDays)]
    );
    res.json({ ok: true, definition: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Schichtcode existiert bereits' });
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/definitions/:id', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM shift_definitions WHERE id=$1 RETURNING *', [parseInt(req.params.id)]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Definition nicht gefunden' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* SPECIAL SHIFT POOLS                              */
/* ------------------------------------------------ */

router.get('/special-pools/:shiftCode', async (req, res) => {
  try {
    const shiftCode = String(req.params.shiftCode || '').trim().toUpperCase();
    const { rows } = await pool.query(
      `SELECT id, shift_code, employee_name, monthly_max_assignments, sort_order, is_active,
              working_weekdays, free_days_after_block
       FROM shift_special_pools
       WHERE shift_code = $1 AND is_active = TRUE
       ORDER BY sort_order, employee_name`,
      [shiftCode]
    );
    res.json({ ok: true, assignments: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/special-pools/:shiftCode', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const shiftCode = String(req.params.shiftCode || '').trim().toUpperCase();
    const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];

    await client.query('BEGIN');

    const defRes = await client.query('SELECT code FROM shift_definitions WHERE code = $1', [shiftCode]);
    if (!defRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Schichtdefinition nicht gefunden' });
    }

    await client.query('DELETE FROM shift_special_pools WHERE shift_code = $1', [shiftCode]);

    for (let index = 0; index < assignments.length; index++) {
      const entry = assignments[index] || {};
      const employeeName = String(entry.employee_name || '').trim();
      if (!employeeName) continue;
      const monthlyMaxAssignments = Math.max(Number.parseInt(String(entry.monthly_max_assignments ?? 0), 10) || 0, 0);
      const workingWeekdays = normalizeWeekdays(entry.working_weekdays);
      const freeDaysAfterBlock = Math.max(0, Math.min(14, Number.parseInt(String(entry.free_days_after_block ?? 2), 10) || 0));
      await client.query(
        `INSERT INTO shift_special_pools (shift_code, employee_name, monthly_max_assignments, sort_order, is_active, working_weekdays, free_days_after_block)
         VALUES ($1, $2, $3, $4, TRUE, $5::jsonb, $6)`,
        [shiftCode, employeeName, monthlyMaxAssignments, index, JSON.stringify(workingWeekdays), freeDaysAfterBlock]
      );
    }

    const { rows } = await client.query(
      `SELECT id, shift_code, employee_name, monthly_max_assignments, sort_order, is_active,
              working_weekdays, free_days_after_block
       FROM shift_special_pools
       WHERE shift_code = $1 AND is_active = TRUE
       ORDER BY sort_order, employee_name`,
      [shiftCode]
    );

    await client.query('COMMIT');
    res.json({ ok: true, assignments: rows });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

/* ------------------------------------------------ */
/* ADMIN-ONLY EMPLOYEE FLAGS                         */
/* ------------------------------------------------ */

router.get('/admin-flags', requireRootAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, employee_name, note, is_active, created_by, created_at, updated_at
       FROM employee_admin_flags
       ORDER BY is_active DESC, employee_name ASC`
    );
    res.json({ ok: true, flags: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/admin-flags', requireRootAdmin, async (req, res) => {
  try {
    const employeeName = String(req.body?.employee_name || '').trim();
    if (!employeeName) return res.status(400).json({ ok: false, error: 'Mitarbeitername erforderlich' });
    const note = String(req.body?.note || '').trim() || null;
    const isActive = req.body?.is_active !== false;
    const actor = req.user?.displayName || req.user?.email || req.user?.username || 'admin';
    const { rows } = await pool.query(
      `INSERT INTO employee_admin_flags (employee_name, note, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (employee_name) DO UPDATE SET
         note = EXCLUDED.note,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING id, employee_name, note, is_active, created_by, created_at, updated_at`,
      [employeeName, note, isActive, actor]
    );
    res.json({ ok: true, flag: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/admin-flags/:id', requireRootAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM employee_admin_flags WHERE id = $1 RETURNING id',
      [Number.parseInt(req.params.id, 10)]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Hinweis nicht gefunden' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* ROTATION RULES                                   */
/* ------------------------------------------------ */

router.get('/rotation-rules', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM shift_rotation_rules WHERE id=1');
    res.json({ ok: true, rules: rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/rotation-rules', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const { max_consecutive_same, max_consecutive_workdays, min_free_after_streak, night_to_early_forbidden, late_to_early_forbidden, min_hours_between_shifts, max_nights_per_month, max_weekends_per_month, weekend_rule, free_days_after_night, free_days_after_weekend, stability_priority, max_shift_type_changes_per_month, min_free_weekends_per_month, min_recovery_days_after_shift_change, night_next_workday, night_next_shift_code, late_before_night_required, short_night_mode_enabled, short_night_free_days_after } = req.body;
    if (Number(max_consecutive_same) < 1 || Number(max_consecutive_workdays) < 1) {
      return res.status(400).json({ ok: false, error: 'Die Grenzen für aufeinanderfolgende Schichten und Arbeitstage müssen mindestens 1 sein' });
    }
    const { rows } = await pool.query(
      `UPDATE shift_rotation_rules SET max_consecutive_same=$1, max_consecutive_workdays=$2, min_free_after_streak=$3, night_to_early_forbidden=$4, late_to_early_forbidden=$5, min_hours_between_shifts=$6, max_nights_per_month=$7, max_weekends_per_month=$8, weekend_rule=$9, free_days_after_night=$10, free_days_after_weekend=$11, stability_priority=$12, max_shift_type_changes_per_month=$13, min_free_weekends_per_month=$14, min_recovery_days_after_shift_change=$15, night_next_workday=$16, night_next_shift_code=$17, late_before_night_required=$18, short_night_mode_enabled=$19, short_night_free_days_after=$20, updated_at=NOW() WHERE id=1 RETURNING *`,
      [max_consecutive_same, max_consecutive_workdays, min_free_after_streak, night_to_early_forbidden, late_to_early_forbidden, min_hours_between_shifts, max_nights_per_month, max_weekends_per_month, weekend_rule, free_days_after_night, free_days_after_weekend, stability_priority, max_shift_type_changes_per_month, min_free_weekends_per_month, min_recovery_days_after_shift_change, Math.max(0, Math.min(6, Number.parseInt(night_next_workday, 10) || 0)), night_next_shift_code || null, Boolean(late_before_night_required), Boolean(short_night_mode_enabled), Math.max(0, Math.min(14, Number.parseInt(short_night_free_days_after, 10) || Number.parseInt(free_days_after_night, 10) || 2))]
    );
    res.json({ ok: true, rules: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* FAIRNESS RULES                                   */
/* ------------------------------------------------ */

router.get('/fairness-rules', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM shift_fairness_rules WHERE id=1');
    res.json({ ok: true, rules: rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/fairness-rules', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const { balance_nights, balance_weekends, balance_total_load, max_deviation_percent, fairness_vs_preference } = req.body;
    const { rows } = await pool.query(
      `UPDATE shift_fairness_rules SET balance_nights=$1, balance_weekends=$2, balance_total_load=$3, max_deviation_percent=$4, fairness_vs_preference=$5, updated_at=NOW() WHERE id=1 RETURNING *`,
      [balance_nights, balance_weekends, balance_total_load, max_deviation_percent, fairness_vs_preference]
    );
    res.json({ ok: true, rules: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* PLANNING CONFIG                                  */
/* ------------------------------------------------ */

router.get('/planning-config', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM shift_planning_config WHERE id=1');
    res.json({ ok: true, config: rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/planning-config', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const { respect_employee_wishes, hard_rules_priority, soft_wishes_priority, fairness_priority, admin_override_priority, monthly_target_hours, annual_target_hours } = req.body;
    const { rows } = await pool.query(
      `UPDATE shift_planning_config SET respect_employee_wishes=$1, hard_rules_priority=$2, soft_wishes_priority=$3, fairness_priority=$4, admin_override_priority=$5, monthly_target_hours=$6, annual_target_hours=$7, updated_at=NOW() WHERE id=1 RETURNING *`,
      [respect_employee_wishes, hard_rules_priority, soft_wishes_priority, fairness_priority, admin_override_priority, monthly_target_hours, annual_target_hours]
    );
    res.json({ ok: true, config: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* SHIFTPLAN EXCLUSIONS (separate from tickets)     */
/* ------------------------------------------------ */

router.get('/exclusions', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM shiftplan_exclusions WHERE is_active = TRUE ORDER BY created_at DESC'
    );
    res.json({ ok: true, exclusions: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/exclusions', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const { employee_name, reason, reason_text, fixed_shift_type } = req.body;
    if (!employee_name) return res.status(400).json({ ok: false, error: 'Mitarbeitername erforderlich' });
    const actor = req.user?.email || req.user?.username || 'system';
    const normalizedFixedShiftType = normalizeFixedShiftType(fixed_shift_type);
    const { rows } = await pool.query(
      `INSERT INTO shiftplan_exclusions (employee_name, reason, reason_text, fixed_shift_type, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [employee_name.trim(), reason || 'admin_override', reason_text || null, normalizedFixedShiftType, actor]
    );
    res.json({ ok: true, exclusion: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/exclusions/:id', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Ungültige ID' });

    const normalizedFixedShiftType = normalizeFixedShiftType(req.body?.fixed_shift_type);
    const nextReason = normalizedFixedShiftType ? 'fixed_shift' : (req.body?.reason || 'admin_override');
    const nextReasonText = req.body?.reason_text ?? null;

    const { rows } = await pool.query(
      `UPDATE shiftplan_exclusions
       SET reason = $1,
           reason_text = $2,
           fixed_shift_type = $3
       WHERE id = $4 AND is_active = TRUE
       RETURNING *`,
      [nextReason, nextReasonText, normalizedFixedShiftType, id]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Eintrag nicht gefunden' });
    res.json({ ok: true, exclusion: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/exclusions/:id', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Ungültige ID' });

    const actor = req.user?.email || req.user?.username || 'system';
    const { rows } = await pool.query(
      `UPDATE shiftplan_exclusions
       SET is_active = FALSE,
           deactivated_by = $2,
           deactivated_at = NOW()
       WHERE id = $1 AND is_active = TRUE
       RETURNING *`,
      [id, actor]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Eintrag nicht gefunden' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* EMPLOYEE PREFERENCES                             */
/* ------------------------------------------------ */

router.get('/employee-preferences', requireVerifiedIdentity, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Nicht autorisiert' });
    const [preferenceResult, canSelectBlockedDays] = await Promise.all([
      pool.query('SELECT * FROM employee_preferences WHERE user_id=$1', [userId]),
      canUseBlockedWeekdayPreferences(req.user),
    ]);
    const preference = preferenceResult.rows[0] || null;
    res.json({
      ok: true,
      canSelectBlockedDays,
      preferences: preference && !canSelectBlockedDays ? { ...preference, blocked_days: [] } : preference,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/employee-preferences/all', requirePageAccess('shiftplan_control', 'write'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ep.*, u.first_name, u.last_name, u.email FROM employee_preferences ep JOIN users u ON u.id = ep.user_id ORDER BY u.last_name, u.first_name`
    );
    res.json({ ok: true, preferences: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/employee-preferences', requireVerifiedIdentity, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Nicht autorisiert' });
    const { preferred_shifts, unwanted_shifts, preferred_holidays, max_nights_per_month, max_weekends_per_month, blocked_days, night_model } = req.body;
    const canSelectBlockedDays = await canUseBlockedWeekdayPreferences(req.user);
    // Half shifts are operational planning details, not employee-selectable preferences.
    // Filter them server-side as well so stale browser bundles cannot reintroduce them.
    const employeePreferenceExcludedShiftCodes = new Set(['HE1', 'HE2', 'HL1', 'HL2']);
    const sanitizeShiftCodes = (value) => Array.isArray(value)
      ? [...new Set(value.map((code) => String(code || '').trim().toUpperCase())
        .filter((code) => code && !employeePreferenceExcludedShiftCodes.has(code)))]
      : [];
    const parsedNightBlockLimit = Number.parseInt(String(max_nights_per_month ?? ''), 10);
    const maxNightShiftsPerMonth = Number.isInteger(parsedNightBlockLimit) && parsedNightBlockLimit > 0
      ? Math.min(parsedNightBlockLimit, 21)
      : null;
    const parsedWeekendBlockLimit = Number.parseInt(String(max_weekends_per_month ?? ''), 10);
    const maxWeekendBlocksPerMonth = Number.isInteger(parsedWeekendBlockLimit) && parsedWeekendBlockLimit > 0
      ? Math.min(parsedWeekendBlockLimit, 3)
      : null;
    const normalizedNightModel = String(night_model || 'SEVEN_DAY').trim().toUpperCase();
    if (!['SEVEN_DAY', 'SHORT'].includes(normalizedNightModel)) {
      return res.status(400).json({ ok: false, error: 'Ungültiges Nachtschicht-Modell' });
    }
    const sanitizedBlockedDays = canSelectBlockedDays && Array.isArray(blocked_days)
      ? [...new Set(blocked_days.map((day) => Number.parseInt(String(day), 10)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
      : [];
    const monthly_preferences = req.body.monthly_preferences && typeof req.body.monthly_preferences === 'object' && !Array.isArray(req.body.monthly_preferences)
      ? Object.fromEntries(Object.entries(req.body.monthly_preferences).filter(([key, value]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && value && typeof value === 'object').map(([key, value]) => [key, {
          preferred_shifts: sanitizeShiftCodes(value.preferred_shifts).slice(0, 20),
          unwanted_shifts: sanitizeShiftCodes(value.unwanted_shifts).slice(0, 20),
        }]))
      : {};

    const { rows } = await pool.query(
      `INSERT INTO employee_preferences (user_id, preferred_shifts, unwanted_shifts, preferred_holidays, max_nights_per_month, max_weekends_per_month, preferred_days, blocked_days, avoid_colleagues, workload_preference, notes, monthly_preferences, night_model, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb, $13, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         preferred_shifts = $2::jsonb,
         unwanted_shifts = $3::jsonb,
         preferred_holidays = $4::jsonb,
         max_nights_per_month = $5,
         max_weekends_per_month = $6,
         preferred_days = $7::jsonb,
         blocked_days = $8::jsonb,
         avoid_colleagues = $9::jsonb,
          workload_preference = $10,
          notes = employee_preferences.notes,
          monthly_preferences = $12::jsonb,
          night_model = $13,
          updated_at = NOW()
       RETURNING *`,
      [
        userId,
        JSON.stringify(sanitizeShiftCodes(preferred_shifts)),
        JSON.stringify(sanitizeShiftCodes(unwanted_shifts)),
        JSON.stringify(Array.isArray(preferred_holidays) ? preferred_holidays : []),
        maxNightShiftsPerMonth,
        maxWeekendBlocksPerMonth,
        JSON.stringify([]),
        JSON.stringify(sanitizedBlockedDays),
        JSON.stringify([]),
        'normal',
        null,
        JSON.stringify(monthly_preferences),
        normalizedNightModel,
      ]
    );
    res.json({ ok: true, preferences: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* TICKET PREFERENCES                               */
/* ------------------------------------------------ */

router.get('/ticket-preferences', requireVerifiedIdentity, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Nicht autorisiert' });
    const { rows } = await pool.query('SELECT * FROM ticket_preferences WHERE user_id=$1', [userId]);
    res.json({ ok: true, preferences: rows[0]?.preferences || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/ticket-preferences/all', requirePageAccess('shiftplan_control', 'write'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tp.*, u.first_name, u.last_name, u.email
       FROM ticket_preferences tp JOIN users u ON u.id = tp.user_id
       ORDER BY u.last_name, u.first_name`
    );
    res.json({ ok: true, preferences: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/ticket-preferences', requireVerifiedIdentity, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Nicht autorisiert' });

    // Validate and sanitise
    const prefs = req.body;
    if (!prefs || typeof prefs !== 'object') {
      return res.status(400).json({ ok: false, error: 'Ungültige Daten' });
    }

    const VALID_WILLINGNESS = ['always', 'preferred', 'neutral', 'avoid', 'never'];
    const VALID_CONFIDENCE  = ['beginner', 'basic', 'intermediate', 'advanced', 'expert'];
    const VALID_INTEREST    = ['none', 'low', 'medium', 'high'];
    const VALID_CATEGORIES  = ['smart_hands', 'cross_connect', 'trouble_ticket', 'deinstall', 'scheduled', 'flexible'];
    const VALID_WORKLOAD    = ['default', 'reduced', 'extended'];
    const VALID_INTENSITY   = ['low', 'normal', 'high'];
    const VALID_STABILITY   = ['stable', 'balanced', 'variety'];

    const validated = {
      preferred_category:            VALID_CATEGORIES.includes(prefs.preferred_category) ? prefs.preferred_category : '',
      secondary_category:            VALID_CATEGORIES.includes(prefs.secondary_category) ? prefs.secondary_category : '',
      avoid_categories:              Array.isArray(prefs.avoid_categories) ? prefs.avoid_categories.filter(c => VALID_CATEGORIES.includes(c)) : [],
      urgent_tt_willingness:         VALID_WILLINGNESS.includes(prefs.urgent_tt_willingness) ? prefs.urgent_tt_willingness : 'neutral',
      scheduled_work_willingness:    VALID_WILLINGNESS.includes(prefs.scheduled_work_willingness) ? prefs.scheduled_work_willingness : 'neutral',
      category_switch_willingness:   VALID_WILLINGNESS.includes(prefs.category_switch_willingness) ? prefs.category_switch_willingness : 'neutral',
      prefer_grouped_work:           !!prefs.prefer_grouped_work,
      prefer_variety_during_shift:   !!prefs.prefer_variety_during_shift,
      skill_confidence:              typeof prefs.skill_confidence === 'object' && prefs.skill_confidence
                                       ? Object.fromEntries(Object.entries(prefs.skill_confidence).filter(([k, v]) => VALID_CATEGORIES.includes(k) && VALID_CONFIDENCE.includes(v)))
                                       : {},
      training_interest:             typeof prefs.training_interest === 'object' && prefs.training_interest
                                       ? Object.fromEntries(Object.entries(prefs.training_interest).filter(([k, v]) => VALID_CATEGORIES.includes(k) && VALID_INTEREST.includes(v)))
                                       : {},
      can_mentor:                    Array.isArray(prefs.can_mentor) ? prefs.can_mentor.filter(c => VALID_CATEGORIES.includes(c)) : [],
      needs_mentoring:               Array.isArray(prefs.needs_mentoring) ? prefs.needs_mentoring.filter(c => VALID_CATEGORIES.includes(c)) : [],
      weekly_workload:               VALID_WORKLOAD.includes(prefs.weekly_workload) ? prefs.weekly_workload : 'default',
      overtime_willingness:          VALID_WILLINGNESS.includes(prefs.overtime_willingness) ? prefs.overtime_willingness : 'neutral',
      last_minute_willingness:       VALID_WILLINGNESS.includes(prefs.last_minute_willingness) ? prefs.last_minute_willingness : 'neutral',
      absence_cover_willingness:     VALID_WILLINGNESS.includes(prefs.absence_cover_willingness) ? prefs.absence_cover_willingness : 'neutral',
      preferred_intensity:           VALID_INTENSITY.includes(prefs.preferred_intensity) ? prefs.preferred_intensity : 'normal',
      stability_vs_variety:          VALID_STABILITY.includes(prefs.stability_vs_variety) ? prefs.stability_vs_variety : 'balanced',
    };

    const { rows } = await pool.query(
      `INSERT INTO ticket_preferences (user_id, preferences, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET preferences = $2, updated_at = NOW()
       RETURNING *`,
      [userId, JSON.stringify(validated)]
    );

    res.json({ ok: true, preferences: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
