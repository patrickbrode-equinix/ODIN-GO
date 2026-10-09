/* ================================================ */
/* Understaffing suggestions                        */
/* GET /api/shiftplan-control/understaffing-        */
/*     suggestions?year=YYYY&month=M                */
/* ================================================ */

import express from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePageAccess } from '../middleware/requirePageAccess.js';
import { ensureShiftplanSchema } from '../lib/ensureShiftplanSchema.js';
import { parseMonthLabel } from '../lib/monthParser.js';
import { buildHessenHolidayMap } from '../lib/hessenHolidays.js';
import {
  buildEmployeeNameLookup,
  resolveEmployeeName,
} from '../lib/employeeNameResolution.js';
import {
  normalizeExclusionWeekdays,
  normalizePlanningShiftTypeKey,
} from '../lib/shiftplanGeneration.js';
import { computeUnderstaffingSuggestions } from '../lib/understaffingSuggestions.js';
import { parsePreferenceStrengths } from '../lib/preferenceStrength.js';
import { normalizeShortNightSeriesDays } from '../lib/shiftDefinitionInput.js';

const router = express.Router();

function pad2(value) {
  return String(value).padStart(2, '0');
}

// Today's calendar date in Europe/Berlin as YYYY-MM-DD.
function berlinTodayKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftMonth(year, month, delta) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function monthKeyOf(year, month) {
  return `${year}-${pad2(month)}`;
}

router.get(
  '/understaffing-suggestions',
  requireAuth,
  requirePageAccess('shiftplan', 'view'),
  async (req, res) => {
    const year = Number.parseInt(String(req.query.year ?? ''), 10);
    const month = Number.parseInt(String(req.query.month ?? ''), 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ ok: false, error: 'Ungültige Parameter: year (2000-2100) und month (1-12) erforderlich' });
    }

    try {
      await ensureShiftplanSchema();

      const previous = shiftMonth(year, month, -1);
      const next = shiftMonth(year, month, 1);
      const currentKey = monthKeyOf(year, month);
      const previousKey = monthKeyOf(previous.year, previous.month);
      const nextKey = monthKeyOf(next.year, next.month);
      const numDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const monthStart = `${currentKey}-01`;
      const monthEnd = `${currentKey}-${pad2(numDays)}`;

      /* ---- live shifts of previous / current / next month ---- */
      const yearPatterns = [...new Set([previous.year, year, next.year])].map((value) => `%${value}%`);
      const shiftRes = await pool.query(
        `SELECT month, employee_name, day, shift_code
           FROM shifts
          WHERE month LIKE ANY($1::text[])`,
        [yearPatterns],
      );
      const rowsByMonth = new Map([[currentKey, []], [previousKey, []], [nextKey, []]]);
      for (const row of shiftRes.rows) {
        const parsed = parseMonthLabel(String(row.month || ''));
        if (!parsed) continue;
        const key = monthKeyOf(parsed.year, parsed.month);
        if (rowsByMonth.has(key)) rowsByMonth.get(key).push(row);
      }

      // Names of the requested month win when aliases collide, so the returned
      // names match the month the user is looking at.
      const nameOrder = [];
      for (const key of [currentKey, previousKey, nextKey]) {
        for (const row of rowsByMonth.get(key)) nameOrder.push(row.employee_name);
      }
      const nameLookup = buildEmployeeNameLookup(
        [...new Set(nameOrder.map((name) => resolveEmployeeName(name, null)).filter(Boolean))],
      );
      const buildSchedule = (key) => {
        const schedule = {};
        for (const row of rowsByMonth.get(key)) {
          const employee = resolveEmployeeName(row.employee_name, nameLookup);
          const day = Number.parseInt(String(row.day ?? ''), 10);
          if (!employee || !Number.isInteger(day) || day < 1 || day > 31) continue;
          if (!schedule[employee]) schedule[employee] = {};
          schedule[employee][day] = String(row.shift_code || '').trim();
        }
        return schedule;
      };
      const schedule = buildSchedule(currentKey);
      const prevMonthSchedule = buildSchedule(previousKey);
      const nextMonthSchedule = buildSchedule(nextKey);

      /* ---- configuration ---- */
      const definitionRes = await pool.query(
        'SELECT * FROM shift_definitions WHERE is_active = TRUE ORDER BY sort_order, code',
      );
      const staffingRes = await pool.query('SELECT * FROM staffing_rules');
      const dayLimitRes = await pool.query('SELECT day_context, shift_type, min_count, max_count FROM staffing_day_limits').catch(() => ({ rows: [] }));
      const rotationRes = await pool.query('SELECT * FROM shift_rotation_rules WHERE id=1');
      const planningRes = await pool.query('SELECT respect_employee_wishes FROM shift_planning_config WHERE id=1');
      const wellbeingRes = await pool.query("SELECT * FROM wellbeing_config WHERE scope = 'global'");
      const blockedDaysRes = await pool.query(
        "SELECT value FROM app_settings WHERE key = 'shiftplan.blocked_days_enabled' LIMIT 1",
      );

      const strengthRes = await pool.query(
        "SELECT key, value FROM app_settings WHERE key LIKE 'shiftplan.pref_strength.%'",
      );
      const prefStrength = parsePreferenceStrengths(strengthRes.rows);
      const shortNightDefinition = definitionRes.rows.find((row) => String(row.code || '').trim().toUpperCase() === 'NK');
      const shortNightSeriesDays = normalizeShortNightSeriesDays(shortNightDefinition?.series_days, 3);

      const respectWishes = planningRes.rows[0] ? planningRes.rows[0].respect_employee_wishes !== false : true;
      const blockedDaysEnabled = String(blockedDaysRes.rows[0]?.value ?? 'false') === 'true';

      /* ---- employee preferences (name-resolved like the generator) ---- */
      const preferenceRes = await pool.query(
        `SELECT ep.*, u.first_name, u.last_name
           FROM employee_preferences ep
           JOIN users u ON u.id = ep.user_id`,
      );
      const preferencesByEmployee = {};
      for (const row of preferenceRes.rows) {
        const employee = resolveEmployeeName([row.first_name, row.last_name].filter(Boolean).join(' '), nameLookup);
        if (!employee) continue;
        preferencesByEmployee[employee] = row;
      }

      /* ---- absences ---- */
      const absenceRes = await pool.query(
        `SELECT employee_name,
                to_char(start_date, 'YYYY-MM-DD') AS start_date,
                to_char(end_date, 'YYYY-MM-DD') AS end_date,
                type
           FROM absences
          WHERE start_date <= $1 AND end_date >= $2`,
        [monthEnd, monthStart],
      );
      const absences = absenceRes.rows
        .map((row) => ({ ...row, employee_name: resolveEmployeeName(row.employee_name, nameLookup) }))
        .filter((row) => row.employee_name);

      /* ---- exclusions (same semantics as the generator) ---- */
      const exclusionRes = await pool.query(
        'SELECT employee_name, fixed_shift_type, weekdays FROM shiftplan_exclusions WHERE is_active = TRUE',
      );
      const excluded = new Set();
      const fixedShiftTypeByEmployee = {};
      const blockedWeekdaysByEmployee = {};
      for (const row of exclusionRes.rows) {
        const employee = resolveEmployeeName(row.employee_name, nameLookup);
        if (!employee) continue;
        const fixedShiftType = normalizePlanningShiftTypeKey(row.fixed_shift_type);
        const ruleWeekdays = normalizeExclusionWeekdays(row.weekdays);
        const coversWholeWeek = ruleWeekdays.length === 7;
        if (fixedShiftType) {
          if (!excluded.has(employee)) {
            fixedShiftTypeByEmployee[employee] = fixedShiftType;
            if (!coversWholeWeek) {
              blockedWeekdaysByEmployee[employee] = [0, 1, 2, 3, 4, 5, 6].filter((weekday) => !ruleWeekdays.includes(weekday));
            }
          }
          continue;
        }
        if (!coversWholeWeek) {
          blockedWeekdaysByEmployee[employee] = ruleWeekdays;
          continue;
        }
        excluded.add(employee);
        delete fixedShiftTypeByEmployee[employee];
        delete blockedWeekdaysByEmployee[employee];
      }
      const assignmentExclusionRes = await pool.query(
        `SELECT employee_name
           FROM assignment_employee_exclusions
          WHERE is_active = TRUE
            AND (valid_from IS NULL OR valid_from <= $1)
            AND (valid_to IS NULL OR valid_to >= $2)`,
        [monthEnd, monthStart],
      );
      for (const row of assignmentExclusionRes.rows) {
        const employee = resolveEmployeeName(row.employee_name, nameLookup);
        if (employee) excluded.add(employee);
      }

      const items = computeUnderstaffingSuggestions({
        year,
        month,
        today: berlinTodayKey(),
        definitions: definitionRes.rows,
        staffingRules: staffingRes.rows,
        staffingDayLimits: dayLimitRes.rows,
        schedule,
        prevMonthSchedule,
        nextMonthSchedule,
        preferencesByEmployee,
        absences,
        rotationRules: rotationRes.rows[0] || null,
        wellbeingConfig: wellbeingRes.rows[0] || null,
        holidayMap: buildHessenHolidayMap(year),
        respectWishes,
        blockedDaysEnabled,
        exclusions: { excluded: [...excluded], blockedWeekdaysByEmployee },
        fixedShiftTypeByEmployee,
        prefStrength,
        shortNightSeriesDays,
      });

      return res.json({ ok: true, items });
    } catch (error) {
      console.error('[UNDERSTAFFING SUGGESTIONS] failed:', error);
      return res.status(500).json({ ok: false, error: 'Unterbesetzungs-Vorschläge konnten nicht berechnet werden' });
    }
  },
);

export default router;
