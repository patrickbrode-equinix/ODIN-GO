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

/* ------------------------------------------------ */
/* SHIFT DEFINITIONS                                */
/* ------------------------------------------------ */

router.get('/definitions', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM shift_definitions ORDER BY sort_order, code');
    res.json({ ok: true, definitions: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/definitions/:id', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const { name, short_name, shift_type, start_time, end_time, start_day_offset, end_day_offset, duration_hours, series_days, min_staff, max_staff, color_hex, is_active, sort_order, applicable_days } = req.body;
    const id = parseInt(req.params.id);
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
    const { code, name, short_name, shift_type, start_time, end_time, start_day_offset, end_day_offset, duration_hours, series_days, min_staff, max_staff, color_hex, sort_order, applicable_days } = req.body;
    if (!code || !name) return res.status(400).json({ ok: false, error: 'Code und Name erforderlich' });
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
      `SELECT id, shift_code, employee_name, monthly_max_assignments, sort_order, is_active
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
      await client.query(
        `INSERT INTO shift_special_pools (shift_code, employee_name, monthly_max_assignments, sort_order, is_active)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [shiftCode, employeeName, monthlyMaxAssignments, index]
      );
    }

    const { rows } = await client.query(
      `SELECT id, shift_code, employee_name, monthly_max_assignments, sort_order, is_active
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
    const { max_consecutive_same, max_consecutive_workdays, min_free_after_streak, night_to_early_forbidden, late_to_early_forbidden, min_hours_between_shifts, max_nights_per_month, max_weekends_per_month, weekend_rule, free_days_after_night, free_days_after_weekend, stability_priority, max_shift_type_changes_per_month, min_free_weekends_per_month, min_recovery_days_after_shift_change, night_next_workday, night_next_shift_code, late_before_night_required } = req.body;
    const { rows } = await pool.query(
      `UPDATE shift_rotation_rules SET max_consecutive_same=$1, max_consecutive_workdays=$2, min_free_after_streak=$3, night_to_early_forbidden=$4, late_to_early_forbidden=$5, min_hours_between_shifts=$6, max_nights_per_month=$7, max_weekends_per_month=$8, weekend_rule=$9, free_days_after_night=$10, free_days_after_weekend=$11, stability_priority=$12, max_shift_type_changes_per_month=$13, min_free_weekends_per_month=$14, min_recovery_days_after_shift_change=$15, night_next_workday=$16, night_next_shift_code=$17, late_before_night_required=$18, updated_at=NOW() WHERE id=1 RETURNING *`,
      [max_consecutive_same, max_consecutive_workdays, min_free_after_streak, night_to_early_forbidden, late_to_early_forbidden, min_hours_between_shifts, max_nights_per_month, max_weekends_per_month, weekend_rule, free_days_after_night, free_days_after_weekend, stability_priority, max_shift_type_changes_per_month, min_free_weekends_per_month, min_recovery_days_after_shift_change, Math.max(0, Math.min(6, Number.parseInt(night_next_workday, 10) || 0)), night_next_shift_code || null, Boolean(late_before_night_required)]
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
    const { rows } = await pool.query('SELECT * FROM employee_preferences WHERE user_id=$1', [userId]);
    res.json({ ok: true, preferences: rows[0] || null });
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
    const { preferred_shifts, unwanted_shifts, preferred_holidays, max_nights_per_month, preferred_days, blocked_days, workload_preference, notes } = req.body;
    const monthly_preferences = req.body.monthly_preferences && typeof req.body.monthly_preferences === 'object' && !Array.isArray(req.body.monthly_preferences)
      ? Object.fromEntries(Object.entries(req.body.monthly_preferences).filter(([key, value]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && value && typeof value === 'object').map(([key, value]) => [key, {
          preferred_shifts: Array.isArray(value.preferred_shifts) ? value.preferred_shifts.map(String).slice(0, 20) : [],
          unwanted_shifts: Array.isArray(value.unwanted_shifts) ? value.unwanted_shifts.map(String).slice(0, 20) : [],
        }]))
      : {};

    const validateArray = (value) => (Array.isArray(value) ? value : []);

    const { rows } = await pool.query(
      `INSERT INTO employee_preferences (user_id, preferred_shifts, unwanted_shifts, preferred_holidays, max_nights_per_month, preferred_days, blocked_days, avoid_colleagues, workload_preference, notes, monthly_preferences, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         preferred_shifts = $2::jsonb,
         unwanted_shifts = $3::jsonb,
         preferred_holidays = $4::jsonb,
         max_nights_per_month = $5,
         preferred_days = $6::jsonb,
         blocked_days = $7::jsonb,
         avoid_colleagues = $8::jsonb,
          workload_preference = $9,
          notes = $10,
          monthly_preferences = $11::jsonb,
          updated_at = NOW()
       RETURNING *`,
      [
        userId,
        JSON.stringify(validateArray(preferred_shifts)),
        JSON.stringify(validateArray(unwanted_shifts)),
        JSON.stringify(validateArray(preferred_holidays)),
        max_nights_per_month || null,
        JSON.stringify(validateArray(preferred_days)),
        JSON.stringify(validateArray(blocked_days)),
        JSON.stringify([]),
        workload_preference || 'normal',
         notes || null,
         JSON.stringify(monthly_preferences),
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
