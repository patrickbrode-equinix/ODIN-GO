/* ================================================ */
/* Shiftplan Control Center – API Routes            */
/* Draft generation, conflicts, Excel, activation   */
/* DETERMINISTIC, rule-based planning engine         */
/* ================================================ */

import express from 'express';
import { requireAuth, requireVerifiedIdentity } from '../middleware/authMiddleware.js';
import { requirePageAccess } from '../middleware/requirePageAccess.js';
import pool from '../db.js';
import { applyActiveShiftModes } from '../lib/shiftModes.js';
import { config } from '../config/index.js';
import ExcelJS from 'exceljs';
import { assertPlanningYear, getPlanningMonths, groupPlanningDrafts, normalizeMetaText, sanitizeCellText, buildDraftSheetHeaderText, MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH } from '../lib/planningPeriods.js';
import { generatePeriodDrafts } from '../services/planningPeriodDrafts.js';
import { recomputeConstraintsInternal } from './constraints.js';
import { syncEmployeeContacts } from '../lib/employeeContactsSync.js';
import { provisionUsersFromShiftplan } from '../services/shiftUserProvisioning.service.js';
import { ensureShiftplanSchema } from '../lib/ensureShiftplanSchema.js';
import {
  formatShiftMonthLabel,
  monthLabelMatchesYear,
  parseDraftMonthId,
} from '../lib/shiftplanMonth.js';
import { parseMonthLabel } from '../lib/monthParser.js';
import { countWeekdaysInRange, getHolidayAdjustedShiftHours, getWorkdayBasedTargetHours } from '../lib/shiftHours.js';
import {
  applyWeekendBlockSlots,
  getVarietyAdjustment,
  getVarietyJitter,
  VARIETY_SEED_MIN_PRIORITY,
  normalizeVarietyPriority,
  buildDailyShiftSlots,
  buildShiftSlots,
  buildStaffingRulesByShiftType,
  buildStaffingMaximumsByShiftType,
  normalizeExclusionWeekdays,
  applyFixedShiftSeriesPattern,
  canStartShiftSeries,
  getShiftContinuityAdjustment,
  keepsShiftTypeCohesion,
  getDeterministicRotationRank,
  getExclusivePreferredShiftType,
  getPreferenceShiftCode,
  isShiftPreferredByEmployeePreference,
  isShiftBlockedByEmployeePreference,
  getTargetHoursScore,
  getShiftSeriesDays,
  getShiftDurationHours,
  getMonthBoundarySeriesRemaining,
  getNightSeriesDaysForModel,
  resolveNightFillTarget,
  isDayBlockedByEmployeePreference,
  isDbsRosterWeekday,
  isNightShiftRefused,
  NIGHT_MODELS,
  NIGHT_PLANNING_MODES,
  normalizeNightPlanningMode,
  resolveEmployeeNightModel,
  normalizePreferenceDayValues,
  isShiftDefinitionDraftPlannable,
  normalizePlanningShiftTypeKey,
  rankSafeSubstituteCandidates,
} from '../lib/shiftplanGeneration.js';
import { getHolidayShiftStaffingLimit, normalizeHolidayStaffingConfig } from '../lib/holidayPreferences.js';
import { buildHessenHolidayMap, buildBankHolidayMap, toIsoDate } from '../lib/hessenHolidays.js';
import { WISH_STATUS, evaluateMonthWishes } from '../lib/wishFulfillment.js';
import { mergeMonthlyPreferences } from '../lib/understaffingSuggestions.js';
import { isRamadanDate } from '../lib/ramadan.js';
import { notifyPlanActivated } from '../lib/planNotifications.js';
import { buildDayLimitMap, buildStaffingForContext, describeStaffingSettings, resolveStaffingDayContext } from '../lib/staffingLimits.js';
import {
  buildEmployeeNameLookup,
  findEmployeeName,
  normalizeEmployeeName,
  resolveAbsenceEmployeeName,
  resolveEmployeeName,
} from '../lib/employeeNameResolution.js';
import { loadWishSettings } from '../lib/wishSettings.js';
import { alignPreferredColleagues } from '../lib/colleagueAlignment.js';
import { buildCostControl, buildHolidayDistribution, focusCostControl } from '../lib/costControl.js';
import { buildShiftDistribution, DISTRIBUTION_LABELS, DISTRIBUTION_SEGMENTS, isWorkedShiftCode } from '../lib/shiftDistribution.js';
import { planWeekCodes } from '../lib/weekConsistency.js';
import { loadDoNotPlanKeys, isDoNotPlan, stripDoNotPlan } from '../lib/doNotPlan.js';
import { applyEnterpriseLayout, buildOverviewSheet, OVERVIEW_SHEET_NAME, WORKBOOK_TITLE } from '../lib/excelEnterprise.js';
import { PERSONAL_AVOID_KEY_PREFIX, PERSONAL_AVOID_RULE, mayKeepPersonalAvoidList, requiresFullWeekend, isHolidayFavored, isNightFavored, NIGHT_FAVORED_WEIGHT, getNeverTogetherRule, getTogetherPartners, isNightTeamMember, isWeekdayOnlyEmployee, violatesNeverTogether, WEEKEND_WEEKDAYS } from '../lib/fixedEmployeeRules.js';
import { buildColoRolePlan, coloNameKey, getColoTaskRequirements, isColoAllowedByRule, isColoCoveredByDbs, normalizeColoPlanningConfig } from '../lib/coloPlanning.js';
import {
  PREFERENCE_STRENGTH_KEY_PREFIX,
  evaluateShiftWishViolations,
  isHardStrength,
  isIgnoredStrength,
  parsePreferenceStrengths,
  scaleBonus,
  softPenalty,
  strengthFactor,
} from '../lib/preferenceStrength.js';

const COLO_ROLE_AUTHOR = 'Colo-Planung';

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

/* ------------------------------------------------ */
/* SHIFT CODES & HELPERS                            */
/* ------------------------------------------------ */

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function isWeekend(year, month, day) {
  const d = new Date(year, month - 1, day);
  return d.getDay() === 0 || d.getDay() === 6;
}

function dayOfWeek(year, month, day) {
  return new Date(year, month - 1, day).getDay(); // 0=Sun, 6=Sat
}

function getAuthenticatedUserId(req) {
  const userId = Number.parseInt(String(req.user?.id ?? ''), 10);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

// Drafts are a shared team resource: every user with page access can read and vote on
// all drafts. Changing or deleting one is limited to its creator and administrators.
function isAdminRequest(req) {
  return req.user?.is_admin === true || req.user?.is_root === true || req.isRoot === true;
}

async function loadDraftGuard(req, res, next, { requireOwner }) {
  try {
    const draftId = Number.parseInt(req.params.id ?? req.params.draftId, 10);
    if (!Number.isInteger(draftId) || draftId <= 0) {
      return res.status(400).json({ ok: false, error: 'Ungültige Draft-ID' });
    }
    const result = await pool.query('SELECT created_by_user_id FROM shiftplan_drafts WHERE id = $1', [draftId]);
    if (!result.rowCount) {
      return res.status(404).json({ ok: false, error: 'Draft nicht gefunden' });
    }
    if (requireOwner && !isAdminRequest(req)) {
      const userId = getAuthenticatedUserId(req);
      if (!userId || Number(result.rows[0].created_by_user_id) !== userId) {
        return res.status(403).json({ ok: false, error: 'Nur der Ersteller oder ein Administrator darf diesen Draft ändern' });
      }
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

const requireReadableDraft = (req, res, next) => loadDraftGuard(req, res, next, { requireOwner: false });
const requireOwnedDraft = (req, res, next) => loadDraftGuard(req, res, next, { requireOwner: true });

// easterSunday / addDays / toIsoDate / buildHessenHolidayMap live in lib/hessenHolidays.js.

function parseBooleanAppSetting(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return fallback;
}

function parseNumberAppSetting(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeWeekdaySetting(value, fallback = [1, 2, 3, 4, 5]) {
  if (Array.isArray(value)) {
    return [...new Set(value
      .map((entry) => Number.parseInt(String(entry), 10))
      .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6))];
  }

  if (typeof value === 'string') {
    try {
      return normalizeWeekdaySetting(JSON.parse(value), fallback);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function parseTargetHoursValue(value, fallback = 174) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : fallback;
}

function getAnchoredSeriesDays(shiftDef, dayOfWeekIndex) {
  const configuredSeriesDays = getShiftSeriesDays(shiftDef);
  const typeKey = normalizePlanningShiftTypeKey(shiftDef?.shift_type);

  if (configuredSeriesDays <= 1) return configuredSeriesDays;
  if (!['early', 'late', 'night', 'special'].includes(typeKey || '')) return configuredSeriesDays;
  if (dayOfWeekIndex === 1) return configuredSeriesDays;

  const applicableDays = new Set(normalizeWeekdaySetting(shiftDef?.applicable_days, [0, 1, 2, 3, 4, 5, 6]));
  let partialSeriesDays = 0;
  for (let offset = 0; offset < configuredSeriesDays; offset++) {
    const currentDayOfWeek = (dayOfWeekIndex + offset) % 7;
    if (offset > 0 && currentDayOfWeek === 1) break;
    if (!applicableDays.has(currentDayOfWeek)) break;
    partialSeriesDays += 1;
  }
  return Math.max(partialSeriesDays, 1);
}

function getWeekendBlockKey(year, month, day) {
  const date = new Date(year, month - 1, day);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toIsoDate(monday);
}

// Monday key ("2027-01-04") -> running week number, to measure the distance between two worked weekends.
function weekendKeyToWeekIndex(key) {
  const time = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(time) ? Math.round(time / (7 * 86400000)) : null;
}

function countWeekendBlocks(year, month, numDays) {
  const keys = new Set();
  for (let day = 1; day <= numDays; day++) {
    if (isWeekend(year, month, day)) keys.add(getWeekendBlockKey(year, month, day));
  }
  return keys.size;
}

function getPlannedWeekendBlockKey(year, month, day, definition, numDays) {
  const applicableDays = new Set(normalizeWeekdaySetting(definition?.applicable_days, []));
  if (!applicableDays.has(6) && !applicableDays.has(0)) return null;

  const seriesDays = Math.min(getShiftSeriesDays(definition), Math.max(numDays - day + 1, 0));
  for (let offset = 0; offset < seriesDays; offset++) {
    const plannedDay = day + offset;
    const plannedDate = new Date(year, month - 1, plannedDay);
    if (applicableDays.has(plannedDate.getDay()) && (plannedDate.getDay() === 6 || plannedDate.getDay() === 0)) {
      return getWeekendBlockKey(year, month, plannedDay);
    }
  }
  return null;
}

// Sum of (actual - official target) hours per employee over the earlier months of the same year, taken from
// the latest saved draft of each month (an activated draft wins). Used when a plan is generated without a
// previous result in the same run (single month, or the first month of a quarter).
async function loadYearToDateHourBalances({ year, month, employees, employeeNameLookup }) {
  const balances = new Map();
  if (month <= 1) return balances;
  const employeeSet = new Set(employees);
  try {
    const first = `${year}-01`;
    const current = `${year}-${String(month).padStart(2, '0')}`;
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (month) month, fairness
         FROM shiftplan_drafts
        WHERE month >= $1 AND month < $2 AND status <> 'failed'
        ORDER BY month, (status = 'activated') DESC, version DESC`,
      [first, current]
    );
    for (const row of rows) {
      const fairness = typeof row.fairness === 'string' ? JSON.parse(row.fairness) : (row.fairness || {});
      for (const [name, entry] of Object.entries(fairness)) {
        const employee = resolveEmployeeName(name, employeeNameLookup);
        if (!employee || !employeeSet.has(employee)) continue;
        const delta = Number(entry?.actualHours) - Number(entry?.targetHours);
        if (Number.isFinite(delta)) balances.set(employee, (balances.get(employee) || 0) + delta);
      }
    }
  } catch (error) {
    console.warn('Year-to-date hour balance unavailable:', error.message);
  }
  return balances;
}

// Seed that makes every generated draft look different when the variety slider is high (see getVarietyJitter).
function newVarietySeed() {
  return Math.floor(Math.random() * 1_000_000) + 1;
}

// Absence markers that can stand in an existing plan (live plan or quarter / year draft) instead of in the absences table.
// code -> absence type used by the generator (credited types give 8 h on weekdays).
// FS (free marker of a default plan) is NOT an absence: it must never block days in the new plan.
const PLAN_ABSENCE_CODES = Object.freeze({ ABW: 'VACATION', URLAUB: 'VACATION', KRANK: 'SICK', S: 'SICK', SEMINAR: 'TRAINING' });

/**
 * Absences that are already planned as codes (ABW, SEMINAR, URLAUB, KRANK, S, FS) in the live plan or in the newest draft of the
 * month. The generator keeps them as they are and plans only before and after them. Returns [{ employee_name, day, code }].
 */
async function loadPlannedAbsenceCodes({ year, month, employeeNameLookup }) {
  const monthLabel = formatShiftMonthLabel(year, month);
  const monthId = `${year}-${String(month).padStart(2, '0')}`;
  const found = new Map();
  const take = (name, day, code) => {
    const normalized = String(code || '').trim().toUpperCase();
    if (!PLAN_ABSENCE_CODES[normalized]) return;
    const employee = resolveEmployeeName(name, employeeNameLookup);
    const dayNumber = Number.parseInt(String(day ?? ''), 10);
    if (!employee || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) return;
    found.set(`${employee}|${dayNumber}`, { employee_name: employee, day: dayNumber, code: normalized });
  };
  try {
    const { rows } = await pool.query(
      `SELECT month, employee_name, day, shift_code
         FROM shifts WHERE (month = $1 OR month = $2) AND day >= $3
        ORDER BY employee_name, day`,
      [monthLabel, monthId, 1]
    );
    for (const row of rows) take(row.employee_name, row.day, row.shift_code);
  } catch (error) {
    console.warn('Planned absences of the live plan unavailable:', error.message);
  }
  try {
    const { rows } = await pool.query(
      `SELECT shifts_json FROM shiftplan_drafts WHERE month = $1 AND status <> 'failed'
        ORDER BY (status = 'activated') DESC, version DESC
        LIMIT 1`,
      [monthId]
    );
    const draftShifts = typeof rows[0]?.shifts_json === 'string' ? JSON.parse(rows[0].shifts_json) : rows[0]?.shifts_json;
    for (const entry of Array.isArray(draftShifts) ? draftShifts : []) take(entry?.employee_name, entry?.day, entry?.shift_code);
  } catch (error) {
    console.warn('Planned absences of the latest draft unavailable:', error.message);
  }
  // A default plan often marks every weekend with an absence-like code. Weekend cells only count when the run of
  // absence cells they belong to also contains a weekday (a real absence from Friday to Monday, a vacation week ...).
  const byEmployee = new Map();
  for (const entry of found.values()) {
    if (!byEmployee.has(entry.employee_name)) byEmployee.set(entry.employee_name, new Set());
    byEmployee.get(entry.employee_name).add(entry.day);
  }
  const isWeekendDay = (day) => { const weekday = new Date(year, month - 1, day).getDay(); return weekday === 0 || weekday === 6; };
  const kept = [];
  for (const entry of found.values()) {
    if (!isWeekendDay(entry.day)) { kept.push(entry); continue; }
    const days = byEmployee.get(entry.employee_name);
    let touchesWeekday = false;
    for (const direction of [-1, 1]) {
      for (let day = entry.day + direction; days.has(day); day += direction) {
        if (!isWeekendDay(day)) { touchesWeekday = true; break; }
      }
      if (touchesWeekday) break;
    }
    if (touchesWeekday) kept.push(entry);
  }
  return kept;
}

/**
 * Bank-holiday shifts every employee already worked earlier in the same year (from the activated / newest draft of
 * each earlier month). Used to spread the holidays evenly over the year. Returns Map(employee -> count).
 */
async function loadYearHolidayShiftCounts({ year, month, employeeNameLookup, employees }) {
  const counts = new Map();
  if (month <= 1) return counts;
  const months = Array.from({ length: month - 1 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (month) month, shifts_json FROM shiftplan_drafts
        WHERE month = ANY($1::text[]) AND status <> 'failed'
        ORDER BY month, (status = 'activated') DESC, version DESC`,
      [months]
    );
    const employeeSet = new Set(employees);
    const bankHolidays = buildBankHolidayMap(year);
    for (const row of Array.isArray(rows) ? rows : []) {
      const shifts = typeof row.shifts_json === 'string' ? JSON.parse(row.shifts_json) : row.shifts_json;
      for (const shift of Array.isArray(shifts) ? shifts : []) {
        const code = String(shift?.shift_code || '').trim().toUpperCase();
        if (!code || ['FS', 'S', 'URL', 'K', 'KR'].includes(code)) continue;
        if (!bankHolidays[`${row.month}-${String(Number(shift.day)).padStart(2, '0')}`]) continue;
        const employee = resolveEmployeeName(shift.employee_name, employeeNameLookup);
        if (!employee || !employeeSet.has(employee)) continue;
        counts.set(employee, (counts.get(employee) || 0) + 1);
      }
    }
  } catch (error) {
    console.warn('Holiday history unavailable for the fair distribution:', error.message);
  }
  return counts;
}

async function loadPreviousMonthShiftCarryState({ year, month, employees, shiftDefinitions, employeeNameLookup, rotation = {} }) {
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousMonthLabel = formatShiftMonthLabel(previousYear, previousMonth);
  const previousMonthId = `${previousYear}-${String(previousMonth).padStart(2, '0')}`;
  const previousMonthDays = daysInMonth(previousYear, previousMonth);
  const currentMonthStartDow = dayOfWeek(year, month, 1);
  const definitionByCode = new Map(
    shiftDefinitions.map((definition) => [String(definition.code || '').trim().toUpperCase(), definition])
  );
  const employeeSet = new Set(employees);

  const lookbackFromDay = Math.max(previousMonthDays - 13, 1);
  let { rows } = await pool.query(
    `SELECT month, employee_name, day, shift_code
       FROM shifts
      WHERE (month = $1 OR month = $2)
        AND day >= $3
      ORDER BY employee_name, day`,
    [previousMonthLabel, previousMonthId, lookbackFromDay]
  );
  // The previous month is not in the live plan yet (e.g. March while April is planned): use its draft
  // (activated first, then the newest version) so the transition between the months is still respected.
  if (rows.length === 0) {
    try {
      const { rows: draftRows } = await pool.query(
        `SELECT shifts_json FROM shiftplan_drafts
          WHERE month = $1 AND status <> 'failed'
          ORDER BY (status = 'activated') DESC, version DESC
          LIMIT 1`,
        [previousMonthId]
      );
      const draftShifts = typeof draftRows[0]?.shifts_json === 'string' ? JSON.parse(draftRows[0].shifts_json) : draftRows[0]?.shifts_json;
      rows = (Array.isArray(draftShifts) ? draftShifts : [])
        .filter((entry) => Number(entry?.day) >= lookbackFromDay)
        .map((entry) => ({ month: previousMonthId, employee_name: entry.employee_name, day: entry.day, shift_code: entry.shift_code }));
    } catch (error) {
      console.warn('Previous month draft unavailable for the carry-over:', error.message);
    }
  }

  const rowsByEmployee = new Map();
  for (const row of rows) {
    const employeeName = resolveEmployeeName(row.employee_name, employeeNameLookup);
    if (!employeeName || !employeeSet.has(employeeName)) continue;
    if (!rowsByEmployee.has(employeeName)) rowsByEmployee.set(employeeName, []);
    rowsByEmployee.get(employeeName).push({
      day: Number.parseInt(String(row.day ?? ''), 10),
      code: String(row.shift_code || '').trim().toUpperCase(),
    });
  }

  const carry = {};
  for (const employee of employees) {
    // Only real shifts count as work; free markers such as FS or absence codes break the streak.
    const employeeRows = (rowsByEmployee.get(employee) || [])
      .filter((row) => Number.isInteger(row.day) && row.day >= 1 && row.day <= previousMonthDays && row.code && definitionByCode.has(row.code))
      .sort((left, right) => left.day - right.day);
    if (employeeRows.length === 0) continue;

    const lastRow = employeeRows[employeeRows.length - 1];
    const lastDefinition = definitionByCode.get(lastRow.code);
    if (!lastDefinition) continue;

    let consecutiveWork = 0;
    for (let day = previousMonthDays; day >= 1; day--) {
      const hasWorked = employeeRows.some((row) => row.day === day);
      if (!hasWorked) break;
      consecutiveWork += 1;
    }

    const seriesRemaining = lastRow.day === previousMonthDays
      ? getMonthBoundarySeriesRemaining({ definition: lastDefinition, monthStartDayOfWeek: currentMonthStartDow })
      : 0;

    // A block that ended at or shortly before the end of the month still needs its free days in the new month
    // (night block, long streak, weekend block): the plan of the new month starts with the rest of them.
    let requiredFreeDays = 0;
    let recoveryReason = null;
    const blockEnded = lastRow.day < previousMonthDays || seriesRemaining === 0;
    if (blockEnded) {
      const freeDaysSince = previousMonthDays - lastRow.day;
      const isNight = normalizePlanningShiftTypeKey(lastDefinition.shift_type) === 'night';
      const isShortNight = isNight && getShiftSeriesDays(lastDefinition) < 7;
      const lastDate = new Date(previousYear, previousMonth - 1, lastRow.day);
      const endedOnWeekend = lastDate.getDay() === 0 || lastDate.getDay() === 6;
      let needed = 0;
      if (isNight) {
        needed = Number(isShortNight ? (rotation.short_night_free_days_after ?? rotation.free_days_after_night) : rotation.free_days_after_night) || 0;
        recoveryReason = isShortNight ? 'Kurze Nachtschicht' : 'Nachtschicht';
      } else if (endedOnWeekend && getShiftSeriesDays(lastDefinition) >= 6 && Number(rotation.free_days_after_weekend) > 0) {
        needed = Number(rotation.free_days_after_weekend);
        recoveryReason = 'Wochenendarbeit';
      } else if (consecutiveWork >= Math.max(Number(rotation.max_consecutive_workdays) || 0, 1) && Number(rotation.min_free_after_streak) > 0) {
        needed = Number(rotation.min_free_after_streak);
        recoveryReason = 'Arbeitsserie';
      }
      requiredFreeDays = Math.max(needed - (lastRow.day < previousMonthDays ? freeDaysSince : 0), 0);
      if (requiredFreeDays === 0) recoveryReason = null;
    }

    const weekendRows = employeeRows.filter((row) => {
      const weekday = new Date(previousYear, previousMonth - 1, row.day).getDay();
      return weekday === 0 || weekday === 6;
    });
    const lastWeekendRow = weekendRows[weekendRows.length - 1];
    // The last days themselves (offset 0 = last day of the month): the rules for neighbouring days, rest times and one
    // shift type per week look across the month change with them.
    const recentCodes = {};
    for (const row of employeeRows) {
      if (row.day > previousMonthDays - 7) recentCodes[row.day - previousMonthDays] = row.code;
    }
    carry[employee] = {
      recentCodes,
      lastWeekendKey: lastWeekendRow ? getWeekendBlockKey(previousYear, previousMonth, lastWeekendRow.day) : null,
      consecutiveWork,
      lastShiftType: lastDefinition.shift_type || null,
      requiredFreeDays,
      recoveryReason,
      seriesCode: seriesRemaining > 0 ? lastRow.code : null,
      seriesRemaining,
      lastWorkedShiftCode: lastRow.code,
      lastWorkedShiftType: lastDefinition.shift_type || null,
      forcedNextShiftCode: null,
      hourBalance: 0,
    };
  }

  return carry;
}

const CREDITED_ABSENCE_TYPES = new Set(['VACATION', 'SICK', 'TRAINING']);
const CREDITED_ABSENCE_HOURS = 8;
const HOLIDAY_CREDIT_HOURS = 8;
const MAX_UNCOHESIVE_FILLER_HOURS = 8.5;
// Per-shift staffing limits no longer apply; the global limits decide (see 'Besetzung').
const GLOBAL_STAFFING_UNLIMITED = 99;

function normalizeSkillText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SKILL_MATCH_ALIASES = {
  'Cross Connect': ['cross connect', 'crossconnect', ' cc '],
  'Metro Connect': ['metro connect', 'metroconnect', ' mc '],
  'Panel Installation': ['panel installation', 'panel'],
  'Deinstalls': ['deinstall', 'deinstalls', 'de install'],
  Power: ['power'],
  Migration: ['migration'],
  'Provide Access': ['provide access', 'access'],
  LOS: [' los '],
  'Colo Planung': ['colo planung', 'colo plan'],
  'Colo Ausfuhrung': ['colo ausfuhrung', 'colo ausfuhrung', 'colo ausf'],
  Antenne: ['antenne'],
  Begleitung: ['begleitung'],
};

function getShiftSkillSignals(shiftDef) {
  const label = ` ${normalizeSkillText(`${shiftDef.code || ''} ${shiftDef.name || ''} ${shiftDef.short_name || ''}`)} `;
  const ratedSkills = Object.entries(SKILL_MATCH_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => label.includes(` ${normalizeSkillText(alias)} `)))
    .map(([skill]) => skill);

  const legacySkills = [];
  if (label.includes(' cc ') || label.includes(' cross connect ')) legacySkills.push('can_cc');
  if (label.includes(' tt ') || label.includes(' trouble ticket ') || label.includes(' troubleticket ')) legacySkills.push('can_tt');
  if (label.includes(' sh ') || label.includes(' smart hand ') || label.includes(' smarthand ')) legacySkills.push('can_sh');

  return {
    ratedSkills,
    legacySkills,
  };
}

function getBestRatedSkillMatch(skillProfile, shiftSkillSignals) {
  if (!skillProfile || !skillProfile.rated_skills || typeof skillProfile.rated_skills !== 'object') return null;

  let bestMatch = null;
  for (const skillName of shiftSkillSignals.ratedSkills) {
    const rating = Number.parseInt(String(skillProfile.rated_skills?.[skillName] ?? ''), 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;

    if (!bestMatch || rating > bestMatch.rating) {
      bestMatch = { skill: skillName, rating };
    }
  }

  return bestMatch;
}

function hasLegacySkillMatch(skillProfile, shiftSkillSignals) {
  if (!skillProfile) return false;
  return shiftSkillSignals.legacySkills.some((skillKey) => skillProfile[skillKey] === true);
}

async function loadShiftplanFeatureFlags() {
  const { rows } = await pool.query(
    `SELECT key, value
     FROM app_settings
     WHERE key = ANY($1::text[])`,
    [['shiftplan.skills_enabled']]
  );

  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    skillsEnabled: parseBooleanAppSetting(settings['shiftplan.skills_enabled'], false),
  };
}

async function loadDbsPlanningConfig() {
  const { rows } = await pool.query(
    `SELECT key, value
     FROM app_settings
     WHERE key = ANY($1::text[])`,
    [[
      'shiftplan.dbs_enabled',
      'shiftplan.dbs_weekdays',
      'shiftplan.dbs_shift_code',
      'shiftplan.dbs_free_days_after_block',
      'shiftplan.dbs_fill_gaps',
    ]]
  );

  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    enabled: parseBooleanAppSetting(settings['shiftplan.dbs_enabled'], true),
    shiftCode: String(settings['shiftplan.dbs_shift_code'] || 'DBS').trim().toUpperCase() || 'DBS',
    weekdays: [1, 2, 3, 4, 5, 6, 0],
    // DBS is a rotating weekly duty. Exactly one pool member covers each block.
    requiredStaff: 1,
    freeDaysAfterBlock: Math.max(Number.parseInt(String(parseNumberAppSetting(settings['shiftplan.dbs_free_days_after_block'], 2)), 10) || 0, 0),
    // false (default): days the weekly owner cannot cover are not taken over by another pool member.
    fillGaps: parseBooleanAppSetting(settings['shiftplan.dbs_fill_gaps'], false),
  };
}

async function loadColoPlanningConfig() {
  const { rows } = await pool.query(
    `SELECT key, value
     FROM app_settings
     WHERE key = ANY($1::text[])`,
    [[
      'shiftplan.colo_enabled',
      'shiftplan.colo_pool',
      'shiftplan.colo_pool_rules',
      'shiftplan.colo_requirements',
      'shiftplan.colo_weekday_preparation_staff',
      'shiftplan.colo_night_staff',
      'shiftplan.colo_weekend_day_staff',
      'shiftplan.colo_weekend_installation_staff',
    ]]
  );
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return normalizeColoPlanningConfig({
    enabled: settings['shiftplan.colo_enabled'],
    employeePool: settings['shiftplan.colo_pool'],
    employeeRules: settings['shiftplan.colo_pool_rules'],
    requirements: settings['shiftplan.colo_requirements'],
    weekdayPreparationStaff: settings['shiftplan.colo_weekday_preparation_staff'],
    nightStaff: settings['shiftplan.colo_night_staff'],
    weekendDayStaff: settings['shiftplan.colo_weekend_day_staff'] ?? settings['shiftplan.colo_weekend_installation_staff'],
  });
}

async function loadDispatcherPlanningConfig() {
  const { rows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`,
    [['shiftplan.dispatcher_enabled', 'shiftplan.dispatcher_pool']]
  );
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  let priorities = [];
  try { priorities = Array.isArray(JSON.parse(settings['shiftplan.dispatcher_pool'] || '[]')) ? JSON.parse(settings['shiftplan.dispatcher_pool'] || '[]') : []; } catch { priorities = []; }
  return { enabled: settings['shiftplan.dispatcher_enabled'] !== 'false', priorities };
}

async function loadHolidayStaffingConfig() {
  const { rows } = await pool.query(
    `SELECT value
     FROM app_settings
     WHERE key = $1
     LIMIT 1`,
    ['shiftplan.holiday_staffing_limits']
  );

  if (!rows.length || !rows[0]?.value) return {};

  try {
    return normalizeHolidayStaffingConfig(JSON.parse(rows[0].value));
  } catch {
    return {};
  }
}

// normalizeEmployeeName lives in lib/employeeNameResolution.js.

/**
 * Deduplicate employees by normalized name (case-insensitive).
 */
function deduplicateEmployees(names) {
  const seen = new Map();
  for (const name of names) {
    const norm = normalizeEmployeeName(name);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (!seen.has(key)) seen.set(key, norm);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'de'));
}

function resolveLiveMonthLabelFromDraftMonth(monthId) {
  const parsedMonth = parseDraftMonthId(monthId);
  if (!parsedMonth) return null;
  return formatShiftMonthLabel(parsedMonth.year, parsedMonth.month);
}

async function loadManualEmployeesForDraftMonth(monthId, client = pool) {
  const liveMonthLabel = resolveLiveMonthLabelFromDraftMonth(monthId);
  if (!liveMonthLabel) return [];

  const { rows } = await client.query(
    `SELECT employee_name, created_at, created_by
       FROM manual_shiftplan_employees
      WHERE month = $1
      ORDER BY LOWER(employee_name) ASC, employee_name ASC`,
    [liveMonthLabel]
  );

  return rows.map((row) => ({
    employee_name: row.employee_name,
    created_at: row.created_at,
    created_by: row.created_by || null,
  }));
}

async function loadManualEmployeeNameSetForDraftMonth(monthId, client = pool) {
  const manualEmployees = await loadManualEmployeesForDraftMonth(monthId, client);
  return new Set(manualEmployees.map((entry) => entry.employee_name));
}

async function loadManualEmployeeSummaryForYear(year, client = pool) {
  const targetYear = Number.parseInt(String(year || ''), 10);
  if (!Number.isInteger(targetYear)) return [];

  const { rows } = await client.query(
    `SELECT month, employee_name
       FROM manual_shiftplan_employees
      WHERE month IS NOT NULL
        AND employee_name IS NOT NULL`
  );

  const grouped = new Map();

  for (const row of rows) {
    const parsedMonth = parseMonthLabel(row.month);
    if (!parsedMonth || parsedMonth.year !== targetYear) continue;

    const employeeName = normalizeEmployeeName(row.employee_name);
    if (!employeeName) continue;

    const monthId = `${parsedMonth.year}-${String(parsedMonth.month).padStart(2, '0')}`;
    if (!grouped.has(monthId)) {
      grouped.set(monthId, { month: monthId, employeeNames: new Map() });
    }

    const summary = grouped.get(monthId);
    const dedupeKey = employeeName.toLowerCase();
    if (!summary.employeeNames.has(dedupeKey)) {
      summary.employeeNames.set(dedupeKey, employeeName);
    }
  }

  return [...grouped.values()]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((entry) => {
      const employeeNames = [...entry.employeeNames.values()].sort((left, right) => left.localeCompare(right, 'de'));
      return {
        month: entry.month,
        count: employeeNames.length,
        employee_names: employeeNames,
      };
    });
}

// buildEmployeeAliasKeys / buildEmployeeNameLookup / resolveEmployeeName live in lib/employeeNameResolution.js.

function hasSubmittedEmployeePreferences(preferenceRow) {
  if (!preferenceRow || typeof preferenceRow !== 'object') return false;

  const hasEntries = (value) => Array.isArray(value) && value.some((entry) => String(entry || '').trim());

  return (
    hasEntries(preferenceRow.preferred_shifts)
    || hasEntries(preferenceRow.unwanted_shifts)
    || hasEntries(preferenceRow.preferred_holidays)
    || hasEntries(preferenceRow.preferred_days)
    || hasEntries(preferenceRow.blocked_days)
    || (Number.isInteger(Number(preferenceRow.max_nights_per_month)) && preferenceRow.max_nights_per_month !== null)
  );
}

/** All names a user row can be matched by in a plan: provisioned plan name, "First Last", "Last, First". */
function userNameCandidates(row) {
  return [
    row?.provisioned_employee_name,
    [row?.first_name, row?.last_name].filter(Boolean).join(' '),
    [row?.last_name, row?.first_name].filter(Boolean).join(', '),
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

async function loadDraftWishStatus(employeeNames) {
  const deduplicatedEmployees = deduplicateEmployees(employeeNames);
  const employeeLookup = buildEmployeeNameLookup(deduplicatedEmployees);
  const { rows } = await pool.query(
    `SELECT ep.*, u.first_name, u.last_name, u.email, u.provisioned_employee_name
     FROM employee_preferences ep
     JOIN users u ON u.id = ep.user_id
     ORDER BY ep.updated_at DESC NULLS LAST, u.last_name, u.first_name`
  );

  const matchedPreferences = new Map();

  for (const row of rows) {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    const fallbackName = [row.last_name, row.first_name].filter(Boolean).join(', ').trim();
    const employeeName = resolveEmployeeName(fullName || fallbackName, employeeLookup);
    if (!employeeName || matchedPreferences.has(employeeName)) continue;

    matchedPreferences.set(employeeName, {
      employee_name: employeeName,
      submitted: hasSubmittedEmployeePreferences(row),
      updated_at: row.updated_at || null,
    });
  }

  return deduplicatedEmployees.map((employeeName) => matchedPreferences.get(employeeName) || {
    employee_name: employeeName,
    submitted: false,
    updated_at: null,
  });
}

async function loadDraftAbsences(month) {
  const [yearStr, monthStr] = String(month || '').split('-');
  const year = Number.parseInt(yearStr, 10);
  const monthNumber = Number.parseInt(monthStr, 10);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) return [];

  const numDays = daysInMonth(year, monthNumber);
  const { rows } = await pool.query(
    `SELECT id, employee_name, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date, type, note
     FROM absences
     WHERE start_date <= $1 AND end_date >= $2
     ORDER BY employee_name, start_date`,
    [`${month}-${numDays}`, `${month}-01`]
  );

  return rows;
}

// Employees with the "Nicht planen" button are not part of any plan, so they never appear in the employee list.
async function loadEmployeesForPlanningYear(year, monthId = null) {
  const [employees, hiddenKeys] = await Promise.all([loadEmployeesForPlanningYearRaw(year, monthId), loadDoNotPlanKeys((text, params) => pool.query(text, params))]);
  return employees.filter((name) => !isDoNotPlan(name, hiddenKeys));
}

async function loadEmployeesForPlanningYearRaw(year, monthId = null) {
  let yearPlanEmployees = [];

  if (Number(year) === 2027) {
    try {
      const { rows: yearPlanRows } = await pool.query(
        `SELECT DISTINCT employee_name
         FROM year_plan_2027
         WHERE employee_name IS NOT NULL AND btrim(employee_name) <> ''`
      );
      yearPlanEmployees = yearPlanRows.map((row) => row.employee_name);
    } catch (error) {
      console.warn('[SHIFTPLAN CONTROL] year_plan_2027 could not be queried:', error.message);
    }
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT month, employee_name
     FROM shifts
     WHERE employee_name IS NOT NULL AND btrim(employee_name) <> ''`
  );

  const yearScopedEmployees = deduplicateEmployees(
    [...yearPlanEmployees, ...rows
      .filter((row) => monthLabelMatchesYear(row.month, year))
      .map((row) => row.employee_name)]
  );

  if (yearScopedEmployees.length > 0) {
    const manualEmployees = monthId ? await loadManualEmployeesForDraftMonth(monthId) : [];
    return deduplicateEmployees([...yearScopedEmployees, ...manualEmployees.map((entry) => entry.employee_name)]);
  }

  const manualEmployees = monthId ? await loadManualEmployeesForDraftMonth(monthId) : [];
  return deduplicateEmployees([...yearPlanEmployees, ...rows.map((row) => row.employee_name), ...manualEmployees.map((entry) => entry.employee_name)]);
}

const WELLBEING_HISTORY_COLUMNS = ['employee_name', 'night_count', 'weekend_count', 'early_count', 'late_count'];
const WELLBEING_REQUIRED_COLUMNS = new Set(['employee_name', 'night_count', 'weekend_count']);

async function loadWellbeingHistory(year, month) {
  const params = [String(year), Number(month)];

  try {
    const result = await pool.query(
      `SELECT employee_name, night_count, weekend_count, early_count, late_count
       FROM wellbeing_metrics
       WHERE year = $1 AND month = $2`,
      params
    );
    return result.rows;
  } catch (error) {
    if (error?.code !== '42703') throw error;

    const columnsRes = await pool.query(
      `SELECT DISTINCT column_name
       FROM information_schema.columns
       WHERE table_name = 'wellbeing_metrics'
         AND column_name = ANY($1::text[])`,
      [WELLBEING_HISTORY_COLUMNS]
    );
    const availableColumns = new Set(columnsRes.rows.map((row) => row.column_name));
    const selectList = WELLBEING_HISTORY_COLUMNS.map((column) => {
      if (availableColumns.has(column) || WELLBEING_REQUIRED_COLUMNS.has(column)) {
        return column;
      }
      return `0::integer AS ${column}`;
    }).join(', ');

    console.warn('[SHIFTPLAN CONTROL] wellbeing_metrics is missing optional legacy columns; using 0 defaults for absent counters');

    const fallbackResult = await pool.query(
      `SELECT ${selectList}
       FROM wellbeing_metrics
       WHERE year = $1 AND month = $2`,
      params
    );
    return fallbackResult.rows;
  }
}

/* ------------------------------------------------ */
/* DETERMINISTIC PLANNING ENGINE                    */
/* Fully rule-based, reproducible, no randomness    */
/* ------------------------------------------------ */

/**
 * Generate a complete shift plan for one month deterministically.
 * 
 * Algorithm:
 * 1. Load all config (shift definitions, rotation rules, fairness rules, planning config)
 * 2. Load all employee data (exclusions, absences, preferences, skills, wellbeing history)
 * 3. For each day in month:
 *    a. Determine available employees (not absent, not excluded)
 *    b. For each active shift definition (sorted by sort_order):
 *       - Build candidate list from available employees
 *       - Score each candidate based on:
 *         * Fairness: how many shifts they already have (lower = better)
 *         * Night balance: fewer previous nights = better for night shifts
 *         * Weekend balance: fewer previous weekends = better for weekend shifts
 *         * Rotation rules: check consecutive days, forbidden transitions
 *         * Employee preferences: preferred/unwanted shifts
 *       - Sort candidates by score (deterministic tiebreak by name)
 *       - Assign top candidate
 *    c. Track all assignments and generate explanations
 * 4. Validate entire plan against all rules
 * 5. Generate conflict list and fairness metrics
 */
export async function generateShiftPlan(year, mon, numDays, createdBy, options = {}) {
  let carryState = options.carryState || {};
  const planningStartDay = Math.max(1, Math.min(numDays, Number.parseInt(String(options.startDay ?? 1), 10) || 1));
  const planningEndDay = Math.max(planningStartDay, Math.min(numDays, Number.parseInt(String(options.endDay ?? numDays), 10) || numDays));
  const planningDays = planningEndDay - planningStartDay + 1;
  const isPartialPeriod = planningStartDay !== 1 || planningEndDay !== numDays;
  const dbsPlanningConfig = await loadDbsPlanningConfig();
  const coloPlanningConfig = await loadColoPlanningConfig();
  // Per-holiday maximums were replaced by the global national / international holiday limits.
  const holidayStaffingConfig = {};
  const defRes = await pool.query(`
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
    WHERE definition.is_active = TRUE OR UPPER(definition.code) = 'NK'
    GROUP BY definition.id
    ORDER BY definition.sort_order, definition.code
  `);
  const modeRes = await pool.query("SELECT key, value FROM app_settings WHERE key = 'shiftplan.active_shift_modes'");
  let activeShiftModes = {};
  try {
    const raw = modeRes.rows[0]?.value;
    activeShiftModes = raw && typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  } catch { activeShiftModes = {}; }
  const configuredShortNightDefinition = defRes.rows.find((definition) => String(definition.code || '').trim().toUpperCase() === 'NK') || null;
  const activeDefinitionRows = defRes.rows.filter((definition) => String(definition.code || '').trim().toUpperCase() !== 'NK');
  const shiftDefs = (activeDefinitionRows.length > 0 ? activeDefinitionRows : [
    { code: 'E1', name: 'Frühschicht 1', shift_type: 'early', min_staff: 1, max_staff: 5, color_hex: '#3b82f6', sort_order: 1, series_days: 5 },
    { code: 'E2', name: 'Frühschicht 2', shift_type: 'early', min_staff: 1, max_staff: 5, color_hex: '#60a5fa', sort_order: 2, series_days: 5 },
    { code: 'L1', name: 'Spätschicht 1', shift_type: 'late', min_staff: 1, max_staff: 5, color_hex: '#f59e0b', sort_order: 3, series_days: 5 },
    { code: 'L2', name: 'Spätschicht 2', shift_type: 'late', min_staff: 1, max_staff: 5, color_hex: '#fbbf24', sort_order: 4, series_days: 5 },
    { code: 'N', name: 'Nachtschicht', shift_type: 'night', min_staff: 1, max_staff: 3, color_hex: '#8b5cf6', sort_order: 5, series_days: 7 },
  ])
    .map((definition) => {
      const shiftCode = String(definition.code || '').trim().toUpperCase();
      if (shiftCode !== dbsPlanningConfig.shiftCode) return definition;
      if (!dbsPlanningConfig.enabled) return null;

      return {
        ...definition,
        applicable_days: [1, 2, 3, 4, 5, 6, 0],
        series_days: 7,
        min_staff: dbsPlanningConfig.requiredStaff,
        max_staff: Math.max(Number.parseInt(String(definition.max_staff ?? 0), 10) || 0, dbsPlanningConfig.requiredStaff),
      };
    })
    .filter(Boolean)
    .map((definition) => applyActiveShiftModes([definition], activeShiftModes)[0])
    .map(applyFixedShiftSeriesPattern)
    .filter(isShiftDefinitionDraftPlannable)
    // Early/late/night staffing is controlled only by the global limits (admin
    // tab "Besetzung"). The per-shift min/max columns no longer take part.
    .map((definition) => (
      ['early', 'late', 'night'].includes(normalizePlanningShiftTypeKey(definition.shift_type) || '')
        ? { ...definition, min_staff: 0, max_staff: GLOBAL_STAFFING_UNLIMITED }
        : definition
    ));

  const rotRes = await pool.query('SELECT * FROM shift_rotation_rules WHERE id=1');
  const rotation = rotRes.rows[0] || {
    max_consecutive_same: 5, max_consecutive_workdays: 6, min_free_after_streak: 1,
    night_to_early_forbidden: true, late_to_early_forbidden: true,
    min_hours_between_shifts: 11, max_nights_per_month: 7, max_weekends_per_month: 2, weekend_rule: 'balanced',
    free_days_after_night: 2, free_days_after_weekend: 2,
    night_next_workday: 4, night_next_shift_code: null,
    late_before_night_required: false,
    stability_priority: 70, max_shift_type_changes_per_month: 4,
    min_free_weekends_per_month: 2, min_recovery_days_after_shift_change: 1,
    short_night_mode_enabled: false,
    short_night_free_days_after: 2,
    night_planning_mode: NIGHT_PLANNING_MODES.MIXED,
  };
  // 0 (or empty) means "no limit", like max_nights_per_month. Treating 0 as a real
  // limit blocks every weekend shift and every 7-day block (nights, E1WE/L1WE ...),
  // because those blocks always contain a weekend.
  const rotationWeekendLimitDisabled = !(Number(rotation.max_weekends_per_month) > 0);
  if (rotationWeekendLimitDisabled) rotation.max_weekends_per_month = 9999;
  const baseNightDefinition = shiftDefs.find((definition) => normalizePlanningShiftTypeKey(definition.shift_type) === 'night');
  // N and NK are two models of the same operational night coverage. They must
  // never be staffed independently on one day.
  // The cap is the global night maximum (set once the staffing rules are loaded).
  let sharedNightStaffCap = 0;
  // Length of a short night block (NK series_days, 1..7, default 3).
  const shortNightSeriesDays = Math.max(1, Math.min(7, Number.parseInt(String(configuredShortNightDefinition?.series_days ?? 3), 10) || 3));
  const shortNightDefinition = configuredShortNightDefinition
    ? applyFixedShiftSeriesPattern({ ...configuredShortNightDefinition, series_days: shortNightSeriesDays })
    : (baseNightDefinition ? {
      ...baseNightDefinition,
      code: 'NK',
      name: 'Kurze Nachtschicht',
      short_name: 'NK',
      series_days: 3,
      start_time: '21:45',
      end_time: '06:45',
      start_day_offset: 0,
      end_day_offset: 1,
      duration_hours: 9,
      color_hex: '#2563eb',
      free_days_after: null,
      modes: [],
    } : null);

  const fairRes = await pool.query('SELECT * FROM shift_fairness_rules WHERE id=1');
  const fairnessRules = fairRes.rows[0] || {
    balance_nights: true, balance_weekends: true, balance_total_load: true,
    max_deviation_percent: 20, fairness_vs_preference: 'fairness',
  };

  const planRes = await pool.query('SELECT * FROM shift_planning_config WHERE id=1');
  // The separate "wish weight" slider was removed from the admin menu (the wish strengths decide);
  // a stored value must not weaken the wishes any more.
  const planConfig = {
    ...(planRes.rows[0] || {
      respect_employee_wishes: true, hard_rules_priority: 100, fairness_priority: 80, admin_override_priority: 90, monthly_target_hours: 174,
    }),
    soft_wishes_priority: 100,
  };

  const specialPoolRes = await pool.query(
    `SELECT shift_code, employee_name, monthly_max_assignments, working_weekdays, free_days_after_block, duration_hours, other_shift_codes, other_days_per_month
     FROM shift_special_pools
     WHERE is_active = TRUE
     ORDER BY shift_code, sort_order, employee_name`
  );
  const specialPoolsByShift = new Map();
  for (const row of specialPoolRes.rows) {
    const shiftCode = String(row.shift_code || '').trim().toUpperCase();
    const employeeName = row.employee_name;
    if (!shiftCode || !employeeName) continue;
    if (!specialPoolsByShift.has(shiftCode)) specialPoolsByShift.set(shiftCode, new Map());
    specialPoolsByShift.get(shiftCode).set(employeeName, {
      monthlyMaxAssignments: Math.max(Number.parseInt(String(row.monthly_max_assignments ?? 0), 10) || 0, 0),
      workingWeekdays: Array.isArray(row.working_weekdays)
        ? row.working_weekdays.map(Number).filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
        : [1, 2, 3, 4, 5],
      freeDaysAfterBlock: Math.max(Number.parseInt(String(row.free_days_after_block ?? dbsPlanningConfig.freeDaysAfterBlock), 10) || 0, 0),
      // Own paid hours of this employee for the shift (null = hours of the definition).
      durationHours: row.duration_hours === null || row.duration_hours === undefined ? null : Number(row.duration_hours),
      // Planning outside the DBS block (DBS pool only): allowed shift codes and a day cap per month.
      otherShiftCodes: Array.isArray(row.other_shift_codes)
        ? row.other_shift_codes.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean)
        : [],
      otherDaysPerMonth: row.other_days_per_month === null || row.other_days_per_month === undefined ? null : Number(row.other_days_per_month),
    });
  }
  const restrictedPoolShiftCodes = new Set([...specialPoolsByShift.keys()]);
  if (dbsPlanningConfig.enabled && dbsPlanningConfig.shiftCode) restrictedPoolShiftCodes.add(dbsPlanningConfig.shiftCode);

  const month = `${year}-${String(mon).padStart(2, '0')}`;
  let employees = await loadEmployeesForPlanningYear(year, month);
  if (employees.length === 0) {
    throw new Error('Keine Mitarbeiter im System gefunden');
  }
  const employeeNameLookup = buildEmployeeNameLookup(employees);

  const absRes = await pool.query(
    `SELECT employee_name, employee_id, start_date, end_date, type, source FROM absences WHERE start_date <= $1 AND end_date >= $2`,
    [`${month}-${numDays}`, `${month}-01`]
  );
  // Vacation wishes of employees must reach the plan even when the stored name is spelled
  // differently from the plan (umlauts, "Last, First"): match by name first, then by the
  // names of the linked user account.
  const absenceUserIds = [...new Set(absRes.rows.map((row) => Number(row.employee_id)).filter((id) => Number.isInteger(id) && id > 0))];
  const absenceUserRows = absenceUserIds.length
    ? (await pool.query('SELECT id, first_name, last_name, provisioned_employee_name FROM users WHERE id = ANY($1::int[])', [absenceUserIds])).rows
    : [];
  const userNameCandidatesById = new Map(absenceUserRows.map((row) => [row.id, userNameCandidates(row)]));
  const absenceMap = new Map();
  const unmatchedAbsences = [];
  for (const absence of absRes.rows) {
    const absenceKey = resolveAbsenceEmployeeName(absence, employeeNameLookup, userNameCandidatesById);
    if (!absenceKey) {
      unmatchedAbsences.push(absence);
      continue;
    }
    if (!absenceMap.has(absenceKey)) absenceMap.set(absenceKey, []);
    absenceMap.get(absenceKey).push(absence);
  }

  // Absences that already stand in the existing plan as codes (e.g. a quarter draft whose January is still on the
  // default) are adopted: nothing is planned on those days, and they are written into the new plan unchanged.
  const adoptedAbsenceCells = [];
  for (const entry of await loadPlannedAbsenceCodes({ year, month: mon, employeeNameLookup })) {
    if (!employees.includes(entry.employee_name) && !absenceMap.has(entry.employee_name)) continue;
    const dateKey = `${month}-${String(entry.day).padStart(2, '0')}`;
    const dayKey = (value) => (value instanceof Date
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
      : String(value || '').slice(0, 10));
    if ((absenceMap.get(entry.employee_name) || []).some((absence) => dayKey(absence.start_date) <= dateKey && dayKey(absence.end_date) >= dateKey)) continue;
    if (!absenceMap.has(entry.employee_name)) absenceMap.set(entry.employee_name, []);
    absenceMap.get(entry.employee_name).push({ employee_name: entry.employee_name, start_date: dateKey, end_date: dateKey, type: PLAN_ABSENCE_CODES[entry.code], source: 'plan' });
    adoptedAbsenceCells.push(entry);
  }

  const exclRes = await pool.query(
    `SELECT employee_name, fixed_shift_type, weekdays, plan_on_holidays, do_not_plan FROM shiftplan_exclusions WHERE is_active = TRUE`
  );
  const shiftExcludedSet = new Set();
  // On the "do not plan" list but ticked "plan on holidays": planned on bank holidays only, never in the hours lists.
  const holidayOnlyEmployees = new Set();
  const fixedShiftTypeByEmployee = new Map();
  // Weekday-limited rules: a plain exclusion blocks its weekdays, a fixed-shift
  // rule allows planning only on its weekdays.
  const exclusionBlockedWeekdaysByEmployee = new Map();
  for (const row of exclRes.rows) {
    if (row.do_not_plan === true) continue; // "Nicht planen": not part of the plan at all
    const fixedShiftType = normalizePlanningShiftTypeKey(row.fixed_shift_type);
    const ruleWeekdays = normalizeExclusionWeekdays(row.weekdays);
    const coversWholeWeek = ruleWeekdays.length === 7;
    if (fixedShiftType) {
      if (!shiftExcludedSet.has(row.employee_name)) {
        fixedShiftTypeByEmployee.set(row.employee_name, fixedShiftType);
        if (!coversWholeWeek) {
          exclusionBlockedWeekdaysByEmployee.set(row.employee_name, new Set([0, 1, 2, 3, 4, 5, 6].filter((weekday) => !ruleWeekdays.includes(weekday))));
        }
      }
      continue;
    }
    if (!coversWholeWeek) {
      exclusionBlockedWeekdaysByEmployee.set(row.employee_name, new Set(ruleWeekdays));
      continue;
    }
    fixedShiftTypeByEmployee.delete(row.employee_name);
    exclusionBlockedWeekdaysByEmployee.delete(row.employee_name);
    if (row.plan_on_holidays === true) {
      holidayOnlyEmployees.add(row.employee_name);
      continue;
    }
    shiftExcludedSet.add(row.employee_name);
  }
  // Fixed rule in code: some employees never work on weekends (absolute, like an admin exclusion).
  for (const name of employees) {
    if (!isWeekdayOnlyEmployee(name) || shiftExcludedSet.has(name)) continue;
    exclusionBlockedWeekdaysByEmployee.set(name, new Set([...(exclusionBlockedWeekdaysByEmployee.get(name) || []), ...WEEKEND_WEEKDAYS]));
  }

  const assignExclRes = await pool.query(
    `SELECT employee_name FROM assignment_employee_exclusions WHERE is_active = TRUE AND (valid_from IS NULL OR valid_from <= $1) AND (valid_to IS NULL OR valid_to >= $2)`,
    [`${month}-${numDays}`, `${month}-01`]
  );
  for (const row of assignExclRes.rows) shiftExcludedSet.add(row.employee_name);
  for (const name of shiftExcludedSet) holidayOnlyEmployees.delete(name);

  const skillsMap = new Map();

  const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
  const prevMonthParts = prevMonth.split('-');
  const wellbeingRows = await loadWellbeingHistory(prevMonthParts[0], Number.parseInt(prevMonthParts[1], 10));
  const historyMap = new Map();
  for (const row of wellbeingRows) historyMap.set(row.employee_name, row);

  const empPrefRes = await pool.query(
    `SELECT ep.*, u.first_name, u.last_name, u.email, u.provisioned_employee_name
     FROM employee_preferences ep
     JOIN users u ON u.id = ep.user_id`
  );
  // Every spelling a user account is known by (plan name, "First Last", "Last, First").
  const resolveUserPlanName = (row) => findEmployeeName(row.provisioned_employee_name, employeeNameLookup)
    || userNameCandidates(row).map((candidate) => findEmployeeName(candidate, employeeNameLookup)).find(Boolean)
    || resolveEmployeeName([row.first_name, row.last_name].filter(Boolean).join(' '), employeeNameLookup);
  // Admin-configured strength (0-100 %) per employee wish type: 100 = absolute (hard
  // block), <100 = score penalty, 0 = ignored. This is the only setting per wish type;
  // blocked weekdays and preferred colleagues no longer have a second on/off switch.
  const { strengths: prefStrength, blockedDaysEnabled, colleaguesEnabled: preferredColleaguesEnabled } = await loadWishSettings((text, params) => pool.query(text, params));
  const empPrefsMap = new Map();
  for (const row of empPrefRes.rows) {
    const employeeName = resolveUserPlanName(row);
    if (!employeeName) continue;
    // Saved weekday exclusions apply to every employee, including catch-up work.
    // Wishes for exactly this month replace the general ones everywhere (also in the passes that read the map directly).
    empPrefsMap.set(employeeName, mergeMonthlyPreferences(blockedDaysEnabled ? row : { ...row, blocked_days: [] }, month));
  }

  // Preferred colleagues stay stored per user and are used while their strength is
  // above 0 %. Wishes are treated symmetrically: if A wants to work with B, B also
  // profits from sharing a shift with A.
  // Admin setting "Abwechslung" (0-100): how strongly the plan avoids repeating the same blocks.
  const varietySetting = await pool.query("SELECT value FROM app_settings WHERE key = 'shiftplan.variety_priority' LIMIT 1");
  const varietyPriority = normalizeVarietyPriority(varietySetting.rows[0]?.value);
  // Admin setting: employees who wished for late AND night may work Thursday/Friday late shifts above the weekday maximum.
  // Admin setting "Ramadan": more late shifts than the normal maximum during the Ramadan period.
  const ramadanRows = (await pool.query(
    'SELECT key, value FROM app_settings WHERE key = ANY($1::text[])',
    [['shiftplan.ramadan_late_enabled', 'shiftplan.ramadan_late_extra']]
  )).rows;
  const ramadanSetting = (key) => ramadanRows.find((row) => row.key === key)?.value;
  const ramadanLateEnabled = parseBooleanAppSetting(ramadanSetting('shiftplan.ramadan_late_enabled'), false);
  const ramadanLateExtra = ramadanLateEnabled
    ? Math.min(Math.max(Math.trunc(parseNumberAppSetting(ramadanSetting('shiftplan.ramadan_late_extra'), 2)) || 0, 0), 10)
    : 0;
  // Admin setting: minimum distance between two worked weekends in weeks (3 = two free weekends in between,
  // 1 = switched off). A single Saturday already counts as a weekend.
  const weekendGapSetting = await pool.query("SELECT value FROM app_settings WHERE key = 'shiftplan.min_weekend_gap_weeks' LIMIT 1");
  const minWeekendGapWeeks = Math.min(Math.max(Math.trunc(parseNumberAppSetting(String(weekendGapSetting.rows[0]?.value ?? '').replace(/^"|"$/g, ''), 3)) || 3, 1), 6);
  // Admin setting: employees who are not yet experienced. They are never planned into the same shift together and,
  // in late and night shifts (little staff), always with an experienced colleague.
  const inexperiencedSetting = await pool.query("SELECT value FROM app_settings WHERE key = 'shiftplan.inexperienced_employees' LIMIT 1");
  const inexperiencedKeys = new Set((() => {
    try {
      const raw = inexperiencedSetting.rows[0]?.value;
      const list = Array.isArray(raw) ? raw : JSON.parse(String(raw || '[]'));
      return Array.isArray(list) ? list.map((name) => coloNameKey(name)).filter(Boolean) : [];
    } catch {
      return [];
    }
  })());
  const lateOverflowSetting = await pool.query("SELECT value FROM app_settings WHERE key = 'shiftplan.late_overflow_thu_fri' LIMIT 1");
  const lateOverflowEnabled = parseBooleanAppSetting(typeof lateOverflowSetting.rows[0]?.value === 'string'
    ? lateOverflowSetting.rows[0].value.replace(/^"|"$/g, '')
    : lateOverflowSetting.rows[0]?.value, false);
  // Different pattern for every generated draft when the slider is high; stored in the plan report for reproduction.
  const varietySeed = Number.isFinite(Number(options.varietySeed)) ? Math.trunc(Number(options.varietySeed)) : 0;
  // Admin setting "Überstunden": unlimited (default) or at most N hours above the target hours.
  const overtimeRows = (await pool.query(
    'SELECT key, value FROM app_settings WHERE key = ANY($1::text[])',
    [['shiftplan.overtime_unlimited', 'shiftplan.max_overtime_hours']]
  )).rows;
  const overtimeSetting = (key) => overtimeRows.find((row) => row.key === key)?.value;
  const overtimeUnlimited = parseBooleanAppSetting(overtimeSetting('shiftplan.overtime_unlimited'), true);
  const overtimeAllowance = overtimeUnlimited
    ? Infinity
    : Math.max(parseNumberAppSetting(overtimeSetting('shiftplan.max_overtime_hours'), 0), 0);
  const preferredColleagueMap = new Map();
  const preferredColleagueWishes = [];
  if (preferredColleaguesEnabled) {
    const colleagueIds = [...new Set(empPrefRes.rows.flatMap((row) => (Array.isArray(row.preferred_colleagues) ? row.preferred_colleagues : [])
      .map((id) => Number.parseInt(String(id), 10)).filter(Number.isInteger)))];
    const colleagueUsers = colleagueIds.length
      ? await pool.query('SELECT id, first_name, last_name, provisioned_employee_name FROM users WHERE id = ANY($1::int[])', [colleagueIds])
      : { rows: [] };
    const colleagueNameById = new Map(colleagueUsers.rows.map((row) => [
      row.id,
      resolveUserPlanName(row),
    ]));
    const addColleaguePair = (left, right) => {
      if (!preferredColleagueMap.has(left)) preferredColleagueMap.set(left, new Set());
      preferredColleagueMap.get(left).add(right);
    };
    for (const row of empPrefRes.rows) {
      const employeeName = resolveUserPlanName(row);
      if (!employeeName) continue;
      for (const rawId of (Array.isArray(row.preferred_colleagues) ? row.preferred_colleagues : []).slice(0, 4)) {
        const colleagueName = colleagueNameById.get(Number.parseInt(String(rawId), 10));
        if (!colleagueName || colleagueName === employeeName) continue;
        preferredColleagueWishes.push({ employee: employeeName, colleague: colleagueName });
        addColleaguePair(employeeName, colleagueName);
        addColleaguePair(colleagueName, employeeName);
      }
    }
  }

  // Colleagues who wish each other (A names B and B names A). Their shared preferred shift type is rewarded
  // independent of the planning order, so a pair or trio ends up in the same shift (see getSharedPreferredTypes).
  const mutualColleagueMap = new Map();
  {
    const wishKeys = new Set(preferredColleagueWishes.map((wish) => `${wish.employee}|${wish.colleague}`));
    for (const wish of preferredColleagueWishes) {
      if (!wishKeys.has(`${wish.colleague}|${wish.employee}`)) continue;
      if (!mutualColleagueMap.has(wish.employee)) mutualColleagueMap.set(wish.employee, new Set());
      mutualColleagueMap.get(wish.employee).add(wish.colleague);
    }
  }

  const preferencesForDate = (employeeName, dateStr) => {
    const base = empPrefsMap.get(employeeName);
    if (!base) return base;
    return mergeMonthlyPreferences(base, String(dateStr || '').slice(0, 7));
  };

  const staffRes = await pool.query('SELECT * FROM staffing_rules');
  const weekdayStaffingRules = buildStaffingRulesByShiftType(staffRes.rows);
  const weekdayStaffingMaximums = buildStaffingMaximumsByShiftType(staffRes.rows);
  let dayLimitRows = [];
  try {
    dayLimitRows = (await pool.query('SELECT day_context, shift_type, min_count, max_count FROM staffing_day_limits')).rows;
  } catch (limitErr) {
    console.warn('staffing_day_limits unavailable, using defaults:', limitErr.message);
  }
  const staffingDayLimitMap = buildDayLimitMap(dayLimitRows);
  // Early/late staffing depends on the day (weekday / Saturday / Sunday / holiday);
  // night uses one global value. The day loop switches these per date.
  let staffingRules = weekdayStaffingRules;
  let staffingMaximums = weekdayStaffingMaximums;
  const selectStaffingForDay = (dow, holidayName, dateStr = null) => {
    const context = resolveStaffingDayContext({ dayOfWeek: dow, holidayName });
    const staffing = buildStaffingForContext({
      context,
      weekdayRules: weekdayStaffingRules,
      weekdayMaximums: weekdayStaffingMaximums,
      dayLimitMap: staffingDayLimitMap,
    });
    staffingRules = staffing.rules;
    staffingMaximums = staffing.maximums;
    // Ramadan: the late maximum is raised by the admin value (the minimum stays as configured).
    if (ramadanLateExtra > 0 && dateStr && isRamadanDate(dateStr) && Number.isFinite(Number(staffingMaximums.late))) {
      staffingMaximums = { ...staffingMaximums, late: Number(staffingMaximums.late) + ramadanLateExtra };
    }
    // Early shift is the overflow pool on normal weekdays: when late/night are full (or fewer people
    // wished for them), everybody else must still fit somewhere. Saturday, Sunday and holidays keep
    // their configured maximums.
    if (context === 'weekday') {
      const { early: _earlyMaximum, ...withoutEarlyMaximum } = staffingMaximums;
      staffingMaximums = withoutEarlyMaximum;
    }
  };
  sharedNightStaffCap = Math.max(Number.parseInt(String(weekdayStaffingMaximums.night ?? 0), 10) || 0, 0);
  const getShiftTypeMaximum = (shiftType) => {
    const key = normalizePlanningShiftTypeKey(shiftType);
    return Object.prototype.hasOwnProperty.call(staffingMaximums, key) ? staffingMaximums[key] : Infinity;
  };

  const shifts = [];
  const explanations = {};
  const conflicts = [];

  // Night planning fails silently when its configuration cannot produce a single
  // shift (no active night definition, zero staffing, limits below one block).
  // Report the cause instead of returning a plan without nights.
  {
    const nightDefinitions = shiftDefs.filter((definition) => normalizePlanningShiftTypeKey(definition.shift_type) === 'night');
    const nightConfigurationIssue = (message, type) => conflicts.push({ day: 1, date: `${month}-01`, shift: 'N', severity: 'critical', type, message });
    if (nightDefinitions.length === 0) {
      nightConfigurationIssue('Keine aktive Nachtschicht-Definition (N) vorhanden: Es werden keine Nachtschichten geplant. Bitte in den Schicht-Einstellungen N aktivieren.', 'night_definition_missing');
    } else {
      const plannedNightSlots = buildShiftSlots(nightDefinitions, staffingRules, null, staffingMaximums)
        .reduce((sum, definition) => sum + (definition.planned_slots || 0), 0);
      if (plannedNightSlots === 0) {
        nightConfigurationIssue('Die Mindestbesetzung der Nachtschicht ist 0 (Schicht-Definition bzw. Besetzungsregel Nacht): Es werden keine Nachtschichten geplant.', 'night_staffing_zero');
      }
      const sevenDayNightsPossible = normalizeNightPlanningMode(rotation.night_planning_mode) !== NIGHT_PLANNING_MODES.SHORT_ONLY;
      const monthlyNightLimit = Number(rotation.max_nights_per_month) || 0;
      if (sevenDayNightsPossible && monthlyNightLimit > 0 && monthlyNightLimit < Math.min(...nightDefinitions.map((definition) => getShiftSeriesDays(definition)))) {
        nightConfigurationIssue(`Das Nachtlimit pro Monat (${monthlyNightLimit}) ist kleiner als ein Nachtblock (${Math.min(...nightDefinitions.map((definition) => getShiftSeriesDays(definition)))} Nächte): 7-Tage-Nachtblöcke können nie eingeplant werden.`, 'night_limit_below_block');
      }
      if (rotation.late_before_night_required) {
        conflicts.push({
          day: 1, date: `${month}-01`, shift: 'N', severity: 'warning', type: 'night_requires_late',
          message: 'Regel "Vor Nachtschicht ist Spätschicht vorgeschrieben" ist aktiv: Nachtblöcke starten nur direkt nach einer Spätschicht und fehlen daher häufig.',
        });
      }
    }
  }

  // Never drop an absence silently: report the ones that could not be assigned to a plan row.
  if (unmatchedAbsences.length > 0) {
    const formatDay = (value) => (value instanceof Date
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
      : String(value || '').slice(0, 10));
    for (const absence of unmatchedAbsences) {
      conflicts.push({
        day: 1,
        date: `${month}-01`,
        shift: String(absence.type || 'ABW').toUpperCase(),
        severity: 'warning',
        type: 'absence_unmatched',
        message: `${absence.type === 'VACATION' ? 'Urlaub' : 'Abwesenheit'} von "${absence.employee_name}" (${formatDay(absence.start_date)} bis ${formatDay(absence.end_date)}) konnte keinem Mitarbeiter im Plan zugeordnet werden und wurde nicht berücksichtigt.`,
      });
    }
  }

  const planReport = {
    totalEmployees: employees.length,
    excludedEmployees: shiftExcludedSet.size,
    activeEmployees: 0,
    totalShiftsPlanned: 0,
    conflictsCount: 0,
    wishesRespected: 0,
    wishesDenied: 0,
    rulesApplied: [],
  };
  planReport.varietySeed = varietyPriority >= 25 ? varietySeed : 0;

  const empStats = {};
  const empDayAssignment = {};
  const empConsecutiveWork = {};
  const empLastShiftType = {};
  const empRequiredFreeDays = {};
  const empHours = {};
  const empRecoveryReason = {};
  const empSeriesCode = {};
  const empSeriesRemaining = {};
  // Last day (of this month) of a block that already ran in the previous month: it is completed, weekend limits were
  // checked when the block started (otherwise "E1SA" stops on Friday and the Saturday is missing).
  const carriedSeriesUntilDay = {};
  const empSeriesTotalDays = {};
  const empLastWorkedShiftCode = {};
  const empLastWorkedShiftType = {};
  const empLastWorkedDay = {};
  const empForcedNextShiftCode = {};
  // Blocks started so far (plus the last one of the previous month): input for the variety score.
  const empBlockHistory = {};

  const activeEmployees = employees.filter((employee) => !shiftExcludedSet.has(employee));
  planReport.activeEmployees = activeEmployees.length;
  if (Object.keys(carryState || {}).length === 0) {
    carryState = await loadPreviousMonthShiftCarryState({
      year,
      month: mon,
      employees: activeEmployees,
      shiftDefinitions: shortNightDefinition ? [...shiftDefs, shortNightDefinition] : shiftDefs,
      employeeNameLookup,
      rotation,
    });
  }
  // Documented in the plan: the previous month (December of the year before for January) feeds the transition.
  planReport.previousMonthCarry = {
    month: mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`,
    employees: Object.keys(carryState || {}).length,
  };
  const configuredMonthlyTargetHours = parseTargetHoursValue(planConfig.monthly_target_hours, 174);
  // Month target follows the Mon-Fri working days of the month (Ø = configured monthly target).
  const targetHours = getWorkdayBasedTargetHours({
    year,
    month: mon,
    monthlyTargetHours: configuredMonthlyTargetHours,
    annualTargetHours: planConfig.annual_target_hours,
  });
  const employeeBaseTargetHours = Object.fromEntries(activeEmployees.map((employee) => [employee, targetHours]));
  const employeeTargetRes = await pool.query(
    `SELECT employee_name, target_hours
     FROM shiftplan_employee_monthly_targets
     WHERE month = $1`,
    [month]
  );
  for (const row of employeeTargetRes.rows) {
    const employeeName = resolveEmployeeName(row.employee_name, employeeNameLookup);
    if (!employeeName || !(employeeName in employeeBaseTargetHours)) continue;
    employeeBaseTargetHours[employeeName] = parseTargetHoursValue(row.target_hours, targetHours);
  }
  // Every month is planned against its own target. A deficit from an earlier
  // month must not inflate the next target, otherwise year plans oscillate.
  const monthWeekdays = countWeekdaysInRange(year, mon, 1, numDays);
  const periodWeekdays = countWeekdaysInRange(year, mon, planningStartDay, planningEndDay);
  // Official target of the period (what Excel and the fairness report show).
  const employeeOfficialTargetHours = Object.fromEntries(activeEmployees.map((employee) => {
    const periodBaseTarget = isPartialPeriod
      ? employeeBaseTargetHours[employee] * (monthWeekdays > 0 ? periodWeekdays / monthWeekdays : planningDays / numDays)
      : employeeBaseTargetHours[employee];
    return [employee, holidayOnlyEmployees.has(employee) ? 0 : Number(Math.max(0, periodBaseTarget).toFixed(2))];
  }));
  // Year balance: hours behind (or ahead of) the official targets of the earlier months of the year are
  // made up (or reduced) in this month, damped and capped so a year plan does not oscillate.
  const yearToDateBalance = await loadYearToDateHourBalances({ year, month: mon, employees: activeEmployees, employeeNameLookup });
  // Inside one run (quarter/year) the balance is chained from the previous month and already contains the
  // year-to-date part; a single month starts from the saved drafts of the earlier months.
  const balanceFromChain = Object.keys(options.carryState || {}).length > 0;
  const carriedHourBalance = Object.fromEntries(activeEmployees.map((employee) => {
    const chained = Number(carryState?.[employee]?.hourBalance);
    return [employee, balanceFromChain ? (Number.isFinite(chained) ? chained : 0) : (yearToDateBalance.get(employee) || 0)];
  }));
  // Year balance goal: nobody ends the year more than BALANCE_FLOOR_HOURS below the official target; upwards it is open
  // (but nobody is planned excessively: the relief below lowers the next month's target).
  const BALANCE_FLOOR_HOURS = 20;
  // The balance pass starts well before the limit, so one more 8h shift still ends inside the tolerance.
  const BALANCE_TRIGGER_HOURS = 6;
  const MAX_CATCHUP_HOURS = 48;
  const MAX_RELIEF_HOURS = 12;
  const employeeTargetHours = Object.fromEntries(activeEmployees.map((employee) => {
    const adjustment = isPartialPeriod ? 0 : Math.min(Math.max(-carriedHourBalance[employee], -MAX_RELIEF_HOURS), MAX_CATCHUP_HOURS);
    return [employee, holidayOnlyEmployees.has(employee) ? 0 : Number(Math.max(0, employeeOfficialTargetHours[employee] + adjustment).toFixed(2))];
  }));
  // Nobody may end the month further than this below the official target (last-resort fill, see below).
  const MAX_HOURS_BELOW_TARGET = 15;
  const baselineShiftSlots = buildShiftSlots(shiftDefs, staffingRules, null, staffingMaximums);
  const holidayMap = buildHessenHolidayMap(year);
  // Fair distribution of the bank holidays: holiday shifts already worked this year (earlier drafts) plus those planned
  // so far in this month. The employee with the fewest is chosen first; holiday-favoured people count 1.25 holidays lower and therefore get more of them.
  const bankHolidayMap = buildBankHolidayMap(year);
  const holidayShiftsBefore = await loadYearHolidayShiftCounts({ year, month: mon, employeeNameLookup, employees: activeEmployees });
  const holidayWorkCodes = new Set(shiftDefs.map((definition) => String(definition.code || "").trim().toUpperCase()));
  let currentDayForHolidayLoad = 1;
  const holidayLoadOf = (employee) => {
    let load = Number(holidayShiftsBefore.get(employee) || 0);
    for (let holidayDay = 1; holidayDay <= numDays; holidayDay++) {
      if (!bankHolidayMap[`${month}-${String(holidayDay).padStart(2, '0')}`]) continue;
      const code = String(empDayAssignment[employee]?.[holidayDay] || '').trim().toUpperCase();
      if (code && holidayWorkCodes.has(code)) load += 1;
    }
    // The remaining days of a block that is already running (not assigned yet) count as well.
    if (empSeriesRemaining[employee] > 0) {
      for (let offset = 0; offset < empSeriesRemaining[employee]; offset++) {
        if (bankHolidayMap[`${month}-${String(currentDayForHolidayLoad + offset).padStart(2, '0')}`]) load += 1;
      }
    }
    return load + (isHolidayFavored(employee) ? -1.25 : 0);
  };
  // Bank holidays inside the block that starts on this day (a Monday block also covers the holiday on Thursday).
  const bankHolidaysInBlock = (startDay, seriesLength) => {
    let found = 0;
    for (let offset = 0; offset < Math.max(seriesLength, 1); offset++) {
      if (bankHolidayMap[`${month}-${String(startDay + offset).padStart(2, '0')}`]) found += 1;
    }
    return found;
  };
  // Employees who have submitted wishes (general or for this month) are placed before those without any.
  const hasSubmittedWishes = (employee) => hasSubmittedEmployeePreferences(empPrefsMap.get(employee));
  // Shift-level wish check resolved against the admin strengths: only wishes
  // with strength 100 hard-block; softer wishes surface as a penalty.
  // Special-pool duties (DBS and others) are assigned by the pool rotation. The list "I only want these shifts"
  // describes the regular shifts and never blocks such a duty (otherwise one monthly wish empties the whole DBS week).
  const isPoolDutyCode = (code) => specialPoolsByShift.has(String(code || '').trim().toUpperCase());
  const withoutPreferredListForPoolDuty = (evaluation, code) => {
    if (!isPoolDutyCode(code) || !evaluation.violations.some((violation) => violation.type === 'not_preferred')) return evaluation;
    const violations = evaluation.violations.filter((violation) => violation.type !== 'not_preferred');
    return { hardBlocked: violations.some((violation) => violation.hard), penalty: violations.reduce((sum, violation) => sum + violation.penalty, 0), violations };
  };
  const getShiftWishEvaluation = (employee, dateStr, code, shiftType = null) => withoutPreferredListForPoolDuty(evaluateShiftWishViolations({
    strengths: prefStrength,
    prefs: preferencesForDate(employee, dateStr),
    code,
    respectWishes: planConfig.respect_employee_wishes,
    holidayName: holidayMap[dateStr],
    shiftType,
    nightCount: Number(empStats[employee]?.nights || 0),
  }), code);
  // Last-resort pass: employees who are still below their target hours may get a shift that is not on
  // their preferred list (e.g. early when late/night are full). Unwanted shifts, blocked days,
  // limits and absences stay absolute.
  let relaxedWishPass = false;
  // Guarantee pass: employees more than MAX_HOURS_BELOW_TARGET below the official target may also be planned on
  // weekdays they asked to keep free (a wish, never a rule). Only used when everything else is exhausted.
  let guaranteePass = false;
  // Early-shift fallback (balance pass): for employees who are behind on hours, a wish list / unwanted shift never blocks an
  // early shift (night refusals, night limits and holiday wishes still do). Early is the overflow pool.
  let earlyFallbackPass = false;
  const isEarlyShiftCode = (code) => earlyShiftCodes.includes(String(code || '').trim().toUpperCase());
  const isHardBlockedForPass = (evaluation, code = null) => {
    if (earlyFallbackPass && isEarlyShiftCode(code)) {
      return evaluation.violations.some((violation) => violation.hard && (violation.monthly || (violation.type !== 'not_preferred' && violation.type !== 'unwanted')));
    }
    return relaxedWishPass
      ? evaluation.violations.some((violation) => violation.hard && (violation.monthly || violation.type !== 'not_preferred'))
      : evaluation.hardBlocked;
  };
  const isEmployeeShiftBlockedOnDate = (employee, dateStr, code) => violatesHolidayOnly(employee, dateStr, code)
    || violatesFullWeekend(employee, code)
    || violatesCrossMonthWeekType(employee, dateStr, code)
    || violatesNeverTogetherOnDate(employee, dateStr, code)
    || violatesInexperiencedOnDate(employee, dateStr, code)
    || isHardBlockedForPass(getShiftWishEvaluation(employee, dateStr, code), code);
  const getShiftWishPenaltyOnDate = (employee, dateStr, code) => getShiftWishEvaluation(employee, dateStr, code).penalty;
  // Month-level variant for the catch-up passes (no date / night count context).
  const evaluateShiftWishForPrefs = (prefs, code) => evaluateShiftWishViolations({
    strengths: prefStrength,
    prefs,
    code,
    respectWishes: planConfig.respect_employee_wishes,
  });
  // Employees for whom every early shift is blocked by their wishes (unwanted / only late+night preferred).
  // Late and night are the only places for their hours, so those slots go to them first (see candidate order).
  const earlyShiftCodes = shiftDefs
    .filter((definition) => normalizePlanningShiftTypeKey(definition.shift_type) === 'early')
    .map((definition) => String(definition.code || '').trim().toUpperCase());
  const lateNightOnlyEmployees = new Set(activeEmployees.filter((employee) => {
    if (earlyShiftCodes.length === 0) return false;
    const prefs = preferencesForDate(employee, `${month}-01`);
    return earlyShiftCodes.every((code) => evaluateShiftWishForPrefs(prefs, code).hardBlocked);
  }));
  planReport.lateNightOnlyEmployees = [...lateNightOnlyEmployees];
  // Late+night wishers (Admin option): may exceed the weekday late maximum on Thursday and Friday.
  const lateOverflowEligible = new Set();
  if (lateOverflowEnabled) {
    const lateCodes = shiftDefs.filter((definition) => normalizePlanningShiftTypeKey(definition.shift_type) === 'late').map((definition) => definition.code);
    const nightCodes = shiftDefs.filter((definition) => normalizePlanningShiftTypeKey(definition.shift_type) === 'night').map((definition) => definition.code);
    for (const employee of activeEmployees) {
      const prefs = preferencesForDate(employee, `${month}-01`);
      if (lateCodes.some((code) => isShiftPreferredByEmployeePreference(prefs, code))
        && nightCodes.some((code) => isShiftPreferredByEmployeePreference(prefs, code))) lateOverflowEligible.add(employee);
    }
  }
  planReport.lateOverflowEnabled = lateOverflowEnabled;
  planReport.lateOverflowEligible = [...lateOverflowEligible];
  planReport.lateOverflow = [];
  // Shifts above the maximum staffing that the balance pass added on purpose (year balance far below target).
  planReport.balanceOverstaff = [];
  // Early shifts that overrode a shift wish / unwanted shift to reach the hours (balance pass).
  planReport.earlyFallbacks = [];
  const isLateOverflowExempt = (employee, day, typeKey) => lateOverflowEligible.has(employee)
    && typeKey === 'late'
    && [4, 5].includes(dayOfWeek(year, mon, day));
  // One shift type per calendar week (Mon-Sun): an employee who already has a shift of another type in the same
  // week must not get a second type (e.g. late Mon-Wed, free, early Fri).
  const shiftTypeByCodeForWeeks = new Map([...shiftDefs, ...(shortNightDefinition ? [shortNightDefinition] : [])]
    .map((definition) => [String(definition.code || '').trim().toUpperCase(), normalizePlanningShiftTypeKey(definition.shift_type)]));
  const isDbsPoolMember = (employee) => Boolean(specialPoolsByShift.get(dbsPlanningConfig.shiftCode)?.has(employee));
  const hasOtherTypeInWeek = (employee, day, shiftType) => {
    if (!shiftType || shiftType === 'special') return false;
    // DBS members have their own rotation and limits outside DBS; they are not held to one type per week.
    if (isDbsPoolMember(employee)) return false;
    const weekStart = day - ((dayOfWeek(year, mon, day) + 6) % 7);
    for (let weekDay = Math.max(weekStart, 1); weekDay <= Math.min(weekStart + 6, numDays); weekDay++) {
      if (weekDay === day) continue;
      const assignedType = shiftTypeByCodeForWeeks.get(String(empDayAssignment[employee]?.[weekDay] || '').trim().toUpperCase());
      if (assignedType && assignedType !== 'special' && assignedType !== shiftType) return true;
    }
    return false;
  };
  const preferredTypesCache = new Map();
  const getPreferredTypes = (employee) => {
    if (!preferredTypesCache.has(employee)) {
      const prefs = preferencesForDate(employee, `${month}-01`);
      preferredTypesCache.set(employee, new Set(shiftDefs
        .filter((definition) => isShiftPreferredByEmployeePreference(prefs, definition.code))
        .map((definition) => normalizePlanningShiftTypeKey(definition.shift_type))));
    }
    return preferredTypesCache.get(employee);
  };
  // Shift types two colleagues can share: the overlap of their wishes; if only one of them has a wish, that wish.
  const getSharedPreferredTypes = (employee, colleague) => {
    const own = getPreferredTypes(employee);
    const other = getPreferredTypes(colleague);
    if (own.size > 0 && other.size > 0) return new Set([...own].filter((type) => other.has(type)));
    return own.size > 0 ? own : other;
  };
  // Employees who work a weekend only as Saturday + Sunday: no Monday-Saturday block (E1SA/E2SA), see the final weekend pass.
  let fullWeekendEmployees = new Set();
  const violatesFullWeekend = (employee, code) => fullWeekendEmployees.has(employee) && /SA$/.test(String(code || '').trim().toUpperCase());
  // Holiday-only employees (do-not-plan list with the holiday tick): only on bank holidays, and never a night block.
  const guardBankHolidays = buildBankHolidayMap(year);
  const violatesHolidayOnly = (employee, dateStr, code) => holidayOnlyEmployees.has(employee)
    && (!guardBankHolidays[dateStr] || /^N/.test(String(code || '').trim().toUpperCase()));
  let violatesNeverTogetherOnDate = () => false;
  let violatesCrossMonthWeekType = () => false;
  let violatesInexperiencedOnDate = () => false;
  let planningCursorDay = 0;
  const totalWeekendBlocks = countWeekendBlocks(year, mon, numDays);
  // Last worked weekend of the previous month (Monday key) per employee, for the weekend spacing.
  const empPreviousWeekendKey = {};
  // The former skills matrix is intentionally no longer part of planning.
  const featureFlags = { skillsEnabled: false };
  let assignedToday = null;
  // People whose weekend block is paused for one holiday (maximum reached): the block continues the next day.
  let holidaySkipToday = new Set();
  let assignedByShiftTypeToday = { early: 0, late: 0, night: 0, special: 0 };
  let assignedByDefToday = {};

  for (const employee of activeEmployees) {
    empStats[employee] = { nights: 0, weekends: 0, workedWeekendBlocks: new Set(), shiftTypeChanges: 0, earlyCount: 0, lateCount: 0, total: 0, actualHours: 0, targetHours: employeeTargetHours[employee], specialShiftCounts: {} };
    empDayAssignment[employee] = {};
    const carried = carryState[employee] || {};
    // Days of the previous month (0, -1, -2 ...) are readable like planned days, but invisible for loops over the month.
    for (const [offset, code] of Object.entries(carried.recentCodes || {})) {
      const dayOffset = Number.parseInt(offset, 10);
      if (!Number.isInteger(dayOffset) || dayOffset > 0 || dayOffset <= -7 || !code) continue;
      Object.defineProperty(empDayAssignment[employee], dayOffset, { value: String(code).trim().toUpperCase(), enumerable: false, writable: true, configurable: true });
    }
    empConsecutiveWork[employee] = Math.max(Number.parseInt(carried.consecutiveWork, 10) || 0, 0);
    empLastShiftType[employee] = carried.lastShiftType || null;
    empRequiredFreeDays[employee] = Math.max(Number.parseInt(carried.requiredFreeDays, 10) || 0, 0);
    empHours[employee] = 0;
    empRecoveryReason[employee] = carried.recoveryReason || null;
    empSeriesCode[employee] = carried.seriesCode || null;
    empSeriesRemaining[employee] = Math.max(Number.parseInt(carried.seriesRemaining, 10) || 0, 0);
    carriedSeriesUntilDay[employee] = empSeriesRemaining[employee] > 0 ? planningStartDay + empSeriesRemaining[employee] - 1 : 0;
    empSeriesTotalDays[employee] = Math.max(Number.parseInt(carried.seriesTotalDays, 10) || 0, 0);
    empLastWorkedShiftCode[employee] = carried.lastWorkedShiftCode || null;
    empLastWorkedShiftType[employee] = carried.lastWorkedShiftType || null;
    empLastWorkedDay[employee] = null;
    empPreviousWeekendKey[employee] = carried.lastWeekendKey || null;
    empForcedNextShiftCode[employee] = carried.forcedNextShiftCode || null;
    empBlockHistory[employee] = carried.lastWorkedShiftCode
      ? [{ code: String(carried.lastWorkedShiftCode).toUpperCase(), type: carried.lastWorkedShiftType || null }]
      : [];
  }

  // pg returns DATE columns as local-midnight Date objects; compare calendar keys to avoid timezone drift.
  const toAbsenceDateKey = (value) => {
    if (value instanceof Date) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    return String(value || '').slice(0, 10);
  };
  const absenceCoversDate = (absence, dateStr) => {
    const dateKey = String(dateStr || '').slice(0, 10);
    return dateKey >= toAbsenceDateKey(absence.start_date) && dateKey <= toAbsenceDateKey(absence.end_date);
  };

  const isEmployeeAbsentOnDate = (employeeName, dateStr) => {
    const absences = absenceMap.get(employeeName) || [];
    return absences.some((absence) => absenceCoversDate(absence, dateStr));
  };

  const getEmployeeAbsenceOnDate = (employeeName, dateStr) => {
    const absences = absenceMap.get(employeeName) || [];
    return absences.find((absence) => absenceCoversDate(absence, dateStr)) || null;
  };

  // Every weekend the employee really works in the plan (read from the cells, so no planning path can be missed).
  const workedWeekendKeysOf = (employee) => {
    const keys = new Set(empStats[employee].workedWeekendBlocks);
    if (empPreviousWeekendKey[employee]) keys.add(empPreviousWeekendKey[employee]);
    for (const [dayText, code] of Object.entries(empDayAssignment[employee] || {})) {
      if (code && isWeekend(year, mon, Number(dayText))) keys.add(getWeekendBlockKey(year, mon, Number(dayText)));
    }
    return keys;
  };
  // Weekend spacing: whoever worked a weekend (also a single Saturday) gets the following weekends free.
  const violatesWeekendSpacing = (employee, newKeys) => {
    if (minWeekendGapWeeks <= 1 || newKeys.length === 0) return false;
    const known = [...workedWeekendKeysOf(employee)];
    for (const key of newKeys) {
      const index = weekendKeyToWeekIndex(key);
      if (index === null) continue;
      for (const other of known) {
        if (other === key) continue;
        const otherIndex = weekendKeyToWeekIndex(other);
        if (otherIndex !== null && Math.abs(index - otherIndex) < minWeekendGapWeeks) return true;
      }
    }
    return false;
  };

  // Weekend keys that the given days would add to the employee.
  const newWeekendKeysFor = (employee, days) => {
    const worked = empStats[employee].workedWeekendBlocks;
    const keys = [];
    for (const day of days) {
      if (!isWeekend(year, mon, day)) continue;
      const key = getWeekendBlockKey(year, mon, day);
      if (!worked.has(key) && !keys.includes(key)) keys.push(key);
    }
    return keys;
  };
  const wouldExceedEmployeeWeekendLimit = (employee, days, { skipSpacing = false } = {}) => {
    const projected = new Set(empStats[employee].workedWeekendBlocks);
    const newKeys = [];
    for (const day of days) {
      if (isWeekend(year, mon, day)) {
        const key = getWeekendBlockKey(year, mon, day);
        if (!projected.has(key) && !newKeys.includes(key)) newKeys.push(key);
        projected.add(key);
      }
    }
    // Bank holiday weekends (Christmas, Easter ...) need more people than a normal weekend: the admin rotation limits (weekend
    // spacing, weekends per month +1) are relaxed for them; the employee's own hard wishes stay in force.
    const holidayWeekend = days.some((day) => isWeekend(year, mon, day) && Boolean(guardBankHolidays[`${month}-${String(day).padStart(2, '0')}`]));
    if (!skipSpacing && !holidayWeekend && violatesWeekendSpacing(employee, newKeys)) return true;
    // The individual limit only blocks while its strength is 100 %; softer
    // strengths are penalised in the candidate scoring (max_weekends).
    const individualLimit = isHardStrength(prefStrength.max_weekends)
      ? Number.parseInt(String(empPrefsMap.get(employee)?.max_weekends_per_month ?? ''), 10)
      : Number.NaN;
    const rotationLimit = Number.parseInt(String(rotation.max_weekends_per_month ?? ''), 10) + (holidayWeekend ? 1 : 0);
    return [individualLimit, rotationLimit].some((limit) => Number.isInteger(limit) && projected.size > limit);
  };

  const isEmployeeBlockedByExclusionOnDay = (employeeName, dow) => (
    exclusionBlockedWeekdaysByEmployee.get(employeeName)?.has(Number(dow)) === true
  );
  // Employee weekday exclusions only block at strength 100 %; admin exclusions stay absolute.
  const isEmployeeBlockedByPreferenceOnDay = (employeeName, dow) => {
    return isEmployeeBlockedByExclusionOnDay(employeeName, dow)
      || (isHardStrength(prefStrength.blocked_days) && isDayBlockedByEmployeePreference(empPrefsMap.get(employeeName), dow));
  };
  // Soft weekday exclusion (0 < strength < 100): penalty instead of removal.
  const getBlockedDayPenalty = (employeeName, dow) => {
    if (isHardStrength(prefStrength.blocked_days) || isIgnoredStrength(prefStrength.blocked_days)) return 0;
    return isDayBlockedByEmployeePreference(empPrefsMap.get(employeeName), dow) ? softPenalty(prefStrength.blocked_days) : 0;
  };

  const getEmployeeNightModel = (employeeName) => {
    return resolveEmployeeNightModel({
      planningMode: rotation.night_planning_mode,
      employeeNightModel: empPrefsMap.get(employeeName)?.night_model,
    });
  };
  // A seven-night block carried over from the previous month must not turn
  // into four or more consecutive NK shifts for a short-night employee.
  for (const employee of activeEmployees) {
    if (getEmployeeNightModel(employee) !== NIGHT_MODELS.SHORT) continue;
    const carriedDefinition = [...shiftDefs, ...(shortNightDefinition ? [shortNightDefinition] : [])]
      .find((definition) => String(definition.code || '').trim().toUpperCase() === String(empSeriesCode[employee] || '').trim().toUpperCase());
    if (normalizePlanningShiftTypeKey(carriedDefinition?.shift_type) !== 'night' || empSeriesRemaining[employee] <= 0) continue;
    const alreadyWorked = Math.max(empSeriesTotalDays[employee] - empSeriesRemaining[employee], 0);
    const allowedRemaining = Math.max(shortNightSeriesDays - alreadyWorked, 0);
    if (empSeriesRemaining[employee] <= allowedRemaining) continue;
    empSeriesRemaining[employee] = allowedRemaining;
    empSeriesTotalDays[employee] = Math.min(empSeriesTotalDays[employee], shortNightSeriesDays);
    if (allowedRemaining === 0) {
      empSeriesCode[employee] = null;
      empSeriesTotalDays[employee] = 0;
      empRequiredFreeDays[employee] = Math.max(empRequiredFreeDays[employee], Number(rotation.short_night_free_days_after ?? rotation.free_days_after_night) || 0);
      empRecoveryReason[employee] = 'Kurze Nachtschicht';
    }
  }
  // DBS pool members can have their own rule for the time outside DBS: which shifts and how many
  // days per month. Without a rule they are planned like everybody else.
  // Every DBS pool member is bound by this rule outside the own DBS week: only
  // the shift types stored in the admin menu (default: early or late) and never
  // a seven-day block (E1WE/E2WE/L1WE/N). Without a stored choice early and late
  // are both allowed.
  // Free days after a DBS block. Mon-Fri pattern: only pattern days count (the weekend is free anyway,
  // "two days free" means Monday and Tuesday). Pattern with Saturday (Mon-Sat): Sunday is the weekly rest
  // and counts as the first free day (Sunday + Monday free, back on Tuesday).
  const countDbsRecoveryDays = (patternDays, freeDays, lastDay) => {
    const countsSunday = Array.isArray(patternDays) && patternDays.includes(6);
    let recovery = 0;
    let counted = 0;
    while (counted < freeDays && recovery < 14) {
      recovery++;
      const weekday = dayOfWeek(year, mon, lastDay + recovery);
      if (patternDays.includes(weekday) || (countsSunday && weekday === 0)) counted++;
    }
    return recovery;
  };
  const getDbsOutsideRule = (employee) => {
    if (!dbsPlanningConfig.enabled) return null;
    return specialPoolsByShift.get(dbsPlanningConfig.shiftCode)?.get(employee) || null;
  };
  const countDaysOutsideDbs = (employee) => Object.values(empDayAssignment[employee] || {})
    .filter((code) => code && String(code).trim().toUpperCase() !== dbsPlanningConfig.shiftCode).length;
  const describeDbsOutsideRule = (rule) => `${rule.otherShiftCodes.length ? `nur ${rule.otherShiftCodes.join(', ')}` : 'nur Früh- oder Spätschicht'}, keine 6-/7-Tage-Wochenendblöcke${rule.otherDaysPerMonth !== null ? `, höchstens ${rule.otherDaysPerMonth} Tage/Monat` : ''}`;
  const isOutsideDbsAllowed = (employee, definition, additionalDays = 1) => {
    const rule = getDbsOutsideRule(employee);
    if (!rule) return true;
    const code = String(definition?.code || '').trim().toUpperCase();
    if (code === dbsPlanningConfig.shiftCode) return true;
    const typeKey = normalizePlanningShiftTypeKey(definition?.shift_type);
    const typeToken = typeKey === 'night' ? 'NIGHT' : typeKey === 'late' ? 'LATE' : typeKey === 'early' ? 'EARLY' : '';
    // Short night blocks (NK) are shorter than seven days; the long N block is not allowed outside DBS.
    const usesShortNight = typeKey === 'night' && getEmployeeNightModel(employee) === NIGHT_MODELS.SHORT;
    // DBS members never run a Saturday/weekend block (6 or 7 days) outside DBS: only weekday blocks.
    if (!usesShortNight && getShiftSeriesDays(definition) >= 6) return false;
    if (/(SA|WE)$/.test(code) && code !== dbsPlanningConfig.shiftCode) return false;
    if (rule.otherShiftCodes.length > 0 && !guaranteePass) {
      // Tokens EARLY/LATE/NIGHT (shift type) or legacy shift codes.
      // (In the guarantee pass the early/late choice is open: only weekday early/late blocks, never night.)
      const allowedByRule = rule.otherShiftCodes.some((allowed) => {
        const token = String(allowed || '').trim().toUpperCase();
        if (token === 'EARLY' || token === 'LATE' || token === 'NIGHT') return token === typeToken;
        return getPreferenceShiftCode(token) === getPreferenceShiftCode(code);
      });
      if (!allowedByRule) return false;
    } else if (typeToken !== 'EARLY' && typeToken !== 'LATE') {
      return false;
    }
    if (rule.otherDaysPerMonth !== null && countDaysOutsideDbs(employee) + additionalDays > rule.otherDaysPerMonth) return false;
    return true;
  };
  // Paid hours of a shift on a day: public holidays (federal + Hessen) are credited twice.
  const getShiftHoursForDay = (definition, day) => getHolidayAdjustedShiftHours({
    baseHours: getShiftDurationHours(definition, dayOfWeek(year, mon, day)),
    month,
    day,
    holidayName: holidayMap[`${month}-${String(day).padStart(2, '0')}`] || null,
    definition,
  });
  const isPoolEmployeeWorkingOnWeekday = (definition, employeeName, weekday) => {
    const shiftCode = String(definition?.code || '').trim().toUpperCase();
    if (shiftCode !== dbsPlanningConfig.shiftCode) return true;
    const entry = specialPoolsByShift.get(shiftCode)?.get(employeeName);
    return Boolean(entry?.workingWeekdays?.includes(weekday));
  };
  // DBS rotation plan (day -> employee), filled before the day loop.
  const dbsRoster = new Map();
  const dbsReservedDays = new Map();
  const isDbsDefinition = (definition) => String(definition?.code || '').trim().toUpperCase() === dbsPlanningConfig.shiftCode;
  const getDbsRosterRunLength = (employeeName, day) => {
    let length = 0;
    while (day + length <= planningEndDay && dbsRoster.get(day + length) === employeeName) length++;
    return length;
  };
  const getPlannedSeriesDays = (employeeName, shiftDef, day) => {
    if (isDbsDefinition(shiftDef) && dbsRoster.size > 0) {
      return Math.max(getDbsRosterRunLength(employeeName, day), 1);
    }
    if (normalizePlanningShiftTypeKey(shiftDef?.shift_type) !== 'night') {
      return getAnchoredSeriesDays(shiftDef, dayOfWeek(year, mon, day));
    }
    if (getEmployeeNightModel(employeeName) !== NIGHT_MODELS.SHORT) {
      return getAnchoredSeriesDays(shiftDef, dayOfWeek(year, mon, day));
    }

    // Short blocks may start on every day. Reduce only for the month boundary
    // or a known hard block; never create four consecutive nights.
    let blockDays = getNightSeriesDaysForModel({
      nightModel: NIGHT_MODELS.SHORT,
      remainingDays: planningEndDay - day + 1,
      shortSeriesDays: shortNightSeriesDays,
    });
    const preferences = empPrefsMap.get(employeeName);
    for (let offset = 1; offset < blockDays; offset++) {
      const nextDay = day + offset;
      const nextDate = `${month}-${String(nextDay).padStart(2, '0')}`;
      if (isEmployeeAbsentOnDate(employeeName, nextDate)
        || isEmployeeBlockedByPreferenceOnDay(employeeName, dayOfWeek(year, mon, nextDay))
        || isEmployeeShiftBlockedOnDate(employeeName, nextDate, shiftDef.code)) {
        blockDays = offset;
        break;
      }
    }
    return Math.max(blockDays, 1);
  };

  const getCreditedAbsenceHours = (absence, weekend) => {
    if (!absence || weekend) return 0;
    return CREDITED_ABSENCE_TYPES.has(String(absence.type || '').toUpperCase()) ? CREDITED_ABSENCE_HOURS : 0;
  };
  // A public holiday on Monday-Friday on which somebody does not work counts as 8 paid hours
  // (the shift plan screen credits it the same way). Without this the generator would try to fill
  // hours that the plan already credits and report shortfalls that do not exist.
  const holidayCreditDays = Object.fromEntries(activeEmployees.map((employee) => [employee, new Set()]));
  const creditHolidayHours = (employee, day) => {
    if (holidayCreditDays[employee].has(day)) return;
    holidayCreditDays[employee].add(day);
    empHours[employee] += HOLIDAY_CREDIT_HOURS;
    empStats[employee].actualHours = Number(empHours[employee].toFixed(2));
  };
  // A shift added later (catch-up passes) replaces the credit of that day.
  const releaseHolidayCredit = (employee, day) => {
    if (!holidayCreditDays[employee].delete(day)) return;
    empHours[employee] = Math.max(empHours[employee] - HOLIDAY_CREDIT_HOURS, 0);
    empStats[employee].actualHours = Number(empHours[employee].toFixed(2));
  };

  const assignShiftToEmployee = ({ emp, shiftDef, day, dateStr, weekend, holidayName, explanationReasons = [], score = null, eligibleCount = null }) => {
    const usesShortNight = normalizePlanningShiftTypeKey(shiftDef.shift_type) === 'night'
      && getEmployeeNightModel(emp) === NIGHT_MODELS.SHORT
      && shortNightDefinition;
    // Keep the N series internally so a short block continues correctly, but
    // persist NK so every plan view can clearly distinguish the short model.
    const assignedShiftDef = usesShortNight ? shortNightDefinition : shiftDef;
    const assignedShiftCode = assignedShiftDef.code;
    const previousWorkedShiftType = empLastWorkedShiftType[emp];
    const configuredSeriesDays = getShiftSeriesDays(shiftDef);
    const continuingBlock = empSeriesRemaining[emp] > 0 && empSeriesCode[emp] === shiftDef.code;
    const seriesDays = continuingBlock
      ? (empSeriesTotalDays[emp] || configuredSeriesDays)
      : getPlannedSeriesDays(emp, shiftDef, day);
    const remainingBefore = continuingBlock ? empSeriesRemaining[emp] : 0;
    const dayInSeries = continuingBlock ? Math.max(seriesDays - remainingBefore + 1, 1) : 1;
    const remainingAfter = seriesDays > 1
      ? (continuingBlock ? Math.max(remainingBefore - 1, 0) : seriesDays - 1)
      : 0;
    const blockEndsToday = remainingAfter === 0;
    if (!continuingBlock) {
      empBlockHistory[emp].push({ code: String(shiftDef.code || '').toUpperCase(), type: normalizePlanningShiftTypeKey(shiftDef.shift_type), seriesDays: getShiftSeriesDays(shiftDef) });
    }

    if (remainingAfter > 0) {
      empSeriesCode[emp] = shiftDef.code;
      empSeriesRemaining[emp] = remainingAfter;
      empSeriesTotalDays[emp] = seriesDays;
    } else {
      empSeriesCode[emp] = null;
      empSeriesRemaining[emp] = 0;
      empSeriesTotalDays[emp] = 0;
    }

    shifts.push({ employee_name: emp, day, shift_code: assignedShiftCode });
    assignedToday.add(emp);
    empDayAssignment[emp][day] = assignedShiftCode;
    assignedByShiftTypeToday[shiftDef.shift_type] = Number(assignedByShiftTypeToday[shiftDef.shift_type] || 0) + 1;
    assignedByDefToday[shiftDef.code] = Number(assignedByDefToday[shiftDef.code] || 0) + 1;
    empLastShiftType[emp] = shiftDef.shift_type;
    empLastWorkedShiftCode[emp] = assignedShiftCode;
    empLastWorkedShiftType[emp] = shiftDef.shift_type;
    empLastWorkedDay[emp] = day;
    if (empForcedNextShiftCode[emp] === shiftDef.code) empForcedNextShiftCode[emp] = null;
    empConsecutiveWork[emp]++;

    const effectiveWorkdayLimit = Math.max(rotation.max_consecutive_workdays, seriesDays);
    if (rotation.min_free_after_streak > 0 && empConsecutiveWork[emp] >= effectiveWorkdayLimit && blockEndsToday) {
      empRequiredFreeDays[emp] = Math.max(empRequiredFreeDays[emp], rotation.min_free_after_streak);
      empRecoveryReason[emp] = 'Arbeitsserie';
    }
    if (shiftDef.shift_type === 'night' && blockEndsToday) {
      const targetWeekday = Math.max(0, Math.min(6, Number.parseInt(rotation.night_next_workday, 10) || 0));
      const currentWeekday = dayOfWeek(year, mon, day);
      const daysUntilTarget = usesShortNight ? 0 : ((targetWeekday - currentWeekday + 7) % 7 || 7);
      const recoveryDays = usesShortNight
        ? Number(rotation.short_night_free_days_after ?? rotation.free_days_after_night)
        : Number(rotation.free_days_after_night);
      empRequiredFreeDays[emp] = Math.max(empRequiredFreeDays[emp], recoveryDays, daysUntilTarget - 1);
      empRecoveryReason[emp] = usesShortNight ? 'Kurze Nachtschicht' : 'Nachtschicht';
      empForcedNextShiftCode[emp] = usesShortNight ? null : (rotation.night_next_shift_code || null);
    }
    if (weekend && rotation.free_days_after_weekend > 0 && blockEndsToday) {
      empRequiredFreeDays[emp] = Math.max(empRequiredFreeDays[emp], rotation.free_days_after_weekend);
      empRecoveryReason[emp] = 'Wochenendarbeit';
    }
    if (blockEndsToday && Number(shiftDef.mode_free_days_after) > 0) {
      empRequiredFreeDays[emp] = Math.max(empRequiredFreeDays[emp], Number(shiftDef.mode_free_days_after));
      empRecoveryReason[emp] = `${shiftDef.active_mode_label || 'Schichtmodus'}: Erholung nach ${shiftDef.code}`;
    } else if (blockEndsToday && assignedShiftDef.free_days_after !== null && assignedShiftDef.free_days_after !== undefined) {
      // Per-shift "Freie Tage nach der Schicht" (NULL = global rules). Precedence:
      // active mode (above) -> definition value (here) -> global rules.
      const definitionFreeDays = Math.max(0, Math.min(14, Number.parseInt(String(assignedShiftDef.free_days_after), 10) || 0));
      const keepsMondayAnchor = shiftDef.shift_type === 'night' && !usesShortNight
        ? Math.max((((Math.max(0, Math.min(6, Number.parseInt(rotation.night_next_workday, 10) || 0)) - dayOfWeek(year, mon, day) + 7) % 7) || 7) - 1, 0)
        : 0;
      empRequiredFreeDays[emp] = Math.max(definitionFreeDays, keepsMondayAnchor);
      empRecoveryReason[emp] = `Erholung nach ${assignedShiftDef.code} (Schichtdefinition)`;
    }

    const ownPoolHours = specialPoolsByShift.get(String(shiftDef.code || '').trim().toUpperCase())?.get(emp)?.durationHours;
    const shiftHours = Number.isFinite(ownPoolHours) && ownPoolHours > 0
      ? getHolidayAdjustedShiftHours({ baseHours: ownPoolHours, month, day, holidayName: holidayMap[`${month}-${String(day).padStart(2, '0')}`] || null, definition: assignedShiftDef })
      : getShiftHoursForDay(assignedShiftDef, day);
    if (shiftDef.shift_type === 'night') empStats[emp].nights++;
    if (weekend) {
      empStats[emp].weekends++;
      empStats[emp].workedWeekendBlocks.add(getWeekendBlockKey(year, mon, day));
    }
    if (String(shiftDef.code).toUpperCase() === dbsPlanningConfig.shiftCode && blockEndsToday) {
      const dbsEntry = specialPoolsByShift.get(dbsPlanningConfig.shiftCode)?.get(emp);
      const freeDaysAfterBlock = dbsEntry?.freeDaysAfterBlock ?? dbsPlanningConfig.freeDaysAfterBlock;
      // Days outside the employee's DBS weekdays (e.g. Sunday for a Mon-Sat
      // pattern) are free anyway and must not consume the recovery days.
      const dbsWeekdays = dbsEntry?.workingWeekdays?.length ? dbsEntry.workingWeekdays : [0, 1, 2, 3, 4, 5, 6];
      const dbsRecoveryDays = countDbsRecoveryDays(dbsWeekdays, freeDaysAfterBlock, day);
      empRequiredFreeDays[emp] = Math.max(empRequiredFreeDays[emp], dbsRecoveryDays);
      empRecoveryReason[emp] = 'DBS-Block';
    }
    if (previousWorkedShiftType && previousWorkedShiftType !== shiftDef.shift_type) empStats[emp].shiftTypeChanges++;
    if (shiftDef.shift_type === 'early') empStats[emp].earlyCount++;
    if (shiftDef.shift_type === 'late') empStats[emp].lateCount++;
    empStats[emp].total++;
    empStats[emp].specialShiftCounts[assignedShiftCode] = Number(empStats[emp].specialShiftCounts[assignedShiftCode] || 0) + 1;
    empHours[emp] += shiftHours;
    empStats[emp].actualHours = Number(empHours[emp].toFixed(2));
    planReport.totalShiftsPlanned++;

    const expKey = `${emp}_${day}`;
    const allReasons = [
      'Verfügbar (kein Urlaub/Abwesenheit, nicht ausgeschlossen)',
      `Schicht: ${assignedShiftDef.name} (${assignedShiftCode})`,
    ];
    if (seriesDays > 1) {
      allReasons.push(`Serienplanung: Tag ${dayInSeries}/${seriesDays}`);
    }
    if (!continuingBlock && configuredSeriesDays > seriesDays) {
      allReasons.push(`Wochenanker: Übergangsblock bis Montag (${seriesDays} Tage)`);
    }
    if (explanationReasons.length > 0) {
      allReasons.push(...explanationReasons);
    }
    if (Number.isFinite(score) && Number.isInteger(eligibleCount) && eligibleCount > 0) {
      allReasons.push(`Planungsbewertung: ${score} Punkte (Rang 1 von ${eligibleCount} zulässigen Kandidaten)`);
    }
    explanations[expKey] = { employee: emp, day, code: shiftDef.code, reasons: allReasons, score };

    const prefs = empPrefsMap.get(emp);
    if (prefs) {
      const preferenceShiftCode = getPreferenceShiftCode(shiftDef.code);
      if ((prefs.preferred_shifts || []).includes(preferenceShiftCode)) planReport.wishesRespected++;
      if ((prefs.unwanted_shifts || []).includes(preferenceShiftCode)) planReport.wishesDenied++;
      if (holidayName && (prefs.preferred_holidays || []).includes(holidayName)) planReport.wishesDenied++;
    }
  };

  // Colo competence: steer pool members into the shifts where Colo cover is
  // required, but only when this does not contradict their own shift wishes.
  const coloPoolKeys = new Set(coloPlanningConfig.enabled
    ? coloPlanningConfig.employeePool.map((employee) => coloNameKey(employee))
    : []);
  const coloShiftTypeByCode = new Map([...shiftDefs, ...(shortNightDefinition ? [shortNightDefinition] : [])]
    .map((definition) => [String(definition.code || '').trim().toUpperCase(), normalizePlanningShiftTypeKey(definition.shift_type)]));
  const isColoPoolEmployee = (employee) => coloPoolKeys.has(coloNameKey(employee));

  // Fixed pair rule (lib/fixedEmployeeRules.js): never together on night / weekend shifts. Checked in every
  // candidate test (also against the running blocks of the partner); a final pass removes what slipped through.
  fullWeekendEmployees = new Set(activeEmployees.filter((employee) => requiresFullWeekend(employee)));
  const neverTogetherByEmployee = new Map();
  for (const employee of activeEmployees) {
    for (const other of activeEmployees) {
      const rule = getNeverTogetherRule(employee, other);
      if (!rule) continue;
      if (!neverTogetherByEmployee.has(employee)) neverTogetherByEmployee.set(employee, []);
      neverTogetherByEmployee.get(employee).push({ partner: other, rule });
    }
  }
  // Personal list of the one person who has the menu (wish list): the same rule as a fixed pair, per chosen colleague.
  try {
    const avoidRows = (await pool.query('SELECT key, value FROM app_settings WHERE key LIKE $1', [`${PERSONAL_AVOID_KEY_PREFIX}%`])).rows;
    const lists = avoidRows.map((row) => {
      let ids = [];
      try { const parsed = JSON.parse(String(row.value || '[]')); ids = Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : []; } catch { ids = []; }
      return { ownerId: Number.parseInt(String(row.key).slice(PERSONAL_AVOID_KEY_PREFIX.length), 10), ids };
    }).filter((entry) => Number.isInteger(entry.ownerId) && entry.ids.length > 0);
    if (lists.length > 0) {
      const wanted = [...new Set(lists.flatMap((entry) => [entry.ownerId, ...entry.ids]))];
      const userRows = (await pool.query('SELECT id, first_name, last_name, provisioned_employee_name FROM users WHERE id = ANY($1::int[])', [wanted])).rows;
      const planNameById = new Map(userRows.map((row) => [Number(row.id), resolveUserPlanName(row)]));
      const ownerMayKeep = new Map(userRows.map((row) => [Number(row.id), mayKeepPersonalAvoidList(row.provisioned_employee_name, [row.first_name, row.last_name].filter(Boolean).join(' '))]));
      planReport.personalAvoid = [];
      for (const entry of lists) {
        const owner = planNameById.get(entry.ownerId);
        if (!owner || !ownerMayKeep.get(entry.ownerId) || !activeEmployees.includes(owner)) continue;
        for (const partnerId of entry.ids) {
          const partner = planNameById.get(partnerId);
          if (!partner || partner === owner || !activeEmployees.includes(partner)) continue;
          for (const [a, b] of [[owner, partner], [partner, owner]]) {
            if (!neverTogetherByEmployee.has(a)) neverTogetherByEmployee.set(a, []);
            if (!neverTogetherByEmployee.get(a).some((existing) => existing.partner === b)) neverTogetherByEmployee.get(a).push({ partner: b, rule: PERSONAL_AVOID_RULE });
          }
          planReport.personalAvoid.push({ owner, partner });
        }
      }
    }
  } catch (error) {
    console.warn('Personal avoid list unavailable:', error.message);
  }
  // One shift type per week across the month change: whoever worked early (late) in the first days of a week that began
  // in the previous month does not get the other type (late / early) in the rest of that week.
  violatesCrossMonthWeekType = (employee, dateStr, code) => {
    const dayNumber = Number.parseInt(String(dateStr).split('-').pop(), 10);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 6) return false;
    const ownType = coloShiftTypeByCode.get(String(code || '').trim().toUpperCase());
    if (ownType !== 'early' && ownType !== 'late') return false;
    const daysSinceMonday = (dayOfWeek(year, mon, dayNumber) + 6) % 7;
    for (let previousDay = dayNumber - daysSinceMonday; previousDay <= 0; previousDay++) {
      const earlierType = coloShiftTypeByCode.get(String(empDayAssignment[employee]?.[previousDay] || '').trim().toUpperCase());
      if ((earlierType === 'early' || earlierType === 'late') && earlierType !== ownType) return true;
    }
    return false;
  };
  // Inexperienced employees (admin setting): never two of them in the same shift type on one day.
  const isInexperienced = (employee) => inexperiencedKeys.has(coloNameKey(employee));
  const inexperiencedEmployees = activeEmployees.filter(isInexperienced);
  // Shift type an employee works on a day: planned cell, or the running block of the employee (future days).
  const shiftTypeOnDay = (employee, dayNumber) => {
    let code = empDayAssignment[employee]?.[dayNumber] || null;
    if (!code && dayNumber > planningCursorDay && empSeriesRemaining[employee] > 0 && dayNumber - planningCursorDay <= empSeriesRemaining[employee]) code = empSeriesCode[employee];
    return code ? coloShiftTypeByCode.get(String(code).trim().toUpperCase()) : null;
  };
  violatesInexperiencedOnDate = (employee, dateStr, code) => {
    if (inexperiencedEmployees.length < 2 || !isInexperienced(employee)) return false;
    const dayNumber = Number.parseInt(String(dateStr).split('-').pop(), 10);
    if (!Number.isInteger(dayNumber)) return false;
    const ownType = coloShiftTypeByCode.get(String(code || '').trim().toUpperCase());
    // Hard only where staff is scarce (late, night); in the large early shift it is a preference (see mentorRank).
    if (ownType !== 'late' && ownType !== 'night') return false;
    return inexperiencedEmployees.some((other) => other !== employee && shiftTypeOnDay(other, dayNumber) === ownType);
  };

  // Fixed groups who are planned together when possible (Marco + Mustafar, night team with Noah and Patrick Brode).
  const togetherPartnersByEmployee = new Map();
  for (const employee of activeEmployees) {
    const partners = getTogetherPartners(employee, activeEmployees);
    if (partners.length > 0) togetherPartnersByEmployee.set(employee, partners);
  }
  violatesNeverTogetherOnDate = (employee, dateStr, code) => {
    const partners = neverTogetherByEmployee.get(employee);
    if (!partners || partners.length === 0) return false;
    const dayNumber = Number.parseInt(String(dateStr).split('-').pop(), 10);
    if (!Number.isInteger(dayNumber)) return false;
    const weekday = dayOfWeek(year, mon, dayNumber);
    const ownType = coloShiftTypeByCode.get(String(code || '').trim().toUpperCase());
    for (const { partner, rule } of partners) {
      let partnerCode = empDayAssignment[partner]?.[dayNumber] || null;
      if (!partnerCode && dayNumber > planningCursorDay && empSeriesRemaining[partner] > 0
        && dayNumber - planningCursorDay <= empSeriesRemaining[partner]) partnerCode = empSeriesCode[partner];
      if (!partnerCode) continue;
      if (violatesNeverTogether(rule, ownType, coloShiftTypeByCode.get(String(partnerCode).trim().toUpperCase()), weekday)) return true;
    }
    return false;
  };
  // Per-person Colo limits of the admin menu (only certain shift types / weekdays). Someone who is not allowed to do
  // Colo on that shift type / weekday does not count as Colo cover and is not steered into it.
  const coloRuleByKey = new Map(Object.entries(coloPlanningConfig.employeeRules || {}).map(([name, rule]) => [coloNameKey(name), rule]));
  const isColoAllowedFor = (employee, shiftType, weekday) => {
    if (!isColoPoolEmployee(employee)) return false;
    return isColoAllowedByRule(coloRuleByKey.get(coloNameKey(employee)), shiftType, weekday);
  };
  // Pool members on the DBS duty who may cover this Colo task as well (admin rule): they count as Colo cover, so no
  // further person has to be planned for it.
  const dbsColoCoverCount = (day, shiftType) => {
    if (!dbsPlanningConfig.enabled || coloPoolKeys.size === 0) return 0;
    const weekday = dayOfWeek(year, mon, day);
    const holder = dbsRoster.get(day);
    return holder && isColoPoolEmployee(holder) && isColoCoveredByDbs(coloRuleByKey.get(coloNameKey(holder)), shiftType, weekday) ? 1 : 0;
  };
  // Returns the open Colo demand for today and the following days that a new
  // block starting today would cover. Running blocks count as future cover.
  const getOpenColoDemandByOffset = (day, shiftType, horizon) => {
    const demand = [];
    if (coloPoolKeys.size === 0) return demand;
    for (let offset = 0; offset < horizon && day + offset <= planningEndDay; offset++) {
      const targetDay = day + offset;
      const required = getColoTaskRequirements(dayOfWeek(year, mon, targetDay), coloPlanningConfig)
        .filter((task) => task.shiftType === shiftType)
        .reduce((sum, task) => sum + task.required, 0);
      const covered = activeEmployees.filter((employee) => {
        if (!isColoAllowedFor(employee, shiftType, dayOfWeek(year, mon, targetDay))) return false;
        if (coloShiftTypeByCode.get(String(empDayAssignment[employee]?.[day] || '').trim().toUpperCase()) !== shiftType) return false;
        return offset === 0 || empSeriesRemaining[employee] >= offset;
      }).length + dbsColoCoverCount(targetDay, shiftType);
      demand.push(Math.max(required - covered, 0));
    }
    return demand;
  };

  // DBS is planned before the regular shifts. A weekday disabled in the weekly
  // owner's DBS pattern remains a normal operations day; it must never be
  // reassigned to another DBS pool member.
  const dbsDefinitionForRoster = shiftDefs.find(isDbsDefinition);
  const dbsPoolEntries = dbsPlanningConfig.enabled && dbsDefinitionForRoster
    ? [...(specialPoolsByShift.get(dbsPlanningConfig.shiftCode)?.entries() || [])].filter(([name]) => activeEmployees.includes(name))
    : [];
  if (dbsPoolEntries.length > 0) {
    const poolNames = dbsPoolEntries.map(([name]) => name);
    const poolEntryByName = new Map(dbsPoolEntries);
    const weekdayLimit = Math.max(Number(rotation.max_consecutive_workdays) || 0, 7);
    const isAvailableForDbs = (name, day) => {
      const dateKey = `${month}-${String(day).padStart(2, '0')}`;
      const weekday = dayOfWeek(year, mon, day);
      if (!poolEntryByName.get(name)?.workingWeekdays?.includes(weekday)) return false;
      if (isEmployeeAbsentOnDate(name, dateKey) || isEmployeeBlockedByPreferenceOnDay(name, weekday)) return false;
      if (isEmployeeShiftBlockedOnDate(name, dateKey, dbsDefinitionForRoster.code)) return false;
      if (day - planningStartDay < (empRequiredFreeDays[name] || 0)) return false;
      return true;
    };
    const weeks = [];
    for (let day = planningStartDay; day <= planningEndDay;) {
      const days = [day];
      while (days[days.length - 1] < planningEndDay && dayOfWeek(year, mon, days[days.length - 1] + 1) !== 1) days.push(days[days.length - 1] + 1);
      weeks.push(days);
      day = days[days.length - 1] + 1;
    }
    const carriedIndex = poolNames.findIndex((name) => String(empSeriesCode[name] || '').toUpperCase() === dbsPlanningConfig.shiftCode && empSeriesRemaining[name] > 0);
    const lastWorkedIndex = poolNames.findIndex((name) => String(carryState[name]?.lastWorkedShiftCode || '').toUpperCase() === dbsPlanningConfig.shiftCode);
    let rotationIndex = carriedIndex >= 0 ? carriedIndex : (lastWorkedIndex >= 0 ? (lastWorkedIndex + 1) % poolNames.length : 0);
    // Simulated per-member state: current work streak (carried series keep
    // running until their end) and the first day after DBS recovery.
    const rosterState = new Map(poolNames.map((name) => [name, {
      streak: empConsecutiveWork[name] || 0,
      carriedUntil: planningStartDay + Math.max(empSeriesRemaining[name] || 0, 0) - 1,
      freeUntil: planningStartDay + Math.max(empRequiredFreeDays[name] || 0, 0),
    }]));
    const getDbsRecoveryDays = (name, lastDay) => {
      const entry = poolEntryByName.get(name);
      const patternDays = entry?.workingWeekdays?.length ? entry.workingWeekdays : [0, 1, 2, 3, 4, 5, 6];
      const recovery = countDbsRecoveryDays(patternDays, entry?.freeDaysAfterBlock ?? dbsPlanningConfig.freeDaysAfterBlock, lastDay);
      const weekendRecovery = isWeekend(year, mon, lastDay) ? Number(rotation.free_days_after_weekend) || 0 : 0;
      return Math.max(recovery, weekendRecovery);
    };
    const canTakeRosterDay = (name, day) => {
      const state = rosterState.get(name);
      return isAvailableForDbs(name, day) && day >= state.freeUntil && state.streak < weekdayLimit;
    };
    const advanceRosterDay = (day) => {
      for (const name of poolNames) {
        const state = rosterState.get(name);
        if (dbsRoster.get(day) === name) {
          state.streak++;
        } else if (dbsRoster.get(day - 1) === name) {
          state.streak = 0;
          state.freeUntil = day - 1 + 1 + getDbsRecoveryDays(name, day - 1);
        } else if (day <= state.carriedUntil) {
          state.streak++;
        } else {
          state.streak = 0;
        }
      }
    };
    const simulateCoverage = (name, days) => {
      const state = rosterState.get(name);
      let streak = state.streak;
      let covered = 0;
      for (const day of days) {
        if (isAvailableForDbs(name, day) && day >= state.freeUntil && streak < weekdayLimit) {
          covered++;
          streak++;
        } else if (covered > 0) {
          break;
        } else {
          streak = day <= state.carriedUntil ? streak + 1 : 0;
        }
      }
      return covered;
    };
    const weekOwners = [];
    const rosterWeekendsOf = (name) => new Set([...dbsRoster.entries()]
      .filter(([day, employee]) => employee === name && isWeekend(year, mon, day))
      .map(([day]) => getWeekendBlockKey(year, mon, day))).size;
    weeks.forEach((days, weekIndex) => {
      let owner = null;
      let bestCoverage = 0;
      for (let offset = 0; offset < poolNames.length; offset++) {
        const name = poolNames[(rotationIndex + offset) % poolNames.length];
        const covered = simulateCoverage(name, days);
        // Take the member whose turn it is unless another one covers clearly more days.
        if (covered > bestCoverage + (owner ? 1 : 0)) {
          owner = name;
          bestCoverage = covered;
        }
      }
      weekOwners.push(owner);
      if (owner) rotationIndex = (poolNames.indexOf(owner) + 1) % poolNames.length;
      const nextOwner = owner ? poolNames[rotationIndex] : null;
      for (const day of days) {
        const ownerWorksThisWeekday = owner
          && isDbsRosterWeekday(poolEntryByName.get(owner), dayOfWeek(year, mon, day));
        if (!ownerWorksThisWeekday) {
          advanceRosterDay(day);
          continue;
        }
        const ownerRunBroken = owner
          && days.some((current) => current < day && dbsRoster.get(current) === owner)
          && dbsRoster.get(day - 1) !== owner;
        if (owner && !ownerRunBroken && canTakeRosterDay(owner, day)) {
          dbsRoster.set(day, owner);
          advanceRosterDay(day);
          continue;
        }
        // Gap filling by another pool member is optional (shiftplan.dbs_fill_gaps, default off).
        if (!dbsPlanningConfig.fillGaps) {
          advanceRosterDay(day);
          continue;
        }
        // Gap: the previous week's member first, the next week's member last.
        const previousOwner = weekOwners[weekIndex - 1];
        const candidates = poolNames
          .filter((name) => name !== owner && canTakeRosterDay(name, day))
          .sort((left, right) => {
            const continuing = (name) => (dbsRoster.get(day - 1) === name ? 0 : 1);
            if (continuing(left) !== continuing(right)) return continuing(left) - continuing(right);
            const weekendDifference = isWeekend(year, mon, day) ? rosterWeekendsOf(left) - rosterWeekendsOf(right) : 0;
            if (weekendDifference !== 0) return weekendDifference;
            const rank = (name) => (name === previousOwner ? 0 : name === nextOwner ? 2 : 1);
            return rank(left) - rank(right);
          });
        if (candidates[0]) dbsRoster.set(day, candidates[0]);
        advanceRosterDay(day);
      }
    });
    for (const [day, name] of dbsRoster.entries()) {
      if (!dbsReservedDays.has(name)) dbsReservedDays.set(name, new Set());
      dbsReservedDays.get(name).add(day);
    }
    // A DBS week should be one connected run of the owner. Report every week that is not complete
    // (fewer days than the owner's pattern, or days without DBS), so gaps never stay unnoticed.
    weeks.forEach((days, index) => {
      const owner = weekOwners[index];
      const entry = owner ? poolEntryByName.get(owner) : null;
      const expectedDays = days.filter((day) => entry?.workingWeekdays?.includes(dayOfWeek(year, mon, day)));
      const plannedDays = days.filter((day) => dbsRoster.has(day));
      const ownDays = days.filter((day) => dbsRoster.get(day) === owner);
      if (days.length < 5 && index > 0 && index < weeks.length - 1) return;
      if (owner && ownDays.length >= expectedDays.length && plannedDays.length === ownDays.length) return;
      conflicts.push({
        day: days[0],
        date: `${month}-${String(days[0]).padStart(2, '0')}`,
        shift: dbsPlanningConfig.shiftCode,
        severity: 'warning',
        type: 'dbs_week_incomplete',
        message: owner
          ? `${dbsPlanningConfig.shiftCode}-Woche ab ${days[0]}.: ${owner} deckt ${ownDays.length} von ${expectedDays.length} Tagen ab (Abwesenheit, Ruhezeit oder Wunschtage verhindern eine durchgehende Woche).`
          : `${dbsPlanningConfig.shiftCode}-Woche ab ${days[0]}.: kein Pool-Mitglied verfügbar.`,
      });
    });
    planReport.dbsRotation = weeks.map((days, index) => ({
      week: `${month}-${String(days[0]).padStart(2, '0')}`,
      owner: weekOwners[index],
      days: days.map((day) => `${day}:${dbsRoster.get(day) || '-'}`),
    }));
  }
  const dbsReservedWeekendKeys = (employee) => new Set([...(dbsReservedDays.get(employee) || [])]
    .filter((day) => isWeekend(year, mon, day))
    .map((day) => getWeekendBlockKey(year, mon, day)));
  // A regular block must neither touch a reserved DBS day nor push its
  // recovery days into it, and it must leave room for the reserved weekends.
  const conflictsWithDbsReservation = (employee, shiftDef, day, seriesDays) => {
    const reserved = dbsReservedDays.get(employee);
    if (!reserved || reserved.size === 0 || isDbsDefinition(shiftDef)) return null;
    const lastDay = Math.min(day + Math.max(seriesDays, 1) - 1, planningEndDay);
    let recoveryDays = 0;
    const blockWeekendKeys = new Set();
    for (let current = day; current <= lastDay; current++) {
      if (isWeekend(year, mon, current)) {
        recoveryDays = Math.max(recoveryDays, Number(rotation.free_days_after_weekend) || 0);
        blockWeekendKeys.add(getWeekendBlockKey(year, mon, current));
      }
    }
    if (normalizePlanningShiftTypeKey(shiftDef.shift_type) === 'night') {
      if (getEmployeeNightModel(employee) === NIGHT_MODELS.SHORT) {
        recoveryDays = Math.max(recoveryDays, Number(rotation.short_night_free_days_after ?? rotation.free_days_after_night) || 0);
      } else {
        const targetWeekday = Math.max(0, Math.min(6, Number.parseInt(rotation.night_next_workday, 10) || 0));
        const daysUntilTarget = ((targetWeekday - dayOfWeek(year, mon, lastDay) + 7) % 7) || 7;
        recoveryDays = Math.max(recoveryDays, Number(rotation.free_days_after_night) || 0, daysUntilTarget - 1);
      }
    }
    for (let current = day; current <= lastDay + recoveryDays; current++) {
      if (reserved.has(current)) return `DBS-Rotation: Tag ${current} ist für DBS reserviert`;
    }
    if (reserved.has(lastDay + 1)) {
      const streakLimit = Math.max(Number(rotation.max_consecutive_workdays) || 0, 7);
      const streakAtRosterStart = (empConsecutiveWork[employee] || 0) + (lastDay - day + 1);
      if (streakAtRosterStart + getDbsRosterRunLength(employee, lastDay + 1) > streakLimit) {
        return `DBS-Rotation: Vor dem DBS-Block ab Tag ${lastDay + 1} ist ein freier Tag nötig`;
      }
    }
    const worked = empStats[employee]?.workedWeekendBlocks || new Set();
    const neededWeekends = new Set([...worked, ...blockWeekendKeys, ...dbsReservedWeekendKeys(employee)]);
    if (blockWeekendKeys.size > 0 && neededWeekends.size > Number(rotation.max_weekends_per_month || 0) && Number(rotation.max_weekends_per_month || 0) > 0) {
      return 'DBS-Rotation: Wochenenden sind für DBS reserviert';
    }
    return null;
  };

  for (let day = planningStartDay; day <= planningEndDay; day++) {
    planningCursorDay = day;
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    const weekend = isWeekend(year, mon, day);
    const dow = dayOfWeek(year, mon, day);
    const holidayName = holidayMap[dateStr] || null;
    selectStaffingForDay(dow, holidayName, dateStr);

    const absenceCreditedToday = new Set();
    for (const employee of activeEmployees) {
      const absence = getEmployeeAbsenceOnDate(employee, dateStr);
      const creditedHours = getCreditedAbsenceHours(absence, weekend);
      if (creditedHours <= 0) continue;
      absenceCreditedToday.add(employee);
      empHours[employee] += creditedHours;
      empStats[employee].actualHours = Number(empHours[employee].toFixed(2));
    }

    const availableForDay = activeEmployees.filter((employee) => {
      if (isEmployeeAbsentOnDate(employee, dateStr)) return false;
      if (isEmployeeBlockedByPreferenceOnDay(employee, dow)) return false;
      if (empRequiredFreeDays[employee] > 0) return false;
      return true;
    });

    assignedToday = new Set();
    holidaySkipToday = new Set();
  assignedByShiftTypeToday = { early: 0, late: 0, night: 0, special: 0 };
    assignedByDefToday = {};
    // Employees who can only work one shift type today (hard wish, fixed type, DBS rule).
    const exclusiveEmployees = [];
    for (const employee of availableForDay) {
      if (empSeriesRemaining[employee] > 0) continue;
      const allowedByType = new Map();
      for (const definition of shiftDefs) {
        const type = normalizePlanningShiftTypeKey(definition.shift_type);
        if (type !== 'early' && type !== 'late' && type !== 'night') continue;
        if (fixedShiftTypeByEmployee.get(employee) && fixedShiftTypeByEmployee.get(employee) !== type) continue;
        if (isEmployeeShiftBlockedOnDate(employee, dateStr, definition.code)) continue;
        if (!isOutsideDbsAllowed(employee, definition, 1)) continue;
        if (!allowedByType.has(type)) allowedByType.set(type, []);
        if (normalizeWeekdaySetting(definition.applicable_days, [0, 1, 2, 3, 4, 5, 6]).includes(dow)) allowedByType.get(type).push(definition.code);
      }
      if (allowedByType.size === 1) exclusiveEmployees.push([...allowedByType.values()][0]);
    }
    const baseShiftSlots = buildDailyShiftSlots({
      exclusiveEmployees,
      shiftDefinitions: shiftDefs,
      staffingRules,
      staffingMaximums,
      activeEmployees,
      employeeHours: empHours,
      employeeTargetHours,
      monthlyTargetHours: targetHours,
      day: day - planningStartDay + 1,
      numDays: planningDays,
      dayOfWeek: dow,
    }).sort((left, right) => {
      const leftPriority = restrictedPoolShiftCodes.has(String(left.code || '').trim().toUpperCase()) ? 0 : 1;
      const rightPriority = restrictedPoolShiftCodes.has(String(right.code || '').trim().toUpperCase()) ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      const seriesDifference = getShiftSeriesDays(right) - getShiftSeriesDays(left);
      if (seriesDifference !== 0) return seriesDifference;
      const leftSort = Number.parseInt(String(left.sort_order ?? 0), 10) || 0;
      const rightSort = Number.parseInt(String(right.sort_order ?? 0), 10) || 0;
      if (leftSort !== rightSort) return leftSort - rightSort;
      return String(left.code || '').localeCompare(String(right.code || ''), 'de');
    });

    // Weekend blocks start on Monday, so Monday decides how many people the coming
    // Saturday and Sunday get (global Saturday / Sunday / holiday minimums).
    const weekendLimitsFor = (offset) => {
      const targetDay = day + offset;
      if (dow !== 1 || targetDay > planningEndDay) return null;
      const targetDate = `${month}-${String(targetDay).padStart(2, '0')}`;
      const staffing = buildStaffingForContext({
        context: resolveStaffingDayContext({ dayOfWeek: dayOfWeek(year, mon, targetDay), holidayName: holidayMap[targetDate] || null }),
        weekdayRules: weekdayStaffingRules,
        weekdayMaximums: weekdayStaffingMaximums,
        dayLimitMap: staffingDayLimitMap,
      });
      const spec = {};
      for (const type of ['early', 'late']) {
        spec[type] = { min: staffing.rules[type] || 0, max: Number.isFinite(staffing.maximums[type]) ? staffing.maximums[type] : null };
      }
      return spec;
    };
    const shiftSlots = dow === 1
      ? applyWeekendBlockSlots({
        slots: baseShiftSlots,
        saturday: weekendLimitsFor(5),
        sunday: weekendLimitsFor(6),
        weekdayMaximums: { early: staffingMaximums.early ?? null, late: staffingMaximums.late ?? null },
      })
      : baseShiftSlots;

    const availableEmployeeSet = new Set(availableForDay);
    const availableShiftCodes = new Set(shiftSlots.map((slot) => slot.code));
    for (const employee of activeEmployees) {
      if (empSeriesRemaining[employee] <= 0) continue;
      const rosterMismatch = dbsRoster.size > 0 && (
        (dbsRoster.get(day) === employee && String(empSeriesCode[employee] || '').toUpperCase() !== dbsPlanningConfig.shiftCode)
        || (dbsRoster.get(day) !== employee && String(empSeriesCode[employee] || '').toUpperCase() === dbsPlanningConfig.shiftCode)
      );
      if (rosterMismatch
        || !availableEmployeeSet.has(employee)
        || !availableShiftCodes.has(empSeriesCode[employee])
        || (day > (carriedSeriesUntilDay[employee] || 0) && wouldExceedEmployeeWeekendLimit(employee, [day], { skipSpacing: coloShiftTypeByCode.get(String(empSeriesCode[employee] || '').trim().toUpperCase()) === 'night' }))
        || isEmployeeShiftBlockedOnDate(employee, dateStr, empSeriesCode[employee])) {
        empSeriesCode[employee] = null;
        empSeriesRemaining[employee] = 0;
      }
    }

    // A running block never ends by itself, so a day with a lower maximum (public holiday, Saturday,
    // Sunday) would keep everybody who started the week. Surplus people get this day off: first those who
    // asked for the holiday off, then those with the fewest open hours.
    // A bank holiday on the coming Saturday / Sunday (Christmas, Easter ...): weekend blocks are not the ones that get cut.
    const holidayWeekendAhead = Array.from({ length: 7 - ((dow + 6) % 7) }, (_, index) => day + index + 1)
      .some((aheadDay) => aheadDay <= numDays && isWeekend(year, mon, aheadDay) && Boolean(bankHolidayMap[`${month}-${String(aheadDay).padStart(2, '0')}`]));
    for (const typeKey of ['early', 'late', 'night']) {
      const typeMaximum = getShiftTypeMaximum(typeKey);
      if (!Number.isFinite(typeMaximum)) continue;
      const running = availableForDay.filter((employee) => empSeriesRemaining[employee] > 0
        && availableShiftCodes.has(empSeriesCode[employee])
        && normalizePlanningShiftTypeKey(shiftSlots.find((slot) => slot.code === empSeriesCode[employee])?.shift_type) === typeKey
        && !isLateOverflowExempt(employee, day, typeKey));
      if (running.length <= typeMaximum) continue;
      const keepOrder = [...running].sort((left, right) => {
        const wantsOff = (employee) => (holidayName && (empPrefsMap.get(employee)?.preferred_holidays || []).includes(holidayName) ? 1 : 0);
        if (wantsOff(left) !== wantsOff(right)) return wantsOff(left) - wantsOff(right);
        // People whose block still has to cover the coming weekend (…SA / …WE) are kept first: cutting them would leave
        // Saturday / Sunday (Christmas, Easter ...) without early / late staff while weekday-only blocks stay.
        const coversWeekend = (employee) => (holidayWeekendAhead && /(SA|WE)$/.test(String(empSeriesCode[employee] || '').trim().toUpperCase()) ? 1 : 0);
        if (coversWeekend(left) !== coversWeekend(right)) return coversWeekend(right) - coversWeekend(left);
        const openHours = (employee) => employeeTargetHours[employee] - empHours[employee];
        return openHours(right) - openHours(left) || left.localeCompare(right, 'de');
      });
      for (const employee of keepOrder.slice(typeMaximum)) {
        // A weekend block (…SA / …WE) is only paused for this holiday and continues tomorrow, so the weekend stays covered
        // and the week does not break apart; everything else ends as before.
        if (empSeriesRemaining[employee] > 1 && /(SA|WE)$/.test(String(empSeriesCode[employee] || '').trim().toUpperCase())) {
          holidaySkipToday.add(employee);
          const index = availableForDay.indexOf(employee);
          if (index >= 0) availableForDay.splice(index, 1);
          continue;
        }
        empSeriesCode[employee] = null;
        empSeriesRemaining[employee] = 0;
        empSeriesTotalDays[employee] = 0;
      }
    }

    const continuationLockedEmployees = new Set(
      availableForDay.filter((employee) => empSeriesRemaining[employee] > 0 && availableShiftCodes.has(empSeriesCode[employee]))
    );

    // Phase 1 fills the minimum of every shift type (night, late, early; fixed pools and weekend
    // blocks first), phase 2 the additional places that bring the hours. Without the split the early
    // shift took the people first and night/late stayed below their minimum although early was far above it.
    const typeRank = (definition) => ({ night: 0, late: 1, early: 2 }[normalizePlanningShiftTypeKey(definition?.shift_type)] ?? 3);
    // Running blocks are placed first of all: they cannot be refused, so they must be counted before
    // any new person is picked, otherwise a later definition pushes the type above its maximum.
    const codesWithRunningBlock = new Set(availableForDay
      .filter((employee) => empSeriesRemaining[employee] > 0)
      .map((employee) => empSeriesCode[employee]));
    const minimumFirstOrder = [...shiftSlots].sort((left, right) => {
      const leftRunning = codesWithRunningBlock.has(left.code) ? 0 : 1;
      const rightRunning = codesWithRunningBlock.has(right.code) ? 0 : 1;
      if (leftRunning !== rightRunning) return leftRunning - rightRunning;
      const leftPool = restrictedPoolShiftCodes.has(String(left.code || '').trim().toUpperCase()) ? 0 : 1;
      const rightPool = restrictedPoolShiftCodes.has(String(right.code || '').trim().toUpperCase()) ? 0 : 1;
      if (leftPool !== rightPool) return leftPool - rightPool;
      return typeRank(left) - typeRank(right) || shiftSlots.indexOf(left) - shiftSlots.indexOf(right);
    });
    // Phase 0 places the running blocks of every definition, phase 1 the minimum, phase 2 the rest.
    for (const [phase, slotOrder] of [shiftSlots, minimumFirstOrder, shiftSlots].entries()) for (const shiftDef of slotOrder) {
      // A missing DBS roster entry is intentional (for example Peter's free
      // Sunday). Regular early/weekend staffing covers that day instead.
      if (isDbsDefinition(shiftDef) && !dbsRoster.has(day)) continue;
      const continuingEmployees = availableForDay
        .filter((employee) => !assignedToday.has(employee)
          && empSeriesRemaining[employee] > 0
          && empSeriesCode[employee] === shiftDef.code
          && isPoolEmployeeWorkingOnWeekday(shiftDef, employee, dow)
          && !isEmployeeShiftBlockedOnDate(employee, dateStr, shiftDef.code))
        .sort((left, right) => left.localeCompare(right, 'de'));
      // planned_slots comes from the global staffing limits; 0 is a valid result (no new starts of this shift today).
      const baseNeededStaff = Math.max(Number.isFinite(Number(shiftDef.planned_slots)) ? Number(shiftDef.planned_slots) : (shiftDef.min_staff || 1), continuingEmployees.length);
      const holidayShiftTypeLimit = getHolidayShiftStaffingLimit(holidayStaffingConfig, holidayName, shiftDef.shift_type);
      const remainingHolidayCapacity = holidayShiftTypeLimit === null
        ? null
        : Math.max(holidayShiftTypeLimit - Number(assignedByShiftTypeToday[shiftDef.shift_type] || 0), 0);
      let neededStaff = remainingHolidayCapacity === null
        ? baseNeededStaff
        : Math.max(continuingEmployees.length, Math.min(baseNeededStaff, remainingHolidayCapacity));
      const shiftSkillSignals = featureFlags.skillsEnabled ? getShiftSkillSignals(shiftDef) : { ratedSkills: [], legacySkills: [] };

      for (const employee of continuingEmployees) {
        if (normalizePlanningShiftTypeKey(shiftDef.shift_type) === 'night'
          && sharedNightStaffCap > 0
          && Number(assignedByShiftTypeToday.night || 0) >= sharedNightStaffCap) {
          conflicts.push({
            day,
            date: dateStr,
            shift: 'N/NK',
            severity: 'critical',
            type: 'night_staffing_cap',
            message: `Gemeinsame Nachtobergrenze von ${sharedNightStaffCap} Mitarbeitenden erreicht; keine weitere N- oder NK-Zuweisung möglich`,
          });
          break;
        }
        assignShiftToEmployee({
          emp: employee,
          shiftDef,
          day,
          dateStr,
          weekend,
          holidayName,
          explanationReasons: ['Blockfortsetzung aus der Vortagsplanung'],
        });
      }

      if (phase === 0) continue;
      const phaseTypeKey = normalizePlanningShiftTypeKey(shiftDef.shift_type);
      const alreadyPlannedForDefinition = Number(assignedByDefToday[shiftDef.code] || 0);
      if (phase === 1 && ['early', 'late', 'night'].includes(phaseTypeKey)) {
        const minimumLeft = Math.max((Number(staffingRules[phaseTypeKey]) || 0) - Number(assignedByShiftTypeToday[phaseTypeKey] || 0), 0);
        neededStaff = Math.min(neededStaff, alreadyPlannedForDefinition + minimumLeft);
      }

      const hasConfiguredNightTransition = availableForDay.some((employee) => empForcedNextShiftCode[employee] === shiftDef.code);
      const isBoundaryBootstrap = planningStartDay === 1
        && day === 1
        && dow !== 1
        && Math.max(continuingEmployees.length, alreadyPlannedForDefinition) < baseNeededStaff;
      const hasShortNightCandidate = normalizePlanningShiftTypeKey(shiftDef.shift_type) === 'night'
        && availableForDay.some((employee) => getEmployeeNightModel(employee) === NIGHT_MODELS.SHORT
          && !assignedToday.has(employee)
          && !isEmployeeShiftBlockedOnDate(employee, dateStr, shiftDef.code));
      const hasDbsRosterStart = isDbsDefinition(shiftDef) && dbsRoster.has(day);
      if (!canStartShiftSeries({ day, dayOfWeek: dow, definition: shiftDef }) && !hasConfiguredNightTransition && !isBoundaryBootstrap && !hasShortNightCandidate && !hasDbsRosterStart) {
        const requiredStaff = Math.max(Number.parseInt(String(shiftDef.min_staff ?? 0), 10) || 0, 0);
        if (phase === 1 && continuingEmployees.length < requiredStaff) {
          conflicts.push({
            day,
            date: dateStr,
            shift: shiftDef.code,
            severity: 'critical',
            type: 'series_understaffed',
            message: `${shiftDef.name} (${shiftDef.code}) am ${dateStr}: Serienbesetzung unterschritten; neue Wochenblöcke dürfen nur montags starten`,
          });
        }
        continue;
      }

      // MIXED night model: after the planned slots, short-block employees fill up to the shift maximum.
      const nightFill = phase === 1
        ? { fillTarget: neededStaff, extraSlots: 0 }
        : resolveNightFillTarget({
          planningMode: rotation.night_planning_mode,
          shiftType: shiftDef.shift_type,
          neededStaff,
          maxStaff: sharedNightStaffCap,
          holidayCapacity: remainingHolidayCapacity,
        });
      for (let slot = Math.max(continuingEmployees.length, alreadyPlannedForDefinition); slot < nightFill.fillTarget; slot++) {
        const isExtraNightSlot = slot >= neededStaff;
        if (normalizePlanningShiftTypeKey(shiftDef.shift_type) === 'night'
          && sharedNightStaffCap > 0
          && Number(assignedByShiftTypeToday.night || 0) >= sharedNightStaffCap) {
          break;
        }
        if (Number(assignedByShiftTypeToday[shiftDef.shift_type] || 0) >= getShiftTypeMaximum(shiftDef.shift_type)) break;
        let candidates = availableForDay.filter((employee) => (
          !assignedToday.has(employee)
          && !(continuationLockedEmployees.has(employee) && empSeriesCode[employee] !== shiftDef.code)
          && isPoolEmployeeWorkingOnWeekday(shiftDef, employee, dow)
          && !isEmployeeShiftBlockedOnDate(employee, dateStr, shiftDef.code)
          && (!isExtraNightSlot || getEmployeeNightModel(employee) === NIGHT_MODELS.SHORT)
        ));
        const matchingSkillCandidates = featureFlags.skillsEnabled && (shiftSkillSignals.ratedSkills.length > 0 || shiftSkillSignals.legacySkills.length > 0)
          ? candidates.filter((employee) => {
              const skillProfile = skillsMap.get(employee);
              return hasLegacySkillMatch(skillProfile, shiftSkillSignals) || !!getBestRatedSkillMatch(skillProfile, shiftSkillSignals);
            })
          : [];

        // Filling up to the maximum is optional: no short-block candidate left is not a conflict.
        if (candidates.length === 0 && isExtraNightSlot) break;
        if (candidates.length === 0) {
          conflicts.push({
            day,
            date: dateStr,
            shift: shiftDef.code,
            severity: 'critical',
            type: 'understaffed',
            message: `${shiftDef.name} (${shiftDef.code}) am ${dateStr}: Nicht genügend verfügbare Mitarbeiter (benötigt: ${neededStaff}, verfügbar: 0)`,
          });
          continue;
        }

        const openColoDemandByOffset = getOpenColoDemandByOffset(day, normalizePlanningShiftTypeKey(shiftDef.shift_type), Math.max(getShiftSeriesDays(shiftDef), 1));
        currentDayForHolidayLoad = day;
        const scored = candidates.map((employee) => {
          let score = 1000;
          let reasons = [];
          const stats = empStats[employee];
          const history = historyMap.get(employee);
          const prefs = preferencesForDate(employee, dateStr);
          const preferenceMatch = planConfig.respect_employee_wishes
            && isShiftPreferredByEmployeePreference(prefs, shiftDef.code);
          const exclusivePreferredShiftType = getExclusivePreferredShiftType(prefs);
          const normalizedShiftCode = String(shiftDef.code || '').trim().toUpperCase();
          const plannedWeekendKey = getPlannedWeekendBlockKey(year, mon, day, shiftDef, numDays);
          const specialPool = specialPoolsByShift.get(normalizedShiftCode);
          const isRestrictedPoolShift = restrictedPoolShiftCodes.has(normalizedShiftCode);
          const fixedShiftType = fixedShiftTypeByEmployee.get(employee);
          const seriesDays = getPlannedSeriesDays(employee, shiftDef, day);
          const nightModel = getEmployeeNightModel(employee);
          const isRosterDbsAssignment = isDbsDefinition(shiftDef) && dbsRoster.get(day) === employee;
          let hardBlocked = false;
          // Wishes with strength < 100 % do not block; they add a penalty so the
          // employee is only used against the wish when a slot needs filling.
          let preferencePenalty = 0;
          const addWishPenalty = (amount, reason) => {
            if (!(amount > 0)) return;
            preferencePenalty += amount;
            score -= amount;
            reasons.push(reason);
          };
          const shiftPreferenceStrengthFactor = strengthFactor(prefStrength.preferred_shifts);
          const preferredWishIgnored = isIgnoredStrength(prefStrength.preferred_shifts);

          // A weekend-covering block (E1SA, E1WE, L1WE, N ...) is only started when every planned day of
          // it is possible. Otherwise a person who cannot work Friday or Sunday would get a "WE" block
          // that stops after Thursday and leaves the weekend uncovered. Weekday blocks may end early.
          if (seriesDays > 1 && getShiftSeriesDays(shiftDef) >= 6) {
            for (let offset = 1; offset < seriesDays && day + offset <= planningEndDay; offset++) {
              const blockDay = day + offset;
              const blockDate = `${month}-${String(blockDay).padStart(2, '0')}`;
              if (isEmployeeAbsentOnDate(employee, blockDate)
                || isEmployeeBlockedByPreferenceOnDay(employee, dayOfWeek(year, mon, blockDay))
                || isEmployeeShiftBlockedOnDate(employee, blockDate, shiftDef.code)) {
                hardBlocked = true;
                reasons.push(`Block ${shiftDef.code} ist nicht vollständig möglich: Tag ${blockDay} ist nicht verfügbar`);
                break;
              }
            }
          }

          if (isDayBlockedByEmployeePreference(prefs, dow)) {
            if (isHardStrength(prefStrength.blocked_days)) {
              hardBlocked = true;
              reasons.push(`Harter Mitarbeiterwunsch: Wochentag ${dow} gesperrt`);
            } else {
              addWishPenalty(getBlockedDayPenalty(employee, dow), `Mitarbeiterwunsch (${prefStrength.blocked_days}%): Wochentag ${dow} nicht gewünscht`);
            }
          }
          const shiftWishEvaluation = getShiftWishEvaluation(employee, dateStr, shiftDef.code, shiftDef.shift_type);
          for (const violation of shiftWishEvaluation.violations) {
            if (violation.type === 'night_limit') continue; // handled by the night limit check below
            if (violation.hard) {
              hardBlocked = true;
              reasons.push(violation.type === 'night_refused'
                ? 'Harter Mitarbeiterwunsch: keine Nachtschicht'
                : violation.type === 'holiday'
                  ? `Harter Mitarbeiterwunsch: ${holidayName} nicht arbeiten`
                  : `Harter Mitarbeiterwunsch: ${shiftDef.code} ist unerwünscht`);
            } else {
              addWishPenalty(violation.penalty, `Mitarbeiterwunsch (${prefStrength[violation.strengthKey]}%): ${shiftDef.code} entgegen Wunsch (soft)`);
            }
          }

          if (empForcedNextShiftCode[employee] && empForcedNextShiftCode[employee] !== shiftDef.code) {
            hardBlocked = true;
            reasons.push(`Nach Nachtblock ist ${empForcedNextShiftCode[employee]} als Folgeschicht vorgegeben`);
          }
          if (empForcedNextShiftCode[employee] === shiftDef.code) {
            score += 1_000_000;
            reasons.push(`Konfigurierte Folgeschicht nach Nachtblock: ${shiftDef.code}`);
          }

          if (fixedShiftType && fixedShiftType !== normalizePlanningShiftTypeKey(shiftDef.shift_type)) {
            hardBlocked = true;
            reasons.push(`Feste Schichtvorgabe: nur ${fixedShiftType}`);
          }

          // Night refusal (unwanted_shifts) is resolved above via getShiftWishEvaluation.

          if (shiftDef.shift_type === 'night'
            && nightModel === NIGHT_MODELS.SEVEN_DAY
            && !canStartShiftSeries({ day, dayOfWeek: dow, definition: shiftDef })
            && !hasConfiguredNightTransition
            && !isBoundaryBootstrap) {
            hardBlocked = true;
            reasons.push('Nachtmodell 7 Tage: Neue Nachtserie kann nur montags beginnen');
          }

          const individualNightLimit = Number.parseInt(String(prefs?.max_nights_per_month ?? ''), 10);
          if (shiftDef.shift_type === 'night' && Number.isInteger(individualNightLimit) && stats.nights + seriesDays > individualNightLimit
            && !isIgnoredStrength(prefStrength.max_nights)) {
            if (isHardStrength(prefStrength.max_nights)) {
              hardBlocked = true;
              reasons.push(`Harter Mitarbeiterwunsch: Nachtlimit ${individualNightLimit} würde überschritten`);
            } else {
              addWishPenalty(softPenalty(prefStrength.max_nights), `Mitarbeiterwunsch (${prefStrength.max_nights}%): Nachtlimit ${individualNightLimit} würde überschritten (soft)`);
            }
          }

          const individualWeekendLimit = Number.parseInt(String(prefs?.max_weekends_per_month ?? ''), 10);
          const blockDays = Array.from({ length: Math.min(seriesDays, planningEndDay - day + 1) }, (_, offset) => day + offset);
          const isNightBlock = normalizePlanningShiftTypeKey(shiftDef.shift_type) === 'night';
          if (wouldExceedEmployeeWeekendLimit(employee, blockDays, { skipSpacing: isNightBlock })) {
            hardBlocked = true;
            reasons.push('Harte Wochenendgrenze würde durch den geplanten Block überschritten');
          } else if (isNightBlock && violatesWeekendSpacing(employee, newWeekendKeysFor(employee, blockDays))) {
            // Every night block contains a weekend. The night minimum must hold, so the spacing only counts as a
            // strong penalty here: people without a recent weekend are taken first, the others only when needed.
            score -= 4000;
            reasons.push(`Wochenendabstand unterschritten (Nachtblock): nur wenn die Nachtbesetzung sonst nicht erreicht wird`);
          }
          if (plannedWeekendKey
            && Number.isInteger(individualWeekendLimit)
            && !stats.workedWeekendBlocks.has(plannedWeekendKey)
            && stats.workedWeekendBlocks.size >= individualWeekendLimit
            && !isIgnoredStrength(prefStrength.max_weekends)) {
            if (isHardStrength(prefStrength.max_weekends)) {
              hardBlocked = true;
              reasons.push(`Harter Mitarbeiterwunsch: Wochenendlimit ${individualWeekendLimit} würde überschritten`);
            } else {
              addWishPenalty(softPenalty(prefStrength.max_weekends), `Mitarbeiterwunsch (${prefStrength.max_weekends}%): Wochenendlimit ${individualWeekendLimit} würde überschritten (soft)`);
            }
          }

          const lastType = empLastShiftType[employee];
          if (lastType === 'night' && shiftDef.shift_type === 'early' && rotation.night_to_early_forbidden) {
            hardBlocked = true;
            reasons.push('Regelverstoß: Nacht→Früh verboten');
          }
          if (lastType === 'late' && shiftDef.shift_type === 'early' && rotation.late_to_early_forbidden) {
            hardBlocked = true;
            reasons.push('Regelverstoß: Spät→Früh verboten');
          }

          if (shiftDef.shift_type === 'night' && rotation.late_before_night_required) {
            const previousCode = empDayAssignment[employee]?.[day - 1];
            const previousDefinition = shiftDefs.find((definition) => definition.code === previousCode);
            const previousType = normalizePlanningShiftTypeKey(previousDefinition?.shift_type);
            if (day > 1 && previousType !== 'late') {
              hardBlocked = true;
              reasons.push('Regelverstoss: Vor Nachtschicht ist Spaetschicht vorgeschrieben');
            } else if (previousType === 'late') {
              score += 250_000;
              reasons.push('Nachtschicht-Transit: Vortag war Spaetschicht');
            }
          }

          const effectiveWorkdayLimit = isRosterDbsAssignment
            ? Math.max(rotation.max_consecutive_workdays, 7, seriesDays)
            : Math.max(rotation.max_consecutive_workdays, seriesDays);
          // The whole planned block counts: a short block directly after a five-day week would end
          // on day eight in a row, although the limit is six.
          if (empConsecutiveWork[employee] + Math.max(seriesDays, 1) > effectiveWorkdayLimit) {
            hardBlocked = true;
            reasons.push(`Max. Arbeitstage in Folge erreicht (${empConsecutiveWork[employee]} + Block ${Math.max(seriesDays, 1)} > ${effectiveWorkdayLimit})`);
          }

          // A short night block contains up to three shifts, so the monthly safety
          // ceiling must use the same unit as the employee's chosen block model.
          const rotationNightLimit = nightModel === NIGHT_MODELS.SHORT
            ? Math.max(Number(rotation.max_nights_per_month) || 0, 0) * shortNightSeriesDays
            : Math.max(Number(rotation.max_nights_per_month) || 0, 0);
          if (shiftDef.shift_type === 'night'
            && rotationNightLimit > 0
            && stats.nights + seriesDays > rotationNightLimit) {
            hardBlocked = true;
            reasons.push(`Nachtlimit erreicht (${stats.nights}/${rotationNightLimit})`);
          }

          if (!isRosterDbsAssignment && plannedWeekendKey && !stats.workedWeekendBlocks.has(plannedWeekendKey) && stats.workedWeekendBlocks.size >= rotation.max_weekends_per_month) {
            hardBlocked = true;
            reasons.push(`Wochenendlimit erreicht (${stats.workedWeekendBlocks.size}/${rotation.max_weekends_per_month})`);
          }

          let consecutiveSame = 0;
          for (let previousDay = day - 1; previousDay >= 1; previousDay--) {
            const prevCode = empDayAssignment[employee][previousDay];
            if (!prevCode) break;
            const prevDef = shiftDefs.find((definition) => definition.code === prevCode);
            if (prevDef && prevDef.shift_type === shiftDef.shift_type) consecutiveSame++;
            else break;
          }
          const effectiveSameShiftLimit = shiftDef.shift_type === 'night' && nightModel === NIGHT_MODELS.SHORT
            ? shortNightSeriesDays
            : Math.max(rotation.max_consecutive_same, seriesDays);
          if (consecutiveSame >= effectiveSameShiftLimit) {
            hardBlocked = true;
            reasons.push(`Max. gleiche Schichtart in Folge erreicht (${consecutiveSame}/${effectiveSameShiftLimit})`);
          }

          const dbsReservationConflict = conflictsWithDbsReservation(employee, shiftDef, day, seriesDays);
          if (dbsReservationConflict) {
            hardBlocked = true;
            reasons.push(dbsReservationConflict);
          }
          if (isRosterDbsAssignment) {
            score += 10_000_000;
            reasons.push('DBS-Rotation: Diese Woche ist für diese Person eingeplant');
          }

          if (isRestrictedPoolShift) {
            const poolEntry = specialPool?.get(employee);
            if (!poolEntry) {
              hardBlocked = true;
              reasons.push(`Nicht im festen Pool für ${shiftDef.code}`);
            } else {
              if (normalizedShiftCode === dbsPlanningConfig.shiftCode && !poolEntry.workingWeekdays.includes(dow)) {
                hardBlocked = true;
                reasons.push(`DBS-Arbeitsmuster: Wochentag ${dow} ist nicht freigegeben`);
              }
              const assignedCount = Number(stats.specialShiftCounts?.[shiftDef.code] || 0);
              const effectiveMonthlyMaxAssignments = normalizedShiftCode === dbsPlanningConfig.shiftCode
                ? Math.max(poolEntry.monthlyMaxAssignments, seriesDays)
                : poolEntry.monthlyMaxAssignments;
              if (assignedCount + seriesDays > effectiveMonthlyMaxAssignments) {
                hardBlocked = true;
                reasons.push(`${shiftDef.code}-Limit erreicht (${assignedCount}/${effectiveMonthlyMaxAssignments})`);
              } else {
                score += 120;
                score -= assignedCount * 90;
                reasons.push(`Fester ${shiftDef.code}-Pool (${assignedCount}/${effectiveMonthlyMaxAssignments})`);
              }
            }
          }

          const dbsOutsideRule = getDbsOutsideRule(employee);
          if (dbsOutsideRule && !isOutsideDbsAllowed(employee, shiftDef, seriesDays)) {
            hardBlocked = true;
            reasons.push(`DBS-Mitarbeiter: außerhalb von DBS gilt ${describeDbsOutsideRule(dbsOutsideRule)}`);
          }

          if (hardBlocked) {
            return { emp: employee, score: Number.NEGATIVE_INFINITY, reasons, hardBlocked: true };
          }

          if (fixedShiftType && fixedShiftType === normalizePlanningShiftTypeKey(shiftDef.shift_type)) {
            score += 200;
            reasons.push(`Feste Schichtvorgabe erfüllt: ${fixedShiftType}`);
          }

          if (featureFlags.skillsEnabled && (shiftSkillSignals.ratedSkills.length > 0 || shiftSkillSignals.legacySkills.length > 0)) {
            const skillProfile = skillsMap.get(employee);
            const ratedSkillMatch = getBestRatedSkillMatch(skillProfile, shiftSkillSignals);
            const legacySkillMatch = hasLegacySkillMatch(skillProfile, shiftSkillSignals);

            if (ratedSkillMatch) {
              score += 60 + ratedSkillMatch.rating * 18;
              reasons.push(`Skill-Match: ${ratedSkillMatch.skill} (${ratedSkillMatch.rating}/5)`);
            }

            if (legacySkillMatch) {
              score += 40;
              reasons.push('Qualifikationsprofil passt zur Schicht');
            }

            if (!ratedSkillMatch && !legacySkillMatch && matchingSkillCandidates.length > 0) {
              score -= 110;
              reasons.push('Skill-Matrix aktiv: andere Kandidaten passen fachlich besser');
            }
          }

          if (fairnessRules.balance_total_load) {
            const avgHours = activeEmployees.reduce((sum, currentEmployee) => sum + empHours[currentEmployee], 0) / activeEmployees.length || 0;
            const diffHours = empHours[employee] - avgHours;
            // fairness_priority (default 80 = factor 1) scales how strongly hour differences are leveled.
            score -= diffHours * 8 * (Math.max(0, Math.min(Number(planConfig.fairness_priority ?? 80), 100)) / 80);
            if (diffHours < -8) reasons.push('Fairness: Weniger Stunden als Durchschnitt');
            if (diffHours > 8) reasons.push('Fairness: Mehr Stunden als Durchschnitt');
          }

          const remainingToTarget = employeeTargetHours[employee] - empHours[employee];
          score += getTargetHoursScore({ currentHours: empHours[employee], targetHours: employeeTargetHours[employee] });
          if (remainingToTarget > 16) reasons.push(`Sollzeit offen: ${remainingToTarget.toFixed(1)}h`);
          if (remainingToTarget < -8) reasons.push(`Bereits über Sollzeit: ${Math.abs(remainingToTarget).toFixed(1)}h`);

          const continuity = getShiftContinuityAdjustment({
            previousCode: empLastWorkedShiftCode[employee],
            previousType: empLastWorkedShiftType[employee],
            previousDay: empLastWorkedDay[employee],
            nextCode: shiftDef.code,
            nextType: shiftDef.shift_type,
            day,
          });
          const stabilityPriority = Math.max(0, Math.min(Number(rotation.stability_priority ?? 70), 100));
          score += continuity.score * (stabilityPriority / 50);
          if (continuity.reason) reasons.push(continuity.reason);

          // Variety: not the same block week after week, plus a small deterministic jitter.
          const variety = getVarietyAdjustment({
            history: empBlockHistory[employee],
            nextCode: shiftDef.code,
            nextType: shiftDef.shift_type,
            nextSeriesDays: getShiftSeriesDays(shiftDef),
            priority: varietyPriority,
          });
          score += variety.score;
          if (variety.reason) reasons.push(variety.reason);
          const varietyJitter = getVarietyJitter({ employee, year, month: mon, weekKey: getWeekendBlockKey(year, mon, day), shiftCode: shiftDef.code, priority: varietyPriority, seed: varietySeed });
          score += varietyJitter;

          const previousWorkedType = empLastWorkedShiftType[employee];
          const isShiftTypeChange = previousWorkedType && previousWorkedType !== shiftDef.shift_type;
          if (isShiftTypeChange) {
            const maxChanges = Math.max(Number(rotation.max_shift_type_changes_per_month ?? 4), 0);
            if (maxChanges > 0 && stats.shiftTypeChanges >= maxChanges) {
              score -= 5000;
              reasons.push(`Work-Life-Balance: Maximal ${maxChanges} Schichtartwechsel pro Monat erreicht`);
            }

            const requiredRecoveryDays = Math.max(Number(rotation.min_recovery_days_after_shift_change ?? 1), 0);
            const freeDaysSinceLastShift = Math.max(day - Number(empLastWorkedDay[employee] || day) - 1, 0);
            if (freeDaysSinceLastShift < requiredRecoveryDays) {
              score -= (requiredRecoveryDays - freeDaysSinceLastShift) * 1000;
              reasons.push(`Work-Life-Balance: ${requiredRecoveryDays} freie Tage vor Schichtartwechsel bevorzugt`);
            }
          }

          if (plannedWeekendKey) {
            const minimumFreeWeekends = Math.max(Number(rotation.min_free_weekends_per_month ?? 2), 0);
            const preferredWorkedWeekendLimit = Math.max(totalWeekendBlocks - minimumFreeWeekends, 0);
            if (!stats.workedWeekendBlocks.has(plannedWeekendKey) && stats.workedWeekendBlocks.size >= preferredWorkedWeekendLimit) {
              score -= 3000;
              reasons.push(`Work-Life-Balance: Mindestens ${minimumFreeWeekends} freie Wochenenden bevorzugt`);
            }
          }

          if (shiftDef.shift_type === 'night' && fairnessRules.balance_nights) {
            const avgNights = activeEmployees.reduce((sum, currentEmployee) => sum + empStats[currentEmployee].nights, 0) / activeEmployees.length || 0;
            score -= (stats.nights / (isNightFavored(employee) ? NIGHT_FAVORED_WEIGHT : 1) - avgNights) * 80;
            if (history && history.night_count > 3) {
              score -= 100;
              reasons.push('Fairnessausgleich: Hohe Nachtlast im Vormonat');
            }
          }

          if (plannedWeekendKey && fairnessRules.balance_weekends) {
            const avgWeekends = activeEmployees.reduce((sum, currentEmployee) => sum + empStats[currentEmployee].workedWeekendBlocks.size, 0) / activeEmployees.length || 0;
            score -= (stats.workedWeekendBlocks.size - avgWeekends) * 80;
          }

          if (planConfig.respect_employee_wishes && prefs) {
            const preferredHolidays = prefs.preferred_holidays || [];
            const maxNights = prefs.max_nights_per_month;

            // Existing soft scores are scaled by the strength of the matching
            // preference type (factor 1 at 100 %, 0 when ignored).
            if (preferenceMatch && !preferredWishIgnored) {
              score += planConfig.soft_wishes_priority * 5 * shiftPreferenceStrengthFactor;
              reasons.push(`Mitarbeiterwunsch: ${shiftDef.code} bevorzugt`);
            }
            if (preferredWishIgnored) {
              // preferred_shifts at 0 %: exclusive shift wish is ignored as well
            } else if (exclusivePreferredShiftType === normalizePlanningShiftTypeKey(shiftDef.shift_type)) {
              score += Math.max(planConfig.soft_wishes_priority, 1) * 400 * shiftPreferenceStrengthFactor;
              reasons.push(`Exklusiver Schichtwunsch: nur ${exclusivePreferredShiftType}`);
              if (isBoundaryBootstrap && seriesDays < getShiftSeriesDays(shiftDef)) {
                score -= Math.max(planConfig.soft_wishes_priority, 1) * 800 * shiftPreferenceStrengthFactor;
                reasons.push('Exklusiver Schichtwunsch wird fuer den naechsten vollstaendigen Wochenblock reserviert');
              }
            } else if (exclusivePreferredShiftType) {
              score -= Math.max(planConfig.soft_wishes_priority, 1) * 400 * shiftPreferenceStrengthFactor;
              reasons.push(`Exklusiver Schichtwunsch bevorzugt ${exclusivePreferredShiftType} statt ${shiftDef.shift_type}`);
            }
            if (holidayName && preferredHolidays.includes(holidayName) && !isIgnoredStrength(prefStrength.holidays)) {
              score -= Math.max(Number(planConfig.soft_wishes_priority) || 0, 1) * 15 * strengthFactor(prefStrength.holidays);
              reasons.push(`Mitarbeiterwunsch: ${holidayName} nicht arbeiten`);
            }
            if (maxNights !== null && maxNights !== undefined && shiftDef.shift_type === 'night' && stats.nights >= maxNights
              && !isIgnoredStrength(prefStrength.max_nights)) {
              score -= 1500 * strengthFactor(prefStrength.max_nights);
              reasons.push(`Individuelles Nachtlimit erreicht (${stats.nights}/${maxNights})`);
            }

          }

          const preferredShiftList = prefs?.preferred_shifts || [];
          const unwantedShiftList = (prefs?.unwanted_shifts || []).map((code) => String(code || '').trim().toUpperCase());
          const averageNights = activeEmployees.reduce((sum, currentEmployee) => sum + empStats[currentEmployee].nights, 0) / (activeEmployees.length || 1);
          const averageWeekends = activeEmployees.reduce((sum, currentEmployee) => sum + empStats[currentEmployee].workedWeekendBlocks.size, 0) / (activeEmployees.length || 1);
          const coloWellbeingOk = (normalizePlanningShiftTypeKey(shiftDef.shift_type) !== 'night' || stats.nights <= averageNights + 1)
            && (!plannedWeekendKey || stats.workedWeekendBlocks.has(plannedWeekendKey) || stats.workedWeekendBlocks.size <= averageWeekends + 0.5);
          const coloBoost = openColoDemandByOffset.slice(0, Math.max(seriesDays, 1)).some((demand) => demand > 0)
            && isColoAllowedFor(employee, normalizePlanningShiftTypeKey(shiftDef.shift_type), dayOfWeek(year, mon, day))
            && coloWellbeingOk
            && !unwantedShiftList.includes('COLO')
            && (!planConfig.respect_employee_wishes || preferredShiftList.length === 0 || preferenceMatch || preferredWishIgnored);
          if (coloBoost) reasons.push(`Colo-Kompetenz: deckt Colo-Bedarf in ${shiftDef.shift_type} (Wunsch passt)`);

          let colleagueMatches = 0;
          const wishedColleagues = preferredColleaguesEnabled && !isIgnoredStrength(prefStrength.colleagues) ? preferredColleagueMap.get(employee) : null;
          if (wishedColleagues && !hardBlocked) {
            const currentShiftType = normalizePlanningShiftTypeKey(shiftDef.shift_type);
            const matchedColleagues = [...wishedColleagues].filter((colleague) => {
              if (colleague === employee) return false;
              const todayCode = String(empDayAssignment[colleague]?.[day] || '').trim().toUpperCase();
              if (todayCode) return coloShiftTypeByCode.get(todayCode) === currentShiftType;
              const runningSeriesCode = String(empSeriesCode[colleague] || '').trim().toUpperCase();
              return Boolean(runningSeriesCode) && empSeriesRemaining[colleague] > 0 && coloShiftTypeByCode.get(runningSeriesCode) === currentShiftType;
            });
            colleagueMatches = matchedColleagues.length;
            if (colleagueMatches > 0) {
              // 300 per match at the default strength 50 % (600 * strength / 100).
              score += colleagueMatches * scaleBonus(prefStrength.colleagues, 300, 50);
              reasons.push(`Wunschkollege in derselben Schicht: ${matchedColleagues.join(', ')}`);
            }
          }

          // Fixed groups (lib/fixedEmployeeRules.js): same shift type as a partner who is already planned today or
          // in a running block. Soft, so wishes, rest rules and the staffing limits still win.
          // Late and night have little staff: an inexperienced person goes there only with an experienced colleague.
          // Without one yet, experienced people are taken first (and the inexperienced one waits).
          let mentorRank = 0;
          if (!hardBlocked && inexperiencedEmployees.length > 0) {
            const ownType = normalizePlanningShiftTypeKey(shiftDef.shift_type);
            if (ownType === 'early') {
              if (isInexperienced(employee) && activeEmployees.some((other) => other !== employee && isInexperienced(other) && shiftTypeOnDay(other, day) === 'early')) mentorRank = 1;
            } else if (ownType === 'late' || ownType === 'night') {
              const peers = activeEmployees.filter((other) => other !== employee && shiftTypeOnDay(other, day) === ownType);
              const hasExperienced = peers.some((other) => !isInexperienced(other));
              if (isInexperienced(employee) && !hasExperienced) {
                mentorRank = 1;
                reasons.push('Wenig Erfahrung: wird in Spät/Nacht erst nach einer erfahrenen Person eingeplant');
              } else if (!isInexperienced(employee) && !hasExperienced && peers.some(isInexperienced)) {
                mentorRank = -1;
                reasons.push('Erfahrene Person für die Begleitung eines Kollegen mit wenig Erfahrung (Spät/Nacht)');
              }
            }
          }
          let togetherCount = 0;
          const togetherPartners = togetherPartnersByEmployee.get(employee);
          if (togetherPartners && !hardBlocked) {
            const currentType = normalizePlanningShiftTypeKey(shiftDef.shift_type);
            const together = togetherPartners.filter(({ partner, shiftTypes }) => {
              if (!shiftTypes.includes(currentType)) return false;
              const todayCode = String(empDayAssignment[partner]?.[day] || '').trim().toUpperCase();
              if (todayCode) return coloShiftTypeByCode.get(todayCode) === currentType;
              const runningCode = String(empSeriesCode[partner] || '').trim().toUpperCase();
              return Boolean(runningCode) && empSeriesRemaining[partner] > 0 && coloShiftTypeByCode.get(runningCode) === currentType;
            });
            if (together.length > 0) {
              score += together.length * 600;
              colleagueMatches += together.length;
              togetherCount = new Set(together.map(({ partner }) => partner)).size; // decides before the hour balance (see sort)
              reasons.push(`Feste Gruppe: gemeinsam mit ${[...new Set(together.map(({ partner }) => partner))].join(', ')}`);
            }
          }
          if (!hardBlocked && normalizePlanningShiftTypeKey(shiftDef.shift_type) === 'night' && isNightTeamMember(employee)) {
            score += 250;
            reasons.push('Festes Nachtteam (Noah, Marco, Mustafar, Patrick Brode): bevorzugt in der Nacht');
          }

          // Mutual colleague wish: the shift type both prefer (or the one preferred by the one who has a wish) fits this shift.
          let mutualShared = false;
          const mutualColleagues = mutualColleagueMap.get(employee);
          if (mutualColleagues && wishedColleagues && !hardBlocked) {
            const currentType = normalizePlanningShiftTypeKey(shiftDef.shift_type);
            mutualShared = [...mutualColleagues].some((colleague) => getSharedPreferredTypes(employee, colleague).has(currentType));
            if (mutualShared) {
              score += scaleBonus(prefStrength.colleagues, 250, 40);
              reasons.push('Gegenseitiger Kollegenwunsch: gemeinsame bevorzugte Schichtart');
            }
          }

          const weekTypeConflict = !hardBlocked && hasOtherTypeInWeek(employee, day, normalizePlanningShiftTypeKey(shiftDef.shift_type));
          if (weekTypeConflict) reasons.push('Schichtartwechsel innerhalb der Woche (nur wenn kein anderer Kandidat passt)');
          return {
            emp: employee,
            score: hardBlocked ? Number.NEGATIVE_INFINITY : score,
            reasons,
            hardBlocked,
            weekTypeConflict,
            mutualShared,
            togetherCount,
            mentorRank,
            preferenceMatch: preferenceMatch && !preferredWishIgnored,
            preferencePenalty,
            coloBoost,
            colleagueMatches,
            dbsRoster: isRosterDbsAssignment,
            // Night distribution: whoever has the fewest nights goes first; Patrick Brode is rated 1.5 times (his night count
            // is divided by 1.5), so he ends up with about 50 % more nights than the others.
            nightLoad: fairnessRules.balance_nights && normalizePlanningShiftTypeKey(shiftDef.shift_type) === 'night'
              ? stats.nights / (isNightFavored(employee) ? NIGHT_FAVORED_WEIGHT : 1)
              : null,
            nightFavored: isNightFavored(employee),
            holidayOnly: holidayOnlyEmployees.has(employee),
            holidayLoad: bankHolidaysInBlock(day, seriesDays) > 0 ? holidayLoadOf(employee) : 0,
            blockHasHoliday: bankHolidaysInBlock(day, seriesDays) > 0,
            submittedWishes: hasSubmittedWishes(employee),
            // Late/night slot and an employee who has no early alternative and still needs hours.
            lateNightPriority: lateNightOnlyEmployees.has(employee)
              && ['late', 'night'].includes(normalizePlanningShiftTypeKey(shiftDef.shift_type) || '')
              && remainingToTarget > 0,
            targetHoursGap: Math.max(remainingToTarget, 0),
            // The candidate order is decided by the open target hours first. Variety moves a candidate
            // by up to about one shift (20 points = 1 hour), so repeating the same block no longer wins
            // against an equally suitable colleague.
            varietyHours: (variety.score + Math.max(-100, Math.min(100, varietyJitter))) / 20,
          };
        });

        const eligibleScored = scored.filter((entry) => Number.isFinite(entry.score));
        if (eligibleScored.length === 0 && isExtraNightSlot) break;
        if (eligibleScored.length === 0) {
          const blockedPreview = scored
            .filter((entry) => entry.hardBlocked && entry.reasons.length > 0)
            .slice(0, 3)
            .map((entry) => `${entry.emp}: ${entry.reasons.join(', ')}`);
          conflicts.push({
            day,
            date: dateStr,
            shift: shiftDef.code,
            severity: 'critical',
            type: 'no_eligible_candidate',
            message: `${shiftDef.name} (${shiftDef.code}) am ${dateStr}: Keine zulässigen Kandidaten${blockedPreview.length > 0 ? ` (${blockedPreview.join(' | ')})` : ''}`,
          });
          continue;
        }

        const rotationWeekKey = getWeekendBlockKey(year, mon, day);
        eligibleScored.sort((left, right) => {
          if (Boolean(left.dbsRoster) !== Boolean(right.dbsRoster)) return left.dbsRoster ? -1 : 1;
          // Bank holiday: the people who are ticked for holiday duty take the slots first.
          if (bankHolidayMap[dateStr] && left.holidayOnly !== right.holidayOnly) return left.holidayOnly ? -1 : 1;
          // Soft wishes (strength < 100 %): an employee is only used against a
          // wish when no candidate without (or with a weaker) violation is left.
          if (left.preferencePenalty !== right.preferencePenalty) return left.preferencePenalty - right.preferencePenalty;
          // Continuity: nobody gets a second shift type within the same week while another candidate is available.
          if (left.weekTypeConflict !== right.weekTypeConflict) return left.weekTypeConflict ? 1 : -1;
          // Fixed groups (Marco + Mustafa, night team): the free place next to a partner goes to the group member.
          if (left.togetherCount !== right.togetherCount) return right.togetherCount - left.togetherCount;
          if (left.mentorRank !== right.mentorRank) return left.mentorRank - right.mentorRank;
          // Late/night slots go to the people who can work nothing else first; everybody else has early
          // as the overflow pool.
          if (left.lateNightPriority !== right.lateNightPriority) return left.lateNightPriority ? -1 : 1;
          // Open Colo cover is filled by a pool member whose wishes fit (before the hour balance: the Colo demand is a fixed requirement).
          if (left.coloBoost !== right.coloBoost) return left.coloBoost ? -1 : 1;
          // Night slot with Patrick Brode among the candidates: he is taken first as long as his weighted night count
          // (nights / 1.5) is not above the other candidate's.
          if (left.nightFavored !== right.nightFavored && left.nightLoad !== null && right.nightLoad !== null) {
            const favored = left.nightFavored ? left : right;
            const other = left.nightFavored ? right : left;
            if (favored.nightLoad <= other.nightLoad) return favored === left ? -1 : 1;
          }
          // Contractual hours remain the first fairness guard. Within one
          // shift's worth of open hours, honour the selected shift wish.
          const targetGapDifference = (right.targetHoursGap + right.varietyHours) - (left.targetHoursGap + left.varietyHours);
          if (Math.abs(targetGapDifference) > getShiftHoursForDay(shiftDef, day)) return targetGapDifference;
          // Bank holidays: whoever has worked the fewest of them goes first (even distribution over the year).
          if ((left.blockHasHoliday || right.blockHasHoliday) && Math.abs(left.holidayLoad - right.holidayLoad) >= 0.5) return left.holidayLoad - right.holidayLoad;
          // Night slots: the lower (weighted) night count wins, Patrick Brode's 1.5 bonus makes him the first pick more often.
          if (left.nightLoad !== null && right.nightLoad !== null && Math.abs(left.nightLoad - right.nightLoad) >= 0.5) return left.nightLoad - right.nightLoad;
          // People who have submitted wishes are placed before those without: their wishes can only be honoured while the
          // slots are still open, everybody else is flexible.
          if (left.submittedWishes !== right.submittedWishes) return left.submittedWishes ? -1 : 1;
          // A stated preferred shift is then the first tie-breaker after all
          // hard safety, recovery, absence and staffing rules have applied.
          if (left.preferenceMatch !== right.preferenceMatch) return left.preferenceMatch ? -1 : 1;
          // Mutual colleague wishes with a shared preferred shift type: planned into the same shift.
          if (left.mutualShared !== right.mutualShared) return left.mutualShared ? -1 : 1;
          // Preferred colleagues come right after the employee's own shift wish.
          if (left.colleagueMatches !== right.colleagueMatches) return right.colleagueMatches - left.colleagueMatches;
          if (right.score !== left.score) return right.score - left.score;
          const leftRank = getDeterministicRotationRank({ employee: left.emp, year, month: mon, weekKey: rotationWeekKey, shiftCode: shiftDef.code });
          const rightRank = getDeterministicRotationRank({ employee: right.emp, year, month: mon, weekKey: rotationWeekKey, shiftCode: shiftDef.code });
          if (leftRank !== rightRank) return leftRank - rightRank;
          return left.emp.localeCompare(right.emp, 'de');
        });

        const winner = eligibleScored[0];
        if (!winner) continue;

        // Add relative ranking context to the winner's reasons
        if (eligibleScored.length > 1) {
          const runnerUp = eligibleScored[1];
          const scoreDiff = winner.score - runnerUp.score;
          if (scoreDiff > 0) {
            winner.reasons.push(`Vorsprung: +${scoreDiff} Punkte vor ${runnerUp.emp}`);
          } else {
            winner.reasons.push(`Gleichstand mit ${runnerUp.emp} - durch die faire Wochenrotation aufgeloest`);
          }
        } else {
          winner.reasons.push('Einziger zulässiger Kandidat');
        }
        if (isBoundaryBootstrap) {
          winner.reasons.push('Uebergangsblock am Monatsanfang bis zur ersten Montagkante');
        }

        assignShiftToEmployee({
          emp: winner.emp,
          shiftDef,
          day,
          dateStr,
          weekend,
          holidayName,
          explanationReasons: winner.reasons,
          score: winner.score,
          eligibleCount: eligibleScored.length,
        });
      }
    }
    for (const employee of activeEmployees) {
      if (!assignedToday.has(employee)) {
        if (holidayName && !weekend && !absenceCreditedToday.has(employee)) creditHolidayHours(employee, day);
        if (empSeriesRemaining[employee] > 0 && holidaySkipToday.has(employee)) {
          empSeriesRemaining[employee] -= 1; // the paused holiday counts as a day of the block
          if (empSeriesRemaining[employee] <= 0) { empSeriesCode[employee] = null; empSeriesTotalDays[employee] = 0; }
        } else if (empSeriesRemaining[employee] > 0) {
          empSeriesCode[employee] = null;
          empSeriesRemaining[employee] = 0;
          empSeriesTotalDays[employee] = 0;
        }
        const recoveryDaysBefore = empRequiredFreeDays[employee];
        const recoveryReasonBefore = empRecoveryReason[employee];
        empConsecutiveWork[employee] = 0;
        empLastShiftType[employee] = null;
        if (empRequiredFreeDays[employee] > 0) {
          empRequiredFreeDays[employee] = Math.max(empRequiredFreeDays[employee] - 1, 0);
          if (empRequiredFreeDays[employee] === 0) empRecoveryReason[employee] = null;
        }
        const expKey = `${employee}_${day}`;
        if (!explanations[expKey]) {
          const absence = getEmployeeAbsenceOnDate(employee, dateStr);
          const isAbsent = Boolean(absence);
          const creditedAbsenceHours = getCreditedAbsenceHours(absence, weekend);
          const absenceLabel = String(absence?.type || 'ABW').toUpperCase();
          const preferenceBlocked = isEmployeeBlockedByPreferenceOnDay(employee, dow);
          explanations[expKey] = {
            employee,
            day,
            code: null,
            reasons: isAbsent
              ? [creditedAbsenceHours > 0
                ? `Nicht eingeteilt: ${absenceLabel} (${creditedAbsenceHours}h gutgeschrieben)`
                : `Nicht eingeteilt: ${absenceLabel} (keine Stundenanrechnung)`]
              : isEmployeeBlockedByExclusionOnDay(employee, dow)
                ? ['Nicht eingeteilt: Admin-Regel schließt diesen Wochentag aus']
              : preferenceBlocked
                ? ['Nicht eingeteilt: Mitarbeiterwunsch sperrt diesen Wochentag']
              : recoveryDaysBefore > 0
                ? [`Nicht eingeteilt: Erholungstag nach ${recoveryReasonBefore || 'Belastung'} erforderlich (${recoveryDaysBefore} verbleibend)`]
                : ['Nicht eingeteilt: Genügend andere Mitarbeiter für alle Schichten verfügbar'],
          };
        }
      }
    }

    for (const employee of employees) {
      if (shiftExcludedSet.has(employee)) {
        const expKey = `${employee}_${day}`;
        explanations[expKey] = {
          employee,
          day,
          code: null,
          reasons: ['Von der Schichtplanung ausgeschlossen (Admin-Einstellung)'],
        };
      }
    }
  }

  // Coverage planning is shift-centric. This mandatory employee-centric pass
  // closes individual contractual-hour gaps without changing fixed week blocks.
  const regularCatchupDefinitions = shiftDefs.filter((definition) => {
    const code = String(definition.code || '').trim().toUpperCase();
    return ['early', 'late'].includes(normalizePlanningShiftTypeKey(definition.shift_type) || '')
      && !['E1SA', 'E1WE', 'E2SA', 'E2WE', 'L1WE'].includes(code)
      && getShiftSeriesDays(definition) <= 5;
  });
  // Last resort for people who would stay more than 15 h below target: single Saturdays (never Sunday) with
  // the early/late weekend variants. Saturday staffing maximums and weekend limits still apply.
  const saturdayCatchupDefinitions = shiftDefs.filter((definition) => {
    const code = String(definition.code || '').trim().toUpperCase();
    return ['E1SA', 'E2SA', 'L1WE', 'E1WE', 'E2WE'].includes(code)
      && ['early', 'late'].includes(normalizePlanningShiftTypeKey(definition.shift_type) || '')
      && normalizeWeekdaySetting(definition.applicable_days, [0, 1, 2, 3, 4, 5, 6]).includes(6);
  });
  const targetCatchupSeriesDefinitions = shiftDefs.filter((definition) => {
    const code = String(definition.code || '').trim().toUpperCase();
    return ['E1SA', 'E1WE', 'E2SA', 'E2WE', 'L1WE'].includes(code) && getShiftSeriesDays(definition) > 1;
  });
  const shiftDefinitionByCode = new Map(
    [...shiftDefs, ...(shortNightDefinition ? [shortNightDefinition] : [])]
      .map((definition) => [String(definition.code || '').trim().toUpperCase(), definition])
  );
  const getAssignedShiftDefinition = (employee, day) => {
    const assignedCode = String(empDayAssignment[employee]?.[day] || '').trim().toUpperCase();
    return shiftDefinitionByCode.get(assignedCode) || null;
  };
  const getAssignedShiftType = (employee, day) => {
    const assignedDefinition = getAssignedShiftDefinition(employee, day);
    return normalizePlanningShiftTypeKey(assignedDefinition?.shift_type);
  };
  const keepsEmployeeShiftCohesion = (employee, day, definition) => keepsShiftTypeCohesion({
    assignmentsByDay: empDayAssignment[employee],
    day,
    shiftType: definition?.shift_type,
    getShiftType: (code) => shiftDefinitionByCode.get(String(code || '').trim().toUpperCase())?.shift_type,
    // 2 days: a Wednesday-Friday filler after a Sunday block and a Friday before a Monday block
    // stay possible; the last-resort pass only looks at the adjacent days.
    lookaroundDays: relaxedWishPass ? 1 : 2,
  });
  const isRecoveryProtectedDay = (employee, day) => {
    const reasons = explanations[`${employee}_${day}`]?.reasons || [];
    return reasons.some((reason) => String(reason).includes('Erholungstag'));
  };
  const wouldViolateAdjacentTransition = (employee, day, shiftDef) => {
    const currentType = normalizePlanningShiftTypeKey(shiftDef?.shift_type);
    const previousType = getAssignedShiftType(employee, day - 1);
    const nextType = getAssignedShiftType(employee, day + 1);

    if (previousType === 'night' && currentType === 'early' && rotation.night_to_early_forbidden) return true;
    if (currentType === 'night' && nextType === 'early' && rotation.night_to_early_forbidden) return true;
    if (previousType === 'late' && currentType === 'early' && rotation.late_to_early_forbidden) return true;
    if (currentType === 'late' && nextType === 'early' && rotation.late_to_early_forbidden) return true;

    // Minimum rest between two shifts on consecutive days (setting "min_hours_between_shifts").
    const minRestHours = Number(rotation.min_hours_between_shifts) || 0;
    if (minRestHours > 0) {
      const toHours = (value) => {
        const [hours, minutes] = String(value || '').slice(0, 5).split(':').map(Number);
        return Number.isFinite(hours) ? hours + (Number.isFinite(minutes) ? minutes : 0) / 60 : null;
      };
      const span = (definition) => {
        const start = toHours(definition?.start_time);
        let end = toHours(definition?.end_time);
        if (start === null || end === null) return null;
        end += 24 * (Number(definition?.end_day_offset) || 0);
        if (end <= start) end += 24;
        return { start, end };
      };
      const definitionOnDay = (otherDay) => shiftDefinitionByCode.get(String(empDayAssignment[employee]?.[otherDay] || '').trim().toUpperCase());
      const own = span(shiftDef);
      const before = definitionOnDay(day - 1);
      const after = definitionOnDay(day + 1);
      if (own && before && String(before.code).toUpperCase() !== dbsPlanningConfig.shiftCode) {
        const previous = span(before);
        if (previous && 24 + own.start - previous.end < minRestHours) return true;
      }
      if (own && after && String(after.code).toUpperCase() !== dbsPlanningConfig.shiftCode) {
        const following = span(after);
        if (following && 24 + following.start - own.end < minRestHours) return true;
      }
    }

    return false;
  };
  const violatesWeekendRecoveryAfterBlock = (employee, workedDays) => {
    const requiredFreeDays = Math.max(Number.parseInt(String(rotation.free_days_after_weekend ?? 0), 10) || 0, 0);
    if (requiredFreeDays <= 0) return false;

    const projectedDays = new Set(workedDays);
    const weekendDays = workedDays.filter((day) => isWeekend(year, mon, day));
    if (weekendDays.length === 0) return false;

    const lastWeekendDay = Math.max(...weekendDays);
    for (let offset = 1; offset <= requiredFreeDays; offset++) {
      const recoveryDay = lastWeekendDay + offset;
      if (recoveryDay > numDays) break;
      if (projectedDays.has(recoveryDay)) return true;
      if (empDayAssignment[employee][recoveryDay]) return true;
    }
    return false;
  };
  // Checks only what adding `day` changes: the day must not fall into the
  // recovery window after an earlier weekend block, and if it joins a block
  // containing a weekend, the free days after that block must stay free.
  const violatesWeekendRecoveryForAddedDay = (employee, day) => {
    const requiredFreeDays = Math.max(Number.parseInt(String(rotation.free_days_after_weekend ?? 0), 10) || 0, 0);
    if (requiredFreeDays <= 0) return false;
    const isWorked = (candidateDay) => candidateDay === day || Boolean(empDayAssignment[employee][candidateDay]);
    let start = day;
    while (start > 1 && isWorked(start - 1)) start--;
    let end = day;
    while (end < numDays && isWorked(end + 1)) end++;
    let runHasWeekend = false;
    for (let current = start; current <= end; current++) if (isWeekend(year, mon, current)) runHasWeekend = true;
    if (runHasWeekend) {
      for (let offset = 2; offset <= requiredFreeDays; offset++) {
        if (end + offset <= numDays && empDayAssignment[employee][end + offset]) return true;
      }
    }
    for (let previousEnd = start - 2; previousEnd >= Math.max(start - requiredFreeDays, 1); previousEnd--) {
      if (!empDayAssignment[employee][previousEnd]) continue;
      let previousStart = previousEnd;
      while (previousStart > 1 && empDayAssignment[employee][previousStart - 1]) previousStart--;
      for (let current = previousStart; current <= previousEnd; current++) {
        if (isWeekend(year, mon, current)) return true;
      }
      break;
    }
    return false;
  };
  const changeEmployeeShiftCode = (employee, day, newCode, reasons) => {
    const normalizedNewCode = String(newCode || '').trim().toUpperCase();
    const shift = shifts.find((entry) => entry.employee_name === employee && entry.day === day);
    const oldCode = String(shift?.shift_code || empDayAssignment[employee]?.[day] || '').trim().toUpperCase();
    if (shift) shift.shift_code = normalizedNewCode;
    empDayAssignment[employee][day] = normalizedNewCode;

    if (oldCode && oldCode !== normalizedNewCode) {
      empStats[employee].specialShiftCounts[oldCode] = Math.max(Number(empStats[employee].specialShiftCounts[oldCode] || 0) - 1, 0);
      empStats[employee].specialShiftCounts[normalizedNewCode] = Number(empStats[employee].specialShiftCounts[normalizedNewCode] || 0) + 1;
    }

    explanations[`${employee}_${day}`] = {
      employee,
      day,
      code: normalizedNewCode,
      reasons,
    };
  };
  const addEmployeeTargetCatchupShift = (employee, day, shiftDef, reasons) => {
    const normalizedCode = String(shiftDef.code || '').trim().toUpperCase();
    const weekend = isWeekend(year, mon, day);
    releaseHolidayCredit(employee, day);
    shifts.push({ employee_name: employee, day, shift_code: normalizedCode });
    empDayAssignment[employee][day] = normalizedCode;
    empLastWorkedShiftCode[employee] = normalizedCode;
    empLastWorkedShiftType[employee] = shiftDef.shift_type;
    empLastWorkedDay[employee] = day;

    const shiftHours = getShiftHoursForDay(shiftDef, day);
    if (shiftDef.shift_type === 'night') empStats[employee].nights++;
    if (weekend) {
      empStats[employee].weekends++;
      empStats[employee].workedWeekendBlocks.add(getWeekendBlockKey(year, mon, day));
    }
    if (shiftDef.shift_type === 'early') empStats[employee].earlyCount++;
    if (shiftDef.shift_type === 'late') empStats[employee].lateCount++;
    empStats[employee].total++;
    empStats[employee].specialShiftCounts[normalizedCode] = Number(empStats[employee].specialShiftCounts[normalizedCode] || 0) + 1;
    empHours[employee] += shiftHours;
    empStats[employee].actualHours = Number(empHours[employee].toFixed(2));
    planReport.totalShiftsPlanned++;

    explanations[`${employee}_${day}`] = {
      employee,
      day,
      code: normalizedCode,
      reasons,
    };
  };
  // Cells that exceed the configured maximum on purpose to make up hours (see the balance pass).
  const balanceOverstaffCells = new Set();
  const ELASTIC_EXTRA_STAFF = 2;
  const capacityWithin = (employee, day, definition, extra = 0) => {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    selectStaffingForDay(dayOfWeek(year, mon, day), holidayMap[dateStr] || null, dateStr);
    if (isEmployeeShiftBlockedOnDate(employee, dateStr, definition.code)) return false;
    if (wouldExceedEmployeeWeekendLimit(employee, [day], { skipSpacing: normalizePlanningShiftTypeKey(definition?.shift_type) === 'night' })) return false;
    // Upgrading an already planned day (E1SA -> E1WE) does not add a day outside DBS.
    if (!isOutsideDbsAllowed(employee, definition, empDayAssignment[employee]?.[day] ? 0 : 1)) return false;
    const maxStaff = Math.max(Number.parseInt(String(definition?.max_staff ?? 0), 10) || 0, 0);
    if (maxStaff === 0) return false;
    const code = String(definition?.code || '').trim().toUpperCase();
    const assignedElsewhere = shifts.filter((entry) => Number(entry.day) === Number(day)
      && String(entry.shift_code || '').trim().toUpperCase() === code
      && entry.employee_name !== employee).length;
    if (assignedElsewhere >= maxStaff + extra) return false;
    const typeKey = normalizePlanningShiftTypeKey(definition?.shift_type);
    const typeMaximum = getShiftTypeMaximum(typeKey) + extra;
    if (!Number.isFinite(typeMaximum)) return true;
    // Admin option: late+night wishers may work Thursday/Friday late above the maximum (marked as overstaffing).
    if (isLateOverflowExempt(employee, day, typeKey)) return true;
    const assignedTypeElsewhere = shifts.filter((entry) => Number(entry.day) === Number(day)
      && entry.employee_name !== employee
      && normalizePlanningShiftTypeKey(shiftDefinitionByCode.get(String(entry.shift_code || '').trim().toUpperCase())?.shift_type) === typeKey).length;
    return assignedTypeElsewhere < typeMaximum;
  };
  // The balance pass (guaranteePass) may exceed the maximum by ELASTIC_EXTRA_STAFF people: a person who is
  // far behind on the year balance gets hours before the maximum blocks them.
  // Bank holidays never get the elastic extra staff: their maximum (admin: Feiertag national / international) is a hard limit.
  const hasDefinitionCapacityForEmployee = (employee, day, definition) => capacityWithin(employee, day, definition, 0)
    || (guaranteePass && !holidayMap[`${month}-${String(day).padStart(2, '0')}`] && capacityWithin(employee, day, definition, ELASTIC_EXTRA_STAFF));

  // Preferred colleagues: swap whole weekday blocks between two people who work exactly the same days,
  // so a wisher and the wished colleague end up in the same shift type without changing the daily
  // staffing. Every rule (wishes, rest, DBS rule, fixed type) is checked before a block is taken over.
  const colleagueAlignments = [];
  if (preferredColleaguesEnabled && preferredColleagueWishes.length > 0) {
    const alignable = new Set(['E1', 'E2', 'L1', 'L2']);
    const typeOfCode = (code) => normalizePlanningShiftTypeKey(shiftDefinitionByCode.get(String(code || '').trim().toUpperCase())?.shift_type);
    const planDate = (day) => `${month}-${String(day).padStart(2, '0')}`;
    const swapBlocks = (first, second) => {
      for (let day = first.start; day <= first.end; day++) {
        empDayAssignment[first.employee][day] = second.code;
        empDayAssignment[second.employee][day] = first.code;
      }
    };
    const canTakeBlock = (employee, start, end, newCode) => {
      const definition = shiftDefinitionByCode.get(newCode);
      const oldCode = empDayAssignment[employee][start];
      if (!definition) return false;
      const fixedType = fixedShiftTypeByEmployee.get(employee);
      if (fixedType && fixedType !== normalizePlanningShiftTypeKey(definition.shift_type)) return false;
      if (!isOutsideDbsAllowed(employee, definition, 0)) return false;
      const applicable = normalizeWeekdaySetting(definition.applicable_days, [1, 2, 3, 4, 5]);
      for (let day = start; day <= end; day++) {
        if (!applicable.includes(dayOfWeek(year, mon, day))) return false;
        const wish = getShiftWishEvaluation(employee, planDate(day), newCode, definition.shift_type);
        if (wish.hardBlocked) return false;
        if (wish.penalty > getShiftWishEvaluation(employee, planDate(day), oldCode, shiftDefinitionByCode.get(oldCode)?.shift_type).penalty) return false;
      }
      // An employee keeps a stated shift wish: no swap away from a preferred shift.
      const prefsForBlock = preferencesForDate(employee, planDate(start));
      if (isShiftPreferredByEmployeePreference(prefsForBlock, oldCode) && !isShiftPreferredByEmployeePreference(prefsForBlock, newCode)) return false;
      // Rest rules at both ends of the block, checked with the block already carrying the new code.
      const original = {};
      for (let day = start; day <= end; day++) { original[day] = empDayAssignment[employee][day]; empDayAssignment[employee][day] = newCode; }
      const violates = wouldViolateAdjacentTransition(employee, start, definition) || wouldViolateAdjacentTransition(employee, end, definition);
      for (let day = start; day <= end; day++) empDayAssignment[employee][day] = original[day];
      return !violates;
    };
    const applied = alignPreferredColleagues({
      assignments: empDayAssignment,
      wishes: preferredColleagueWishes.filter((wish) => activeEmployees.includes(wish.employee) && activeEmployees.includes(wish.colleague)),
      getType: typeOfCode,
      isSwappable: (block) => alignable.has(block.code) && block.end - block.start <= 4,
      canTake: canTakeBlock,
      swap: swapBlocks,
      firstDay: planningStartDay,
      lastDay: planningEndDay,
    });
    for (const entry of applied) {
      for (const [employee, newCode, oldCode] of [[entry.first, entry.firstCode, entry.secondCode], [entry.second, entry.secondCode, entry.firstCode]]) {
        const newDefinition = shiftDefinitionByCode.get(newCode);
        const oldDefinition = shiftDefinitionByCode.get(oldCode);
        for (let day = entry.startDay; day <= entry.endDay; day++) {
          const shift = shifts.find((item) => item.employee_name === employee && item.day === day);
          if (shift) shift.shift_code = newCode;
          empStats[employee].specialShiftCounts[oldCode] = Math.max(Number(empStats[employee].specialShiftCounts[oldCode] || 0) - 1, 0);
          empStats[employee].specialShiftCounts[newCode] = Number(empStats[employee].specialShiftCounts[newCode] || 0) + 1;
          if (oldDefinition?.shift_type !== newDefinition?.shift_type) {
            if (oldDefinition?.shift_type === 'early') empStats[employee].earlyCount--;
            if (oldDefinition?.shift_type === 'late') empStats[employee].lateCount--;
            if (newDefinition?.shift_type === 'early') empStats[employee].earlyCount++;
            if (newDefinition?.shift_type === 'late') empStats[employee].lateCount++;
          }
          empHours[employee] += getShiftHoursForDay(newDefinition, day) - getShiftHoursForDay(oldDefinition, day);
          explanations[`${employee}_${day}`] = {
            employee,
            day,
            code: newCode,
            reasons: [`Wunschkollege ${entry.colleague}: ${newCode} getauscht, damit beide in derselben Schichtart arbeiten`],
          };
        }
        empStats[employee].actualHours = Number(empHours[employee].toFixed(2));
        const lastDay = Math.max(...Object.keys(empDayAssignment[employee]).filter((day) => empDayAssignment[employee][day]).map(Number));
        if (Number.isFinite(lastDay)) {
          empLastWorkedShiftCode[employee] = empDayAssignment[employee][lastDay];
          empLastWorkedShiftType[employee] = shiftDefinitionByCode.get(empLastWorkedShiftCode[employee])?.shift_type || empLastWorkedShiftType[employee];
        }
      }
      colleagueAlignments.push(entry);
    }
  }

  // Reclaim pass (runs BEFORE the catch-up passes, so donors are refilled afterwards) for employees who cannot\n  // work early at all (see lateNightOnlyEmployees): when late is at its
  // maximum on the days they are free, a flexible colleague gives away a complete weekday late run and works
  // early instead (early is the overflow pool). Whole runs only, so nobody gets a late/early/late zigzag.
  if (lateNightOnlyEmployees.size > 0) {
    const lateWeekdayDefinitions = regularCatchupDefinitions.filter((definition) => normalizePlanningShiftTypeKey(definition.shift_type) === 'late');
    const earlyWeekdayDefinitions = regularCatchupDefinitions.filter((definition) => normalizePlanningShiftTypeKey(definition.shift_type) === 'early');
    const lateWeekdayCodes = new Set(lateWeekdayDefinitions.map((definition) => String(definition.code).trim().toUpperCase()));
    const dbsMembers = new Set([...(specialPoolsByShift.get(dbsPlanningConfig.shiftCode)?.keys() || [])]);
    const dateOf = (day) => `${month}-${String(day).padStart(2, '0')}`;

    const dropAssignedShift = (employee, day) => {
      const code = empDayAssignment[employee][day];
      const definition = shiftDefinitionByCode.get(String(code || '').trim().toUpperCase());
      if (!code || !definition) return;
      const index = shifts.findIndex((entry) => entry.employee_name === employee && Number(entry.day) === Number(day));
      if (index >= 0) shifts.splice(index, 1);
      delete empDayAssignment[employee][day];
      empHours[employee] -= getShiftHoursForDay(definition, day);
      const stats = empStats[employee];
      stats.total = Math.max(stats.total - 1, 0);
      if (definition.shift_type === 'early') stats.earlyCount = Math.max(stats.earlyCount - 1, 0);
      if (definition.shift_type === 'late') stats.lateCount = Math.max(stats.lateCount - 1, 0);
      const normalized = String(code).trim().toUpperCase();
      stats.specialShiftCounts[normalized] = Math.max(Number(stats.specialShiftCounts[normalized] || 0) - 1, 0);
      stats.actualHours = Number(empHours[employee].toFixed(2));
      planReport.totalShiftsPlanned = Math.max(planReport.totalShiftsPlanned - 1, 0);
      delete explanations[`${employee}_${day}`];
    };

    // Complete weekday late runs (Mon-Fri only, 2+ days, no holiday) of one employee.
    const lateRunsOf = (employee) => {
      const runs = [];
      let current = null;
      for (let day = 1; day <= numDays + 1; day++) {
        const code = day <= numDays ? String(empDayAssignment[employee][day] || '').trim().toUpperCase() : '';
        const weekday = day <= numDays ? dayOfWeek(year, mon, day) : 0;
        const usable = lateWeekdayCodes.has(code) && weekday >= 1 && weekday <= 5 && !holidayMap[dateOf(day)];
        if (usable && current && current.code === code) current.days.push(day);
        else {
          if (current && current.days.length >= 2) runs.push(current);
          current = usable ? { code, days: [day] } : null;
        }
      }
      if (current && current.days.length >= 2) runs.push(current);
      // A run that touches a weekend/other shift is part of a longer block: only complete weekday runs count.
      return runs.filter((run) => {
        const before = empDayAssignment[employee][run.days[0] - 1];
        const after = empDayAssignment[employee][run.days[run.days.length - 1] + 1];
        return !before && !after;
      });
    };

    const needy = [...lateNightOnlyEmployees].sort((left, right) => (
      (employeeTargetHours[right] - empHours[right]) - (employeeTargetHours[left] - empHours[left])
    ));
    const canTakeLateDays = (employee, definition, days) => days.every((day) => {
      if (empDayAssignment[employee][day]) return false;
      const dateStr = dateOf(day);
      const weekday = dayOfWeek(year, mon, day);
      return !isEmployeeAbsentOnDate(employee, dateStr)
        && !isEmployeeBlockedByPreferenceOnDay(employee, weekday)
        && !isEmployeeShiftBlockedOnDate(employee, dateStr, definition.code)
        && !isRecoveryProtectedDay(employee, day)
        && !wouldViolateAdjacentTransition(employee, day, definition)
        && keepsEmployeeShiftCohesion(employee, day, definition)
        && isOutsideDbsAllowed(employee, definition, 1);
    });
    for (const employee of needy) {
      for (let round = 0; round < 10; round++) {
        if (!(employeeTargetHours[employee] - empHours[employee] >= 8)) break;
        let best = null;
        for (const donor of activeEmployees) {
          if (donor === employee || lateNightOnlyEmployees.has(donor) || dbsMembers.has(donor)) continue;
          const donorPrefs = preferencesForDate(donor, `${month}-01`);
          for (const run of lateRunsOf(donor)) {
            const lateDefinition = lateWeekdayDefinitions.find((definition) => String(definition.code).trim().toUpperCase() === run.code);
            if (!lateDefinition) continue;
            // Segments of the run that move: the whole run, or its start / end (at least 2 days; the remaining
            // part of the donor's run also stays at 2+ days).
            const length = run.days.length;
            const segments = [{ kind: 'whole', days: run.days }];
            for (let size = 2; size <= length - 2; size++) {
              segments.push({ kind: 'end', days: run.days.slice(length - size) });
              segments.push({ kind: 'start', days: run.days.slice(0, size) });
            }
            for (const segment of segments) {
              const segmentHours = segment.days.reduce((sum, day) => sum + getShiftHoursForDay(lateDefinition, day), 0);
              if (empHours[employee] + segmentHours > employeeTargetHours[employee] + 8) continue;
              if (!canTakeLateDays(employee, lateDefinition, segment.days)) continue;
              let neighbours = 0;
              for (let previous = segment.days[0] - 1; previous >= 1 && empDayAssignment[employee][previous]; previous--) neighbours++;
              for (let next = segment.days[segment.days.length - 1] + 1; next <= numDays && empDayAssignment[employee][next]; next++) neighbours++;
              if (neighbours + segment.days.length > Math.max(rotation.max_consecutive_workdays || 6, 5)) continue;

              // (a) the donor works early on those days: allowed for the whole run and for its start (early -> late
              //     is fine); the end of a run would turn late -> early on consecutive days (forbidden).
              let earlyDefinition = null;
              if (segment.kind !== 'end') {
                earlyDefinition = earlyWeekdayDefinitions
                  .filter((definition) => isOutsideDbsAllowed(donor, definition, 0))
                  .find((definition) => segment.days.every((day) => !isEmployeeShiftBlockedOnDate(donor, dateOf(day), definition.code))
                    && !wouldViolateAdjacentTransition(donor, segment.days[0], definition)) || null;
              }
              // (b) the donor simply gives the days away when that leaves them close to their own target.
              // The donor is refilled (early is the overflow pool) by the catch-up passes that follow.
              const donorKeepsHours = true;
              if (!earlyDefinition && !donorKeepsHours) continue;

              const donorLikesLate = isShiftPreferredByEmployeePreference(donorPrefs, run.code) ? 1 : 0;
              const candidate = {
                donor, run, segment, lateDefinition, earlyDefinition,
                converts: Boolean(earlyDefinition), donorLikesLate,
                length: segment.days.length, surplus: empHours[donor] - employeeTargetHours[donor],
              };
              const better = (a, b) => {
                if (a.converts !== b.converts) return a.converts;
                if (a.donorLikesLate !== b.donorLikesLate) return a.donorLikesLate < b.donorLikesLate;
                if (a.length !== b.length) return a.length > b.length;
                return a.surplus > b.surplus;
              };
              if (!best || better(candidate, best)) best = candidate;
            }
          }
        }
        if (!best) break;
        for (const day of best.segment.days) {
          dropAssignedShift(best.donor, day);
          if (best.earlyDefinition) {
            addEmployeeTargetCatchupShift(best.donor, day, best.earlyDefinition, [
              `Tausch: ${best.lateDefinition.code} an ${employee} abgegeben, der keine Frühschicht übernehmen kann`,
              'Frühschicht als Auffangbecken, Ruhezeiten und Wünsche geprüft',
            ]);
          }
          addEmployeeTargetCatchupShift(employee, day, best.lateDefinition, [
            'Spät-/Nacht-Priorität: Mitarbeiter ohne Frühschicht-Möglichkeit erhält die Spätschicht vorrangig',
            best.earlyDefinition
              ? `${best.donor} arbeitet an diesen Tagen stattdessen Frühschicht`
              : `${best.donor} gibt diese Tage ab (Stunden über dem eigenen Soll)`,
          ]);
        }
      }
    }
  }
  // Largest hour deficit first: the free capacity goes to those who need it most, not to whoever
  // comes first in the alphabet.
  const catchupOrder = [...activeEmployees].sort((left, right) => (
    (employeeTargetHours[right] - empHours[right]) - (employeeTargetHours[left] - empHours[left])
  ));
  // Pass 1 honours every wish. Pass 2 only runs for employees who are still below target and
  // may then leave their preferred-shift list (see relaxedWishPass).
  const catchupRuns = [
    ...catchupOrder.map((employee) => ({ employee, relaxedPass: false })),
    ...catchupOrder.map((employee) => ({ employee, relaxedPass: true })),
    ...catchupOrder.map((employee) => ({ employee, relaxedPass: true, guarantee: true })),
  ];
  for (const { employee, relaxedPass, guarantee = false } of catchupRuns) {
    relaxedWishPass = relaxedPass;
    guaranteePass = guarantee;
    earlyFallbackPass = guarantee && (carriedHourBalance[employee] + empHours[employee] - employeeOfficialTargetHours[employee] < -10
      || empHours[employee] < employeeOfficialTargetHours[employee] - 8);
    if (relaxedPass && !guarantee && !(employeeTargetHours[employee] - empHours[employee] >= 1)) continue;
    // Balance pass: everybody who is more than half a shift below the planning target and whose year balance is
    // below -BALANCE_FLOOR_HOURS (or who is far under the monthly target) gets more hours.
    if (guarantee && !(empHours[employee] < employeeTargetHours[employee] - 4
      && (carriedHourBalance[employee] + empHours[employee] - employeeOfficialTargetHours[employee] < -BALANCE_TRIGGER_HOURS
        || empHours[employee] < employeeOfficialTargetHours[employee] - MAX_HOURS_BELOW_TARGET))) continue;
    const fixedShiftType = fixedShiftTypeByEmployee.get(employee);
    const prefs = preferencesForDate(employee, `${month}-01`);
    const candidateDefinitions = (guaranteePass ? [...regularCatchupDefinitions, ...saturdayCatchupDefinitions] : regularCatchupDefinitions)
      .filter((definition) => !fixedShiftType || fixedShiftType === normalizePlanningShiftTypeKey(definition.shift_type))
      .filter((definition) => !isHardBlockedForPass(evaluateShiftWishForPrefs(prefs, definition.code), definition.code))
      .filter((definition) => isOutsideDbsAllowed(employee, definition, 1))
      .sort((left, right) => {
        // Soft wishes (< 100 %): prefer definitions that do not violate a wish.
        const penaltyDifference = evaluateShiftWishForPrefs(prefs, left.code).penalty - evaluateShiftWishForPrefs(prefs, right.code).penalty;
        if (penaltyDifference !== 0) return penaltyDifference;
        const leftPreferred = isShiftPreferredByEmployeePreference(prefs, left.code) ? 1 : 0;
        const rightPreferred = isShiftPreferredByEmployeePreference(prefs, right.code) ? 1 : 0;
        if (rightPreferred !== leftPreferred) return rightPreferred - leftPreferred;
        if (relaxedWishPass) {
          // Fallback: early is the overflow pool.
          const leftEarly = normalizePlanningShiftTypeKey(left.shift_type) === 'early' ? 1 : 0;
          const rightEarly = normalizePlanningShiftTypeKey(right.shift_type) === 'early' ? 1 : 0;
          if (rightEarly !== leftEarly) return rightEarly - leftEarly;
        }
        const leftContinuity = left.code === empLastWorkedShiftCode[employee] ? 1 : 0;
        const rightContinuity = right.code === empLastWorkedShiftCode[employee] ? 1 : 0;
        if (rightContinuity !== leftContinuity) return rightContinuity - leftContinuity;
        // Variety: no fixed first definition (always E1) for everybody. The order differs per
        // employee and month but is reproducible.
        if (varietyPriority > 0) {
          const leftRank = getDeterministicRotationRank({ employee, year, month: mon, weekKey: 'catchup', shiftCode: varietySeed && varietyPriority >= VARIETY_SEED_MIN_PRIORITY ? `${left.code}#${varietySeed}` : left.code });
          const rightRank = getDeterministicRotationRank({ employee, year, month: mon, weekKey: 'catchup', shiftCode: varietySeed && varietyPriority >= VARIETY_SEED_MIN_PRIORITY ? `${right.code}#${varietySeed}` : right.code });
          if (leftRank !== rightRank) return leftRank - rightRank;
        }
        return Number(left.sort_order || 0) - Number(right.sort_order || 0);
      });
    if (candidateDefinitions.length === 0) continue;

    // Guarantee pass: fill to 10 h below the official target (the limit is 15 h).
    const fillTarget = () => employeeTargetHours[employee];
    while (empHours[employee] < fillTarget()) {
      const availableDays = [];
      // Every allowed shift is checked, not only the preferred one: when the preferred shift is
      // full (e.g. late is at its maximum) the employee still gets another shift with free capacity.
      for (const [definitionRank, catchupDefinition] of candidateDefinitions.entries())
      for (let day = planningStartDay; day <= planningEndDay; day++) {
        if (empDayAssignment[employee][day]) continue;
        const dateStr = `${month}-${String(day).padStart(2, '0')}`;
        const dow = dayOfWeek(year, mon, day);
        if (isEmployeeAbsentOnDate(employee, dateStr)) continue;
        if (guaranteePass && dow === 0) continue;
        // Weekdays an employee asked to keep free are only given up when the month is far below target (last resort).
        const mayUseBlockedWeekday = guaranteePass && empHours[employee] < employeeOfficialTargetHours[employee] - MAX_HOURS_BELOW_TARGET;
        if (!mayUseBlockedWeekday && isEmployeeBlockedByPreferenceOnDay(employee, dow)) continue;
        if (isEmployeeShiftBlockedOnDate(employee, dateStr, catchupDefinition.code)) continue;
        if (isRecoveryProtectedDay(employee, day)) continue;
        if (wouldViolateAdjacentTransition(employee, day, catchupDefinition)) continue;
        if (!keepsEmployeeShiftCohesion(employee, day, catchupDefinition)) continue;
        if (!hasDefinitionCapacityForEmployee(employee, day, catchupDefinition)) continue;
        if (!normalizeWeekdaySetting(catchupDefinition.applicable_days, [1, 2, 3, 4, 5]).includes(dow)) continue;

        let adjacentWorkdays = 0;
        for (let previous = day - 1; previous >= 1 && empDayAssignment[employee][previous]; previous--) adjacentWorkdays++;
        for (let next = day + 1; next <= numDays && empDayAssignment[employee][next]; next++) adjacentWorkdays++;
        const exceedsWorkdayLimit = adjacentWorkdays + 1 > Math.max(rotation.max_consecutive_workdays || 6, 5);
        if (exceedsWorkdayLimit) continue;
        const sameCodeNeighbor = empDayAssignment[employee][day - 1] === catchupDefinition.code
          || empDayAssignment[employee][day + 1] === catchupDefinition.code;
        const sameTypeNeighbor = getAssignedShiftType(employee, day - 1) === normalizePlanningShiftTypeKey(catchupDefinition.shift_type)
          || getAssignedShiftType(employee, day + 1) === normalizePlanningShiftTypeKey(catchupDefinition.shift_type);
        const recoveryEntry = explanations[`${employee}_${day}`]?.reasons?.some((reason) => String(reason).includes('Erholung'));
        // Level the coverage: days that already have many colleagues of this shift type come last, so
        // the filler shifts do not all pile up on the same days (e.g. every Wed-Fri).
        const catchupType = normalizePlanningShiftTypeKey(catchupDefinition.shift_type);
        const colleaguesOfTypeThatDay = shifts.filter((entry) => Number(entry.day) === day
          && normalizePlanningShiftTypeKey(shiftDefinitionByCode.get(String(entry.shift_code || '').trim().toUpperCase())?.shift_type) === catchupType).length;
        // Avoid isolated single days: a filler day that touches an existing work day extends a block,
        // a day with no working neighbour would be a lone shift between free days.
        const touchesWorkDay = Boolean(empDayAssignment[employee][day - 1]) || Boolean(empDayAssignment[employee][day + 1]);
        // Stay with one shift type per week: switching late -> early needs a free day in between (rest rule),
        // which would leave a gap in the middle of the week (late Mon-Tue, free, early Thu-Fri).
        let weekTypeBonus = 0;
        const weekStartDay = day - ((dow + 6) % 7);
        for (let weekDay = weekStartDay; weekDay < weekStartDay + 7; weekDay++) {
          if (weekDay === day || weekDay > numDays) continue;
          const assignedType = getAssignedShiftType(employee, weekDay);
          if (!assignedType || assignedType === 'special') continue;
          weekTypeBonus = assignedType === catchupType ? 120 : -200;
          break;
        }
        // Continuity (hard): one shift type per week, no isolated days and no two-day fragments. A new run
        // starts Monday to Wednesday at the earliest (at least three days until Friday) or extends an existing block.
        if (weekTypeBonus === -200 && !isDbsPoolMember(employee)) continue;
        if (!touchesWorkDay && !guaranteePass && !([1, 2, 3].includes(dow))) continue;
        availableDays.push({
          day,
          definition: catchupDefinition,
          score: (sameCodeNeighbor ? 100 : 0) + (sameTypeNeighbor ? 60 : 0) + (touchesWorkDay ? 40 : -80) - (recoveryEntry ? 50 : 0)
            // Last-resort pass: the order of the shifts (early first = overflow pool) decides; spreading the
            // fillers over the days would pull people into late shifts that only have room on a few days.
            - definitionRank * (relaxedWishPass ? 80 : 12) - (guaranteePass && dow === 6 ? 60 : 0) + weekTypeBonus
            - (relaxedWishPass ? 0 : colleaguesOfTypeThatDay * 8 * (varietyPriority / 60))
            - getBlockedDayPenalty(employee, dow) - getShiftWishPenaltyOnDate(employee, dateStr, catchupDefinition.code)
            // Variety: equally good filler days are decided differently per draft (slider in the settings).
            + getVarietyJitter({ employee, year, month: mon, weekKey: `fill${day}`, shiftCode: catchupDefinition.code, priority: varietyPriority, seed: varietySeed }),
        });
      }

      if (availableDays.length === 0) break;
      availableDays.sort((left, right) => right.score - left.score || left.day - right.day);
      const selectedDay = availableDays[0].day;
      const catchupDefinition = availableDays[0].definition;
      const selectedDate = `${month}-${String(selectedDay).padStart(2, '0')}`;
      const shiftHours = getShiftHoursForDay(catchupDefinition, selectedDay);
      releaseHolidayCredit(employee, selectedDay);
      shifts.push({ employee_name: employee, day: selectedDay, shift_code: catchupDefinition.code });
      const usesElasticCapacity = guaranteePass && !capacityWithin(employee, selectedDay, catchupDefinition, 0);
      if (usesElasticCapacity) balanceOverstaffCells.add(`${employee}|${selectedDay}`);
      const usedEarlyFallback = earlyFallbackPass && isEarlyShiftCode(catchupDefinition.code)
        && getShiftWishEvaluation(employee, selectedDate, catchupDefinition.code).violations.some((violation) => violation.type === 'unwanted' || violation.type === 'not_preferred');
      if (usedEarlyFallback) planReport.earlyFallbacks.push({ employee, day: selectedDay, date: selectedDate, code: catchupDefinition.code });
      empDayAssignment[employee][selectedDay] = catchupDefinition.code;
      empHours[employee] += shiftHours;
      empStats[employee].total++;
      empStats[employee].actualHours = Number(empHours[employee].toFixed(2));
      if (catchupDefinition.shift_type === 'early') empStats[employee].earlyCount++;
      if (catchupDefinition.shift_type === 'late') empStats[employee].lateCount++;
      planReport.totalShiftsPlanned++;
      explanations[`${employee}_${selectedDay}`] = {
        employee,
        day: selectedDay,
        code: catchupDefinition.code,
        reasons: [
          `Verbindlicher Sollzeitausgleich auf mindestens ${employeeTargetHours[employee]} Stunden`,
          ...(usedEarlyFallback ? ['Fallback Frühschicht: Schichtwunsch/unerwünschte Schicht zugunsten der Stundenzahl übergangen'] : []),
          ...(usesElasticCapacity ? ['Überbesetzung zum Stundenausgleich: Jahressaldo im Minus, Maximalbesetzung bewusst überschritten'] : []),
          `Schichtkontinuität: ${catchupDefinition.code} statt zufälligem Schichtwechsel`,
          `Nicht abwesend am ${selectedDate}`,
        ],
      };
    }

    if (guaranteePass) continue;

    // Saturday block (E1SA/E2SA) is extended to the full Mon-Sun block of the SAME family.
    for (const [saturdayBlockCode, weekendBlockCode] of [['E1SA', 'E1WE'], ['E2SA', 'E2WE']]) {
      if (empHours[employee] >= employeeTargetHours[employee]) break;
      const earlyWeekendDefinition = shiftDefs.find((definition) => String(definition.code).toUpperCase() === weekendBlockCode);
      if (earlyWeekendDefinition && !evaluateShiftWishForPrefs(prefs, earlyWeekendDefinition.code).hardBlocked) {
        for (let monday = planningStartDay; monday <= planningEndDay - 6 && empHours[employee] < employeeTargetHours[employee]; monday++) {
          if (dayOfWeek(year, mon, monday) !== 1) continue;
          const saturday = monday + 5;
          const sunday = monday + 6;
          const hasCompleteSaturdayBlock = Array.from({ length: 6 }, (_, offset) => monday + offset)
            .every((day) => empDayAssignment[employee][day] === saturdayBlockCode);
          const sundayDate = `${month}-${String(sunday).padStart(2, '0')}`;
          if (!hasCompleteSaturdayBlock || empDayAssignment[employee][sunday] || isEmployeeAbsentOnDate(employee, sundayDate)) continue;
          if (Array.from({ length: 7 }, (_, offset) => monday + offset).some((day) => isEmployeeBlockedByPreferenceOnDay(employee, dayOfWeek(year, mon, day)))) continue;
          if (isRecoveryProtectedDay(employee, sunday)) continue;
          if (violatesWeekendRecoveryAfterBlock(employee, Array.from({ length: 7 }, (_, offset) => monday + offset))) continue;
          if (!Array.from({ length: 7 }, (_, offset) => monday + offset).every((day) => hasDefinitionCapacityForEmployee(employee, day, earlyWeekendDefinition))) continue;

          for (let day = monday; day <= saturday; day++) {
            const shift = shifts.find((entry) => entry.employee_name === employee && entry.day === day);
            if (shift) shift.shift_code = weekendBlockCode;
            empDayAssignment[employee][day] = weekendBlockCode;
            explanations[`${employee}_${day}`] = {
              employee,
              day,
              code: weekendBlockCode,
              reasons: [`Sollzeitausgleich: vollständiger ${weekendBlockCode}-Block Montag bis Sonntag`],
            };
          }
          releaseHolidayCredit(employee, sunday);
          shifts.push({ employee_name: employee, day: sunday, shift_code: weekendBlockCode });
          empDayAssignment[employee][sunday] = weekendBlockCode;
          empHours[employee] += getShiftHoursForDay(earlyWeekendDefinition, sunday);
          empStats[employee].total++;
          empStats[employee].weekends++;
          empStats[employee].workedWeekendBlocks.add(getWeekendBlockKey(year, mon, sunday));
          empStats[employee].actualHours = Number(empHours[employee].toFixed(2));
          planReport.totalShiftsPlanned++;
          explanations[`${employee}_${sunday}`] = {
            employee,
            day: sunday,
            code: weekendBlockCode,
            reasons: [
              `Verbindlicher Sollzeitausgleich auf mindestens ${employeeTargetHours[employee]} Stunden`,
              `${saturdayBlockCode} wurde regelkonform zu ${weekendBlockCode} Montag bis Sonntag erweitert`,
            ],
          };
        }
      }
    }

    while (empHours[employee] < employeeTargetHours[employee]) {
      const missingHours = employeeTargetHours[employee] - empHours[employee];
      const blockCandidates = [];

      for (const blockDefinition of targetCatchupSeriesDefinitions) {
        const blockCode = String(blockDefinition.code || '').trim().toUpperCase();
        const blockType = normalizePlanningShiftTypeKey(blockDefinition.shift_type);
        const seriesDays = getShiftSeriesDays(blockDefinition);
        if (fixedShiftType && fixedShiftType !== blockType) continue;
        if (evaluateShiftWishForPrefs(prefs, blockDefinition.code).hardBlocked) continue;

        const applicableDays = new Set(normalizeWeekdaySetting(blockDefinition.applicable_days, [1, 2, 3, 4, 5, 6, 0]));
        for (let monday = planningStartDay; monday <= planningEndDay - seriesDays + 1; monday++) {
          if (dayOfWeek(year, mon, monday) !== 1) continue;

          const blockDays = [];
          let validSeries = true;
          for (let offset = 0; offset < seriesDays; offset++) {
            const day = monday + offset;
            if (!applicableDays.has(dayOfWeek(year, mon, day))) {
              validSeries = false;
              break;
            }
            blockDays.push(day);
          }
          if (!validSeries) continue;
          if (wouldExceedEmployeeWeekendLimit(employee, blockDays)) continue;

          const weekdayBaseDays = blockDays.filter((day) => {
            const dow = dayOfWeek(year, mon, day);
            return dow >= 1 && dow <= 5;
          });
          if (weekdayBaseDays.length < 5) continue;
          if (!weekdayBaseDays.every((day) => empDayAssignment[employee][day] && getAssignedShiftType(employee, day) === blockType)) continue;

          // Keep the employee's weekday family (E1 vs E2, L1 vs L2): skip blocks of a different family
          // when a block definition of the employee's own family exists for the same shift type.
          const baseFamilies = new Set(weekdayBaseDays.map((day) => getPreferenceShiftCode(empDayAssignment[employee][day])));
          if (baseFamilies.size === 1) {
            const [baseFamily] = [...baseFamilies];
            const blockFamily = getPreferenceShiftCode(blockCode);
            if (baseFamily !== blockFamily && targetCatchupSeriesDefinitions.some((other) => (
              normalizePlanningShiftTypeKey(other.shift_type) === blockType
              && getPreferenceShiftCode(other.code) === baseFamily
            ))) continue;
          }

          const additionalDays = blockDays.filter((day) => !empDayAssignment[employee][day]);
          if (additionalDays.length === 0) continue;
          if (additionalDays.some((day) => isEmployeeAbsentOnDate(employee, `${month}-${String(day).padStart(2, '0')}`))) continue;
          if (additionalDays.some((day) => isEmployeeBlockedByPreferenceOnDay(employee, dayOfWeek(year, mon, day)))) continue;
          if (additionalDays.some((day) => isRecoveryProtectedDay(employee, day))) continue;
          if (additionalDays.some((day) => wouldViolateAdjacentTransition(employee, day, blockDefinition))) continue;
          if (blockDays.some((day) => !hasDefinitionCapacityForEmployee(employee, day, blockDefinition))) continue;
          if (violatesWeekendRecoveryAfterBlock(employee, blockDays)) continue;

          const blockedByOtherShift = blockDays.some((day) => {
            const assignedCode = empDayAssignment[employee][day];
            if (!assignedCode) return false;
            return getAssignedShiftType(employee, day) !== blockType;
          });
          if (blockedByOtherShift) continue;

          const addedHours = additionalDays.reduce((sum, blockDay) => sum + getShiftHoursForDay(blockDefinition, blockDay), 0);
          blockCandidates.push({
            blockDefinition,
            blockCode,
            blockDays,
            additionalDays,
            addedHours,
            preferencePenalty: additionalDays.reduce((sum, blockDay) => sum + getBlockedDayPenalty(employee, dayOfWeek(year, mon, blockDay)), 0)
              + evaluateShiftWishForPrefs(prefs, blockDefinition.code).penalty,
            score: Math.abs(addedHours - missingHours) + additionalDays.length * 0.01,
          });
        }
      }

      if (blockCandidates.length === 0) break;
      blockCandidates.sort((left, right) => left.preferencePenalty - right.preferencePenalty || left.score - right.score || left.blockDays[0] - right.blockDays[0] || left.blockCode.localeCompare(right.blockCode, 'de'));
      const selected = blockCandidates[0];
      const reason = `Verbindlicher Sollzeitausgleich auf mindestens ${employeeTargetHours[employee]} Stunden`;

      for (const day of selected.blockDays) {
        if (empDayAssignment[employee][day]) {
          changeEmployeeShiftCode(employee, day, selected.blockCode, [
            reason,
            `Blockregel: ${selected.blockCode} vollständig von Montag bis ${selected.blockDays.length === 6 ? 'Samstag' : 'Sonntag'}`,
          ]);
        } else {
          addEmployeeTargetCatchupShift(employee, day, selected.blockDefinition, [
            reason,
            `Blockregel: ${selected.blockCode} vollständig von Montag bis ${selected.blockDays.length === 6 ? 'Samstag' : 'Sonntag'}`,
            `Nicht abwesend am ${month}-${String(day).padStart(2, '0')}`,
          ]);
        }
      }
    }

    while (empHours[employee] < employeeTargetHours[employee]) {
      const missingHours = employeeTargetHours[employee] - empHours[employee];
      const mandatoryCandidates = [];

      for (const definition of candidateDefinitions) {
        const applicableDays = new Set(normalizeWeekdaySetting(definition.applicable_days, [1, 2, 3, 4, 5]));
        for (let day = planningStartDay; day <= planningEndDay; day++) {
          if (empDayAssignment[employee][day]) continue;
          const dateStr = `${month}-${String(day).padStart(2, '0')}`;
          const dow = dayOfWeek(year, mon, day);
          if (isEmployeeAbsentOnDate(employee, dateStr)) continue;
          if (isEmployeeBlockedByPreferenceOnDay(employee, dow)) continue;
          if (isEmployeeShiftBlockedOnDate(employee, dateStr, definition.code)) continue;
          if (isRecoveryProtectedDay(employee, day)) continue;
          if (!applicableDays.has(dow)) continue;
          if (wouldViolateAdjacentTransition(employee, day, definition)) continue;
          if (!hasDefinitionCapacityForEmployee(employee, day, definition)) continue;

          if (violatesWeekendRecoveryForAddedDay(employee, day)) continue;
          // Continuity: never a second shift type within the same calendar week.
          if (hasOtherTypeInWeek(employee, day, normalizePlanningShiftTypeKey(definition.shift_type))) continue;

          let previousStreak = 0;
          for (let previous = day - 1; previous >= 1 && empDayAssignment[employee][previous]; previous--) previousStreak++;
          let nextStreak = 0;
          for (let next = day + 1; next <= numDays && empDayAssignment[employee][next]; next++) nextStreak++;
          const projectedStreak = previousStreak + 1 + nextStreak;
          if (projectedStreak > Math.max(rotation.max_consecutive_workdays || 6, 5)) continue;

          const shiftHours = getShiftHoursForDay(definition, day);
          const sameCodeNeighbor = empDayAssignment[employee][day - 1] === definition.code
            || empDayAssignment[employee][day + 1] === definition.code;
          const sameTypeNeighbor = getAssignedShiftType(employee, day - 1) === normalizePlanningShiftTypeKey(definition.shift_type)
            || getAssignedShiftType(employee, day + 1) === normalizePlanningShiftTypeKey(definition.shift_type);
          const weekdayBonus = isWeekend(year, mon, day) ? 0 : 20;
          // A filler day must continue the employee's own block: same shift type as the days around it
          // and next to a working day. Anything else looks like a random day in the plan.
          const cohesive = keepsEmployeeShiftCohesion(employee, day, definition);
          const touchesWorkDay = Boolean(empDayAssignment[employee][day - 1]) || Boolean(empDayAssignment[employee][day + 1]);

          mandatoryCandidates.push({
            day,
            definition,
            cohesive: cohesive && touchesWorkDay,
            addedHours: shiftHours,
            preferenceMatch: isShiftPreferredByEmployeePreference(preferencesForDate(employee, dateStr), definition.code),
            preferencePenalty: getBlockedDayPenalty(employee, dow) + getShiftWishPenaltyOnDate(employee, dateStr, definition.code),
            score: Math.abs(missingHours - shiftHours)
              - (sameCodeNeighbor ? 10 : 0)
              - (sameTypeNeighbor ? 6 : 0)
              - weekdayBonus
              + projectedStreak,
          });
        }
      }
      if (mandatoryCandidates.length === 0) break;
      mandatoryCandidates.sort((left, right) => {
        if (left.preferencePenalty !== right.preferencePenalty) return left.preferencePenalty - right.preferencePenalty;
        if (left.cohesive !== right.cohesive) return left.cohesive ? -1 : 1;
        if (left.preferenceMatch !== right.preferenceMatch) return left.preferenceMatch ? -1 : 1;
        return left.score - right.score || left.day - right.day || String(left.definition.code).localeCompare(String(right.definition.code), 'de');
      });
      const selected = mandatoryCandidates[0];
      // Up to one shift of missing hours is accepted instead of a day that does not fit the plan.
      // Continuity before hours: a day that does not continue a block is only added when the employee would
      // otherwise be more than MAX_HOURS_BELOW_TARGET under the official target.
      if (!selected.cohesive && empHours[employee] >= employeeOfficialTargetHours[employee] - MAX_HOURS_BELOW_TARGET) break;
      addEmployeeTargetCatchupShift(employee, selected.day, selected.definition, [
        `Verbindlicher letzter Sollzeitausgleich auf mindestens ${employeeTargetHours[employee]} Stunden`,
        `Zusatzdienst ${selected.definition.code} wurde gewählt, weil noch ${missingHours.toFixed(1)}h fehlen`,
        'Harte Abwesenheits-, Erholungs- und Übergangsregeln geprüft',
      ]);
    }

    // Short months (e.g. February) cannot reach the monthly target with weekday
    // shifts alone. Extend an adjacent early/late block by single weekend days
    // while keeping rest, streak and weekend limits as hard rules.
    // Early weekend extension may use either family (E1WE and, when configured and active, E2WE).
    const weekendCatchupDefinitionsByType = {
      early: [shiftDefinitionByCode.get('E1WE'), shiftDefinitionByCode.get('E2WE')].filter(Boolean),
      late: [shiftDefinitionByCode.get('L1WE')].filter(Boolean),
    };
    const requiredWeekendRecoveryDays = Math.max(Number.parseInt(String(rotation.free_days_after_weekend ?? 0), 10) || 0, 0);
    const maxConsecutiveWorkdays = Math.max(rotation.max_consecutive_workdays || 6, 5);
    const rotationWeekendLimit = Number.parseInt(String(rotation.max_weekends_per_month ?? ''), 10);
    const individualWeekendLimit = Number.parseInt(String(prefs?.max_weekends_per_month ?? ''), 10);
    const carriedConsecutiveWork = Number.parseInt(String(carryState[employee]?.consecutiveWork ?? 0), 10) || 0;
    while (empHours[employee] < employeeTargetHours[employee]) {
      const missingHours = employeeTargetHours[employee] - empHours[employee];
      const weekendCandidates = [];

      for (let day = planningStartDay; day <= planningEndDay; day++) {
        if (!isWeekend(year, mon, day) || empDayAssignment[employee][day]) continue;
        const dateStr = `${month}-${String(day).padStart(2, '0')}`;
        const dow = dayOfWeek(year, mon, day);
        if (isEmployeeAbsentOnDate(employee, dateStr)) continue;
        if (isEmployeeBlockedByPreferenceOnDay(employee, dow)) continue;
        if (isRecoveryProtectedDay(employee, day)) continue;

        const neighborTypes = new Set([getAssignedShiftType(employee, day - 1), getAssignedShiftType(employee, day + 1)]
          .filter((type) => type === 'early' || type === 'late'));
        const weekendBlockDefinitions = [...neighborTypes].flatMap((type) => weekendCatchupDefinitionsByType[type] || []);
        for (const definition of weekendBlockDefinitions) {
          const blockType = normalizePlanningShiftTypeKey(definition.shift_type);
          if (fixedShiftType && fixedShiftType !== blockType) continue;
          if (!normalizeWeekdaySetting(definition.applicable_days, [0, 1, 2, 3, 4, 5, 6]).includes(dow)) continue;
          if (isEmployeeShiftBlockedOnDate(employee, dateStr, definition.code)) continue;
          if (wouldViolateAdjacentTransition(employee, day, definition)) continue;
          if (!hasDefinitionCapacityForEmployee(employee, day, definition)) continue;

          const weekendKey = getWeekendBlockKey(year, mon, day);
          const opensNewWeekend = !empStats[employee].workedWeekendBlocks.has(weekendKey);
          const workedWeekends = empStats[employee].workedWeekendBlocks.size;
          if (opensNewWeekend && Number.isInteger(rotationWeekendLimit) && workedWeekends >= rotationWeekendLimit) continue;
          const individualWeekendLimitExceeded = opensNewWeekend && Number.isInteger(individualWeekendLimit) && workedWeekends >= individualWeekendLimit
            && !isIgnoredStrength(prefStrength.max_weekends);
          if (individualWeekendLimitExceeded && isHardStrength(prefStrength.max_weekends)) continue;

          let previousStreak = 0;
          let previous = day - 1;
          for (; previous >= 1 && empDayAssignment[employee][previous]; previous--) previousStreak++;
          if (previous < 1) previousStreak += carriedConsecutiveWork;
          let nextStreak = 0;
          for (let next = day + 1; next <= numDays && empDayAssignment[employee][next]; next++) nextStreak++;
          const projectedStreak = previousStreak + 1 + nextStreak;
          if (projectedStreak > maxConsecutiveWorkdays) continue;

          // Recovery after the weekend counts from its last worked day and must fit into this month.
          const lastWeekendWorkDay = isWeekend(year, mon, day + 1) && empDayAssignment[employee][day + 1] ? day + 1 : day;
          let recoveryViolated = lastWeekendWorkDay + requiredWeekendRecoveryDays > numDays;
          for (let offset = 1; offset <= requiredWeekendRecoveryDays && !recoveryViolated; offset++) {
            const recoveryDay = lastWeekendWorkDay + offset;
            if (recoveryDay === day) continue;
            if (empDayAssignment[employee][recoveryDay]) recoveryViolated = true;
          }
          if (recoveryViolated) continue;

          const shiftHours = getShiftHoursForDay(definition, day);
          // With two weekend families configured, continue the neighbour's family (E1 -> E1WE, E2 -> E2WE).
          const continuesFamily = (weekendCatchupDefinitionsByType[blockType] || []).length > 1
            && [day - 1, day + 1].some((neighborDay) => {
              const neighborCode = empDayAssignment[employee][neighborDay];
              return neighborCode && getPreferenceShiftCode(neighborCode) === getPreferenceShiftCode(definition.code);
            });
          // Family continuation is a hard filter when the neighbour's family has a matching weekend definition.
          const neighborFamilies = [day - 1, day + 1]
            .filter((neighborDay) => empDayAssignment[employee][neighborDay] && getAssignedShiftType(employee, neighborDay) === blockType)
            .map((neighborDay) => getPreferenceShiftCode(empDayAssignment[employee][neighborDay]));
          if (neighborFamilies.length > 0
            && !neighborFamilies.includes(getPreferenceShiftCode(definition.code))
            && (weekendCatchupDefinitionsByType[blockType] || []).some((other) => neighborFamilies.includes(getPreferenceShiftCode(other.code)))) continue;
          weekendCandidates.push({
            day,
            definition,
            preferencePenalty: getBlockedDayPenalty(employee, dow) + getShiftWishPenaltyOnDate(employee, dateStr, definition.code)
              + (individualWeekendLimitExceeded ? softPenalty(prefStrength.max_weekends) : 0),
            score: Math.abs(missingHours - shiftHours)
              + (opensNewWeekend ? 20 : 0)
              + projectedStreak
              - (continuesFamily ? 3 : 0),
          });
        }
      }

      if (weekendCandidates.length === 0) break;
      weekendCandidates.sort((left, right) => left.preferencePenalty - right.preferencePenalty || left.score - right.score || left.day - right.day);
      const selected = weekendCandidates[0];
      addEmployeeTargetCatchupShift(employee, selected.day, selected.definition, [
        `Verbindlicher Sollzeitausgleich auf mindestens ${employeeTargetHours[employee]} Stunden`,
        `Wochenend-Ausgleich: ${selected.definition.code} direkt anschließend an einen ${normalizePlanningShiftTypeKey(selected.definition.shift_type) === 'early' ? 'Früh' : 'Spät'}block`,
        'Ruhezeiten, max. Arbeitstage am Stück und Wochenendlimits geprüft',
      ]);
    }
  }

  relaxedWishPass = false;
  guaranteePass = false;
  earlyFallbackPass = false;

  // Overtime pass (admin setting "Überstunden": unlimited or a maximum above the target hours). Runs after
  // everybody below target was served, so overtime never takes capacity from those who still miss hours.
  // It only completes runs: a free day is added when it touches a worked day or when it is the first
  // day after a recovery period (e.g. the Friday after a weekend/night block). No isolated days.
  if (overtimeAllowance > 0) {
    const overtimeOrder = [...activeEmployees].sort((left, right) => (
      (empHours[left] - employeeTargetHours[left]) - (empHours[right] - employeeTargetHours[right])
    ));
    for (const employee of overtimeOrder) {
      const fixedShiftType = fixedShiftTypeByEmployee.get(employee);
      const prefs = preferencesForDate(employee, `${month}-01`);
      const definitions = regularCatchupDefinitions
        .filter((definition) => !fixedShiftType || fixedShiftType === normalizePlanningShiftTypeKey(definition.shift_type))
        .filter((definition) => !isHardBlockedForPass(evaluateShiftWishForPrefs(prefs, definition.code), definition.code))
        .filter((definition) => isOutsideDbsAllowed(employee, definition, 1));
      if (definitions.length === 0) continue;
      for (let added = 0; added < 12; added++) {
        let best = null;
        for (let day = planningStartDay; day <= planningEndDay; day++) {
          if (empDayAssignment[employee][day]) continue;
          const dateStr = `${month}-${String(day).padStart(2, '0')}`;
          const dow = dayOfWeek(year, mon, day);
          if (dow === 0 || dow === 6) continue;
          if (isEmployeeAbsentOnDate(employee, dateStr) || isEmployeeBlockedByPreferenceOnDay(employee, dow)) continue;
          if (isRecoveryProtectedDay(employee, day)) continue;
          const neighborCode = empDayAssignment[employee][day - 1] || empDayAssignment[employee][day + 1] || null;
          const firstDayAfterRecovery = !neighborCode && day > planningStartDay && isRecoveryProtectedDay(employee, day - 1);
          if (!neighborCode && !firstDayAfterRecovery) continue;
          let adjacentWorkdays = 0;
          for (let previous = day - 1; previous >= 1 && empDayAssignment[employee][previous]; previous--) adjacentWorkdays++;
          for (let next = day + 1; next <= numDays && empDayAssignment[employee][next]; next++) adjacentWorkdays++;
          if (adjacentWorkdays + 1 > Math.max(rotation.max_consecutive_workdays || 6, 5)) continue;
          const neighborType = neighborCode ? normalizePlanningShiftTypeKey(shiftDefinitionByCode.get(String(neighborCode).trim().toUpperCase())?.shift_type) : null;
          const ranked = definitions
            .map((definition) => ({
              definition,
              rank: (definition.code === neighborCode ? 0 : normalizePlanningShiftTypeKey(definition.shift_type) === neighborType ? 1 : 2)
                + (isShiftPreferredByEmployeePreference(prefs, definition.code) ? -0.5 : 0),
            }))
            .sort((left, right) => left.rank - right.rank);
          const choice = ranked.find(({ definition }) => (
            normalizeWeekdaySetting(definition.applicable_days, [1, 2, 3, 4, 5]).includes(dow)
            && !isEmployeeShiftBlockedOnDate(employee, dateStr, definition.code)
            && !wouldViolateAdjacentTransition(employee, day, definition)
            && keepsEmployeeShiftCohesion(employee, day, definition)
            && hasDefinitionCapacityForEmployee(employee, day, definition)
            && empHours[employee] + getShiftHoursForDay(definition, day) <= employeeTargetHours[employee] + overtimeAllowance
          ));
          if (!choice) continue;
          const score = (neighborCode ? 50 : 0) - choice.rank * 20 - getBlockedDayPenalty(employee, dow);
          if (!best || score > best.score || (score === best.score && day < best.day)) best = { day, definition: choice.definition, score };
        }
        if (!best) break;
        addEmployeeTargetCatchupShift(employee, best.day, best.definition, [
          'Überstunden erlaubt (Admin-Einstellung): Lücke zur Woche geschlossen',
          `${best.definition.code} direkt anschließend an einen Arbeitstag bzw. nach der Erholung`,
        ]);
      }
    }
  }
  // Explain every employee who stays clearly below the target hours: count, per free day, which
  // rule or limit blocked the filler shift, so a "free for weeks" employee is never unexplained.
  for (const employee of activeEmployees) {
    const deficit = employeeOfficialTargetHours[employee] - empHours[employee];
    if (!(deficit >= 8)) continue;
    const fixedType = fixedShiftTypeByEmployee.get(employee);
    relaxedWishPass = true;
    const options = regularCatchupDefinitions
      .filter((definition) => !fixedType || fixedType === normalizePlanningShiftTypeKey(definition.shift_type))
      .filter((definition) => isOutsideDbsAllowed(employee, definition, 1));
    const tally = new Map();
    const count = (reason) => tally.set(reason, (tally.get(reason) || 0) + 1);
    let freeDays = 0;
    for (let day = planningStartDay; day <= planningEndDay; day++) {
      if (empDayAssignment[employee][day]) continue;
      freeDays++;
      const dateStr = `${month}-${String(day).padStart(2, '0')}`;
      const dow = dayOfWeek(year, mon, day);
      if (isEmployeeAbsentOnDate(employee, dateStr)) { count('Abwesenheit/Urlaub'); continue; }
      if (isEmployeeBlockedByPreferenceOnDay(employee, dow)) { count('gesperrter Wochentag (Ausschluss/Wunsch)'); continue; }
      if (isRecoveryProtectedDay(employee, day)) { count('Erholungstag'); continue; }
      if (options.length === 0) { count('keine passende Schicht (feste Schichtart/Wunsch/DBS-Regel)'); continue; }
      // Why does no allowed shift fit? Report the reason of the shift that got furthest.
      const failureOf = (definition) => {
        if (!normalizeWeekdaySetting(definition.applicable_days, [1, 2, 3, 4, 5]).includes(dow)) return 'Wochenende bzw. Schicht nicht an diesem Wochentag (nur Wochenendblöcke)';
        if (isEmployeeShiftBlockedOnDate(employee, dateStr, definition.code)) return 'Schicht durch Wunsch/Ausschluss gesperrt';
        if (wouldViolateAdjacentTransition(employee, day, definition)) return 'Schichtfolge/Mindestruhezeit (z. B. Spät→Früh, Nacht→Früh)';
        if (!keepsEmployeeShiftCohesion(employee, day, definition)) return 'Schichtart-Zusammenhalt (kein Wechsel innerhalb von 3 Tagen)';
        if (!hasDefinitionCapacityForEmployee(employee, day, definition)) return 'Tagesbesetzung bereits am Maximum';
        return null;
      };
      const failures = options.map(failureOf);
      if (failures.every((failure) => failure !== null)) {
        const priority = ['Tagesbesetzung bereits am Maximum', 'Schichtart-Zusammenhalt (kein Wechsel innerhalb von 3 Tagen)', 'Schichtfolge/Mindestruhezeit (z. B. Spät→Früh, Nacht→Früh)', 'Schicht durch Wunsch/Ausschluss gesperrt'];
        count(priority.find((reason) => failures.includes(reason)) || failures[0]);
        continue;
      }
      count('Arbeitstage-am-Stück-Limit');
    }
    relaxedWishPass = false;
    const detail = [...tally.entries()].sort((left, right) => right[1] - left[1]).map(([reason, days]) => `${reason}: ${days}`).join('; ');
    conflicts.push({
      day: 1,
      date: `${month}-01`,
      shift: 'Soll',
      severity: deficit > MAX_HOURS_BELOW_TARGET ? 'critical' : 'warning',
      type: 'target_hours_unreached',
      message: `${employee}: Sollstunden um ${deficit.toFixed(1)}h unterschritten (${empHours[employee].toFixed(1)} von ${employeeOfficialTargetHours[employee]}h${deficit > MAX_HOURS_BELOW_TARGET ? `, mehr als ${MAX_HOURS_BELOW_TARGET}h` : ''}), ${freeDays} freie Tage. Gründe je freiem Tag: ${detail || 'unbekannt'}.`,
    });
  }

  // Re-audit configured minimum staffing after all target-hour catch-up passes.
  // Earlier slot failures can become obsolete when catch-up shifts are added.
  const transientCoverageTypes = new Set(['understaffed', 'no_eligible_candidate', 'series_understaffed']);
  for (let index = conflicts.length - 1; index >= 0; index--) {
    if (transientCoverageTypes.has(conflicts[index]?.type)) conflicts.splice(index, 1);
  }

  const assignmentsByEmployee = new Map(activeEmployees.map((employee) => [employee, []]));
  for (const shift of shifts) {
    if (!assignmentsByEmployee.has(shift.employee_name)) assignmentsByEmployee.set(shift.employee_name, []);
    assignmentsByEmployee.get(shift.employee_name).push(Number(shift.day));
  }

  for (let day = planningStartDay; day <= planningEndDay; day++) {
    selectStaffingForDay(dayOfWeek(year, mon, day), holidayMap[`${month}-${String(day).padStart(2, '0')}`] || null, `${month}-${String(day).padStart(2, '0')}`);
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    const dow = dayOfWeek(year, mon, day);
    const applicableDefinitions = shiftDefs.filter((definition) => normalizeWeekdaySetting(definition.applicable_days, [0, 1, 2, 3, 4, 5, 6]).includes(dow));
    const assignmentsToday = shifts.filter((entry) => Number(entry.day) === day);

    const definitionsByType = new Map();
    for (const definition of applicableDefinitions) {
      const type = normalizePlanningShiftTypeKey(definition.shift_type);
      if (!type) continue;
      if (!definitionsByType.has(type)) definitionsByType.set(type, []);
      definitionsByType.get(type).push(definition);
    }

    for (const [shiftType, definitions] of definitionsByType.entries()) {
      const configuredTypeMinimum = Number.parseInt(String(staffingRules[shiftType] ?? ''), 10);
      const definitionMinimum = definitions.reduce((sum, definition) => sum + Math.max(Number.parseInt(String(definition.min_staff ?? 0), 10) || 0, 0), 0);
      const required = Number.isInteger(configuredTypeMinimum) ? Math.max(configuredTypeMinimum, definitionMinimum) : definitionMinimum;
      if (required <= 0) continue;

      // A day without a DBS owner is intentional when a pool exists (the owner's weekday pattern, free
      // days, other members' rest); missing coverage is reported per week as dbs_week_incomplete.
      if (definitions.every((definition) => restrictedPoolShiftCodes.has(String(definition.code || '').trim().toUpperCase()))
        && dbsPoolEntries.length > 0) continue;

      const definitionCodes = new Set(definitions.map((definition) => String(definition.code || '').trim().toUpperCase()));
      if (shiftType === 'night' && shortNightDefinition) definitionCodes.add(String(shortNightDefinition.code || 'NK').trim().toUpperCase());
      const actual = assignmentsToday.filter((entry) => definitionCodes.has(String(entry.shift_code || '').trim().toUpperCase())).length;
      if (actual >= required) continue;

      const suggestionDefinition = [...definitions].sort((left, right) => {
        const leftCount = assignmentsToday.filter((entry) => String(entry.shift_code).toUpperCase() === String(left.code).toUpperCase()).length;
        const rightCount = assignmentsToday.filter((entry) => String(entry.shift_code).toUpperCase() === String(right.code).toUpperCase()).length;
        return leftCount - rightCount || Number(left.sort_order || 0) - Number(right.sort_order || 0);
      })[0];
      const coverageDays = [];
      const maximumCoverageDays = Math.max(getShiftSeriesDays(suggestionDefinition), 1);
      for (let offset = 0; offset < maximumCoverageDays && day + offset <= planningEndDay; offset++) {
        const coverageDay = day + offset;
        if (offset > 0 && dayOfWeek(year, mon, coverageDay) === 1) break;
        if (!normalizeWeekdaySetting(suggestionDefinition.applicable_days, [0, 1, 2, 3, 4, 5, 6]).includes(dayOfWeek(year, mon, coverageDay))) break;
        coverageDays.push(coverageDay);
      }
      if (coverageDays.length === 0) coverageDays.push(day);
      const weekendDays = coverageDays.filter((coverageDay) => isWeekend(year, mon, coverageDay));

      const substituteCandidates = activeEmployees.map((employee) => {
        const absenceDays = coverageDays.filter((coverageDay) => isEmployeeAbsentOnDate(employee, `${month}-${String(coverageDay).padStart(2, '0')}`));
        const recoveryDays = coverageDays.filter((coverageDay) => isRecoveryProtectedDay(employee, coverageDay)
          || isEmployeeShiftBlockedOnDate(employee, `${month}-${String(coverageDay).padStart(2, '0')}`, suggestionDefinition.code));
        const history = historyMap.get(employee) || {};
        const currentStats = empStats[employee] || {};
        return {
          employee,
          assignmentDays: assignmentsByEmployee.get(employee) || [],
          assignmentTypesByDay: Object.fromEntries(Object.entries(empDayAssignment[employee] || {})
            .map(([assignedDay, code]) => [assignedDay, shiftDefinitionByCode.get(String(code || '').trim().toUpperCase())?.shift_type || null])),
          workedWeekendBlocks: currentStats.workedWeekendBlocks?.size || 0,
          absenceDays,
          recoveryDays,
          fixedShiftType: fixedShiftTypeByEmployee.get(employee),
          preferences: preferencesForDate(employee, dateStr),
          currentNights: currentStats.nights || 0,
          currentHours: empHours[employee] || 0,
          targetHours: employeeTargetHours[employee] || targetHours,
          wellbeingScore: Number(history.night_count || 0) * 4
            + Number(history.weekend_count || 0) * 3
            + Number(currentStats.nights || 0) * 4
            + Number(currentStats.workedWeekendBlocks?.size || 0) * 3,
          dayOfWeekByDay: Object.fromEntries(coverageDays.map((coverageDay) => [coverageDay, dayOfWeek(year, mon, coverageDay)])),
        };
      });
      const suggestionCode = String(suggestionDefinition?.code || '').trim().toUpperCase();
      const restrictedPool = restrictedPoolShiftCodes.has(suggestionCode)
        ? new Set([...(specialPoolsByShift.get(suggestionCode)?.keys() || [])]
          .filter((employee) => coverageDays.every((coverageDay) => isPoolEmployeeWorkingOnWeekday(suggestionDefinition, employee, dayOfWeek(year, mon, coverageDay)))))
        : null;
      const suggestions = rankSafeSubstituteCandidates({
        candidates: substituteCandidates.filter((candidate) => isOutsideDbsAllowed(candidate.employee, suggestionDefinition, coverageDays.length)),
        shiftType,
        shiftCode: suggestionDefinition?.code,
        coverageDays,
        weekendDays,
        limit: 3,
        rules: {
          nightToEarlyForbidden: rotation.night_to_early_forbidden,
          lateToEarlyForbidden: rotation.late_to_early_forbidden,
          freeDaysAfterNight: rotation.free_days_after_night,
          freeDaysAfterWeekend: rotation.free_days_after_weekend,
          maxConsecutiveWorkdays: rotation.max_consecutive_workdays,
          maxWeekendsPerMonth: rotation.max_weekends_per_month,
          maxNightsPerMonth: shiftType === 'night'
            ? (normalizeNightPlanningMode(rotation.night_planning_mode) === NIGHT_PLANNING_MODES.SEVEN_DAY_ONLY
              ? rotation.max_nights_per_month
              : Number(rotation.max_nights_per_month || 0) * shortNightSeriesDays)
            : null,
          restrictedPool,
          shortNightSeriesDays,
          respectEmployeeWishes: planConfig.respect_employee_wishes,
        },
      }).map((suggestion) => ({ ...suggestion, shiftCode: suggestionDefinition?.code || null, coverageDays }));
      const emptyPoolHint = restrictedPool && restrictedPool.size === 0
        ? ` Für ${suggestionCode} ist kein Mitarbeiter im festen Pool hinterlegt (Admin-Einstellungen → ${suggestionCode}-Pool).`
        : '';

      conflicts.push({
        day,
        date: dateStr,
        shift: suggestionDefinition?.code || shiftType,
        shiftType,
        required,
        actual,
        missing: required - actual,
        severity: 'critical',
        type: 'understaffed',
        message: `${dateStr}: ${shiftType} ist mit ${actual}/${required} Personen unterbesetzt.${emptyPoolHint}`,
        suggestions,
      });
    }
  }

  planReport.balanceOverstaff = [...balanceOverstaffCells].map((cell) => {
    const [employee, dayText] = cell.split('|');
    const day = Number(dayText);
    return { employee, day, date: `${month}-${String(day).padStart(2, '0')}`, code: shifts.find((entry) => entry.employee_name === employee && Number(entry.day) === day)?.shift_code || null };
  }).filter((entry) => entry.code);
  // Final hard-constraint audit. The planning pass must never silently return
  // a draft with an overstaffed definition, a refused night, or a short-night
  // run longer than three consecutive days.
  for (let day = planningStartDay; day <= planningEndDay; day++) {
    selectStaffingForDay(dayOfWeek(year, mon, day), holidayMap[`${month}-${String(day).padStart(2, '0')}`] || null, `${month}-${String(day).padStart(2, '0')}`);
    const assignmentsToday = shifts.filter((entry) => Number(entry.day) === day);
    for (const definition of shiftDefs) {
      const code = String(definition.code || '').trim().toUpperCase();
      const assignedEntries = assignmentsToday.filter((entry) => String(entry.shift_code || '').trim().toUpperCase() === code);
      const maxStaffForCheck = Math.max(Number.parseInt(String(definition.max_staff ?? 0), 10) || 0, 0);
      // Deliberate overstaffing of the balance pass is documented in the plan report, not a conflict.
      const elasticInDefinition = assignedEntries.filter((entry) => balanceOverstaffCells.has(`${entry.employee_name}|${day}`)).length;
      const assigned = assignedEntries.length - Math.min(elasticInDefinition, Math.max(assignedEntries.length - maxStaffForCheck, 0));
      const maxStaff = Math.max(Number.parseInt(String(definition.max_staff ?? 0), 10) || 0, 0);
      if (maxStaff > 0 && assigned > maxStaff) {
        conflicts.push({
          day,
          date: `${month}-${String(day).padStart(2, '0')}`,
          shift: code,
          severity: 'critical',
          type: 'max_staff_reached',
          assigned,
          maxStaff,
          message: `${code} am ${month}-${String(day).padStart(2, '0')}: ${assigned}/${maxStaff} Personen eingeplant; maximale Besetzung überschritten.`,
        });
      }
    }
    for (const [typeKey, typeMaximum] of Object.entries(staffingMaximums)) {
      const entriesOfType = assignmentsToday.filter((entry) => normalizePlanningShiftTypeKey(
        shiftDefinitionByCode.get(String(entry.shift_code || '').trim().toUpperCase())?.shift_type
      ) === typeKey);
      const elasticInType = entriesOfType.filter((entry) => balanceOverstaffCells.has(`${entry.employee_name}|${day}`)).length;
      let assignedType = entriesOfType.length - Math.min(elasticInType, Math.max(entriesOfType.length - typeMaximum, 0));
      if (assignedType > typeMaximum && lateOverflowEligible.size > 0 && [4, 5].includes(dayOfWeek(year, mon, day)) && typeKey === 'late') {
        // The exempt people who were added last are the overstaffing; it is marked, not reported as a conflict.
        const exemptEntries = entriesOfType.filter((entry) => lateOverflowEligible.has(entry.employee_name));
        const overflowCount = Math.min(exemptEntries.length, assignedType - typeMaximum);
        for (const entry of exemptEntries.slice(exemptEntries.length - overflowCount)) {
          planReport.lateOverflow.push({ employee: entry.employee_name, day, date: `${month}-${String(day).padStart(2, '0')}`, code: entry.shift_code });
          const key = `${entry.employee_name}_${day}`;
          const existing = explanations[key] || { employee: entry.employee_name, day, code: entry.shift_code, reasons: [] };
          existing.reasons = [...(existing.reasons || []), 'Überbesetzung Spätschicht (Do/Fr): Nacht- und Spätschicht-Wunsch, Admin-Freigabe über die Obergrenze'];
          explanations[key] = existing;
        }
        assignedType -= overflowCount;
      }
      if (assignedType > typeMaximum) {
        conflicts.push({
          day,
          date: `${month}-${String(day).padStart(2, '0')}`,
          shift: typeKey,
          severity: 'critical',
          type: 'max_staff_reached',
          assigned: assignedType,
          maxStaff: typeMaximum,
          message: `${typeKey} am ${month}-${String(day).padStart(2, '0')}: ${assignedType}/${typeMaximum} Personen eingeplant; kumulierte Maximalbesetzung überschritten.`,
        });
      }
    }
    const sharedNightAssignments = assignmentsToday.filter((entry) => {
      const code = String(entry.shift_code || '').trim().toUpperCase();
      return normalizePlanningShiftTypeKey(shiftDefinitionByCode.get(code)?.shift_type) === 'night';
    }).length;
    if (sharedNightStaffCap > 0 && sharedNightAssignments > sharedNightStaffCap) {
      conflicts.push({
        day,
        date: `${month}-${String(day).padStart(2, '0')}`,
        shift: 'N/NK',
        severity: 'critical',
        type: 'night_staffing_cap',
        assigned: sharedNightAssignments,
        maxStaff: sharedNightStaffCap,
        message: `N und NK zusammen: ${sharedNightAssignments}/${sharedNightStaffCap} Personen eingeplant; gemeinsame Nachtobergrenze überschritten.`,
      });
    }
  }

  for (const employee of activeEmployees) {
    const preferences = empPrefsMap.get(employee);
    const employeeShifts = shifts
      .filter((entry) => entry.employee_name === employee)
      .sort((left, right) => Number(left.day) - Number(right.day));
    const nightDays = new Set(employeeShifts
      .filter((entry) => normalizePlanningShiftTypeKey(shiftDefinitionByCode.get(String(entry.shift_code || '').trim().toUpperCase())?.shift_type) === 'night')
      .map((entry) => Number(entry.day)));

    if (isNightShiftRefused(preferences) && nightDays.size > 0 && isHardStrength(prefStrength.unwanted_shifts)) {
      conflicts.push({
        employee,
        severity: 'critical',
        type: 'hard_blocked_shift',
        message: `${employee}: Nachtschicht wurde trotz harter Abwahl eingeplant.`,
      });
    }

    if (getEmployeeNightModel(employee) === NIGHT_MODELS.SHORT) {
      let consecutiveNights = 0;
      for (let day = planningStartDay; day <= planningEndDay; day++) {
        consecutiveNights = nightDays.has(day) ? consecutiveNights + 1 : 0;
        if (consecutiveNights > shortNightSeriesDays) {
          conflicts.push({
            employee,
            day,
            date: `${month}-${String(day).padStart(2, '0')}`,
            severity: 'critical',
            type: 'short_night_limit_reached',
            message: `${employee}: Das Nachtmodell Kurz erlaubt maximal ${shortNightSeriesDays} aufeinanderfolgende Nachtschichten.`,
          });
          break;
        }
      }
    }
  }

  // Night top-up: the night minimum must hold on every day. A new 7-day night block can only start on Monday, so a
  // person who drops out in mid-week (absence, blocked day, recovery) leaves a gap until the next Monday. Free people
  // take over the open nights for the rest of the week; every rule of the candidate tests stays in force.
  planReport.nightTopUp = [];
  {
    relaxedWishPass = false;
    guaranteePass = false;
    earlyFallbackPass = false;
    const nightDefinitions = shiftDefs.filter((definition) => normalizePlanningShiftTypeKey(definition.shift_type) === 'night');
    const freeDaysAfterNight = Math.max(Number(rotation.free_days_after_night) || 0, 0);
    const maxNightsPerMonth = Number(rotation.max_nights_per_month) > 0 ? Number(rotation.max_nights_per_month) : Infinity;
    const nightCountOn = (day) => activeEmployees.filter((employee) => coloShiftTypeByCode.get(String(empDayAssignment[employee]?.[day] || '').trim().toUpperCase()) === 'night').length;
    if (nightDefinitions.length > 0) {
      for (let day = planningStartDay; day <= planningEndDay; day++) {
        const dow = dayOfWeek(year, mon, day);
        const dateOf = (targetDay) => `${month}-${String(targetDay).padStart(2, '0')}`;
        selectStaffingForDay(dow, holidayMap[dateOf(day)] || null, dateOf(day));
        const required = Math.max(Number(staffingRules.night) || 0, 0);
        if (required === 0) continue;
        let guard = 0;
        while (nightCountOn(day) < required && guard++ < required) {
          // the open run: from today until Sunday (or the end of the period) as long as the night is short
          let runEnd = day;
          while (runEnd < planningEndDay && dayOfWeek(year, mon, runEnd) !== 0) {
            selectStaffingForDay(dayOfWeek(year, mon, runEnd + 1), holidayMap[dateOf(runEnd + 1)] || null, dateOf(runEnd + 1));
            if (nightCountOn(runEnd + 1) >= Math.max(Number(staffingRules.night) || 0, 0)) break;
            runEnd++;
          }
          selectStaffingForDay(dow, holidayMap[dateOf(day)] || null, dateOf(day));
          let best = null;
          for (const employee of activeEmployees) {
            const fixedType = fixedShiftTypeByEmployee.get(employee);
            if (fixedType && fixedType !== 'night') continue;
            const length = runEnd - day + 1;
            if (empStats[employee].nights + length > maxNightsPerMonth) continue;
            const prefs = empPrefsMap.get(employee);
            const ownNightLimit = Number.parseInt(String(prefs?.max_nights_per_month ?? ''), 10);
            if (isHardStrength(prefStrength.max_nights) && Number.isInteger(ownNightLimit) && empStats[employee].nights + length > ownNightLimit) continue;
            const definition = (getEmployeeNightModel(employee) === NIGHT_MODELS.SHORT && shortNightDefinition) ? shortNightDefinition : nightDefinitions[0];
            if (!definition) continue;
            const applicableDays = normalizeWeekdaySetting(definition.applicable_days, [0, 1, 2, 3, 4, 5, 6]);
            const days = Array.from({ length }, (_, offset) => day + offset);
            let possible = true;
            for (const target of days) {
              const targetDow = dayOfWeek(year, mon, target);
              if (empDayAssignment[employee][target] || isEmployeeAbsentOnDate(employee, dateOf(target))
                || isEmployeeBlockedByPreferenceOnDay(employee, targetDow)
                || isDayBlockedByEmployeePreference(prefs, targetDow)
                || isRecoveryProtectedDay(employee, target)
                || !applicableDays.includes(targetDow)
                || isEmployeeShiftBlockedOnDate(employee, dateOf(target), definition.code)) { possible = false; break; }
            }
            if (!possible) continue;
            const before = getAssignedShiftType(employee, day - 1);
            if (before && before !== 'night') continue; // would hang on to a different shift type
            let connectedBefore = 0;
            for (let previous = day - 1; previous >= 1 && empDayAssignment[employee][previous]; previous--) connectedBefore++;
            if (connectedBefore + length > Math.max(rotation.max_consecutive_workdays || 6, 7)) continue;
            // the free days after the block must be really free
            let recoveryFree = true;
            for (let offset = 1; offset <= freeDaysAfterNight; offset++) {
              if (empDayAssignment[employee][runEnd + offset]) { recoveryFree = false; break; }
            }
            if (!recoveryFree) continue;
            if (wouldViolateAdjacentTransition(employee, day, definition)) continue;
            if (wouldExceedEmployeeWeekendLimit(employee, days, { skipSpacing: true })) continue;
            if (!isOutsideDbsAllowed(employee, definition, length)) continue;
            if (!days.every((target) => capacityWithin(employee, target, definition, 0) || capacityWithin(employee, target, definition, ELASTIC_EXTRA_STAFF))) continue;
            const openHours = employeeTargetHours[employee] - empHours[employee];
            const wantsNight = (prefs?.preferred_shifts || []).some((code) => normalizePlanningShiftTypeKey(shiftDefinitionByCode.get(String(code).trim().toUpperCase())?.shift_type) === 'night');
            const score = openHours + (wantsNight ? 80 : 0) + (isNightTeamMember(employee) ? 120 : 0) - empStats[employee].nights * 8;
            if (!best || score > best.score) best = { employee, definition, days, score };
          }
          if (!best) break;
          for (const target of best.days) {
            const targetDow = dayOfWeek(year, mon, target);
            releaseHolidayCredit(best.employee, target);
            shifts.push({ employee_name: best.employee, day: target, shift_code: best.definition.code });
            empDayAssignment[best.employee][target] = best.definition.code;
            empHours[best.employee] += getShiftHoursForDay(best.definition, target);
            empStats[best.employee].total++;
            empStats[best.employee].nights++;
            empStats[best.employee].actualHours = Number(empHours[best.employee].toFixed(2));
            if (targetDow === 6 || targetDow === 0) {
              empStats[best.employee].weekends++;
              empStats[best.employee].workedWeekendBlocks.add(getWeekendBlockKey(year, mon, target));
            }
            planReport.totalShiftsPlanned++;
            explanations[`${best.employee}_${target}`] = {
              employee: best.employee,
              day: target,
              code: best.definition.code,
              reasons: [
                `Nachtbesetzung aufgefüllt: ${best.definition.code} bis zur Mindestbesetzung (${required} Personen)`,
                'Wünsche, Abwesenheiten, Ruhezeiten, Wochenendabstand und Nachtlimits geprüft',
              ],
            };
          }
          planReport.nightTopUp.push({ employee: best.employee, from: day, to: best.days.at(-1), code: best.definition.code });
        }
      }
    }
  }

  // Colo repair pass: the admin demand (early / late tasks per weekday) is covered by pool members who are still
  // free that day. Every rule stays in force (wishes, absences, rest, week continuity, limits); only people
  // from the Colo list are used, the one with the biggest hour deficit first.
  planReport.coloRepair = [];
  if (coloPlanningConfig.enabled && coloPoolKeys.size > 0) {
    relaxedWishPass = false;
    guaranteePass = false;
    earlyFallbackPass = false;
    const poolMembers = activeEmployees.filter(isColoPoolEmployee);
    const typeOfAssigned = (employee, day) => coloShiftTypeByCode.get(String(empDayAssignment[employee]?.[day] || '').trim().toUpperCase());
    for (let day = planningStartDay; day <= planningEndDay; day++) {
      const dow = dayOfWeek(year, mon, day);
      const dateStr = `${month}-${String(day).padStart(2, '0')}`;
      selectStaffingForDay(dow, holidayMap[dateStr] || null, dateStr);
      const tasks = getColoTaskRequirements(dow, coloPlanningConfig);
      for (const type of ['early', 'late']) {
        const required = tasks.filter((task) => task.shiftType === type).reduce((sum, task) => sum + task.required, 0);
        if (required === 0) continue;
        const definitionsOfType = (dow === 6 ? saturdayCatchupDefinitions : regularCatchupDefinitions)
          .filter((definition) => normalizePlanningShiftTypeKey(definition.shift_type) === type)
          .filter((definition) => normalizeWeekdaySetting(definition.applicable_days, [1, 2, 3, 4, 5]).includes(dow));
        if (dow === 0 || definitionsOfType.length === 0) continue;
        let covered = poolMembers.filter((employee) => typeOfAssigned(employee, day) === type && isColoAllowedFor(employee, type, dow)).length + dbsColoCoverCount(day, type);
        while (covered < required) {
          let best = null;
          for (const employee of poolMembers) {
            if (empDayAssignment[employee][day]) continue;
            if (!isColoAllowedFor(employee, type, dow)) continue;
            if (isEmployeeAbsentOnDate(employee, dateStr) || isEmployeeBlockedByPreferenceOnDay(employee, dow)) continue;
            if (isRecoveryProtectedDay(employee, day)) continue;
            const fixedShiftType = fixedShiftTypeByEmployee.get(employee);
            const prefs = preferencesForDate(employee, dateStr);
            let adjacentWorkdays = 0;
            for (let previous = day - 1; previous >= 1 && empDayAssignment[employee][previous]; previous--) adjacentWorkdays++;
            for (let next = day + 1; next <= numDays && empDayAssignment[employee][next]; next++) adjacentWorkdays++;
            if (adjacentWorkdays + 1 > Math.max(rotation.max_consecutive_workdays || 6, 5)) continue;
            const weekStartDay = day - ((dow + 6) % 7);
            let otherTypeInWeek = false;
            for (let weekDay = weekStartDay; weekDay < weekStartDay + 7; weekDay++) {
              if (weekDay === day || weekDay > numDays) continue;
              const assignedType = getAssignedShiftType(employee, weekDay);
              if (assignedType && assignedType !== 'special') { otherTypeInWeek = assignedType !== type; break; }
            }
            if (otherTypeInWeek && !isDbsPoolMember(employee)) continue;
            const touchesWorkDay = Boolean(empDayAssignment[employee][day - 1]) || Boolean(empDayAssignment[employee][day + 1]);
            for (const definition of definitionsOfType) {
              if (fixedShiftType && fixedShiftType !== type) continue;
              if (isEmployeeShiftBlockedOnDate(employee, dateStr, definition.code)) continue;
              if (wouldViolateAdjacentTransition(employee, day, definition)) continue;
              if (!keepsEmployeeShiftCohesion(employee, day, definition)) continue;
              if (!hasDefinitionCapacityForEmployee(employee, day, definition)) continue;
              if (!isOutsideDbsAllowed(employee, definition, 1)) continue;
              const score = (employeeTargetHours[employee] - empHours[employee])
                + (touchesWorkDay ? 60 : -40)
                + (definition.code === empLastWorkedShiftCode[employee] ? 30 : 0)
                - getShiftWishPenaltyOnDate(employee, dateStr, definition.code)
                - getBlockedDayPenalty(employee, dow);
              if (!best || score > best.score) best = { employee, definition, score, prefs };
            }
          }
          if (!best) break;
          const { employee, definition } = best;
          const shiftHours = getShiftHoursForDay(definition, day);
          releaseHolidayCredit(employee, day);
          shifts.push({ employee_name: employee, day, shift_code: definition.code });
          empDayAssignment[employee][day] = definition.code;
          empLastWorkedShiftCode[employee] = definition.code;
          empHours[employee] += shiftHours;
          empStats[employee].total++;
          empStats[employee].actualHours = Number(empHours[employee].toFixed(2));
          if (type === 'early') empStats[employee].earlyCount++;
          if (type === 'late') empStats[employee].lateCount++;
          if (dow === 6) {
            empStats[employee].weekends++;
            empStats[employee].workedWeekendBlocks.add(getWeekendBlockKey(year, mon, day));
          }
          planReport.totalShiftsPlanned++;
          planReport.coloRepair.push({ employee, day, date: dateStr, code: definition.code, type });
          explanations[`${employee}_${day}`] = {
            employee,
            day,
            code: definition.code,
            reasons: [
              `Colo-Kompetenz: ${definition.code} für den Colo-Bedarf (Admin-Vorgabe) eingeplant`,
              'Wünsche, Abwesenheiten, Ruhezeiten und Wochenkontinuität geprüft',
              `Nicht abwesend am ${dateStr}`,
            ],
          };
          covered++;
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Final integrity passes (every rule of the candidate tests stays in force):
  //  1. Fixed pair rule: whoever still works together in a forbidden way loses the cell at the edge of the block.
  //  2. A free day inside a running block (Mon-Sun early, Friday free) is closed, so blocks stay continuous.
  // ------------------------------------------------------------------------------------------------
  planningCursorDay = planningEndDay + 1;
  planReport.neverTogether = [];
  const shiftTypeOfCell = (employee, day) => coloShiftTypeByCode.get(String(empDayAssignment[employee]?.[day] || '').trim().toUpperCase());
  const removeCell = (employee, day) => {
    const code = String(empDayAssignment[employee]?.[day] || '').trim().toUpperCase();
    const definition = shiftDefinitionByCode.get(code);
    const index = shifts.findIndex((entry) => entry.employee_name === employee && Number(entry.day) === day);
    if (index >= 0) shifts.splice(index, 1);
    delete empDayAssignment[employee][day];
    if (definition) {
      empHours[employee] = Math.max(empHours[employee] - getShiftHoursForDay(definition, day), 0);
      empStats[employee].actualHours = Number(empHours[employee].toFixed(2));
      empStats[employee].total = Math.max(empStats[employee].total - 1, 0);
      if (definition.shift_type === 'night') empStats[employee].nights = Math.max(empStats[employee].nights - 1, 0);
    }
    planReport.totalShiftsPlanned = Math.max(planReport.totalShiftsPlanned - 1, 0);
    delete explanations[`${employee}_${day}`];
  };
  for (const [employee, partners] of neverTogetherByEmployee) {
    for (const { partner, rule } of partners) {
      if (employee.localeCompare(partner, 'de') > 0) continue; // handle every pair once
      for (let day = planningStartDay; day <= planningEndDay; day++) {
        if (!empDayAssignment[employee][day] || !empDayAssignment[partner][day]) continue;
        if (!violatesNeverTogether(rule, shiftTypeOfCell(employee, day), shiftTypeOfCell(partner, day), dayOfWeek(year, mon, day))) continue;
        const isEdge = (name) => !empDayAssignment[name][day - 1] || !empDayAssignment[name][day + 1];
        const victim = isEdge(partner) && !isEdge(employee) ? partner : (isEdge(employee) ? employee : partner);
        const keptCode = empDayAssignment[victim === employee ? partner : employee][day];
        const removedCode = empDayAssignment[victim][day];
        removeCell(victim, day);
        planReport.neverTogether.push({ day, removed: victim, code: removedCode, partnerCode: keptCode });
        conflicts.push({
          day,
          date: `${month}-${String(day).padStart(2, '0')}`,
          shift: removedCode,
          severity: 'warning',
          type: 'never_together',
          message: `${rule.label}: dürfen nie zusammen in Nacht- oder Wochenendschicht arbeiten. ${victim} wurde am ${day}. aus ${removedCode} genommen.`,
        });
      }
    }
  }

  // Weekend as a pair: whoever works Saturday also works Sunday (and the other way round). Missing day is added with the
  // same shift (a Monday-Saturday block becomes the Monday-Sunday block); when that is not allowed, the lone day is dropped.
  planReport.fullWeekend = [];
  for (const employee of fullWeekendEmployees) {
    const rows = [];
    for (let saturday = planningStartDay; saturday < planningEndDay; saturday++) {
      if (dayOfWeek(year, mon, saturday) !== 6 || saturday + 1 > numDays) continue;
      const sunday = saturday + 1;
      const hasSaturday = Boolean(empDayAssignment[employee][saturday]);
      const hasSunday = Boolean(empDayAssignment[employee][sunday]);
      if (hasSaturday === hasSunday) continue;
      rows.push({ present: hasSaturday ? saturday : sunday, missing: hasSaturday ? sunday : saturday });
    }
    for (const { present, missing } of rows) {
      const presentCode = String(empDayAssignment[employee][present] || '').trim().toUpperCase();
      const weekendCode = /SA$/.test(presentCode) && shiftDefinitionByCode.has(presentCode.replace(/SA$/, 'WE')) ? presentCode.replace(/SA$/, 'WE') : presentCode;
      const definition = shiftDefinitionByCode.get(weekendCode);
      const dateStr = `${month}-${String(missing).padStart(2, '0')}`;
      const possible = definition
        && missing >= planningStartDay && missing <= planningEndDay
        && !isEmployeeAbsentOnDate(employee, dateStr)
        && !isEmployeeBlockedByPreferenceOnDay(employee, dayOfWeek(year, mon, missing))
        && !violatesNeverTogetherOnDate(employee, dateStr, weekendCode);
      if (possible) {
        if (weekendCode !== presentCode) {
          // E1SA -> E1WE: the whole block Monday to Saturday takes the weekend variant
          for (let blockDay = present; blockDay >= 1 && empDayAssignment[employee][blockDay] && String(empDayAssignment[employee][blockDay]).toUpperCase() === presentCode; blockDay--) {
            changeEmployeeShiftCode(employee, blockDay, weekendCode, [`Wochenende nur als Samstag und Sonntag: ${presentCode} wurde zu ${weekendCode}`]);
          }
        }
        addEmployeeTargetCatchupShift(employee, missing, definition, [`Wochenende nur als Samstag und Sonntag: ${weekendCode} auch am ${missing}.`, `Nicht abwesend am ${dateStr}`]);
        planReport.fullWeekend.push({ employee, day: missing, code: weekendCode, action: 'added' });
      } else {
        removeCell(employee, present);
        planReport.fullWeekend.push({ employee, day: present, code: presentCode, action: 'removed' });
        conflicts.push({
          day: present,
          date: `${month}-${String(present).padStart(2, '0')}`,
          shift: presentCode,
          severity: 'warning',
          type: 'full_weekend',
          message: `${employee} arbeitet Wochenenden nur als Samstag und Sonntag; der zweite Tag ist nicht möglich (Abwesenheit, Sperrtag oder Kollegen-Regel), deshalb wurde der ${present}. entfernt.`,
        });
      }
    }
  }
  planReport.holeRepair = [];
  {
    relaxedWishPass = false;
    guaranteePass = false;
    earlyFallbackPass = false;
    for (const employee of activeEmployees) {
      for (let day = Math.max(planningStartDay, 2); day < planningEndDay; day++) {
        const dow = dayOfWeek(year, mon, day);
        if (dow === 1 || dow === 0) continue; // a hole needs both neighbours inside the same Monday-Sunday block
        if (empDayAssignment[employee][day]) continue;
        const previousCode = empDayAssignment[employee][day - 1];
        const nextCode = empDayAssignment[employee][day + 1];
        if (!previousCode || !nextCode) continue;
        const type = shiftTypeOfCell(employee, day - 1);
        if (!['early', 'late', 'night'].includes(type) || type !== shiftTypeOfCell(employee, day + 1)) continue;
        const dateStr = `${month}-${String(day).padStart(2, '0')}`;
        if (isEmployeeAbsentOnDate(employee, dateStr) || isEmployeeBlockedByPreferenceOnDay(employee, dow)) continue;
        if (isDayBlockedByEmployeePreference(empPrefsMap.get(employee), dow)) continue; // a wished-off weekday stays free, also when the wish is soft
        if (isRecoveryProtectedDay(employee, day)) continue;
        let connected = 0;
        for (let previous = day - 1; previous >= 1 && empDayAssignment[employee][previous]; previous--) connected++;
        for (let next = day + 1; next <= numDays && empDayAssignment[employee][next]; next++) connected++;
        if (connected + 1 > Math.max(rotation.max_consecutive_workdays || 6, 5)) continue;
        const candidates = [shiftDefinitionByCode.get(String(previousCode).trim().toUpperCase()), shiftDefinitionByCode.get(String(nextCode).trim().toUpperCase()),
          ...(dow === 6 ? saturdayCatchupDefinitions : regularCatchupDefinitions)]
          .filter((definition, index, list) => definition && list.indexOf(definition) === index)
          .filter((definition) => normalizePlanningShiftTypeKey(definition.shift_type) === type)
          .filter((definition) => normalizeWeekdaySetting(definition.applicable_days, [1, 2, 3, 4, 5]).includes(dow));
        const definition = candidates.find((candidate) => !isEmployeeShiftBlockedOnDate(employee, dateStr, candidate.code)
          && !wouldViolateAdjacentTransition(employee, day, candidate)
          && isOutsideDbsAllowed(employee, candidate, 1)
          && (capacityWithin(employee, day, candidate, 0) || (!holidayMap[dateStr] && capacityWithin(employee, day, candidate, ELASTIC_EXTRA_STAFF)))); // never above the maximum on a holiday
        if (!definition) continue;
        if (!capacityWithin(employee, day, definition, 0)) balanceOverstaffCells.add(`${employee}|${day}`);
        releaseHolidayCredit(employee, day);
        shifts.push({ employee_name: employee, day, shift_code: definition.code });
        empDayAssignment[employee][day] = definition.code;
        empHours[employee] += getShiftHoursForDay(definition, day);
        empStats[employee].total++;
        empStats[employee].actualHours = Number(empHours[employee].toFixed(2));
        if (type === 'early') empStats[employee].earlyCount++;
        if (type === 'late') empStats[employee].lateCount++;
        if (type === 'night') empStats[employee].nights++;
        if (dow === 6) {
          empStats[employee].weekends++;
          empStats[employee].workedWeekendBlocks.add(getWeekendBlockKey(year, mon, day));
        }
        planReport.totalShiftsPlanned++;
        planReport.holeRepair.push({ employee, day, date: dateStr, code: definition.code });
        explanations[`${employee}_${day}`] = {
          employee,
          day,
          code: definition.code,
          reasons: [
            `Lücke im Block geschlossen: ${definition.code} zwischen ${previousCode} und ${nextCode}, damit die Schichtfolge durchgehend bleibt`,
            'Wünsche, Abwesenheiten, Ruhezeiten und Wochenendabstand geprüft',
          ],
        };
      }
    }
  }

  // Check of the experience rule: never two inexperienced people in one shift, and in late / night not without an experienced colleague.
  planReport.inexperienced = { employees: inexperiencedEmployees.length, together: 0, alone: 0 };
  if (inexperiencedEmployees.length > 0) {
    for (let day = planningStartDay; day <= planningEndDay; day++) {
      for (const type of ['early', 'late', 'night']) {
        const people = activeEmployees.filter((employee) => coloShiftTypeByCode.get(String(empDayAssignment[employee]?.[day] || '').trim().toUpperCase()) === type);
        const newcomers = people.filter(isInexperienced);
        const dateLabel = `${month}-${String(day).padStart(2, '0')}`;
        if (newcomers.length >= 2 && type === 'early') {
          planReport.inexperienced.togetherEarly = (planReport.inexperienced.togetherEarly || 0) + 1; // only a preference in the large early shift
        } else if (newcomers.length >= 2) {
          planReport.inexperienced.together += 1;
          conflicts.push({ day, date: dateLabel, shift: type, severity: 'warning', type: 'inexperienced_together', message: `${dateLabel}: ${newcomers.join(', ')} haben wenig Erfahrung und sind in derselben Schicht (${type}) geplant.` });
        } else if (newcomers.length === 1 && type !== 'early' && people.length === 1) {
          planReport.inexperienced.alone += 1;
          conflicts.push({ day, date: dateLabel, shift: type, severity: 'warning', type: 'inexperienced_alone', message: `${dateLabel}: ${newcomers[0]} hat wenig Erfahrung und ist in der ${type === 'night' ? 'Nacht' : 'Spätschicht'} ohne erfahrenen Kollegen geplant.` });
        } else if (newcomers.length === 1 && type !== 'early' && people.length > 1 && people.every(isInexperienced)) {
          planReport.inexperienced.alone += 1;
        }
      }
    }
  }

  // Weekend variants (E1SA, E1WE, E2SA, E2WE, L1WE ...) are only shown when the block really contains the weekend.
  // A run of working days without Saturday / Sunday (e.g. the first block after a night shift, or a block whose weekend
  // was dropped) gets the plain code (E1 / E2 / L1 / L2). Runs that touch the edge of the planned period stay as they
  // are, because their weekend may lie in the neighbouring month.
  planReport.weekendCodeRenamed = [];
  for (const employee of activeEmployees) {
    const days = Object.keys(empDayAssignment[employee] || {}).map(Number).filter((day) => empDayAssignment[employee][day]).sort((a, b) => a - b);
    let index = 0;
    while (index < days.length) {
      let end = index;
      while (end + 1 < days.length && days[end + 1] === days[end] + 1) end++;
      const run = days.slice(index, end + 1);
      index = end + 1;
      if (run[0] <= planningStartDay || run[run.length - 1] >= planningEndDay) continue;
      if (run.some((day) => isWeekend(year, mon, day))) continue;
      for (const day of run) {
        const code = String(empDayAssignment[employee][day] || '').trim().toUpperCase();
        const match = /^([EL]\d)(SA|WE)$/.exec(code);
        if (!match) continue;
        const plainDefinition = shiftDefinitionByCode.get(match[1]);
        const currentDefinition = shiftDefinitionByCode.get(code);
        if (!plainDefinition || !currentDefinition || normalizePlanningShiftTypeKey(plainDefinition.shift_type) !== normalizePlanningShiftTypeKey(currentDefinition.shift_type)) continue;
        empDayAssignment[employee][day] = plainDefinition.code;
        const cell = shifts.find((entry) => entry.employee_name === employee && Number(entry.day) === day);
        if (cell) cell.shift_code = plainDefinition.code;
        if (explanations[`${employee}_${day}`]) explanations[`${employee}_${day}`].code = plainDefinition.code;
        planReport.weekendCodeRenamed.push({ employee, day, from: code, to: plainDefinition.code });
      }
    }
  }

  // Adopted absences stay in the plan as they were (code unchanged); only a free cell is taken.
  planReport.adoptedAbsences = [];
  for (const entry of adoptedAbsenceCells) {
    if (entry.day < planningStartDay || entry.day > planningEndDay) continue;
    if (shifts.some((shift) => shift.employee_name === entry.employee_name && Number(shift.day) === entry.day)) continue;
    shifts.push({ employee_name: entry.employee_name, day: entry.day, shift_code: entry.code });
    planReport.adoptedAbsences.push({ employee: entry.employee_name, day: entry.day, code: entry.code });
  }

  shifts.sort((left, right) => left.day - right.day || left.employee_name.localeCompare(right.employee_name, 'de'));

  const coloRolePlan = buildColoRolePlan({
    year,
    month: mon,
    numDays,
    startDay: planningStartDay,
    endDay: planningEndDay,
    shifts,
    shiftDefinitions: [...shiftDefs, ...(shortNightDefinition ? [shortNightDefinition] : [])],
    config: coloPlanningConfig,
    preferencesByEmployee: empPrefsMap,
    respectEmployeeWishes: planConfig.respect_employee_wishes,
    dbsShiftCode: dbsPlanningConfig.enabled ? dbsPlanningConfig.shiftCode : null,
  });
  conflicts.push(...coloRolePlan.conflicts);
  planReport.colo = coloRolePlan.summary;

  for (const employee of activeEmployees) {
    const exclusivePreferredShiftType = getExclusivePreferredShiftType(empPrefsMap.get(employee));
    if (!exclusivePreferredShiftType) continue;
    const deviatingAssignments = shifts.filter((entry) => {
      if (entry.employee_name !== employee) return false;
      const definition = shiftDefinitionByCode.get(String(entry.shift_code || '').trim().toUpperCase());
      return normalizePlanningShiftTypeKey(definition?.shift_type) !== exclusivePreferredShiftType;
    });
    if (deviatingAssignments.length === 0) continue;
    conflicts.push({
      day: planningEndDay,
      date: `${month}-${String(planningEndDay).padStart(2, '0')}`,
      shift: null,
      employee,
      severity: 'warning',
      type: 'exclusive_shift_preference_tradeoff',
      requestedShiftType: exclusivePreferredShiftType,
      deviatingAssignments: deviatingAssignments.length,
      message: `${employee}: Der exklusive Wunsch ${exclusivePreferredShiftType} wurde ${deviatingAssignments.length}-mal durch Sollzeit, Besetzung oder harte Rotationsgrenzen ueberstimmt.${exclusivePreferredShiftType === 'night' ? ` Das globale Limit liegt bei ${rotation.max_nights_per_month} Nachtdiensten pro Monat.` : ''}`,
    });
  }

  for (const employee of activeEmployees) {
    const missingHours = Number((employeeTargetHours[employee] - empHours[employee]).toFixed(2));
    if (missingHours <= 0) continue;
    const creditedAbsenceCapacity = Array.from({ length: planningDays }, (_, index) => planningStartDay + index)
      .reduce((sum, day) => sum + getCreditedAbsenceHours(
        getEmployeeAbsenceOnDate(employee, `${month}-${String(day).padStart(2, '0')}`),
        isWeekend(year, mon, day)
      ), 0);
    const theoreticalAvailableHours = creditedAbsenceCapacity + Array.from({ length: planningDays }, (_, index) => planningStartDay + index)
      .filter((day) => !isEmployeeAbsentOnDate(employee, `${month}-${String(day).padStart(2, '0')}`))
      .filter((day) => !isEmployeeBlockedByPreferenceOnDay(employee, dayOfWeek(year, mon, day)))
      .length * Math.max(...shiftDefs.map(getShiftDurationHours), 8);
    const nightRecoveryBlocked = Array.from({ length: planningDays }, (_, index) => planningStartDay + index)
      .some((day) => (explanations[`${employee}_${day}`]?.reasons || []).some((reason) => /Erholungstag nach Nachtschicht/i.test(String(reason))));
    const shortfallReason = theoreticalAvailableHours < employeeTargetHours[employee]
      ? 'mathematically_impossible'
      : nightRecoveryBlocked
        ? 'night_recovery'
        : 'hard_constraints';
    const reasonLabel = shortfallReason === 'mathematically_impossible'
      ? 'im Zeitraum rechnerisch nicht erreichbar'
      : shortfallReason === 'night_recovery'
        ? 'durch zwingende Erholung nach Nachtschicht verursacht'
        : 'durch harte Planungsregeln begrenzt';
    conflicts.push({
      day: planningEndDay,
      date: `${month}-${String(planningEndDay).padStart(2, '0')}`,
      shift: null,
      employee: employee,
      severity: 'warning',
      type: 'target_hours_shortfall',
      reason: shortfallReason,
      missingHours,
      message: `${employee}: Zielzeit um ${missingHours.toFixed(2)} Stunden unterschritten (${reasonLabel}).`,
    });
  }

  // Week consistency (last pass): within one week a person has ONE shift family (E1 or E2 ...) and the suffix of the code
  // matches the weekend that is really worked: both days = ...WE, Saturday only = ...SA, no weekend = plain code.
  // Single days that other passes added (a lone "E1WE" Saturday after an "E1" week, E1 and E2 mixed) are aligned.
  // Only cells of this planning period are changed; same hours only; every wish / absence / rule check stays in force.
  planReport.codeNormalization = [];
  const relaxedBeforeNormalization = relaxedWishPass;
  // Soft wishes (strength below 100 %) do not stop the relabelling: the days are already planned, only the code variant changes.
  relaxedWishPass = true;
  {
    const hasDefinition = (code) => shiftDefinitionByCode.has(code);
    const firstWeekMonday = planningStartDay - ((dayOfWeek(year, mon, planningStartDay) + 6) % 7);
    for (const employee of activeEmployees) {
      for (let monday = firstWeekMonday; monday <= planningEndDay; monday += 7) {
        if (monday + 6 > numDays) continue; // the week continues in the next month: aligned later (quarter / year run)
        const cells = [];
        for (let offset = 0; offset < 7; offset++) {
          const code = String(empDayAssignment[employee]?.[monday + offset] || '').trim().toUpperCase();
          if (code) cells.push({ offset, code, dayIndex: monday + offset });
        }
        const plan = planWeekCodes(cells, hasDefinition);
        if (!plan) continue;
        const planBase = plan.targetCode.replace(/(SA|WE)$/, '');
        for (const cell of plan.cells) {
          if (cell.code === plan.targetCode) continue;
          if (cell.dayIndex < planningStartDay || cell.dayIndex > planningEndDay) continue; // cells of the previous month stay
          const dateStr = `${month}-${String(cell.dayIndex).padStart(2, '0')}`;
          const oldDefinition = shiftDefinitionByCode.get(cell.code);
          if (!oldDefinition) continue;
          // Wanted code first; when a wish / rule forbids it at least the same shift family (E2 instead of E1 ...).
          const alternatives = cell.offset >= 5
            ? [plan.targetCode, `${planBase}WE`, `${planBase}SA`, planBase]
            : [plan.targetCode, planBase];
          const chosen = [...new Set(alternatives)].find((candidate) => {
            const definition = shiftDefinitionByCode.get(candidate);
            return definition
              && getShiftHoursForDay(oldDefinition, cell.dayIndex) === getShiftHoursForDay(definition, cell.dayIndex)
              && (candidate === cell.code || !isEmployeeShiftBlockedOnDate(employee, dateStr, candidate));
          });
          if (!chosen || chosen === cell.code) continue;
          const keptReasons = explanations[`${employee}_${cell.dayIndex}`]?.reasons || [];
          changeEmployeeShiftCode(employee, cell.dayIndex, chosen, [...keptReasons, `Wochenkonsistenz: ${cell.code} wurde zu ${chosen} (eine Schichtfamilie je Woche, Code passend zum geleisteten Wochenende)`]);
          planReport.codeNormalization.push({ employee, day: cell.dayIndex, from: cell.code, to: chosen });
        }
      }
    }
  }

  relaxedWishPass = relaxedBeforeNormalization;

  const targetShortfalls = activeEmployees
    .filter((employee) => !holidayOnlyEmployees.has(employee))
    .map((employee) => ({ employee, actualHours: Number(empHours[employee].toFixed(2)), targetHours: employeeTargetHours[employee] }))
    .filter((entry) => entry.actualHours < entry.targetHours);
  if (targetShortfalls.length > 0) {
    planReport.targetShortfalls = targetShortfalls;
  }

  const fairness = {};
  for (const employee of activeEmployees) {
    if (holidayOnlyEmployees.has(employee)) continue; // not part of the hours lists
    fairness[employee] = {
      nights: empStats[employee].nights,
      weekends: empStats[employee].weekends,
      workedWeekendBlocks: empStats[employee].workedWeekendBlocks.size,
      shiftTypeChanges: empStats[employee].shiftTypeChanges,
      earlyCount: empStats[employee].earlyCount,
      lateCount: empStats[employee].lateCount,
      total: empStats[employee].total,
      actualHours: Number(empHours[employee].toFixed(2)),
      targetHours: employeeOfficialTargetHours[employee],
      planningTargetHours: employeeTargetHours[employee],
      carriedHourBalance: Number((carriedHourBalance[employee] || 0).toFixed(2)),
      deltaHours: Number((empHours[employee] - employeeOfficialTargetHours[employee]).toFixed(2)),
    };
  }

  planReport.conflictsCount = conflicts.length;
  const shiftCodeByEmployeeDay = new Map(shifts.map((entry) => [`${entry.employee_name}|${entry.day}`, String(entry.shift_code || '').trim().toUpperCase()]));
  planReport.preferredColleagues = {
    enabled: preferredColleaguesEnabled,
    wishes: preferredColleagueWishes
      .filter((wish) => activeEmployees.includes(wish.employee) && activeEmployees.includes(wish.colleague))
      .map((wish) => {
        let sharedDays = 0;
        let employeeDays = 0;
        for (let day = 1; day <= numDays; day++) {
          const ownCode = shiftCodeByEmployeeDay.get(`${wish.employee}|${day}`);
          if (!ownCode) continue;
          employeeDays += 1;
          const colleagueCode = shiftCodeByEmployeeDay.get(`${wish.colleague}|${day}`);
          if (colleagueCode && coloShiftTypeByCode.get(ownCode) === coloShiftTypeByCode.get(colleagueCode)) sharedDays += 1;
        }
        return { ...wish, sharedDays, employeeDays };
      }),
  };
  const fulfilledColleagueWishes = planReport.preferredColleagues.wishes.filter((wish) => wish.sharedDays > 0).length;
  // Seamless transition: say clearly which previous month was used (or that none was found).
  const carryMonthLabel = `${MONTH_NAMES_DE[Number(planReport.previousMonthCarry.month.slice(5))]} ${planReport.previousMonthCarry.month.slice(0, 4)}`;
  const carryRule = planReport.previousMonthCarry.employees > 0
    ? `Übergang aus dem Vormonat ${carryMonthLabel}: laufende Blöcke, Erholungstage und Arbeitsserien von ${planReport.previousMonthCarry.employees} Mitarbeitenden fortgesetzt`
    : `Vormonat ${carryMonthLabel} nicht gefunden: der Plan beginnt ohne Übergang (Dienstplan des Vormonats im Schichtplan hinterlegen oder zuerst als Draft erzeugen)`;
  if (planReport.previousMonthCarry.employees === 0 && !isPartialPeriod) {
    conflicts.push({ day: 1, date: `${month}-01`, shift: '', severity: 'warning', type: 'previous_month_missing', message: carryRule });
  }
  planReport.rulesApplied = [
    carryRule,
    `Rotationsregeln: Max ${rotation.max_consecutive_workdays} Arbeitstage, ${rotation.max_nights_per_month} Nächte/Monat`,
    `Serienplanung aktiv: ${shiftDefs.map((definition) => `${definition.code}=${getShiftSeriesDays(definition)} Tage`).join(', ')}`,
    'Wochenanker aktiv: Neue Serien werden zur nächsten Montagkante ausgerichtet',
    `Abwesenheitsgutschrift: Urlaub, Krank und Seminar zählen mit ${CREDITED_ABSENCE_HOURS} Stunden pro Werktag`,
    `Freitage nach Nacht: ${rotation.free_days_after_night || 0}, nach Wochenendarbeit: ${rotation.free_days_after_weekend || 0}`,
    `Monatliche Zielzeit: ${targetHours} Stunden (Werktage Mo–Fr, Ø ${configuredMonthlyTargetHours} h; kein Übertrag zwischen Monaten)`,
    targetShortfalls.length > 0
      ? `Monatliche Unterstunden: ${targetShortfalls.length} Mitarbeiter unter Zielzeit`
      : 'Monatliche Zielzeit erreicht oder uebertroffen',
    `Fairnessregeln: Nächte=${fairnessRules.balance_nights ? 'Ja' : 'Nein'}, Wochenenden=${fairnessRules.balance_weekends ? 'Ja' : 'Nein'}`,
    `Wünsche berücksichtigt: ${planConfig.respect_employee_wishes ? 'Ja' : 'Nein'} (Gewichtung ${planConfig.soft_wishes_priority}%)`,
    `Wunschstärken: Unerwünschte Schichten ${prefStrength.unwanted_shifts}%, Wunschschichten ${prefStrength.preferred_shifts}%, Feiertage ${prefStrength.holidays}%, Sperrtage ${prefStrength.blocked_days}%, Nächte ${prefStrength.max_nights}%, Wochenenden ${prefStrength.max_weekends}%, Wunschkollegen ${prefStrength.colleagues}% (100% = verbindlich; Urlaub/Abwesenheit und Admin-Ausschlüsse immer verbindlich)`,
    coloPlanningConfig.enabled
      ? `Colo-Kompetenzplanung: ${coloRolePlan.summary.assigned}/${coloRolePlan.summary.requiredAssignments} Aufgaben aus ${coloRolePlan.summary.poolSize} Pool-Mitarbeitern besetzt`
      : 'Colo-Kompetenzplanung: deaktiviert',
    preferredColleaguesEnabled
      ? `Wunschkollegen: ${fulfilledColleagueWishes}/${planReport.preferredColleagues.wishes.length} Wünsche mit gemeinsamen Schichten`
      : 'Wunschkollegen: vom Admin deaktiviert (gespeicherte Auswahl wird ignoriert)',
    `Harte Regeln Priorität: ${planConfig.hard_rules_priority}%`,
    `Fairness Priorität: ${planConfig.fairness_priority}%`,
  ];

  return {
    month,
    shifts,
    explanations,
    conflicts,
    fairness,
    planReport,
    carryState: Object.fromEntries(activeEmployees.map((employee) => [employee, {
      recentCodes: Object.fromEntries(Array.from({ length: 7 }, (_, index) => numDays - index)
        .filter((dayNumber) => dayNumber >= 1 && empDayAssignment[employee]?.[dayNumber])
        .map((dayNumber) => [dayNumber - numDays, String(empDayAssignment[employee][dayNumber]).trim().toUpperCase()])),
      consecutiveWork: empConsecutiveWork[employee],
      lastShiftType: empLastShiftType[employee],
      requiredFreeDays: empRequiredFreeDays[employee],
      recoveryReason: empRecoveryReason[employee],
      seriesCode: empSeriesCode[employee],
      seriesRemaining: empSeriesRemaining[employee],
      seriesTotalDays: empSeriesTotalDays[employee],
      lastWeekendKey: [...workedWeekendKeysOf(employee)].sort().at(-1) || null,
      lastWorkedShiftCode: empLastWorkedShiftCode[employee],
      lastWorkedShiftType: empLastWorkedShiftType[employee],
      forcedNextShiftCode: empForcedNextShiftCode[employee],
      hourBalance: Number(((carriedHourBalance[employee] || 0) + empHours[employee] - employeeOfficialTargetHours[employee]).toFixed(2)),
    }])),
    configSnapshot: {
      employees: employees.length,
      activeEmployees: activeEmployees.length,
      excluded: shiftExcludedSet.size,
      // Everybody who is not planned regularly (do-not-plan list, also with the holiday tick): no Soll/Ist hours in lists.
      excludedEmployeeNames: [...new Set([...shiftExcludedSet, ...holidayOnlyEmployees])].sort((left, right) => left.localeCompare(right, 'de')),
      daysInMonth: numDays,
      planningPeriod: {
        type: isPartialPeriod ? 'week' : 'month',
        startDay: planningStartDay,
        endDay: planningEndDay,
        days: planningDays,
      },
      shiftDefinitions: [...shiftDefs, ...(shortNightDefinition ? [shortNightDefinition] : [])].map((definition) => ({
        code: definition.code,
        name: definition.name,
        type: definition.shift_type,
        minStaff: definition.min_staff,
        maxStaff: definition.max_staff,
        durationHours: getShiftDurationHours(definition),
        startTime: definition.start_time ? String(definition.start_time).slice(0, 5) : null,
        endTime: definition.end_time ? String(definition.end_time).slice(0, 5) : null,
        dayOverrides: Array.isArray(definition.day_overrides) ? definition.day_overrides : [],
        seriesDays: getShiftSeriesDays(definition),
        startDayOffset: Number.parseInt(String(definition.start_day_offset ?? 0), 10) || 0,
        endDayOffset: Number.parseInt(String(definition.end_day_offset ?? (definition.shift_type === 'night' ? 1 : 0)), 10) || 0,
      })),
      rotationRules: rotation,
      fairnessRules,
      planningConfig: planConfig,
      // The slider / limit values this draft was generated with (shown in the draft view and the Excel export).
      planningSettings: {
        varietyPriority,
        varietySeed: varietyPriority >= 25 ? varietySeed : 0,
        lateOverflowEnabled,
        ramadanLateEnabled,
        ramadanLateExtra,
        overtimeUnlimited,
        maxOvertimeHours: overtimeUnlimited ? null : overtimeAllowance,
        balanceFloorHours: -BALANCE_FLOOR_HOURS,
        maxCatchupHours: MAX_CATCHUP_HOURS,
        maxReliefHours: MAX_RELIEF_HOURS,
        monthlyTargetHours: configuredMonthlyTargetHours,
        staffing: describeStaffingSettings({ weekdayRules: weekdayStaffingRules, weekdayMaximums: weekdayStaffingMaximums, dayLimitMap: staffingDayLimitMap }),
        shiftLimits: shiftDefs.map((definition) => ({
          code: definition.code,
          type: normalizePlanningShiftTypeKey(definition.shift_type),
          minStaff: Number.parseInt(String(definition.min_staff ?? 0), 10) || 0,
          maxStaff: Number.parseInt(String(definition.max_staff ?? 0), 10) || 0,
        })),
      },
      preferenceStrengths: prefStrength,
      dbsPlanningConfig,
      coloPlanningConfig,
      coloAssignments: coloRolePlan.assignments,
      staffingRules: weekdayStaffingRules,
      staffingDayLimits: staffingDayLimitMap,
      specialPools: Object.fromEntries(
        [...specialPoolsByShift.entries()].map(([shiftCode, entries]) => [
          shiftCode,
          [...entries.entries()].map(([employeeName, value]) => ({
            employeeName,
            monthlyMaxAssignments: value.monthlyMaxAssignments,
            workingWeekdays: value.workingWeekdays,
            freeDaysAfterBlock: value.freeDaysAfterBlock,
          })),
        ])
      ),
      effectiveShiftSlots: baselineShiftSlots.map((definition) => ({
        code: definition.code,
        type: definition.shift_type,
        plannedSlots: definition.planned_slots,
        durationHours: getShiftDurationHours(definition),
        seriesDays: getShiftSeriesDays(definition),
      })),
      generatedAt: new Date().toISOString(),
    },
  };
}

/* ------------------------------------------------ */
/* LIST DRAFTS                                      */
/* ------------------------------------------------ */

router.get('/drafts', async (req, res) => {
  try {
    const { month, grouped, year } = req.query;
    let sql = `SELECT d.id, d.month, d.version, d.status, d.title, d.description, d.note,
                      d.config_snapshot->'planningBatch' AS planning_batch,
                      d.created_by, d.created_at, d.approved_by, d.approved_at,
                      d.activated_by, d.activated_at,
                      (SELECT COUNT(*)::int FROM shiftplan_draft_feedback f WHERE f.draft_id = d.id) AS feedback_count,
                      (SELECT COUNT(*)::int FROM shiftplan_draft_feedback f WHERE f.draft_id = d.id AND f.status = 'open') AS open_feedback_count,
                      (SELECT COUNT(*)::int FROM shiftplan_draft_votes v WHERE v.draft_id = d.id AND v.vote = 'approve') AS approve_votes,
                      (SELECT COUNT(*)::int FROM shiftplan_draft_votes v WHERE v.draft_id = d.id AND v.vote = 'needs_changes') AS needs_changes_votes
                 FROM shiftplan_drafts d
                WHERE TRUE`;
    const params = [];
    if (month) {
      params.push(month);
      sql += ` AND d.month = $${params.length}`;
    }
    if (year) {
      const yearNumber = Number(year);
      if (!Number.isInteger(yearNumber) || yearNumber < 1900 || yearNumber > 9999) return res.status(400).json({ ok: false, error: 'Ungültiges Jahr' });
      params.push(`${yearNumber}-%`);
      sql += ` AND d.month LIKE $${params.length}`;
    }
    sql += ` ORDER BY d.created_at DESC, d.id DESC`;
    if (grouped !== 'true') sql += ' LIMIT 50';
    const { rows } = await pool.query(sql, params);
    res.json({ ok: true, drafts: rows, ...(grouped === 'true' ? { groups: groupPlanningDrafts(rows) } : {}) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/drafts/year/:year', async (req, res) => {
  try {
    const year = Number.parseInt(req.params.year, 10);
    if (!year || year < 2027 || year > 2040) return res.status(400).json({ ok: false, error: 'Ungültiges Planungsjahr' });
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (d.month)
              d.id, d.id AS "draftId", d.month, d.version, d.status, d.title, d.note, d.created_at,
              (SELECT COUNT(*)::int FROM shiftplan_draft_feedback f WHERE f.draft_id = d.id) AS feedback_count,
              (SELECT COUNT(*)::int FROM shiftplan_draft_feedback f WHERE f.draft_id = d.id AND f.status = 'open') AS open_feedback_count,
              (SELECT COUNT(*)::int FROM shiftplan_draft_votes v WHERE v.draft_id = d.id AND v.vote = 'approve') AS approve_votes,
              (SELECT COUNT(*)::int FROM shiftplan_draft_votes v WHERE v.draft_id = d.id AND v.vote = 'needs_changes') AS needs_changes_votes
         FROM shiftplan_drafts d
        WHERE d.month LIKE $1
        ORDER BY d.month, d.version DESC`,
      [`${year}-%`]
    );
    res.json({ ok: true, year, generated: rows, drafts: rows, errors: [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/drafts/year/:year/full', async (req, res) => {
  try {
    const year = Number.parseInt(req.params.year, 10);
    if (!year || year < 2027 || year > 2040) return res.status(400).json({ ok: false, error: 'Ungueltiges Planungsjahr' });
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (d.month)
              d.id, d.month, d.version, d.status, d.title, d.note, d.created_by, d.created_at,
              d.shifts_json,
              (SELECT COUNT(*)::int FROM shiftplan_draft_feedback f WHERE f.draft_id = d.id) AS feedback_count,
              (SELECT COUNT(*)::int FROM shiftplan_draft_votes v WHERE v.draft_id = d.id AND v.vote = 'approve') AS approve_votes,
              (SELECT COUNT(*)::int FROM shiftplan_draft_votes v WHERE v.draft_id = d.id AND v.vote = 'needs_changes') AS needs_changes_votes
         FROM shiftplan_drafts d
        WHERE d.month LIKE $1
        ORDER BY d.month, d.version DESC`,
      [`${year}-%`]
    );
    res.json({ ok: true, year, drafts: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* GET SINGLE DRAFT (with full data)                */
/* ------------------------------------------------ */

// Shift times of the current definitions: fallback for drafts created before the snapshot contained the times.
async function loadShiftTimesByCode() {
  try {
    const { rows } = await pool.query('SELECT code, start_time, end_time, start_day_offset, end_day_offset FROM shift_definitions');
    return new Map(rows.map((row) => [String(row.code || '').trim().toUpperCase(), {
      startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
      endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
      startDayOffset: row.start_day_offset,
      endDayOffset: row.end_day_offset,
    }]));
  } catch (error) {
    console.warn('Shift times unavailable for the cost control:', error.message);
    return new Map();
  }
}

// Night, Sunday and holiday supplement hours per week / month / quarter. The quarter (or the whole batch) provides the context.
async function loadDraftCostControl(draft) {
  let drafts = [draft];
  try {
    const batchId = draft.config_snapshot?.planningBatch?.id;
    if (batchId) {
      const { rows } = await pool.query(
        `SELECT month, shifts_json, config_snapshot FROM shiftplan_drafts
          WHERE config_snapshot->'planningBatch'->>'id' = $1 AND status <> 'failed'`,
        [batchId]
      );
      if (rows.length) drafts = rows;
    } else {
      const [year, mon] = String(draft.month).split('-').map(Number);
      const firstMonth = Math.floor((mon - 1) / 3) * 3 + 1;
      const months = [0, 1, 2].map((offset) => `${year}-${String(firstMonth + offset).padStart(2, '0')}`);
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (month) month, shifts_json, config_snapshot FROM shiftplan_drafts
          WHERE month = ANY($1::text[]) AND status <> 'failed'
          ORDER BY month, (id = $2) DESC, (status = 'activated') DESC, version DESC`,
        [months, draft.id]
      );
      if (rows.length) drafts = rows;
    }
    // The shown draft itself always counts with its current (possibly manually edited) shifts.
    drafts = [...drafts.filter((entry) => entry.month !== draft.month), draft];
  } catch (error) {
    console.warn('Cost control context unavailable:', error.message);
  }
  const employeeNames = [...new Set(drafts.flatMap((entry) => (Array.isArray(entry.shifts_json) ? entry.shifts_json : []).map((shift) => String(shift?.employee_name || '').trim()).filter(Boolean)))];
  return focusCostControl(buildCostControl(drafts, { timesByCode: await loadShiftTimesByCode() }), draft.month, { employeeNames });
}

router.get('/drafts/:id', requireReadableDraft, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM shiftplan_drafts WHERE id = $1', [parseInt(req.params.id)]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Draft nicht gefunden' });
    const draft = rows[0];
    const draftEmployees = deduplicateEmployees([
      ...(Array.isArray(draft.shifts_json) ? draft.shifts_json.map((entry) => entry.employee_name) : []),
      ...Object.keys(draft.fairness || {}),
    ]);
    const wishStatus = await loadDraftWishStatus(draftEmployees);
    const wishSummary = wishStatus.reduce((summary, entry) => {
      if (entry.submitted) summary.submitted += 1;
      else summary.missing += 1;
      return summary;
    }, { submitted: 0, missing: 0 });
    const absences = await loadDraftAbsences(draft.month);
    const manualEmployees = await loadManualEmployeesForDraftMonth(draft.month);

    // Employees with the "Nicht planen" button are removed from older drafts as well.
    const hiddenKeys = await loadDoNotPlanKeys((text, params) => pool.query(text, params));
    const visibleDraft = stripDoNotPlan({
      ...draft,
      wish_status: wishStatus,
      absences,
      manual_employees: manualEmployees,
    }, hiddenKeys);
    const visibleWishSummary = visibleDraft.wish_status.reduce((summary, entry) => {
      if (entry.submitted) summary.submitted += 1;
      else summary.missing += 1;
      return summary;
    }, { submitted: 0, missing: 0 });
    res.json({
      ok: true,
      draft: {
        ...visibleDraft,
        wish_summary: hiddenKeys.size > 0 ? visibleWishSummary : wishSummary,
        cost_control: await loadDraftCostControl(visibleDraft),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* GENERATE DRAFT                                   */
/* ------------------------------------------------ */

/* ------------------------------------------------ */
/* GENERATE DRAFT (deterministic engine)            */
/* ------------------------------------------------ */

router.post('/drafts/generate', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const { month, note } = req.body;
    const title = normalizeMetaText(req.body.title, MAX_TITLE_LENGTH) ?? null;
    const description = normalizeMetaText(req.body.description, MAX_DESCRIPTION_LENGTH) ?? null;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ ok: false, error: 'Gültiges Monatsformat erforderlich (YYYY-MM)' });
    }

    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr);
    const mon = parseInt(monthStr);
    try { assertPlanningYear(year); } catch (error) { return res.status(400).json({ ok: false, error: error.message }); }
    const numDays = daysInMonth(year, mon);
    const createdBy = req.user?.displayName || req.user?.email || req.user?.loginName || 'system';

    const result = await generateShiftPlan(year, mon, numDays, createdBy, { varietySeed: newVarietySeed() });

    // Compute next version number
    const verRes = await pool.query(
      'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM shiftplan_drafts WHERE month = $1',
      [month]
    );
    const nextVersion = verRes.rows[0].next_version;

    // Persist draft
    const { rows } = await pool.query(
      `INSERT INTO shiftplan_drafts (month, version, status, shifts_json, explanations, conflicts, fairness, config_snapshot, note, title, created_by, created_by_user_id, description)
       VALUES ($1, $2, 'draft', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12) RETURNING *`,
      [
        month, nextVersion,
        JSON.stringify(result.shifts),
        JSON.stringify(result.explanations),
        JSON.stringify(result.conflicts),
        JSON.stringify(result.fairness),
        JSON.stringify({ ...result.configSnapshot, planReport: result.planReport }),
        note || null,
        title,
        createdBy,
        getAuthenticatedUserId(req),
        description,
      ]
    );

    res.json({ ok: true, draft: rows[0], planReport: result.planReport });
  } catch (err) {
    console.error('Draft generation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/drafts/generate-week', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const weekStart = String(req.body?.weekStart || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ ok: false, error: 'Gültiges Startdatum der Woche erforderlich (YYYY-MM-DD)' });
    }

    const monday = new Date(`${weekStart}T12:00:00`);
    if (Number.isNaN(monday.getTime()) || monday.getDay() !== 1) {
      return res.status(400).json({ ok: false, error: 'Die Wochenplanung muss an einem Montag beginnen.' });
    }

    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const segments = [];
    let cursor = new Date(monday);
    while (cursor <= sunday) {
      const year = cursor.getFullYear();
      const mon = cursor.getMonth() + 1;
      const endOfMonth = new Date(year, mon, 0);
      const segmentEnd = endOfMonth < sunday ? endOfMonth : sunday;
      segments.push({ year, mon, startDay: cursor.getDate(), endDay: segmentEnd.getDate() });
      cursor = new Date(segmentEnd);
      cursor.setDate(cursor.getDate() + 1);
    }

    try { for (const segment of segments) assertPlanningYear(segment.year); }
    catch (error) { return res.status(400).json({ ok: false, error: error.message }); }

    const createdBy = req.user?.displayName || req.user?.email || req.user?.loginName || 'system';
const generatedPlans = [];
    let carryState = null;
    for (const segment of segments) {
      const month = `${segment.year}-${String(segment.mon).padStart(2, '0')}`;
      const result = await generateShiftPlan(segment.year, segment.mon, daysInMonth(segment.year, segment.mon), createdBy, {
        startDay: segment.startDay,
        endDay: segment.endDay,
        carryState,
      });
      carryState = result.carryState;
      generatedPlans.push({ month, segment, result });
    }

    const client = await pool.connect();
    const generated = [];
    try {
      await client.query('BEGIN');
      for (const { month, segment, result } of generatedPlans) {
        const versionResult = await client.query(
          'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM shiftplan_drafts WHERE month = $1',
          [month]
        );
        const version = versionResult.rows[0].next_version;
        const title = `Wochenplanung ${weekStart}${generatedPlans.length > 1 ? ` (${segment.startDay}-${segment.endDay})` : ''}`;
        const { rows } = await client.query(
          `INSERT INTO shiftplan_drafts (month, version, status, shifts_json, explanations, conflicts, fairness, config_snapshot, note, title, created_by, created_by_user_id)
           VALUES ($1, $2, 'draft', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11)
           RETURNING id, month, version, status, title, created_at`,
          [
            month,
            version,
            JSON.stringify(result.shifts),
            JSON.stringify(result.explanations),
            JSON.stringify(result.conflicts),
            JSON.stringify(result.fairness),
            JSON.stringify({ ...result.configSnapshot, planReport: result.planReport, weekStart }),
            req.body?.note || `Wochenplanung ab ${weekStart}`,
            title,
            createdBy,
            getAuthenticatedUserId(req),
          ]
        );
        generated.push({
          ...rows[0],
          draftId: rows[0].id,
          shifts: result.shifts.length,
          conflicts: result.conflicts.length,
          startDay: segment.startDay,
          endDay: segment.endDay,
        });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    res.json({ ok: true, weekStart, generated });
  } catch (err) {
    console.error('Week generation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/drafts/:id/schedule', requireReadableDraft, async (req, res) => {
  try {
    const draftId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(draftId) || draftId <= 0) return res.status(400).json({ ok: false, error: 'Ungueltige Draft-ID' });
    const { rows } = await pool.query(
      `SELECT id, month, version, status, title, description, note, created_by, created_at, shifts_json
         FROM shiftplan_drafts
        WHERE id = $1`,
      [draftId],
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Draft nicht gefunden' });
    res.json({ ok: true, draft: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* UPDATE DRAFT STATUS                              */
/* ------------------------------------------------ */

router.patch('/drafts/:id/status', requirePageAccess('shiftplan_control', 'write'), requireOwnedDraft, async (req, res) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['draft', 'in_review', 'approved', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ ok: false, error: `Gültiger Status: ${validStatuses.join(', ')}` });
    }
    const actor = req.user?.email || req.user?.username || 'unknown';
    let sql, params;
    if (status === 'approved') {
      sql = `UPDATE shiftplan_drafts SET status = $2, approved_by = $3, approved_at = NOW(), note = COALESCE($4, note) WHERE id = $1 RETURNING *`;
      params = [parseInt(req.params.id), status, actor, note];
    } else {
      sql = `UPDATE shiftplan_drafts SET status = $2, note = COALESCE($3, note) WHERE id = $1 RETURNING *`;
      params = [parseInt(req.params.id), status, note];
    }
    const { rows } = await pool.query(sql, params);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Draft nicht gefunden' });
    res.json({ ok: true, draft: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/drafts/:id/feedback', requireReadableDraft, async (req, res) => {
  try {
    const draftId = Number.parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `SELECT id, draft_id, employee_name, day, suggestion, status,
              created_by_name, created_at, reviewed_by, reviewed_at
         FROM shiftplan_draft_feedback
        WHERE draft_id = $1
        ORDER BY created_at DESC`,
      [draftId]
    );
    res.json({ ok: true, feedback: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/drafts/:id/votes', requireReadableDraft, async (req, res) => {
  try {
    const draftId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(draftId)) return res.status(400).json({ ok: false, error: 'Ungueltiger Draft.' });
    const [summaryResult, currentResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE vote = 'approve')::int AS approve,
           COUNT(*) FILTER (WHERE vote = 'needs_changes')::int AS needs_changes,
           COUNT(*)::int AS total
         FROM shiftplan_draft_votes
         WHERE draft_id = $1`,
        [draftId]
      ),
      pool.query(
        `SELECT vote FROM shiftplan_draft_votes WHERE draft_id = $1 AND user_id = $2`,
        [draftId, req.user.id]
      ),
    ]);
    res.json({
      ok: true,
      votes: summaryResult.rows[0] || { approve: 0, needs_changes: 0, total: 0 },
      currentVote: currentResult.rows[0]?.vote || null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/drafts/:id/vote', requireVerifiedIdentity, requireReadableDraft, async (req, res) => {
  try {
    const draftId = Number.parseInt(req.params.id, 10);
    const vote = String(req.body?.vote || '').trim();
    if (!Number.isInteger(draftId) || !['approve', 'needs_changes'].includes(vote)) {
      return res.status(400).json({ ok: false, error: 'Vote muss approve oder needs_changes sein.' });
    }
    const draftResult = await pool.query('SELECT id FROM shiftplan_drafts WHERE id = $1', [draftId]);
    if (!draftResult.rowCount) return res.status(404).json({ ok: false, error: 'Draft nicht gefunden.' });
    await pool.query(
      `INSERT INTO shiftplan_draft_votes (draft_id, user_id, vote)
       VALUES ($1, $2, $3)
       ON CONFLICT (draft_id, user_id)
       DO UPDATE SET vote = EXCLUDED.vote, updated_at = NOW()`,
      [draftId, req.user.id, vote]
    );
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE vote = 'approve')::int AS approve,
         COUNT(*) FILTER (WHERE vote = 'needs_changes')::int AS needs_changes,
         COUNT(*)::int AS total
       FROM shiftplan_draft_votes
       WHERE draft_id = $1`,
      [draftId]
    );
    res.json({ ok: true, votes: rows[0], currentVote: vote });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/drafts/:id/feedback', requireVerifiedIdentity, requireReadableDraft, async (req, res) => {
  try {
    const draftId = Number.parseInt(req.params.id, 10);
    const employeeName = String(req.body?.employeeName || '').trim();
    const suggestion = String(req.body?.suggestion || '').trim();
    const dayValue = req.body?.day == null || req.body.day === ''
      ? null
      : Number.parseInt(req.body.day, 10);

    if (!Number.isInteger(draftId) || suggestion.length < 5) {
      return res.status(400).json({ ok: false, error: 'Ein Kommentar mit mindestens 5 Zeichen ist erforderlich.' });
    }
    if (dayValue !== null && (!Number.isInteger(dayValue) || dayValue < 1 || dayValue > 31)) {
      return res.status(400).json({ ok: false, error: 'Der Tag muss zwischen 1 und 31 liegen.' });
    }

    const draftResult = await pool.query(
      `SELECT id FROM shiftplan_drafts WHERE id = $1`,
      [draftId]
    );
    if (!draftResult.rowCount) return res.status(404).json({ ok: false, error: 'Draft nicht gefunden.' });

    const actorName = req.user?.displayName
      || [req.user?.first_name, req.user?.last_name].filter(Boolean).join(' ')
      || req.user?.email
      || 'Mitarbeiter';
    const { rows } = await pool.query(
      `INSERT INTO shiftplan_draft_feedback
         (draft_id, employee_name, day, suggestion, created_by_user_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, draft_id, employee_name, day, suggestion, status, created_by_name, created_at`,
      [draftId, employeeName || null, dayValue, suggestion, req.user?.id || null, actorName]
    );
    res.status(201).json({ ok: true, feedback: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/drafts/:draftId/feedback/:feedbackId', requirePageAccess('shiftplan_control', 'write'), requireOwnedDraft, async (req, res) => {
  try {
    const validStatuses = new Set(['open', 'accepted', 'declined', 'resolved']);
    const status = String(req.body?.status || '').trim();
    if (!validStatuses.has(status)) {
      return res.status(400).json({ ok: false, error: 'Ungültiger Feedback-Status.' });
    }
    const actor = req.user?.displayName || req.user?.email || 'Admin';
    const { rows } = await pool.query(
      `UPDATE shiftplan_draft_feedback
          SET status = $3, reviewed_by = $4, reviewed_at = NOW()
        WHERE id = $2 AND draft_id = $1
        RETURNING *`,
      [Number.parseInt(req.params.draftId, 10), Number.parseInt(req.params.feedbackId, 10), status, actor]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Feedback nicht gefunden.' });
    res.json({ ok: true, feedback: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/drafts/:id/metadata', requirePageAccess('shiftplan_control', 'write'), requireOwnedDraft, async (req, res) => {
  try {
    const draftId = parseInt(req.params.id, 10);
    const body = req.body || {};
    const sets = [];
    const params = [draftId];
    const fields = [['title', MAX_TITLE_LENGTH], ['description', MAX_DESCRIPTION_LENGTH], ['note', null]];
    for (const [key, max] of fields) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      const value = max ? normalizeMetaText(body[key], max) : normalizeMetaText(body[key], Number.MAX_SAFE_INTEGER);
      params.push(value ?? null);
      sets.push(`${key} = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ ok: false, error: 'Keine Felder zum Aktualisieren angegeben' });

    const { rows } = await pool.query(
      `UPDATE shiftplan_drafts
          SET ${sets.join(', ')}
        WHERE id = $1
          AND status != 'activated'
        RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Draft nicht gefunden oder bereits aktiviert' });
    res.json({ ok: true, draft: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/drafts/groups/:groupId/metadata', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const groupId = String(req.params.groupId || '');
    if (!groupId || groupId.startsWith('month:') || groupId.startsWith('legacy-year:')) {
      return res.status(400).json({ ok: false, error: 'Ungültige Planungsgruppe' });
    }
    const body = req.body || {};
    const sets = [];
    const params = [groupId, isAdminRequest(req) ? null : getAuthenticatedUserId(req)];
    for (const [key, max] of [['title', MAX_TITLE_LENGTH], ['description', MAX_DESCRIPTION_LENGTH]]) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      params.push(normalizeMetaText(body[key], max) ?? null);
      sets.push(`${key} = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ ok: false, error: 'Keine Felder zum Aktualisieren angegeben' });
    const result = await pool.query(
      `UPDATE shiftplan_drafts
          SET ${sets.join(', ')}
        WHERE config_snapshot->'planningBatch'->>'id' = $1
          AND ($2::int IS NULL OR created_by_user_id = $2)
          AND status != 'activated'`,
      params
    );
    res.json({ ok: true, updated: result.rowCount });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Paid hours of one shift code on one day of a draft, taken from the shift definitions stored with the draft
// (day-specific overrides win). Free markers and unknown codes count 0.
export function getDraftShiftHours(snapshot, month, day, code) {
  const normalized = String(code || '').trim().toUpperCase();
  const definition = (Array.isArray(snapshot?.shiftDefinitions) ? snapshot.shiftDefinitions : [])
    .find((entry) => String(entry?.code || '').trim().toUpperCase() === normalized);
  if (!definition) return 0;
  const [year, mon] = String(month || '').split('-').map(Number);
  const weekday = new Date(year, (mon || 1) - 1, day).getDay();
  const override = (Array.isArray(definition.dayOverrides) ? definition.dayOverrides : [])
    .find((entry) => Number(entry?.weekday) === weekday && Number.isFinite(Number(entry?.duration_hours)));
  const hours = override ? Number(override.duration_hours) : Number(definition.durationHours);
  if (!Number.isFinite(hours)) return 0;
  const holidayName = buildHessenHolidayMap(year)[toIsoDate(new Date(year, (mon || 1) - 1, day))] || null;
  return getHolidayAdjustedShiftHours({
    baseHours: hours, month, day, holidayName,
    definition: { start_time: definition.startTime ?? definition.start_time, end_time: definition.endTime ?? definition.end_time, start_day_offset: definition.startDayOffset ?? definition.start_day_offset, end_day_offset: definition.endDayOffset ?? definition.end_day_offset },
  });
}

// Keeps Ist/Differenz of the fairness block in step with manual edits (incremental, so credited hours stay).
export function applyDraftHoursChange(fairness, employeeName, deltaHours, deltaShifts = 0) {
  const base = fairness && typeof fairness === 'object' ? { ...fairness } : {};
  const entry = { ...(base[employeeName] || {}) };
  if (!Number.isFinite(Number(entry.actualHours)) && !Number.isFinite(Number(entry.targetHours))) return base;
  entry.actualHours = Number((Number(entry.actualHours || 0) + deltaHours).toFixed(2));
  if (Number.isFinite(Number(entry.targetHours))) entry.deltaHours = Number((entry.actualHours - Number(entry.targetHours)).toFixed(2));
  if (Number.isFinite(Number(entry.total))) entry.total = Math.max(0, Number(entry.total) + deltaShifts);
  base[employeeName] = entry;
  return base;
}

function sortDraftShifts(shifts) {
  return shifts.sort((left, right) => String(left.employee_name).localeCompare(String(right.employee_name), 'de') || Number(left.day) - Number(right.day));
}

// A cell without a shift cannot carry a Colo mark any more.
function dropColoMarks(snapshot, month, cells) {
  if (!Array.isArray(snapshot?.coloAssignments) || cells.length === 0) return snapshot;
  const dates = new Set(cells.map(({ employeeName, day }) => `${employeeName}|${month}-${String(day).padStart(2, '0')}`));
  const remaining = snapshot.coloAssignments.filter((entry) => !dates.has(`${entry.employee_name}|${String(entry.date).slice(0, 10)}`));
  return remaining.length === snapshot.coloAssignments.length ? snapshot : { ...snapshot, coloAssignments: remaining };
}

router.patch('/drafts/:id/shifts', requirePageAccess('shiftplan_control', 'write'), requireOwnedDraft, async (req, res) => {
  try {
    const draftId = parseInt(req.params.id, 10);
    const employeeName = String(req.body?.employeeName || '').trim();
    const day = Number.parseInt(req.body?.day, 10);
    const shiftCode = req.body?.shiftCode == null ? '' : String(req.body.shiftCode).trim().toUpperCase();

    if (!employeeName || !Number.isInteger(day) || day < 1 || day > 31) {
      return res.status(400).json({ ok: false, error: 'employeeName und day sind erforderlich' });
    }

    const { rows } = await pool.query('SELECT id, month, status, shifts_json, fairness, config_snapshot FROM shiftplan_drafts WHERE id = $1', [draftId]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Draft nicht gefunden' });
    if (rows[0].status === 'activated') return res.status(400).json({ ok: false, error: 'Aktivierte Drafts koennen nicht bearbeitet werden' });

    const shifts = Array.isArray(rows[0].shifts_json) ? rows[0].shifts_json : [];
    const snapshot = rows[0].config_snapshot && typeof rows[0].config_snapshot === 'object' ? rows[0].config_snapshot : {};
    const previous = shifts.find((entry) => entry.employee_name === employeeName && Number(entry.day) === day);
    const nextShifts = shifts.filter((entry) => !(entry.employee_name === employeeName && Number(entry.day) === day));
    if (shiftCode) {
      nextShifts.push({ employee_name: employeeName, day, shift_code: shiftCode, manual_override: true });
    }
    sortDraftShifts(nextShifts);

    const nextSnapshot = shiftCode ? snapshot : dropColoMarks(snapshot, rows[0].month, [{ employeeName, day }]);
    const deltaHours = getDraftShiftHours(snapshot, rows[0].month, day, shiftCode) - getDraftShiftHours(snapshot, rows[0].month, day, previous?.shift_code);
    const nextFairness = applyDraftHoursChange(rows[0].fairness, employeeName, deltaHours, (shiftCode ? 1 : 0) - (previous ? 1 : 0));

    const { rows: updatedRows } = await pool.query(
      `UPDATE shiftplan_drafts
          SET shifts_json = $2::jsonb,
              config_snapshot = $3::jsonb,
              fairness = $4::jsonb,
              note = COALESCE(note, 'Manuell angepasst')
        WHERE id = $1
        RETURNING *`,
      [draftId, JSON.stringify(nextShifts), JSON.stringify(nextSnapshot), JSON.stringify(nextFairness)]
    );

    res.json({ ok: true, draft: { ...updatedRows[0], cost_control: await loadDraftCostControl(updatedRows[0]) }, previousShiftCode: previous?.shift_code || '' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* SWAP TWO SHIFTS OF A DRAFT                       */
/* Body: { a: { employeeName, day }, b: { ... } }   */
/* Exchanges the two cells (also an empty cell      */
/* = moving a shift). Hours are updated atomically. */
/* ------------------------------------------------ */

router.patch('/drafts/:id/swap', requirePageAccess('shiftplan_control', 'write'), requireOwnedDraft, async (req, res) => {
  try {
    const draftId = parseInt(req.params.id, 10);
    const readCell = (cell) => ({ employeeName: String(cell?.employeeName || '').trim(), day: Number.parseInt(cell?.day, 10) });
    const a = readCell(req.body?.a);
    const b = readCell(req.body?.b);
    const valid = (cell) => cell.employeeName && Number.isInteger(cell.day) && cell.day >= 1 && cell.day <= 31;
    if (!valid(a) || !valid(b)) return res.status(400).json({ ok: false, error: 'Beide Zellen (employeeName, day) sind erforderlich' });
    if (a.employeeName === b.employeeName && a.day === b.day) return res.status(400).json({ ok: false, error: 'Es muessen zwei unterschiedliche Zellen gewaehlt werden' });

    const { rows } = await pool.query('SELECT id, month, status, shifts_json, fairness, config_snapshot FROM shiftplan_drafts WHERE id = $1', [draftId]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Draft nicht gefunden' });
    if (rows[0].status === 'activated') return res.status(400).json({ ok: false, error: 'Aktivierte Drafts koennen nicht bearbeitet werden' });

    const shifts = Array.isArray(rows[0].shifts_json) ? rows[0].shifts_json : [];
    const snapshot = rows[0].config_snapshot && typeof rows[0].config_snapshot === 'object' ? rows[0].config_snapshot : {};
    const month = rows[0].month;
    const find = (cell) => shifts.find((entry) => entry.employee_name === cell.employeeName && Number(entry.day) === cell.day);
    const codeA = String(find(a)?.shift_code || '').trim().toUpperCase();
    const codeB = String(find(b)?.shift_code || '').trim().toUpperCase();
    if (!codeA && !codeB) return res.status(400).json({ ok: false, error: 'Beide Zellen sind leer - es gibt nichts zu tauschen' });
    if (codeA === codeB && a.employeeName === b.employeeName) return res.status(400).json({ ok: false, error: 'Beide Zellen haben dieselbe Schicht' });

    const without = (cell) => (entry) => !(entry.employee_name === cell.employeeName && Number(entry.day) === cell.day);
    let nextShifts = shifts.filter(without(a)).filter(without(b));
    if (codeB) nextShifts.push({ employee_name: a.employeeName, day: a.day, shift_code: codeB, manual_override: true });
    if (codeA) nextShifts.push({ employee_name: b.employeeName, day: b.day, shift_code: codeA, manual_override: true });
    sortDraftShifts(nextShifts);

    let nextFairness = rows[0].fairness;
    const apply = (cell, oldCode, newCode) => {
      const delta = getDraftShiftHours(snapshot, month, cell.day, newCode) - getDraftShiftHours(snapshot, month, cell.day, oldCode);
      nextFairness = applyDraftHoursChange(nextFairness, cell.employeeName, delta, (newCode ? 1 : 0) - (oldCode ? 1 : 0));
    };
    apply(a, codeA, codeB);
    apply(b, codeB, codeA);
    // A Colo mark stays with the person and day only when the cell still holds a shift.
    const emptied = [!codeB ? a : null, !codeA ? b : null].filter(Boolean);
    const nextSnapshot = dropColoMarks(snapshot, month, emptied);

    const { rows: updatedRows } = await pool.query(
      `UPDATE shiftplan_drafts
          SET shifts_json = $2::jsonb,
              config_snapshot = $3::jsonb,
              fairness = $4::jsonb,
              note = COALESCE(note, 'Manuell angepasst')
        WHERE id = $1
        RETURNING *`,
      [draftId, JSON.stringify(nextShifts), JSON.stringify(nextSnapshot), JSON.stringify(nextFairness)]
    );
    res.json({ ok: true, draft: { ...updatedRows[0], cost_control: await loadDraftCostControl(updatedRows[0]) }, swapped: { a: { ...a, before: codeA, after: codeB }, b: { ...b, before: codeB, after: codeA } } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
/* ------------------------------------------------ */
/* COLO MARK OF A DRAFT CELL                        */
/* Body: { employeeName, day, assigned, comment? }  */
/* Marks / unmarks one employee on one day as Colo. */
/* ------------------------------------------------ */

router.patch('/drafts/:id/colo', requirePageAccess('shiftplan_control', 'write'), requireOwnedDraft, async (req, res) => {
  try {
    const draftId = parseInt(req.params.id, 10);
    const employeeName = String(req.body?.employeeName || '').trim();
    const day = Number.parseInt(req.body?.day, 10);
    const assigned = req.body?.assigned !== false;
    const comment = String(req.body?.comment || '').trim().slice(0, 200);

    if (!employeeName || !Number.isInteger(day) || day < 1 || day > 31) {
      return res.status(400).json({ ok: false, error: 'employeeName und day sind erforderlich' });
    }

    const { rows } = await pool.query('SELECT id, month, status, shifts_json, config_snapshot FROM shiftplan_drafts WHERE id = $1', [draftId]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Draft nicht gefunden' });
    const draft = rows[0];
    if (draft.status === 'activated') return res.status(400).json({ ok: false, error: 'Aktivierte Drafts koennen nicht bearbeitet werden' });

    const parsedMonth = parseDraftMonthId(draft.month);
    if (!parsedMonth || day > daysInMonth(parsedMonth.year, parsedMonth.month)) {
      return res.status(400).json({ ok: false, error: 'Ungültiger Tag für diesen Monat' });
    }
    const shiftOfDay = (Array.isArray(draft.shifts_json) ? draft.shifts_json : [])
      .find((entry) => entry.employee_name === employeeName && Number(entry.day) === day);
    if (assigned && !shiftOfDay) {
      return res.status(400).json({ ok: false, error: 'Nur Mitarbeitende mit einer Schicht an diesem Tag können als Colo markiert werden' });
    }

    const date = `${draft.month}-${String(day).padStart(2, '0')}`;
    const snapshot = draft.config_snapshot && typeof draft.config_snapshot === 'object' ? draft.config_snapshot : {};
    const current = Array.isArray(snapshot.coloAssignments) ? snapshot.coloAssignments : [];
    const others = current.filter((entry) => !(entry.employee_name === employeeName && String(entry.date).slice(0, 10) === date));
    const coloAssignments = assigned
      ? [...others, { employee_name: employeeName, date, role_key: 'colo', comment: comment || 'Colo (manuell markiert)', task_key: 'manual', shift_code: shiftOfDay.shift_code, manual: true }]
      : others;
    coloAssignments.sort((left, right) => String(left.date).localeCompare(String(right.date)) || String(left.employee_name).localeCompare(String(right.employee_name), 'de'));

    const { rows: updated } = await pool.query(
      `UPDATE shiftplan_drafts SET config_snapshot = $2::jsonb WHERE id = $1 RETURNING *`,
      [draftId, JSON.stringify({ ...snapshot, coloAssignments })]
    );
    res.json({ ok: true, draft: updated[0], coloAssignments });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* ACTIVATE DRAFT → Overwrite live shiftplan        */
/* ------------------------------------------------ */

router.post('/drafts/:id/activate', requirePageAccess('shiftplan_control', 'write'), requireOwnedDraft, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const draftId = parseInt(req.params.id);
    const actor = req.user?.displayName || req.user?.email || req.user?.loginName || 'system';

    // Load draft
    const { rows: draftRows } = await client.query('SELECT * FROM shiftplan_drafts WHERE id = $1', [draftId]);
    if (!draftRows.length) { await client.query('ROLLBACK').catch(() => {}); return res.status(404).json({ ok: false, error: 'Draft nicht gefunden' }); }
    const draft = draftRows[0];

    if (draft.status === 'activated') {
      await client.query('ROLLBACK').catch(() => {});
      return res.status(400).json({ ok: false, error: 'Dieser Draft wurde bereits aktiviert' });
    }

    const shifts = draft.shifts_json; // JSONB array
    const draftMonth = draft.month;
    const parsedDraftMonth = parseDraftMonthId(draftMonth);

    if (!parsedDraftMonth) {
      await client.query('ROLLBACK').catch(() => {});
      return res.status(400).json({ ok: false, error: 'Ungültiges Draft-Monatsformat' });
    }

    // Build month label matching existing schema (e.g. "2026-04" or "April 2026")
    const liveMonthLabel = formatShiftMonthLabel(parsedDraftMonth.year, parsedDraftMonth.month);

    if (!liveMonthLabel) {
      await client.query('ROLLBACK').catch(() => {});
      return res.status(400).json({ ok: false, error: 'Monatslabel konnte nicht erzeugt werden' });
    }

    const manualEmployeeNames = await loadManualEmployeeNameSetForDraftMonth(draftMonth, client);

    // The live plan before the switch: the differences go out as notifications afterwards.
    const previousLivePlan = (await client.query('SELECT employee_name, day, shift_code FROM shifts WHERE month = $1 OR month = $2', [liveMonthLabel, draftMonth])).rows;

    // Delete existing shifts for this month. Also clean up legacy rows written with the raw YYYY-MM key.
    await client.query('DELETE FROM shifts WHERE month = $1 OR month = $2', [liveMonthLabel, draftMonth]);

    // Insert draft shifts
    for (const s of shifts) {
      await client.query(
        'INSERT INTO shifts (month, employee_name, day, shift_code, source) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (month, employee_name, day) DO UPDATE SET shift_code = $4, source = $5',
        [liveMonthLabel, s.employee_name, s.day, s.shift_code, manualEmployeeNames.has(s.employee_name) ? 'manual' : 'import']
      );
    }

    // Colo marks of the draft (generated or set by hand) become the "COLO" role of the
    // week plan, so the people are marked in the live plan. Roles of other kinds that an
    // employee already has on that day are never overwritten.
    const coloAssignments = Array.isArray(draft.config_snapshot?.coloAssignments) ? draft.config_snapshot.coloAssignments : [];
    const monthPrefix = `${parsedDraftMonth.year}-${String(parsedDraftMonth.month).padStart(2, '0')}`;
    await client.query(
      `DELETE FROM weekplan_roles WHERE role_key = 'colo' AND updated_by = $1 AND to_char(date, 'YYYY-MM') = $2`,
      [COLO_ROLE_AUTHOR, monthPrefix]
    );
    for (const assignment of coloAssignments) {
      const date = String(assignment?.date || '').slice(0, 10);
      const employeeName = String(assignment?.employee_name || '').trim();
      if (!employeeName || !date.startsWith(`${monthPrefix}-`)) continue;
      await client.query(
        `INSERT INTO weekplan_roles (employee_name, date, role_key, comment, updated_by)
         VALUES ($1, $2, 'colo', $3, $4)
         ON CONFLICT (employee_name, date) DO NOTHING`,
        [employeeName, date, String(assignment?.comment || '').trim().slice(0, 200) || null, COLO_ROLE_AUTHOR]
      );
    }

    // Update draft status
    await client.query(
      `UPDATE shiftplan_drafts SET status = 'activated', activated_by = $2, activated_at = NOW() WHERE id = $1`,
      [draftId, actor]
    );

    await client.query('COMMIT');

    let contactSync = null;
    let userProvisioning = null;
    try {
      contactSync = await syncEmployeeContacts();
    } catch (contactErr) {
      console.warn('[SHIFTPLAN CONTROL] Employee contacts sync failed:', contactErr.message);
      contactSync = { error: contactErr.message };
    }

    try {
      userProvisioning = await provisionUsersFromShiftplan();
    } catch (provisionErr) {
      console.warn('[SHIFTPLAN CONTROL] User provisioning failed:', provisionErr.message);
      userProvisioning = { error: provisionErr.message };
    }

    recomputeConstraintsInternal(liveMonthLabel).catch((constraintErr) => {
      console.warn('[SHIFTPLAN CONTROL] Constraint recompute failed:', constraintErr.message);
    });

    res.json({ ok: true, message: `Draft für ${liveMonthLabel} wurde als aktiver Schichtplan übernommen`, activatedBy: actor, liveMonthLabel, contactSync, userProvisioning });
    // The people concerned and the admin(s) are told what changed (never blocks the activation).
    void notifyPlanActivated({
      db: pool,
      year: parsedDraftMonth.year,
      month: parsedDraftMonth.month,
      monthLabel: liveMonthLabel,
      previous: previousLivePlan,
      next: Array.isArray(shifts) ? shifts : [],
      actor,
      actorUserId: req.user?.id || null,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Activation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

/* ------------------------------------------------ */
/* DELETE DRAFT                                     */
/* ------------------------------------------------ */

router.delete('/drafts/:id', requirePageAccess('shiftplan_control', 'write'), requireOwnedDraft, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM shiftplan_drafts WHERE id = $1 AND status != 'activated' RETURNING *`,
      [parseInt(req.params.id)]
    );
    if (!rows.length) return res.status(400).json({ ok: false, error: 'Draft nicht gefunden oder bereits aktiviert' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* EXCEL EXPORT – Professional .xlsx with exceljs   */
/* ------------------------------------------------ */

const MONTH_NAMES_DE = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DAY_NAMES_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const SHIFT_COLORS = {
  E1: { fill: 'FFEDD5', font: '9A3412' },
  E2: { fill: 'FED7AA', font: '9A3412' },
  E1SA: { fill: 'FFEDD5', font: '9A3412' },
  E1WE: { fill: 'FED7AA', font: '9A3412' },
  E2SA: { fill: 'FED7AA', font: '9A3412' },
  E2WE: { fill: 'FDBA74', font: '9A3412' },
  L1:{ fill: 'FEF3C7', font: '854D0E' },
  L2: { fill: 'FDE68A', font: '854D0E' },
  L1WE: { fill: 'FEF3C7', font: '854D0E' },
  N:  { fill: 'DBEAFE', font: '1E3A8A' },
  FS: { fill: 'D1FAE5', font: '065F46' },
  ABW:{ fill: 'D1D5DB', font: '1F2937' },
  DBS:{ fill: 'E0E7FF', font: '3730A3' },
  S:  { fill: 'F3F4F6', font: '374151' },
  // Absences that are not planned shifts (taken from the absence table).
  URL: { fill: 'EDE9FE', font: '5B21B6' },
  KRANK: { fill: 'FEE2E2', font: '991B1B' },
  SEM: { fill: 'CCFBF1', font: '115E59' },
  EXT: { fill: 'E0F2FE', font: '075985' },
};

const ABSENCE_EXCEL_CODES = { VACATION: 'URL', SICK: 'KRANK', TRAINING: 'SEM', OFFSITE: 'EXT' };

/** Excel wants ARGB (8 hex digits). A bare RGB value is read as an invalid colour and drops the fill. */
function toExcelArgb(value) {
  const text = String(value || '');
  return /^[0-9a-fA-F]{6}$/.test(text) ? `FF${text.toUpperCase()}` : value;
}

function normalizeWorkbookColors(workbook) {
  workbook.eachSheet((worksheet) => {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const fill = cell.fill;
        if (fill?.type === 'pattern' && fill.fgColor?.argb && toExcelArgb(fill.fgColor.argb) !== fill.fgColor.argb) {
          cell.fill = { ...fill, fgColor: { ...fill.fgColor, argb: toExcelArgb(fill.fgColor.argb) } };
        }
        const font = cell.font;
        if (font?.color?.argb && toExcelArgb(font.color.argb) !== font.color.argb) {
          cell.font = { ...font, color: { ...font.color, argb: toExcelArgb(font.color.argb) } };
        }
        const border = cell.border;
        if (border) {
          const next = { ...border };
          let changed = false;
          for (const side of ['top', 'bottom', 'left', 'right']) {
            const color = border[side]?.color;
            if (color?.argb && toExcelArgb(color.argb) !== color.argb) {
              next[side] = { ...border[side], color: { ...color, argb: toExcelArgb(color.argb) } };
              changed = true;
            }
          }
          if (changed) cell.border = next;
        }
      });
    });
  });
}

function localDayKey(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value || '').slice(0, 10);
}

/**
 * Absences (vacation wishes, sickness, training ...) that fall into the months of the drafts,
 * assigned to the employee spelling used in each draft:
 *   Map<month, { marks: Map<employee, Map<day, {code,type,source}>>, vacations: Map<employee, [{start_date,end_date,source,note}]> }>
 * Never throws: without a database the export simply has no absence marks.
 */
async function loadAbsenceInfoForDrafts(drafts) {
  const result = new Map();
  if (!drafts.length) return result;
  try {
    const months = drafts.map((draft) => draft.month).sort();
    const [lastYear, lastMonth] = months[months.length - 1].split('-').map(Number);
    const lastDay = new Date(lastYear, lastMonth, 0).getDate();
    const { rows } = await pool.query(
      `SELECT employee_name, employee_id, start_date, end_date, type, source, note
         FROM absences WHERE start_date <= $2 AND end_date >= $1`,
      [`${months[0]}-01`, `${months[months.length - 1]}-${String(lastDay).padStart(2, '0')}`],
    );
    const userIds = [...new Set(rows.map((row) => Number(row.employee_id)).filter((id) => Number.isInteger(id) && id > 0))];
    const userRows = userIds.length
      ? (await pool.query('SELECT id, first_name, last_name, provisioned_employee_name FROM users WHERE id = ANY($1::int[])', [userIds])).rows
      : [];
    const candidatesById = new Map(userRows.map((row) => [row.id, userNameCandidates(row)]));

    for (const draft of drafts) {
      const [year, mon] = draft.month.split('-').map(Number);
      const monthStart = `${draft.month}-01`;
      const monthEnd = `${draft.month}-${String(new Date(year, mon, 0).getDate()).padStart(2, '0')}`;
      const planNames = new Set([...(draft.shifts_json || []).map((shift) => shift.employee_name), ...Object.keys(draft.fairness || {})]);
      const lookup = buildEmployeeNameLookup([...planNames].filter(Boolean));
      const marks = new Map();
      const vacations = new Map();
      for (const row of rows) {
        const start = localDayKey(row.start_date);
        const end = localDayKey(row.end_date);
        if (end < monthStart || start > monthEnd) continue;
        const employee = resolveAbsenceEmployeeName(row, lookup, candidatesById);
        if (!employee) continue;
        const code = ABSENCE_EXCEL_CODES[String(row.type || '').toUpperCase()] || 'ABW';
        if (!marks.has(employee)) marks.set(employee, new Map());
        const from = start < monthStart ? 1 : Number(start.slice(8, 10));
        const to = end > monthEnd ? Number(monthEnd.slice(8, 10)) : Number(end.slice(8, 10));
        for (let day = from; day <= to; day++) {
          if (!marks.get(employee).has(day)) marks.get(employee).set(day, { code, type: row.type, source: row.source });
        }
        if (String(row.type || '').toUpperCase() === 'VACATION') {
          if (!vacations.has(employee)) vacations.set(employee, []);
          vacations.get(employee).push({ start_date: start, end_date: end, source: row.source, note: row.note });
        }
      }
      result.set(draft.month, { marks, vacations });
    }
  } catch (error) {
    console.warn('Excel export: absences could not be loaded:', error?.message || error);
  }
  return result;
}

function resolveExcelShiftColors(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (SHIFT_COLORS[code]) return SHIFT_COLORS[code];
  if (/^E\d/.test(code)) return { fill: 'FFEDD5', font: '9A3412' };
  if (/^L\d/.test(code)) return { fill: 'FEF3C7', font: '854D0E' };
  if (/^N(?:\d|$)/.test(code)) return { fill: 'DBEAFE', font: '1E3A8A' };
  if (/^(ABW|URL|KRANK)/.test(code)) return { fill: 'D1D5DB', font: '1F2937' };
  return null;
}

/* ------------------------------------------------ */
/* MANAGEMENT EXPORT: HOURS + WISH FULFILMENT       */
/* ------------------------------------------------ */

const EXCEL_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
const EXCEL_THIN_BORDER = { top: { style: 'thin', color: { argb: 'D1D5DB' } }, bottom: { style: 'thin', color: { argb: 'D1D5DB' } }, left: { style: 'thin', color: { argb: 'D1D5DB' } }, right: { style: 'thin', color: { argb: 'D1D5DB' } } };

function styleExcelHeaderRow(ws, rowNumber, columnCount) {
  for (let c = 1; c <= columnCount; c++) {
    const cell = ws.getCell(rowNumber, c);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = EXCEL_HEADER_FILL;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = EXCEL_THIN_BORDER;
  }
  ws.getRow(rowNumber).height = 26;
}

/** Green / amber / red fill for a percent value (wish fulfilment or hours reached). */
function percentFill(percent) {
  if (percent === null || percent === undefined) return null;
  const argb = percent >= 80 ? 'D1FAE5' : percent >= 50 ? 'FEF3C7' : 'FEE2E2';
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function statusFill(status) {
  const argb = status === WISH_STATUS.MET ? 'D1FAE5' : status === WISH_STATUS.PARTIAL ? 'FEF3C7' : 'FEE2E2';
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/** Management sheet "Kostenkontrolle": night and Sunday hours per calendar week, month, quarter and employee. */
const STAFFING_CONTEXT_LABELS = [
  ['weekday', 'Mo–Fr'], ['saturday', 'Samstag'], ['sunday', 'Sonntag'],
  ['holiday_national', 'Feiertag national'], ['holiday_international', 'Feiertag international'],
];
const STAFFING_TYPE_LABELS = [['early', 'Früh'], ['late', 'Spät'], ['night', 'Nacht']];

function formatStaffingLimit(entry) {
  if (!entry) return '–';
  const min = entry.min ?? '–';
  const max = entry.max ?? '∞';
  return `${min}–${max}${entry.overflow ? ' (Überlauf)' : ''}`;
}

// One line with the slider values of a draft (month sheets and drafts list).
export function describePlanningSettingsLine(settings) {
  if (!settings) return 'Einstellungen: für diesen Entwurf nicht gespeichert (älterer Entwurf).';
  const parts = [`Abwechslung ${settings.varietyPriority}%`];
  for (const [context, label] of STAFFING_CONTEXT_LABELS.slice(0, 3)) {
    const types = STAFFING_TYPE_LABELS.filter(([type]) => (context === 'weekday' ? true : type !== 'night'));
    parts.push(`${label}: ${types.map(([type, typeLabel]) => `${typeLabel} ${formatStaffingLimit(settings.staffing?.[context]?.[type])}`).join(', ')}`);
  }
  parts.push(settings.overtimeUnlimited ? 'Überstunden unbegrenzt' : `Überstunden max. ${settings.maxOvertimeHours} h`);
  return `Einstellungen (Min–Max Personen): ${parts.join(' | ')}`;
}

function addPlanningSettingsSheet(workbook, drafts) {
  const ws = workbook.addWorksheet('Einstellungen');
  ws.getCell(1, 1).value = 'Einstellungen der Entwürfe: Regler und Besetzungs-Obergrenzen';
  ws.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: '1E3A5F' } };
  ws.getCell(2, 1).value = 'Besetzung als Min–Max Personen je Schichtart und Tag (∞ = keine Obergrenze, Überlauf = Frühschicht Mo–Fr nimmt Überhang auf). Stand der Erstellung des jeweiligen Entwurfs.';
  ws.getCell(2, 1).font = { name: 'Calibri', size: 9, color: { argb: '6B7280' } };
  const headers = ['Monat', 'Version', 'Abwechslung (%)', 'Seed', 'Überstunden', 'Spät Do/Fr über Max'];
  for (const [context, contextLabel] of STAFFING_CONTEXT_LABELS) {
    for (const [type, typeLabel] of STAFFING_TYPE_LABELS) {
      if (type === 'night' && context !== 'weekday') continue;
      headers.push(`${contextLabel} ${typeLabel}`);
    }
  }
  headers.push('Obergrenze je Schicht', 'Max. Aufholung (h/Monat)', 'Max. Abbau (h/Monat)', 'Jahresminimum (h)');
  headers.forEach((header, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = header;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getColumn(i + 1).width = i === 0 ? 16 : (header === 'Obergrenze je Schicht' ? 34 : 13);
  });
  ws.getRow(4).height = 32;
  drafts.forEach((draft, index) => {
    const [year, mon] = draft.month.split('-').map(Number);
    const settings = draft.config_snapshot?.planningSettings;
    const values = [`${MONTH_NAMES_DE[mon]} ${year}`, draft.version];
    if (!settings) {
      values.push('nicht gespeichert');
    } else {
      values.push(
        settings.varietyPriority,
        settings.varietySeed || '–',
        settings.overtimeUnlimited ? 'unbegrenzt' : `max. ${settings.maxOvertimeHours} h`,
        settings.lateOverflowEnabled ? 'ja' : 'nein',
      );
      for (const [context] of STAFFING_CONTEXT_LABELS) {
        for (const [type] of STAFFING_TYPE_LABELS) {
          if (type === 'night' && context !== 'weekday') continue;
          values.push(formatStaffingLimit(settings.staffing?.[context]?.[type]));
        }
      }
      values.push(
        (settings.shiftLimits || []).map((entry) => `${entry.code}: ${entry.maxStaff}`).join(', '),
        settings.maxCatchupHours,
        settings.maxReliefHours,
        settings.balanceFloorHours,
      );
    }
    values.forEach((value, i) => {
      const cell = ws.getCell(5 + index, i + 1);
      cell.value = value;
      cell.font = { name: 'Calibri', size: 9 };
      cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'D1D5DB' } } };
    });
  });
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
}

/** Employees who are not planned regularly (do-not-plan list): they stay out of every hours list. */
function notPlannedNamesOf(draft) {
  return new Set(Array.isArray(draft?.config_snapshot?.excludedEmployeeNames) ? draft.config_snapshot.excludedEmployeeNames : []);
}

// "F" below the day number in the date header of a holiday (line break inside the number format), name as a note.
function markHolidayHeader(cell, holidayName, day) {
  cell.value = `${day}\nF`;
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B91C1C' } };
  cell.note = `Feiertag: ${holidayName}`;
}
function holidayListText(holidays, year, mon) {
  const prefix = `${year}-${String(mon).padStart(2, '0')}-`;
  const entries = Object.entries(holidays).filter(([date]) => date.startsWith(prefix)).sort(([left], [right]) => left.localeCompare(right));
  return entries.map(([date, name]) => `${date.slice(8, 10)}.${date.slice(5, 7)}. ${name}`).join('   ·   ');
}

const COLO_TASK_SHORT = { preparation: 'Vorbereitung', night: 'Nacht', weekend: 'Wochenende' };
const COLO_COVERAGE_HEADERS = ['Datum', 'Wochentag', 'Feiertag', 'Colo besetzt', 'Fehlend', 'Status'];

/**
 * Management sheet "Colo-Abdeckung": for every day of the drafts which Colo tasks are covered (and by whom) and which
 * requirement of the admin settings is open (the generator's colo_understaffed conflicts). Shows at a glance whether
 * all days are covered as demanded.
 */
export function addColoCoverageSheet(workbook, drafts) {
  const relevant = drafts.filter((draft) => draft.config_snapshot?.planReport?.colo?.enabled
    || (Array.isArray(draft.config_snapshot?.coloAssignments) && draft.config_snapshot.coloAssignments.length > 0));
  if (relevant.length === 0) return null;
  const ws = workbook.addWorksheet('Colo-Abdeckung');
  ws.getCell(1, 1).value = 'Colo-Abdeckung pro Tag';
  ws.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: '1E3A5F' } };
  const rows = [];
  for (const draft of relevant) {
    const [year, mon] = String(draft.month).split('-').map(Number);
    const holidays = buildHessenHolidayMap(year);
    const assignments = Array.isArray(draft.config_snapshot?.coloAssignments) ? draft.config_snapshot.coloAssignments : [];
    const conflicts = (Array.isArray(draft.conflicts) ? draft.conflicts : []).filter((entry) => entry?.type === 'colo_understaffed');
    for (let day = 1; day <= daysInMonth(year, mon); day++) {
      const iso = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const covered = assignments.filter((entry) => String(entry.date).slice(0, 10) === iso);
      const open = conflicts.filter((entry) => String(entry.date).slice(0, 10) === iso);
      const missingCount = open.reduce((sum, entry) => sum + (Number(entry.missing) || 1), 0);
      rows.push({
        iso,
        date: `${String(day).padStart(2, '0')}.${String(mon).padStart(2, '0')}.${year}`,
        weekday: DAY_NAMES_DE[new Date(year, mon - 1, day).getDay()],
        holiday: holidays[iso] || '',
        covered: covered.map((entry) => `${entry.employee_name}  ·  ${COLO_TASK_SHORT[entry.task_key] || entry.comment || 'Colo'}`).join('\n'),
        coveredCount: covered.length,
        missingText: open.map((entry) => `${COLO_TASK_SHORT[entry.task] || entry.task || 'Colo'}: ${entry.actual ?? 0} von ${entry.required ?? '?'}`).join('\n'),
        missingCount,
        status: missingCount > 0 ? 'Lücke' : covered.length > 0 ? 'abgedeckt' : 'keine Vorgabe',
      });
    }
  }
  const gapDays = rows.filter((entry) => entry.status === 'Lücke').length;
  const coveredDays = rows.filter((entry) => entry.status === 'abgedeckt').length;
  ws.getCell(2, 1).value = `${rows.length} Tage: ${coveredDays} vollständig abgedeckt, ${gapDays} mit offenem Colo-Bedarf, ${rows.length - coveredDays - gapDays} ohne Vorgabe. Offene Aufgaben: ${rows.reduce((sum, entry) => sum + entry.missingCount, 0)}.`;
  ws.getCell(2, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: gapDays > 0 ? 'B45309' : '047857' } };
  COLO_COVERAGE_HEADERS.forEach((header, index) => { ws.getCell(4, index + 1).value = header; });
  styleExcelHeaderRow(ws, 4, COLO_COVERAGE_HEADERS.length);
  rows.forEach((entry, index) => {
    const values = [entry.date, entry.weekday, entry.holiday, entry.covered || '–', entry.missingText || '', entry.status];
    values.forEach((value, column) => {
      const cell = ws.getCell(5 + index, column + 1);
      cell.value = value;
      cell.font = { name: 'Calibri', size: 10, bold: column === 5 };
      cell.alignment = { horizontal: column === 3 || column === 4 ? 'left' : 'center', vertical: 'middle', wrapText: column === 3 || column === 4 };
      cell.border = EXCEL_THIN_BORDER;
      if (column === 5) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: entry.status === 'Lücke' ? 'FEE2E2' : entry.status === 'abgedeckt' ? 'D1FAE5' : 'F3F4F6' } };
    });
  });
  [12, 11, 22, 70, 30, 14].forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: COLO_COVERAGE_HEADERS.length } };
  return { rows, gapDays, coveredDays };
}

/**
 * Continuous plan: one sheet from the first to the last day of all drafts (e.g. January to December), employees in
 * rows, every day of the year in a column, so a whole year can be read without switching sheets.
 */
export function addContinuousPlanSheet(workbook, drafts, { absenceInfo = new Map(), missingWishEmployees = new Set(), title = 'Fortlaufender Plan' } = {}) {
  const sorted = [...drafts].sort((left, right) => left.month.localeCompare(right.month));
  const ws = workbook.addWorksheet('Fortlaufender Plan');
  const byDraft = sorted.map((draft) => {
    const [year, mon] = draft.month.split('-').map(Number);
    const plan = new Map();
    for (const shift of Array.isArray(draft.shifts_json) ? draft.shifts_json : []) {
      if (!plan.has(shift.employee_name)) plan.set(shift.employee_name, {});
      plan.get(shift.employee_name)[shift.day] = shift.shift_code;
    }
    for (const name of Object.keys(draft.fairness || {})) if (!plan.has(name)) plan.set(name, {});
    return { draft, year, mon, numDays: daysInMonth(year, mon), plan, holidays: buildHessenHolidayMap(year), marks: absenceInfo.get(draft.month)?.marks || new Map() };
  });
  const employees = [...new Set(byDraft.flatMap((entry) => [...entry.plan.keys()]))].sort((left, right) => left.localeCompare(right, 'de'));
  const totalDays = byDraft.reduce((sum, entry) => sum + entry.numDays, 0);

  ws.mergeCells(1, 1, 1, Math.max(totalDays + 1, 2));
  ws.getCell(1, 1).value = `${title}: ${MONTH_NAMES_DE[byDraft[0].mon]} ${byDraft[0].year} bis ${MONTH_NAMES_DE[byDraft.at(-1).mon]} ${byDraft.at(-1).year}`;
  ws.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: '1E3A5F' } };
  ws.getRow(1).height = 26;
  const border = { top: { style: 'thin', color: { argb: 'D1D5DB' } }, bottom: { style: 'thin', color: { argb: 'D1D5DB' } }, left: { style: 'thin', color: { argb: 'D1D5DB' } }, right: { style: 'thin', color: { argb: 'D1D5DB' } } };
  const monthStartBorder = { ...border, left: { style: 'medium', color: { argb: '1E3A5F' } } };
  ws.getCell(2, 1).value = 'Monat';
  ws.getCell(3, 1).value = 'Wochentag';
  ws.getCell(4, 1).value = 'Mitarbeiter';
  for (let row = 2; row <= 4; row++) {
    const cell = ws.getCell(row, 1);
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
  }

  let column = 2;
  const columnOfDay = [];
  byDraft.forEach((entry, entryIndex) => {
    const firstColumn = column;
    for (let day = 1; day <= entry.numDays; day++, column++) {
      const dow = new Date(entry.year, entry.mon - 1, day).getDay();
      const isHoliday = Boolean(entry.holidays[`${entry.year}-${String(entry.mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`]);
      const weekendOrHoliday = dow === 0 || dow === 6 || isHoliday;
      const header = (row, value, size = 8) => {
        const cell = ws.getCell(row, column);
        cell.value = value;
        cell.font = { name: 'Calibri', size, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isHoliday ? 'B91C1C' : weekendOrHoliday ? '4B5563' : (entryIndex % 2 === 0 ? '1E3A5F' : '2F5D8C') } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = day === 1 ? monthStartBorder : border;
      };
      header(3, DAY_NAMES_DE[dow]);
      header(4, day);
      if (isHoliday) markHolidayHeader(ws.getCell(4, column), entry.holidays[`${entry.year}-${String(entry.mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`], day);
      columnOfDay.push({ entry, day, column });
      ws.getColumn(column).width = 4.2;
    }
    ws.mergeCells(2, firstColumn, 2, column - 1);
    const monthCell = ws.getCell(2, firstColumn);
    monthCell.value = `${MONTH_NAMES_DE[entry.mon]} ${entry.year}`;
    monthCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    monthCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: entryIndex % 2 === 0 ? '1E3A5F' : '2F5D8C' } };
    monthCell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  if (byDraft.some((entry) => Object.keys(entry.holidays).some((date) => date.startsWith(`${entry.year}-${String(entry.mon).padStart(2, '0')}-`)))) ws.getRow(4).height = 30;
  employees.forEach((employee, index) => {
    const rowNumber = 5 + index;
    const nameCell = ws.getCell(rowNumber, 1);
    nameCell.value = employee;
    nameCell.font = { name: 'Calibri', size: 9, bold: true };
    nameCell.border = border;
    if (missingWishEmployees.has(employee)) { nameCell.fill = MISSING_WISH_FILL; nameCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '92400E' } }; }
    for (const { entry, day, column: dayColumn } of columnOfDay) {
      const planned = entry.plan.get(employee)?.[day] || '';
      const code = planned || entry.marks.get(employee)?.get(day)?.code || '';
      const cell = ws.getCell(rowNumber, dayColumn);
      cell.value = code;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { name: 'Calibri', size: 8 };
      cell.border = day === 1 ? monthStartBorder : border;
      const colors = resolveExcelShiftColors(code);
      if (colors) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.fill } };
        cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: colors.font } };
      } else {
        const dow = new Date(entry.year, entry.mon - 1, day).getDay();
        if (dow === 0 || dow === 6) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
      }
    }
  });
  ws.getColumn(1).width = 24;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4, activeCell: 'B5' }];
  ws.pageSetup = { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4', margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  return { employees: employees.length, days: totalDays };
}

const DISTRIBUTION_COLORS = { early: 'F5B942', late: '4A86E8', night: '8B6BD6', weekend: '6FD0E8', other: '9CA3AF' };
const DISTRIBUTION_TEXT = { early: '1F2937', late: 'FFFFFF', night: 'FFFFFF', weekend: '0F172A', other: '1F2937' };
const DISTRIBUTION_BAR_CELLS = 100;

/** Splits the bar cells over the segments in proportion to their counts (largest remainder, the sum stays exact). */
export function allocateBarCells(counts, cells = DISTRIBUTION_BAR_CELLS) {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((value) => (value / total) * cells);
  const allocated = exact.map((value) => Math.floor(value));
  let remaining = cells - allocated.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((left, right) => right.remainder - left.remainder);
  for (const { index } of order) {
    if (remaining <= 0) break;
    if (counts[index] > 0) { allocated[index] += 1; remaining -= 1; }
  }
  return allocated;
}

/**
 * Management sheet "Schichtverteilung": per employee how the worked shifts split into early / late / night on weekdays
 * and the weekend (own segment), as absolute numbers, percent and a stacked bar made of coloured cells.
 */
export function addShiftDistributionSheet(workbook, drafts, { missingWishEmployees = new Set() } = {}) {
  const typeByCode = new Map();
  const rows = [];
  for (const draft of drafts) {
    const [year, mon] = String(draft.month).split('-').map(Number);
    for (const definition of draft.config_snapshot?.shiftDefinitions || []) {
      const code = String(definition?.code || '').trim().toUpperCase();
      if (code && !typeByCode.has(code)) typeByCode.set(code, String(definition.type || definition.shift_type || '').toLowerCase());
    }
    const notPlanned = notPlannedNamesOf(draft);
    for (const shift of Array.isArray(draft.shifts_json) ? draft.shifts_json : []) {
      if (!notPlanned.has(shift.employee_name)) rows.push({ ...shift, year, month: mon });
    }
  }
  const { employees, team } = buildShiftDistribution(rows, typeByCode);
  const ws = workbook.addWorksheet('Schichtverteilung');
  const segments = DISTRIBUTION_SEGMENTS.filter((segment) => segment !== 'other' || team.other > 0);
  const tableColumns = 2 + segments.length * 2; // name, total, counts, percent
  const barStart = tableColumns + 2; // one spacer column
  const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const white = { style: 'thin', color: { argb: 'FFFFFF' } };

  ws.getCell(1, 1).value = 'Schichtverteilung pro Mitarbeiter';
  ws.getCell(2, 1).value = 'Gearbeitete Schichten (Tage) aller Pläne dieser Datei. Früh, Spät und Nacht zählen von Montag bis Freitag, das Wochenende (Samstag und Sonntag, alle Schichtarten) ist ein eigener Abschnitt. Der Balken zeigt 100 % der Schichten einer Person; die Beschriftung nennt Anzahl und Anteil. Gelb = keine Wünsche abgegeben.';
  ws.getCell(2, 1).font = { name: 'Calibri', size: 9, color: { argb: '6B7280' } };

  // Legend row (row 3) over the bar: one coloured block per segment
  const cellsPerLegend = Math.floor(DISTRIBUTION_BAR_CELLS / segments.length);
  segments.forEach((segment, index) => {
    const from = barStart + index * cellsPerLegend;
    const to = index === segments.length - 1 ? barStart + DISTRIBUTION_BAR_CELLS - 1 : from + cellsPerLegend - 1;
    ws.mergeCells(3, from, 3, to);
    const cell = ws.getCell(3, from);
    cell.value = DISTRIBUTION_LABELS[segment];
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: DISTRIBUTION_TEXT[segment] } };
    cell.fill = solid(DISTRIBUTION_COLORS[segment]);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.getRow(3).height = 22;

  // Header row 4: table headers, scale 0 / 25 / 50 / 75 / 100 % over the bar
  const headers = ['Mitarbeiter', 'Schichten gesamt', ...segments.map((segment) => `${DISTRIBUTION_LABELS[segment]} Anzahl`), ...segments.map((segment) => `${DISTRIBUTION_LABELS[segment]} Anteil`)];
  headers.forEach((header, index) => { ws.getCell(4, index + 1).value = header; });
  styleExcelHeaderRow(ws, 4, headers.length);
  const quarter = DISTRIBUTION_BAR_CELLS / 4;
  ['0 %', '25 %', '50 %', '75 %'].forEach((label, index) => {
    ws.mergeCells(4, barStart + index * quarter, 4, barStart + (index + 1) * quarter - 1);
    const cell = ws.getCell(4, barStart + index * quarter);
    cell.value = label;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '6B7280' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    cell.border = { left: { style: 'thin', color: { argb: '9CA3AF' } } };
  });
  ws.getCell(4, barStart + DISTRIBUTION_BAR_CELLS - 1).border = { right: { style: 'thin', color: { argb: '9CA3AF' } } };
  ws.getRow(4).height = 30;

  const writeRow = (rowNumber, label, entry, { bold = false } = {}) => {
    const values = [label, entry.total, ...segments.map((segment) => entry[segment]), ...segments.map((segment) => entry.total > 0 ? entry.percent[segment] / 100 : null)];
    values.forEach((value, index) => {
      const cell = ws.getCell(rowNumber, index + 1);
      cell.value = value;
      cell.font = { name: 'Calibri', size: 10, bold };
      cell.alignment = { horizontal: index === 0 ? 'left' : 'center', vertical: 'middle' };
      cell.border = EXCEL_THIN_BORDER;
      cell.fill = solid(bold ? 'E5E7EB' : (rowNumber % 2 === 0 ? 'FFFFFF' : 'F8FAFC'));
      if (index >= 2 + segments.length) cell.numFmt = '0.0%';
      if (index === 0 && missingWishEmployees.has(label)) { cell.fill = MISSING_WISH_FILL; cell.font = MISSING_WISH_FONT; }
    });
    // Bar: contiguous segments, each one merged and labelled with count and share
    const cells = allocateBarCells(segments.map((segment) => entry[segment]), DISTRIBUTION_BAR_CELLS);
    let column = barStart;
    segments.forEach((segment, index) => {
      const width = cells[index];
      if (width <= 0) return;
      const from = column;
      const to = column + width - 1;
      if (to > from) ws.mergeCells(rowNumber, from, rowNumber, to);
      const cell = ws.getCell(rowNumber, from);
      const share = entry.percent[segment];
      cell.value = width >= 14 ? `${entry[segment]}  ·  ${share.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
        : width >= 5 ? entry[segment] : null;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: DISTRIBUTION_TEXT[segment] } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let fillColumn = from; fillColumn <= to; fillColumn++) {
        const target = ws.getCell(rowNumber, fillColumn);
        target.fill = solid(DISTRIBUTION_COLORS[segment]);
        target.border = { top: white, bottom: white, left: fillColumn === from ? white : undefined, right: fillColumn === to ? white : undefined };
      }
      column += width;
    });
    ws.getRow(rowNumber).height = 24;
  };
  writeRow(5, 'Team gesamt', team, { bold: true });
  employees.forEach((entry, index) => writeRow(6 + index, entry.employee, entry));

  ws.getColumn(1).width = 28;
  for (let column = 2; column <= tableColumns; column++) ws.getColumn(column).width = 12;
  ws.getColumn(tableColumns + 1).width = 2;
  for (let column = barStart; column < barStart + DISTRIBUTION_BAR_CELLS; column++) ws.getColumn(column).width = 1.15;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
  return { employees, team };
}

export function addCostControlSheet(workbook, drafts, { timesByCode = new Map(), missingWishEmployees = new Set() } = {}) {
  const control = buildCostControl(drafts, { timesByCode });
  const ws = workbook.addWorksheet('Kostenkontrolle');
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  ws.getCell(1, 1).value = 'Kostenkontrolle: Nacht-, Sonntags- und Feiertagszuschläge';
  ws.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: '1E3A5F' } };
  ws.getCell(2, 1).value = 'Zuschlagsstunden aus den Schichtzeiten: Nacht 20-6 Uhr, Sonntag 0-24 Uhr, Feiertag 0-24 Uhr (nur nationale und internationale Bankfeiertage; Fronleichnam, Heiligabend und Silvester zählen nicht). Die unbezahlte Stunde Pause ist abgezogen. Nachtschichten am Sonntag erhalten Nacht- und Sonntagszuschlag; ein Sonntag, der Feiertag ist, steht in beiden Spalten (nicht addieren). Zuordnung zum Starttag der Schicht.';
  ws.mergeCells(2, 1, 2, 8);
  ws.getCell(2, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getCell(2, 1).font = { name: 'Calibri', size: 9, color: { argb: '6B7280' } };
  ws.getRow(2).height = 42;

  let row = 4;
  const writeTable = (title, headers, rows, { totalRow = null } = {}) => {
    ws.getCell(row, 1).value = title;
    ws.getCell(row, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: '1E3A5F' } };
    row += 1;
    headers.forEach((header, index) => { ws.getCell(row, index + 1).value = header; });
    styleExcelHeaderRow(ws, row, headers.length);
    const hourColumns = headers.map((header) => /\(h\)/.test(String(header)));
    row += 1;
    for (const values of [...rows, ...(totalRow ? [totalRow] : [])]) {
      const isTotal = totalRow && values === totalRow;
      values.forEach((value, index) => {
        const cell = ws.getCell(row, index + 1);
        cell.value = value;
        cell.border = EXCEL_THIN_BORDER;
        cell.font = { name: 'Calibri', size: 10, bold: Boolean(isTotal) };
        cell.alignment = { horizontal: index === 0 || typeof value === 'string' && value.length > 14 ? 'left' : 'center', vertical: 'middle' };
        if (isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E5E7EB' } };
        if (typeof value === 'number') cell.numFmt = hourColumns[index] ? '#,##0.00' : '#,##0';
      });
      row += 1;
    }
    row += 1;
  };
  const hoursRow = (label, entry, extra = []) => [label, entry.nightHours, entry.sundayHours, entry.holidayHours, entry.nightShifts, entry.sundayShifts, entry.holidayShifts, ...extra];
  const header = ['Zeitraum', 'Nachtzuschlag (h)', 'Sonntagszuschlag (h)', 'Feiertagszuschlag (h)', 'Schichten mit Nacht', 'Schichten mit Sonntag', 'Schichten mit Feiertag'];
  writeTable('Pro Kalenderwoche', [...header, 'Hinweis'], control.weeks.map((week) => hoursRow(
    `KW ${week.week} (ab ${week.monday.slice(8, 10)}.${week.monday.slice(5, 7)}.${week.monday.slice(0, 4)})`,
    week,
    [week.partial ? 'Teilwoche: Tage außerhalb der geplanten Monate fehlen' : '']
  )));
  writeTable('Pro Monat', header, control.months.map((entry) => {
    const [year, mon] = entry.month.split('-').map(Number);
    return hoursRow(`${MONTH_NAMES_DE[mon]} ${year}`, entry);
  }));
  writeTable('Pro Quartal', header, control.quarters.map((entry) => hoursRow(entry.key.replace('-', ' '), entry)), {
    totalRow: hoursRow('Gesamt', control.total),
  });

  const monthKeys = control.months.map((entry) => entry.month);
  const employeeHeader = ['Mitarbeiter', ...monthKeys.flatMap((month) => {
    const [year, mon] = month.split('-').map(Number);
    return [`${MONTH_NAMES_DE[mon]} ${year} Nacht (h)`, `${MONTH_NAMES_DE[mon]} ${year} Sonntag (h)`, `${MONTH_NAMES_DE[mon]} ${year} Feiertag (h)`];
  }), 'Gesamt Nacht (h)', 'Gesamt Sonntag (h)', 'Gesamt Feiertag (h)'];
  writeTable('Pro Mitarbeiter', employeeHeader, control.employees.map((entry) => [
    entry.employee,
    ...monthKeys.flatMap((month) => [entry.months[month]?.nightHours ?? 0, entry.months[month]?.sundayHours ?? 0, entry.months[month]?.holidayHours ?? 0]),
    entry.total.nightHours,
    entry.total.sundayHours,
    entry.total.holidayHours,
  ]));

  // Holidays by name: which holiday, how many hours, who worked it.
  const categoryLabel = (category) => (category === 'holiday_international' ? 'international' : 'national');
  const dateLabel = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
  writeTable('Feiertage im Detail (nur Bankfeiertage)', ['Datum', 'Feiertag', 'Art', 'Feiertagszuschlag (h)', 'Schichten', 'Mitarbeiter (Stunden)'], control.holidays.map((entry) => [
    dateLabel(entry.date),
    entry.name,
    categoryLabel(entry.category),
    entry.hours,
    entry.shifts,
    entry.employees.map((person) => `${person.employee} (${person.hours} h)`).join(', '),
  ]), {
    totalRow: ['Gesamt', '', '', Number(control.holidays.reduce((sum, entry) => sum + entry.hours, 0).toFixed(2)), control.holidays.reduce((sum, entry) => sum + entry.shifts, 0), ''],
  });
  const distribution = buildHolidayDistribution(control.holidays, [...new Set(drafts.flatMap((draft) => (Array.isArray(draft.shifts_json) ? draft.shifts_json : []).map((shift) => String(shift?.employee_name || '').trim()).filter(Boolean)))]);
  const holidayHeader = ['Mitarbeiter', ...control.holidays.map((entry) => `${entry.name} ${entry.date.slice(8, 10)}.${entry.date.slice(5, 7)}.`), 'Gesamt (h)', 'Schichten', 'Abweichung vom Ø (h)'];
  writeTable('Verteilung der Feiertagsstunden pro Mitarbeiter', holidayHeader, distribution.employees.map((entry) => [
    entry.employee,
    ...control.holidays.map((holiday) => entry.byHoliday[holiday.date] ?? 0),
    entry.hours,
    entry.shifts,
    Number((entry.hours - distribution.averageHours).toFixed(2)),
  ]), {
    totalRow: ['Ø je Mitarbeiter', ...control.holidays.map(() => ''), distribution.averageHours, '', `höchster Wert ${distribution.maxHours} h / niedrigster ${distribution.minHours} h`],
  });

  // Employees without submitted wishes: highlight their name in every employee table of this sheet.
  for (let rowNumber = 4; rowNumber <= row; rowNumber++) {
    const nameCell = ws.getCell(rowNumber, 1);
    if (typeof nameCell.value === 'string' && missingWishEmployees.has(nameCell.value)) { nameCell.fill = MISSING_WISH_FILL; nameCell.font = MISSING_WISH_FONT; }
  }

  ws.getColumn(1).width = 30;
  for (let column = 2; column <= Math.max(employeeHeader.length, holidayHeader.length, 6); column++) ws.getColumn(column).width = 18;
  ws.getColumn(8).width = Math.max(ws.getColumn(8).width || 0, 48);
  return control;
}

// Colour for employees without submitted wishes (all management sheets).
const MISSING_WISH_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FDE68A' } };
const MISSING_WISH_FONT = { name: 'Calibri', size: 10, bold: true, color: { argb: '92400E' } };

// options: includeHours (Soll/Ist), includeWishes (Wunscherfüllung + Details), includeWishStatus (Wünsche abgegeben ja/nein, farbig).
// Returns the employees without submitted wishes so the month sheets can mark them as well.
async function addManagementSheets(workbook, drafts, absenceInfo = new Map(), options = {}) {
  const includeHours = options.includeHours !== false;
  const includeWishes = options.includeWishes !== false;
  const includeWishStatus = options.includeWishStatus !== false;
  const allNames = new Set();
  for (const draft of drafts) {
    for (const shift of draft.shifts_json || []) if (shift.employee_name) allNames.add(shift.employee_name);
    for (const name of Object.keys(draft.fairness || {})) allNames.add(name);
  }
  const nameLookup = buildEmployeeNameLookup([...allNames]);

  // Current saved wishes. They are matched to the draft's employee names.
  const prefRes = await pool.query(
    `SELECT ep.*, u.first_name, u.last_name, u.provisioned_employee_name
       FROM employee_preferences ep
       JOIN users u ON u.id = ep.user_id`
  ).catch(() => ({ rows: [] }));
  const prefsByEmployee = new Map();
  for (const row of prefRes.rows) {
    const name = userNameCandidates(row).map((candidate) => findEmployeeName(candidate, nameLookup)).find(Boolean);
    if (name) prefsByEmployee.set(name, row);
  }
  const { blockedDaysEnabled } = await loadWishSettings((text, params) => pool.query(text, params)).catch(() => ({ blockedDaysEnabled: true }));

  const summaryRows = [];
  const detailRows = [];
  for (const draft of drafts) {
    const [year, mon] = draft.month.split('-').map(Number);
    const monthLabel = `${MONTH_NAMES_DE[mon]} ${year}`;
    const holidays = buildHessenHolidayMap(year);
    const definitions = (draft.config_snapshot?.shiftDefinitions || []).map((definition) => ({ code: definition.code, shift_type: definition.type, is_active: true }));
    const colleagueWishes = draft.config_snapshot?.planReport?.preferredColleagues?.wishes || [];

    const shiftsByEmployee = new Map();
    for (const shift of draft.shifts_json || []) {
      if (!shiftsByEmployee.has(shift.employee_name)) shiftsByEmployee.set(shift.employee_name, {});
      shiftsByEmployee.get(shift.employee_name)[shift.day] = shift.shift_code;
    }
    const notPlanned = notPlannedNamesOf(draft);
    const employees = [...new Set([...shiftsByEmployee.keys(), ...Object.keys(draft.fairness || {})])]
      .filter((name) => !notPlanned.has(name))
      .sort((left, right) => left.localeCompare(right, 'de'));

    for (const employee of employees) {
      const fairness = draft.fairness?.[employee] || {};
      const target = Number(fairness.targetHours);
      const actual = Number(fairness.actualHours);
      const wishes = evaluateMonthWishes({
        year,
        month: mon,
        shiftsByDay: shiftsByEmployee.get(employee) || {},
        preferences: mergeMonthlyPreferences(prefsByEmployee.get(employee) || null, draft.month),
        holidays,
        blockedDaysEnabled,
        definitions,
        colleagueWishes: colleagueWishes.filter((wish) => wish.employee === employee),
        vacations: absenceInfo.get(draft.month)?.vacations?.get(employee) || [],
      });
      summaryRows.push({
        monthKey: draft.month,
        monthLabel,
        employee,
        target: Number.isFinite(target) ? target : null,
        actual: Number.isFinite(actual) ? actual : null,
        wishPercent: wishes.percent,
        wishCount: wishes.items.length,
        vacationDays: [...(absenceInfo.get(draft.month)?.marks?.get(employee)?.values() || [])].filter((mark) => mark.code === 'URL').length,
        wishScoreSum: wishes.items.reduce((sum, entry) => sum + entry.score, 0),
        submitted: Boolean(prefsByEmployee.has(employee) && hasSubmittedEmployeePreferences(prefsByEmployee.get(employee))),
      });
      for (const entry of wishes.items) detailRows.push({ monthLabel, employee, ...entry });
    }
  }

  /* ---- shared helpers for the overview sheets ---- */
  const missingWishEmployees = new Set(summaryRows.filter((entry) => !entry.submitted).map((entry) => entry.employee));
  const solidFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const styleBodyCell = (cell, { bold = false, align = 'center', numFmt = null } = {}) => {
    cell.font = { name: 'Calibri', size: 10, bold };
    cell.alignment = { horizontal: align, vertical: 'middle' };
    cell.border = EXCEL_THIN_BORDER;
    if (numFmt) cell.numFmt = numFmt;
  };
  const describeContent = () => [
    includeHours ? 'Soll-/Ist-Stunden' : null,
    includeWishes ? 'Wunscherfüllung' : null,
    includeWishStatus ? 'Wünsche abgegeben (ja/nein)' : null,
  ].filter(Boolean).join(', ');
  const noteLines = [
    includeHours ? 'Soll = monatliches Sollstunden-Ziel laut Admin-Einstellung, für jeden vollen Monat gleich. Monate mit weniger Arbeitstagen (z. B. Februar) liegen deshalb rechnerisch darunter, der Ausgleich erfolgt über das Jahr (Blatt „Gesamt“).' : null,
    includeWishes ? 'Wunscherfüllung = Durchschnitt der Erfüllung aller hinterlegten Wünsche des Monats (Details im Blatt „Wunschdetails“). Basis sind die aktuell gespeicherten Wünsche.' : null,
    includeWishStatus ? 'Gelb markiert = für diese Person wurden keine Wünsche abgegeben.' : null,
  ].filter(Boolean).join(' ');

  /* ---- Sheet 1: per month (columns follow the chosen content) ---- */
  const ws = workbook.addWorksheet(includeHours && includeWishes ? 'Stunden & Wünsche' : includeHours ? 'Stunden' : includeWishes ? 'Wünsche' : 'Wunsch-Status');
  const diffOf = (entry) => (entry.target !== null && entry.actual !== null ? Number((entry.actual - entry.target).toFixed(2)) : null);
  const reachedOf = (entry) => (entry.target > 0 && entry.actual !== null ? Math.round((entry.actual / entry.target) * 1000) / 10 : null);
  const columns = [
    { header: 'Monat', width: 14, align: 'left', value: (entry) => entry.monthLabel },
    { header: 'Mitarbeiter', width: 24, align: 'left', bold: true, key: 'name', value: (entry) => entry.employee },
    ...(includeHours ? [
      { header: 'Soll (h)', width: 12, numFmt: '0.0', value: (entry) => entry.target },
      { header: 'Ist (h)', width: 12, numFmt: '0.0', value: (entry) => entry.actual },
      { header: 'Differenz (h)', width: 17, numFmt: '+0.0;-0.0;0.0', key: 'diff', value: (entry) => diffOf(entry) },
      { header: 'Soll erreicht', width: 17, numFmt: '0.0%', key: 'reached', value: (entry) => { const r = reachedOf(entry); return r === null ? null : r / 100; } },
    ] : []),
    ...(includeWishes ? [{ header: 'Urlaub (Tage)', width: 16, key: 'vacation', value: (entry) => entry.vacationDays }] : []),
    ...(includeWishStatus ? [{ header: 'Wünsche abgegeben', width: 23, key: 'submitted', value: (entry) => (entry.submitted ? 'Ja' : 'Nein') }] : []),
    ...(includeWishes ? [
      { header: 'Wünsche', width: 12, value: (entry) => entry.wishCount },
      { header: 'Wunscherfüllung', width: 20, numFmt: '0%', key: 'wishPercent', value: (entry) => (entry.wishPercent === null ? null : entry.wishPercent / 100) },
    ] : []),
  ];
  const columnCount = columns.length;
  ws.mergeCells(1, 1, 1, columnCount);
  ws.getCell(1, 1).value = describeContent() ? `Auswertung: ${describeContent()}` : 'Auswertung';
  ws.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: '1E3A5F' } };
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, columnCount);
  ws.getCell(2, 1).value = noteLines || ' ';
  ws.getCell(2, 1).font = { name: 'Calibri', size: 9, color: { argb: '6B7280' } };
  ws.getCell(2, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(2).height = 28;
  columns.forEach((column, index) => { ws.getCell(4, index + 1).value = column.header; });
  styleExcelHeaderRow(ws, 4, columnCount);

  summaryRows.forEach((entry, index) => {
    const rowNumber = index + 5;
    columns.forEach((column, i) => {
      const cell = ws.getCell(rowNumber, i + 1);
      const value = column.value(entry);
      cell.value = value === null || value === undefined ? (column.numFmt ? null : '–') : value;
      styleBodyCell(cell, { bold: column.bold, align: column.align || 'center', numFmt: column.numFmt });
      if (column.key === 'diff' && value !== null) cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: value < 0 ? 'B91C1C' : '047857' } };
      if (column.key === 'reached') { const fill = percentFill(reachedOf(entry)); if (fill) cell.fill = fill; }
      if (column.key === 'wishPercent') { const fill = percentFill(entry.wishPercent); if (fill) cell.fill = fill; }
      if (column.key === 'vacation' && entry.vacationDays > 0) cell.fill = solidFill('EDE9FE');
      if (column.key === 'submitted') { cell.fill = solidFill(entry.submitted ? 'D1FAE5' : 'FDE68A'); if (!entry.submitted) cell.font = MISSING_WISH_FONT; }
      // Employees without wishes stand out in the name cell as well.
      if (includeWishStatus && column.key === 'name' && !entry.submitted) { cell.fill = MISSING_WISH_FILL; cell.font = MISSING_WISH_FONT; }
    });
  });
  columns.forEach((column, index) => { ws.getColumn(index + 1).width = column.width; });
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 2, activeCell: 'C5' }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + summaryRows.length, column: columnCount } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: '4:4' };

  /* ---- Sheet 2: totals per employee (several months only) ---- */
  if (drafts.length > 1) {
    const totals = new Map();
    for (const entry of summaryRows) {
      const total = totals.get(entry.employee) || { target: 0, actual: 0, scoreSum: 0, count: 0, submitted: false };
      total.target += entry.target || 0;
      total.actual += entry.actual || 0;
      total.scoreSum += entry.wishScoreSum;
      total.count += entry.wishCount;
      total.submitted = total.submitted || entry.submitted;
      totals.set(entry.employee, total);
    }
    const totalColumns = [
      { header: 'Mitarbeiter', width: 26, align: 'left', bold: true, key: 'name', value: (employee) => employee },
      ...(includeHours ? [
        { header: 'Soll (h)', width: 11, numFmt: '0.0', value: (_e, total) => total.target },
        { header: 'Ist (h)', width: 11, numFmt: '0.0', value: (_e, total) => total.actual },
        { header: 'Differenz (h)', width: 14, numFmt: '+0.0;-0.0;0.0', key: 'diff', value: (_e, total) => Number((total.actual - total.target).toFixed(2)) },
        { header: 'Soll erreicht', width: 17, numFmt: '0.0%', key: 'reached', value: (_e, total) => (total.target > 0 ? Math.round((total.actual / total.target) * 1000) / 1000 : null) },
      ] : []),
      ...(includeWishStatus ? [{ header: 'Wünsche abgegeben', width: 23, key: 'submitted', value: (_e, total) => (total.submitted ? 'Ja' : 'Nein') }] : []),
      ...(includeWishes ? [
        { header: 'Wünsche', width: 12, value: (_e, total) => total.count },
        { header: 'Wunscherfüllung', width: 20, numFmt: '0%', key: 'wishPercent', value: (_e, total) => (total.count > 0 ? total.scoreSum / total.count : null) },
      ] : []),
    ];
    const ts = workbook.addWorksheet('Gesamt');
    ts.mergeCells(1, 1, 1, totalColumns.length);
    ts.getCell(1, 1).value = 'Gesamtübersicht über alle Monate';
    ts.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: '1E3A5F' } };
    ts.getRow(1).height = 28;
    totalColumns.forEach((column, index) => { ts.getCell(3, index + 1).value = column.header; });
    styleExcelHeaderRow(ts, 3, totalColumns.length);
    [...totals.entries()].sort((left, right) => left[0].localeCompare(right[0], 'de')).forEach(([employee, total], index) => {
      const rowNumber = index + 4;
      totalColumns.forEach((column, i) => {
        const cell = ts.getCell(rowNumber, i + 1);
        const value = column.value(employee, total);
        cell.value = value === null || value === undefined ? (column.numFmt ? null : '–') : value;
        styleBodyCell(cell, { bold: column.bold, align: column.align || 'center', numFmt: column.numFmt });
        if (column.key === 'diff') cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: value < 0 ? 'B91C1C' : '047857' } };
        if (column.key === 'reached') { const fill = percentFill(value === null ? null : value * 100); if (fill) cell.fill = fill; }
        if (column.key === 'wishPercent') { const fill = percentFill(value === null ? null : value * 100); if (fill) cell.fill = fill; }
        if (column.key === 'submitted') { cell.fill = solidFill(total.submitted ? 'D1FAE5' : 'FDE68A'); if (!total.submitted) cell.font = MISSING_WISH_FONT; }
        if (includeWishStatus && column.key === 'name' && !total.submitted) { cell.fill = MISSING_WISH_FILL; cell.font = MISSING_WISH_FONT; }
      });
    });
    totalColumns.forEach((column, index) => { ts.getColumn(index + 1).width = column.width; });
    ts.views = [{ state: 'frozen', ySplit: 3, xSplit: 1, activeCell: 'B4' }];
  }
  /* ---- Sheet 3: every single wish ---- */
  if (!includeWishes) return missingWishEmployees;
  const ds = workbook.addWorksheet('Wunschdetails');
  const detailHeaders = ['Monat', 'Mitarbeiter', 'Art', 'Wunsch', 'Ergebnis', 'Erfüllung', 'Details'];
  ds.mergeCells(1, 1, 1, detailHeaders.length);
  ds.getCell(1, 1).value = 'Wunschdetails je Mitarbeiter';
  ds.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: '1E3A5F' } };
  ds.getRow(1).height = 28;
  detailHeaders.forEach((header, index) => { ds.getCell(3, index + 1).value = header; });
  styleExcelHeaderRow(ds, 3, detailHeaders.length);
  if (detailRows.length === 0) {
    ds.mergeCells(4, 1, 4, detailHeaders.length);
    ds.getCell(4, 1).value = 'Für diese Pläne sind keine Wünsche hinterlegt.';
    ds.getCell(4, 1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: '6B7280' } };
  }
  detailRows.forEach((entry, index) => {
    const rowNumber = index + 4;
    [entry.monthLabel, entry.employee, entry.category, entry.wish, entry.status, entry.percent / 100, entry.detail].forEach((value, i) => {
      const cell = ds.getCell(rowNumber, i + 1);
      cell.value = sanitizeCellText(typeof value === 'string' ? value : String(value));
      if (typeof value === 'number') cell.value = value;
      cell.font = { name: 'Calibri', size: 10, bold: i === 1 };
      cell.alignment = { horizontal: i === 5 || i === 4 ? 'center' : 'left', vertical: 'top', wrapText: i === 3 || i === 6 };
      cell.border = EXCEL_THIN_BORDER;
    });
    ds.getCell(rowNumber, 6).numFmt = '0%';
    ds.getCell(rowNumber, 5).fill = statusFill(entry.status);
    ds.getCell(rowNumber, 6).fill = statusFill(entry.status);
  });
  [14, 24, 20, 38, 18, 11, 70].forEach((width, index) => { ds.getColumn(index + 1).width = width; });
  ds.views = [{ state: 'frozen', ySplit: 3, xSplit: 2, activeCell: 'C4' }];
  if (detailRows.length > 0) ds.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + detailRows.length, column: detailHeaders.length } };
  ds.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: '3:3' };
  return missingWishEmployees;
}

/**
 * variant 'team'       : only the shifts, one worksheet per month (no hours, no internal data).
 * variant 'management' : the same month sheets with hours, plus overview sheets with
 *                        target/actual hours and the wish fulfilment per employee.
 * no variant           : the complete month sheets (version, status, hours), no extra sheets.
 */
export async function buildExcelWorkbook(drafts, period = null, options = {}) {
  // No variant (internal callers, tests): the complete month sheets with version, status and hours.
  const variant = options.variant || 'full';
  const isTeam = variant === 'team';
  // Management export: the admin picks what is visible (hours, wish fulfilment, wish status).
  const isManagement = variant === 'management';
  const includeHours = !isManagement || options.includeHours !== false;
  const includeWishStatus = isManagement && options.includeWishStatus !== false;
  const showHours = !isTeam && includeHours;
  // Employees with the "Nicht planen" button do not appear anywhere in the export (older drafts may still contain them).
  const hiddenKeys = options.hiddenKeys || await loadDoNotPlanKeys((text, params) => pool.query(text, params));
  drafts = drafts.map((draft) => stripDoNotPlan(draft, hiddenKeys));
  drafts = [...drafts].sort((left, right) => left.month.localeCompare(right.month));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ODIN Shiftplan';
  workbook.created = new Date();
  // Cover sheet: created first so it is the first tab, filled at the end when all sheets exist.
  const overviewSheet = workbook.addWorksheet(OVERVIEW_SHEET_NAME);

  // Overview sheets come first, so they are the first thing the readers see.
  const absenceInfo = await loadAbsenceInfoForDrafts(drafts);
  const missingWishEmployees = isManagement
    ? await addManagementSheets(workbook, drafts, absenceInfo, options)
    : new Set();
  // Cost control (night and Sunday hours) is only for the management.
  const highlightMissing = options.includeWishStatus === false ? new Set() : missingWishEmployees;
  const costControl = isManagement ? addCostControlSheet(workbook, drafts, { timesByCode: await loadShiftTimesByCode(), missingWishEmployees: highlightMissing }) : null;
  if (isManagement) addShiftDistributionSheet(workbook, drafts, { missingWishEmployees: highlightMissing });
  const coloCoverage = isManagement ? addColoCoverageSheet(workbook, drafts) : null;
  // One continuous plan over all months of a quarter / year (before the month sheets).
  if (drafts.length > 1) addContinuousPlanSheet(workbook, drafts, { absenceInfo, missingWishEmployees: includeWishStatus ? missingWishEmployees : new Set() });


  for (const draft of drafts) {
    const shifts = draft.shifts_json;
    const [year, mon] = draft.month.split('-').map(Number);
    const numDays = daysInMonth(year, mon);
    const sheetName = `${MONTH_NAMES_DE[mon]} ${year}`;

    const ws = workbook.addWorksheet(sheetName);
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4, activeCell: 'B5' }];
    ws.properties.defaultRowHeight = 18;

    // Group shifts by employee
    const byEmployee = {};
    for (const s of shifts) {
      if (!byEmployee[s.employee_name]) byEmployee[s.employee_name] = {};
      byEmployee[s.employee_name][s.day] = s.shift_code;
    }
    // Employees that are planned but have no shift this month still get a row (absence marks).
    for (const name of Object.keys(draft.fairness || {})) if (!byEmployee[name]) byEmployee[name] = {};
    const monthMarks = absenceInfo.get(draft.month)?.marks || new Map();
    const monthHolidays = buildHessenHolidayMap(year);
    const notPlannedNames = notPlannedNamesOf(draft);
    const empNames = Object.keys(byEmployee).sort((a, b) => a.localeCompare(b, 'de'));
    // Colo cover (all variants) and late overstaffing on Thursday/Friday (not in the team sheet) are marked in the cell.
    const coloCells = new Set((Array.isArray(draft.config_snapshot?.coloAssignments) ? draft.config_snapshot.coloAssignments : [])
      .filter((entry) => entry?.employee_name && String(entry.date || '').startsWith(draft.month))
      .map((entry) => `${entry.employee_name}|${Number(String(entry.date).slice(8, 10))}`));
    const overflowCells = new Set(isTeam ? [] : (Array.isArray(draft.config_snapshot?.planReport?.lateOverflow) ? draft.config_snapshot.planReport.lateOverflow : [])
      .map((entry) => `${entry.employee}|${Number(entry.day)}`));

    // Title row
    const lastColumn = showHours ? numDays + 2 : numDays + 1;
    ws.mergeCells(1, 1, 1, lastColumn);
    const titleCell = ws.getCell(1, 1);
    const headerText = buildDraftSheetHeaderText({
      title: period?.title || draft.title,
      description: draft.description,
      // The team sheet shows the plan only; version, status and author are internal.
      metaLine: isTeam
        ? `Schichtplan ${sheetName}`
        : `Version ${draft.version} | Status: ${draft.status} | Erstellt: ${new Date(draft.created_at).toLocaleDateString('de-DE')} von ${draft.created_by}`,
      sheetName,
    });
    titleCell.value = headerText.title;
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: '1E3A5F' } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 28;

    // Subtitle row
    ws.mergeCells(2, 1, 2, lastColumn);
    const subCell = ws.getCell(2, 1);
    subCell.value = headerText.subtitle;
    subCell.font = { name: 'Calibri', size: 9, color: { argb: '6B7280' } };
    subCell.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(2).height = headerText.rowHeight;

    // Day-of-week row (row 3)
    ws.getCell(3, 1).value = '';
    ws.getCell(3, 1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    ws.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
    for (let d = 1; d <= numDays; d++) {
      const dow = new Date(year, mon - 1, d).getDay();
      const cell = ws.getCell(3, d + 1);
      cell.value = DAY_NAMES_DE[dow];
      cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dow === 0 || dow === 6 ? '4B5563' : '1E3A5F' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin', color: { argb: '374151' } }, bottom: { style: 'thin', color: { argb: '374151' } }, left: { style: 'thin', color: { argb: '374151' } }, right: { style: 'thin', color: { argb: '374151' } } };
    }
    // Stats header (management variant only)
    const statsCol = numDays + 2;
    if (showHours) {
      ws.getCell(3, statsCol).value = 'Σ';
      ws.getCell(3, statsCol).font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell(3, statsCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
      ws.getCell(3, statsCol).alignment = { horizontal: 'center' };
    }

    // Header row (row 4) – day numbers
    ws.getCell(4, 1).value = 'Mitarbeiter';
    ws.getCell(4, 1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    ws.getCell(4, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
    ws.getCell(4, 1).border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
    for (let d = 1; d <= numDays; d++) {
      const dow = new Date(year, mon - 1, d).getDay();
      const cell = ws.getCell(4, d + 1);
      cell.value = d;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dow === 0 || dow === 6 ? '4B5563' : '1E3A5F' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
      const holidayName = monthHolidays[`${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`];
      if (holidayName) {
        markHolidayHeader(cell, holidayName, d);
        ws.getCell(3, d + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B91C1C' } };
      }
    }
    if (showHours) {
      ws.getCell(4, statsCol).value = 'Stunden';
      ws.getCell(4, statsCol).font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell(4, statsCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
      ws.getCell(4, statsCol).alignment = { horizontal: 'center' };
    }
    ws.getRow(4).height = Object.keys(monthHolidays).some((date) => date.startsWith(`${year}-${String(mon).padStart(2, '0')}-`)) ? 32 : 22;

    const durationByCode = new Map(
      (draft.config_snapshot?.shiftDefinitions || []).map((definition) => [
        String(definition.code || '').trim().toUpperCase(),
        Number(definition.durationHours) || 8,
      ])
    );

    // Data rows
    empNames.forEach((emp, idx) => {
      const row = idx + 5;
      const nameCell = ws.getCell(row, 1);
      nameCell.value = emp;
      nameCell.font = { name: 'Calibri', size: 9, bold: true };
      nameCell.border = { top: { style: 'thin', color: { argb: 'D1D5DB' } }, bottom: { style: 'thin', color: { argb: 'D1D5DB' } }, left: { style: 'thin', color: { argb: 'D1D5DB' } }, right: { style: 'thin', color: { argb: 'D1D5DB' } } };
      if (idx % 2 === 1) nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F9FAFB' } };
      // Employees without submitted wishes are highlighted (only when the admin chose the wish status).
      if (includeWishStatus && missingWishEmployees.has(emp)) {
        nameCell.fill = MISSING_WISH_FILL;
        nameCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '92400E' } };
      }

      let fallbackHours = 0;
      for (let d = 1; d <= numDays; d++) {
        const plannedCode = byEmployee[emp][d] || '';
        // Vacation wishes, sickness etc. show up on days without a planned shift.
        const code = plannedCode || monthMarks.get(emp)?.get(d)?.code || '';
        const cell = ws.getCell(row, d + 1);
        cell.value = code;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { name: 'Calibri', size: 9 };
        cell.border = { top: { style: 'thin', color: { argb: 'D1D5DB' } }, bottom: { style: 'thin', color: { argb: 'D1D5DB' } }, left: { style: 'thin', color: { argb: 'D1D5DB' } }, right: { style: 'thin', color: { argb: 'D1D5DB' } } };

        const markNotes = [];
        if (plannedCode && coloCells.has(`${emp}|${d}`)) markNotes.push('Colo');
        if (plannedCode && overflowCells.has(`${emp}|${d}`)) markNotes.push('Überbesetzung Spätschicht (Do/Fr)');
        if (markNotes.length > 0) {
          cell.note = markNotes.join(' + ');
          const markColor = markNotes[0] === 'Colo' ? '06B6D4' : 'F97316';
          const thick = { style: 'medium', color: { argb: markColor } };
          cell.border = { top: thick, bottom: thick, left: thick, right: thick };
        }
        const colors = resolveExcelShiftColors(code);
        if (plannedCode) fallbackHours += durationByCode.get(String(code).trim().toUpperCase()) || 8;
        if (colors) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.fill } };
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: colors.font } };
        } else {
          const dow = new Date(year, mon - 1, d).getDay();
          if (dow === 0 || dow === 6) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
          } else if (idx % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F9FAFB' } };
          }
        }
      }

      // COLO badge: second line "COLO" in every planned Colo cell and a COLO line under the name.
      let coloDays = 0;
      for (let d = 1; d <= numDays; d++) {
        if (!byEmployee[emp][d] || !coloCells.has(`${emp}|${d}`)) continue;
        coloDays++;
        const cell = ws.getCell(row, d + 1);
        const baseFont = { ...(cell.font || { name: 'Calibri', size: 9, bold: true }) };
        cell.value = { richText: [
          { text: String(byEmployee[emp][d]), font: baseFont },
          { text: '\nCOLO', font: { name: 'Calibri', size: 7, bold: true, color: { argb: '0E7490' } } },
        ] };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
      if (coloDays > 0) ws.getRow(row).height = 28;

      // Credited monthly hours (includes configured shift durations and absences); none for employees who are not planned.
      if (showHours && !notPlannedNames.has(emp)) {
        const totalCell = ws.getCell(row, statsCol);
        const reportedHours = Number(draft.fairness?.[emp]?.actualHours);
        totalCell.value = Number.isFinite(reportedHours) ? reportedHours : fallbackHours;
        totalCell.alignment = { horizontal: 'center' };
        totalCell.font = { name: 'Calibri', size: 9, bold: true };
        totalCell.border = { top: { style: 'thin', color: { argb: 'D1D5DB' } }, bottom: { style: 'thin', color: { argb: 'D1D5DB' } }, left: { style: 'thin', color: { argb: 'D1D5DB' } }, right: { style: 'thin', color: { argb: 'D1D5DB' } } };
      }
    });

    // Column widths
    ws.getColumn(1).width = 22;
    for (let d = 1; d <= numDays; d++) ws.getColumn(d + 1).width = 4.5;
    if (showHours) ws.getColumn(statsCol).width = 7;
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + empNames.length, column: 1 } };

    // Legend row
    const legendRow = empNames.length + 6;
    ws.getCell(legendRow, 1).value = 'Legende:';
    ws.getCell(legendRow, 1).font = { name: 'Calibri', size: 9, bold: true };
    let col = 2;
    for (const [code, colors] of Object.entries(SHIFT_COLORS)) {
      const cell = ws.getCell(legendRow, col);
      cell.value = code;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.fill } };
      cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: colors.font } };
      cell.alignment = { horizontal: 'center' };
      col++;
    }
    if (coloCells.size > 0 || overflowCells.size > 0) {
      const marks = [coloCells.size > 0 ? 'Cyan umrandet = Colo' : null, overflowCells.size > 0 ? 'Orange umrandet = Überbesetzung Spätschicht Do/Fr' : null].filter(Boolean);
      ws.getCell(legendRow + 3, 1).value = marks.join('   |   ');
      ws.getCell(legendRow + 3, 1).font = { name: 'Calibri', size: 8, bold: true, color: { argb: '0E7490' } };
    }
    const holidayLine = holidayListText(monthHolidays, year, mon);
    if (holidayLine) {
      ws.getCell(legendRow + 4, 1).value = `F = Feiertag:   ${holidayLine}`;
      ws.getCell(legendRow + 4, 1).font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'B91C1C' } };
    }
    if (includeWishStatus) {
      const legendCell = ws.getCell(legendRow + 1, 1);
      legendCell.value = 'Gelb = keine Wünsche abgegeben';
      legendCell.fill = MISSING_WISH_FILL;
      legendCell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: '92400E' } };
    }

    // Footer: who is planned for Colo, and the limits this draft was generated with.
    const coloByEmployee = new Map();
    for (const key of coloCells) { const [name] = key.split('|'); coloByEmployee.set(name, (coloByEmployee.get(name) || 0) + 1); }
    const coloReport = draft.config_snapshot?.planReport?.colo;
    if (coloByEmployee.size === 0 && coloReport) {
      const coloInfo = ws.getCell(empNames.length + 6, 1);
      coloInfo.value = coloReport.enabled
        ? `COLO: keine Einsätze geplant (${coloReport.missing ?? 0} von ${coloReport.requiredAssignments ?? 0} Aufgaben offen) – siehe Konflikte im Draft`
        : 'COLO: Colo-Planung ist in den Admin-Einstellungen ausgeschaltet, deshalb gibt es keine Markierungen';
      coloInfo.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'B45309' } };
    }
    if (coloByEmployee.size > 0) {
      const coloLine = ws.getCell(empNames.length + 6, 1);
      coloLine.value = `COLO geplant: ${[...coloByEmployee.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([name, days]) => `${name} (${days})`).join(', ')}`;
      coloLine.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '0E7490' } };
    }
    if (!isTeam) {
      const settingsLine = ws.getCell(empNames.length + 7, 1);
      settingsLine.value = describePlanningSettingsLine(draft.config_snapshot?.planningSettings);
      settingsLine.font = { name: 'Calibri', size: 8, color: { argb: '6B7280' } };
    }
    // Footer
    const footerRow = empNames.length + 8;
    ws.getCell(footerRow, 1).value = `Exportiert am ${new Date().toLocaleString('de-DE', { timeZone: config.OPERATIONAL_TIMEZONE })} — ODIN Schichtplan${isTeam ? '' : ` v${draft.version}`}`;
    ws.getCell(footerRow, 1).font = { name: 'Calibri', size: 8, color: { argb: '9CA3AF' } };

    // Print setup
    ws.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      printTitlesRow: '1:4',
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    };
    ws.headerFooter = { oddFooter: `&L ODIN Schichtplan &C ${sheetName} &R Seite &P von &N` };
  }

  // Slider values and staffing limits of every draft (management / full exports).
  if (!isTeam) addPlanningSettingsSheet(workbook, drafts);

  // If multiple months, add summary sheet
  if (drafts.length > 1) {
    const summaryLabel = period?.type === 'quarter' ? `Quartalsübersicht Q${period.quarter} ${period.year}` : 'Jahresübersicht';
    const summaryWs = workbook.addWorksheet(period?.type === 'quarter' ? 'Quartalsübersicht' : 'Jahresübersicht');
    const groupTitle = period?.title ?? drafts.find(d => d.title)?.title;
    const groupDescription = period?.description ?? drafts.find(d => d.description)?.description;
    summaryWs.getCell(1, 1).value = sanitizeCellText(groupTitle && String(groupTitle).trim() ? String(groupTitle).trim() : `ODIN Schichtplan – ${summaryLabel}`);
    summaryWs.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: '1E3A5F' } };
    summaryWs.mergeCells(1, 1, 1, 6);
    if (groupDescription && String(groupDescription).trim()) {
      const descriptionText = String(groupDescription).trim();
      summaryWs.mergeCells(2, 1, 2, 6);
      const descCell = summaryWs.getCell(2, 1);
      descCell.value = sanitizeCellText(descriptionText);
      descCell.font = { name: 'Calibri', size: 9, color: { argb: '6B7280' } };
      descCell.alignment = { wrapText: true, vertical: 'top' };
      summaryWs.getRow(2).height = Math.min(90, Math.max(18, 15 * descriptionText.split('\n').length));
    }

    // The team sheet shows no internal data (version, status, conflicts).
    const columns = isTeam
      ? [['Monat', () => null], ['Schichten', (d) => d.shifts_json?.length || 0], ['Mitarbeiter', (d) => new Set((d.shifts_json || []).map(s => s.employee_name)).size]]
      : [['Monat', () => null], ['Version', (d) => d.version], ['Status', (d) => d.status], ['Schichten', (d) => d.shifts_json?.length || 0], ['Mitarbeiter', (d) => new Set((d.shifts_json || []).map(s => s.employee_name)).size], ['Konflikte', (d) => d.conflicts?.length || 0]];
    columns.forEach(([header], i) => {
      const cell = summaryWs.getCell(3, i + 1);
      cell.value = header;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
      cell.alignment = { horizontal: 'center' };
    });

    drafts.forEach((d, idx) => {
      const row = idx + 4;
      const [y, m] = d.month.split('-').map(Number);
      summaryWs.getCell(row, 1).value = `${MONTH_NAMES_DE[m]} ${y}`;
      columns.slice(1).forEach(([, valueOf], i) => { summaryWs.getCell(row, i + 2).value = valueOf(d); });
      for (let c = 1; c <= columns.length; c++) {
        summaryWs.getCell(row, c).font = { name: 'Calibri', size: 9 };
        summaryWs.getCell(row, c).alignment = { horizontal: 'center' };
        summaryWs.getCell(row, c).border = { bottom: { style: 'thin', color: { argb: 'D1D5DB' } } };
      }
      summaryWs.getCell(row, 1).alignment = { horizontal: 'left' };
    });

    summaryWs.getColumn(1).width = 20;
    for (let c = 2; c <= columns.length; c++) summaryWs.getColumn(c).width = 14;
  }

  // Common look of all sheets and the cover sheet with key figures, contents and legend.
  const generatedLabel = new Date().toLocaleString('de-DE', { timeZone: config.OPERATIONAL_TIMEZONE });
  const variantLabel = isManagement ? 'Leitungsauswertung' : isTeam ? 'Teamplan' : 'Gesamtexport';
  applyEnterpriseLayout(workbook, { variantLabel, generatedLabel });
  buildOverviewSheet(workbook, overviewSheet, buildOverviewContext({ drafts, period, isManagement, isTeam, variantLabel, generatedLabel, exportedBy: options.exportedBy || '', costControl, coloCoverage, missingWishEmployees: includeWishStatus ? missingWishEmployees : new Set() }));

  normalizeWorkbookColors(workbook);
  return workbook;
}

/** Key figures, shift legend and mark legend of the cover sheet. */
function buildOverviewContext({ drafts, period, isManagement, isTeam, variantLabel, generatedLabel, exportedBy, costControl, coloCoverage, missingWishEmployees }) {
  const employees = new Set();
  let shiftCount = 0;
  let actualHours = 0;
  let targetHours = 0;
  let conflictCount = 0;
  let criticalCount = 0;
  for (const draft of drafts) {
    const notPlanned = notPlannedNamesOf(draft);
    for (const shift of Array.isArray(draft.shifts_json) ? draft.shifts_json : []) {
      if (!isWorkedShiftCode(shift.shift_code)) continue;
      shiftCount += 1;
      if (!notPlanned.has(shift.employee_name)) employees.add(shift.employee_name);
    }
    for (const entry of Object.values(draft.fairness || {})) {
      actualHours += Number(entry?.actualHours) || 0;
      targetHours += Number(entry?.targetHours) || 0;
    }
    for (const conflict of Array.isArray(draft.conflicts) ? draft.conflicts : []) {
      conflictCount += 1;
      if (conflict?.severity === 'critical') criticalCount += 1;
    }
  }
  const firstMonth = drafts[0]?.month || '';
  const lastMonth = drafts.at(-1)?.month || firstMonth;
  const monthLabel = (month) => { const [year, mon] = String(month).split('-').map(Number); return `${MONTH_NAMES_DE[mon]} ${year}`; };
  const periodLabel = period?.type === 'quarter' ? `Quartalsplanung Q${period.quarter} ${period.year}`
    : period?.type === 'year' ? `Jahresplanung ${period.year}`
      : firstMonth === lastMonth ? monthLabel(firstMonth) : `${monthLabel(firstMonth)} bis ${monthLabel(lastMonth)}`;
  const number = (value, digits = 0) => value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const kpis = [
    { label: 'Mitarbeiter', value: employees.size, note: 'regulär geplant, mit mindestens einer Schicht' },
    { label: 'Geplante Schichten', value: shiftCount, numFmt: '#,##0', note: `in ${drafts.length} ${drafts.length === 1 ? 'Monat' : 'Monaten'}` },
  ];
  if (!isTeam) {
    const reached = targetHours > 0 ? actualHours / targetHours : null;
    // Year balance per employee over all months of the export: nobody should end more than 20 h below the Soll.
    const balance = new Map();
    for (const draft of drafts) {
      for (const [name, entry] of Object.entries(draft.fairness || {})) {
        if (notPlannedNamesOf(draft).has(name)) continue;
        const current = balance.get(name) || { actual: 0, target: 0 };
        current.actual += Number(entry?.actualHours) || 0;
        current.target += Number(entry?.targetHours) || 0;
        balance.set(name, current);
      }
    }
    const inCorridor = [...balance.values()].filter((entry) => entry.actual - entry.target >= -20).length;
    kpis.push(
      { label: 'Ist-Stunden', value: Math.round(actualHours), numFmt: '#,##0" h"', note: `Soll ${number(targetHours)} h` },
      { label: 'Soll erreicht', value: reached === null ? null : Math.round(reached * 1000) / 1000, numFmt: '0.0 %', note: `Ist ${number(actualHours)} h von ${number(targetHours)} h`, tone: reached === null || reached >= 0.97 ? THEME_OK : THEME_WARN },
      { label: 'Im Zielkorridor', value: `${inCorridor} von ${balance.size}`, note: 'Mitarbeiter höchstens 20 h unter dem Soll', tone: balance.size === 0 || inCorridor === balance.size ? THEME_OK : THEME_WARN },
      { label: 'Konflikte', value: conflictCount, note: `davon ${criticalCount} kritisch`, tone: criticalCount > 0 ? THEME_BAD : conflictCount > 0 ? THEME_WARN : THEME_OK },
    );
  }
  if (isManagement) {
    if (coloCoverage) {
      const total = coloCoverage.rows.length;
      kpis.push({ label: 'Colo-Abdeckung', value: `${coloCoverage.coveredDays} von ${total} Tagen`, note: `${coloCoverage.gapDays} Tage mit offenem Bedarf`, tone: coloCoverage.gapDays > 0 ? THEME_WARN : THEME_OK });
    }
    kpis.push({ label: 'Ohne Wünsche', value: missingWishEmployees.size, note: 'Mitarbeiter ohne abgegebene Wünsche', tone: missingWishEmployees.size > 0 ? THEME_WARN : THEME_OK });
    if (costControl) {
      kpis.push(
        { label: 'Feiertagszuschlag', value: costControl.total.holidayHours, numFmt: '#,##0.0" h"', note: `${costControl.holidays.length} Bankfeiertage` },
        { label: 'Nachtzuschlag', value: costControl.total.nightHours, numFmt: '#,##0.0" h"', note: `${costControl.total.nightShifts} Schichten mit Nacht` },
        { label: 'Sonntagszuschlag', value: costControl.total.sundayHours, numFmt: '#,##0.0" h"', note: `${costControl.total.sundayShifts} Schichten mit Sonntag` },
      );
    }
  } else {
    kpis.push({ label: 'Zeitraum', value: drafts.length, note: periodLabel });
  }

  const definitions = new Map();
  for (const draft of drafts) {
    for (const definition of draft.config_snapshot?.shiftDefinitions || []) {
      const code = String(definition?.code || '').trim().toUpperCase();
      if (code && !definitions.has(code)) definitions.set(code, definition);
    }
  }
  const typeLabel = { early: 'Früh', late: 'Spät', night: 'Nacht', special: 'Sonder' };
  const shifts = [...definitions.entries()].map(([code, definition]) => ({
    code,
    name: definition.name || '',
    time: (definition.startTime ?? definition.start_time) && (definition.endTime ?? definition.end_time)
      ? `${String(definition.startTime ?? definition.start_time).slice(0, 5)}–${String(definition.endTime ?? definition.end_time).slice(0, 5)}` : '',
    hours: Number(definition.durationHours ?? definition.duration_hours) || '',
    type: typeLabel[String(definition.type || definition.shift_type || '').toLowerCase()] || '',
  }));

  const cyan = { style: 'medium', color: { argb: '06B6D4' } };
  const orange = { style: 'medium', color: { argb: 'F97316' } };
  const marks = [
    { sample: 'Sa/So', fill: 'F3F4F6', text: 'Grau hinterlegt = Wochenende (im Fortlaufenden Plan zusätzlich Tageskopf grau, Feiertage rot)' },
    { sample: 'E1', fill: 'FFEDD5', font: '9A3412', border: { top: cyan, bottom: cyan, left: cyan, right: cyan }, text: 'Cyan umrandet (zweite Zeile „COLO“) = Mitarbeiter übernimmt an diesem Tag eine Colo-Aufgabe' },
    { sample: 'URL', fill: 'EDE9FE', font: '5B21B6', text: 'Urlaub (URL), Krank (KRANK), Seminar (SEM), Extern (EXT) kommen aus den Abwesenheiten, nicht aus dem Generator' },
  ];
  marks.splice(1, 0, { sample: 'F', fill: 'B91C1C', font: 'FFFFFF', text: 'Roter Tageskopf mit „F“ unter dem Datum = Feiertag; der Name steht in der Zellnotiz und unter dem Plan' });
  if (!isTeam) marks.splice(3, 0, { sample: 'L1', fill: 'FEF3C7', font: '854D0E', border: { top: orange, bottom: orange, left: orange, right: orange }, text: 'Orange umrandet = Überbesetzung Spätschicht am Donnerstag/Freitag' });
  if (isManagement) marks.push({ sample: 'Name', fill: 'FDE68A', font: '92400E', text: 'Gelb hinterlegter Name = für diese Person wurden keine Wünsche abgegeben' });

  // Generation date = newest creation time of the drafts; author(s) = who generated them.
  const createdTimes = drafts.map((draft) => new Date(draft.created_at)).filter((date) => !Number.isNaN(date.getTime()));
  const generatedAt = createdTimes.length > 0 ? new Date(Math.max(...createdTimes.map((date) => date.getTime()))) : new Date();
  const generatedAtLabel = `${generatedAt.toLocaleDateString('de-DE', { timeZone: config.OPERATIONAL_TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric' })}, ${generatedAt.toLocaleTimeString('de-DE', { timeZone: config.OPERATIONAL_TIMEZONE, hour: '2-digit', minute: '2-digit' })} Uhr`;
  const authors = [...new Set(drafts.map((draft) => String(draft.created_by || '').trim()).filter((name) => name && name !== 'system'))];

  return {
    title: WORKBOOK_TITLE,
    periodLabel,
    variantLabel,
    confidential: !isTeam,
    generatedLabel,
    generatedAtLabel,
    createdBy: authors.join(', '),
    exportedBy,
    kpis,
    shifts,
    marks,
    colorFor: resolveExcelShiftColors,
  };
}

const THEME_OK = '047857';
const THEME_WARN = 'B45309';
const THEME_BAD = 'B91C1C';

// ?variant=team (default: shifts only) or ?variant=management (hours + wish fulfilment).
// The management variant contains personal wish data and hours: admins only.
function exportVariant(req) {
  return req.query?.variant === 'management' ? 'management' : 'team';
}
// ?include=hours,wishes,wishStatus chooses the content of the management export (default: everything).
function exportOptions(req) {
  const variant = exportVariant(req);
  const exportedBy = req.user?.displayName || req.user?.email || req.user?.loginName || '';
  if (variant !== 'management') return { variant, exportedBy };
  const raw = req.query?.include;
  if (raw === undefined) return { variant, exportedBy, includeHours: true, includeWishes: true, includeWishStatus: true };
  const parts = new Set(String(raw).split(',').map((part) => part.trim()).filter(Boolean));
  return { variant, exportedBy, includeHours: parts.has('hours'), includeWishes: parts.has('wishes'), includeWishStatus: parts.has('wishStatus') };
}
function variantFileSuffix(variant) {
  return variant === 'management' ? 'Leitung' : 'Team';
}
function managementExportGuard(req, res, next) {
  if (req.query?.variant === 'management' && !isAdminRequest(req)) {
    return res.status(403).json({ ok: false, error: 'Die Leitungs-Auswertung ist nur für Administratoren verfügbar' });
  }
  return next();
}

router.get('/drafts/:id/excel', managementExportGuard, requireReadableDraft, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM shiftplan_drafts WHERE id = $1', [parseInt(req.params.id)]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Draft nicht gefunden' });
    const draft = rows[0];

    const variant = exportVariant(req);
    const workbook = await buildExcelWorkbook([draft], null, exportOptions(req));
    const filename = `ODIN_Schichtplan_${draft.month}_v${draft.version}_${variantFileSuffix(variant)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Export the exact monthly versions belonging to one generation run.
router.get('/drafts/groups/:groupId/excel', managementExportGuard, async (req, res) => {
  try {
    const summaries = await pool.query(
      `SELECT id, month, version, note, created_at, config_snapshot->'planningBatch' AS planning_batch
       FROM shiftplan_drafts`);
    const group = groupPlanningDrafts(summaries.rows).find(entry => entry.id === req.params.groupId);
    if (!group || group.type === 'month') return res.status(404).json({ ok: false, error: 'Planungsgruppe nicht gefunden' });
    const { rows } = await pool.query(
      'SELECT * FROM shiftplan_drafts WHERE id = ANY($1::int[]) ORDER BY month',
      [group.drafts.map(draft => draft.id)]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Keine Monats-Drafts vorhanden' });
    const groupTitle = rows.find(row => row.title)?.title || null;
    const groupDescription = rows.find(row => row.description)?.description || null;
    const variant = exportVariant(req);
    const workbook = await buildExcelWorkbook(rows, { ...group, title: groupTitle, description: groupDescription }, exportOptions(req));
    const suffix = variantFileSuffix(variant);
    const filename = group.type === 'quarter' ? `ODIN_Quartalsplanung_Q${group.quarter}_${group.year}_${suffix}.xlsx` : `ODIN_Jahresplanung_${group.year}_${suffix}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/* Year Excel Export – all 12 months in one workbook */
router.get('/drafts/year-excel/:year', managementExportGuard, async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    if (!year) return res.status(400).json({ ok: false, error: 'Jahr erforderlich' });

    // Get latest draft for each month of the year
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (month) *
         FROM shiftplan_drafts
        WHERE month LIKE $1
        ORDER BY month, version DESC`,
      [`${year}-%`]
    );

    if (!rows.length) return res.status(404).json({ ok: false, error: `Keine Drafts für ${year} gefunden` });

    const variant = exportVariant(req);
    const workbook = await buildExcelWorkbook(rows, null, exportOptions(req));
    const filename = `ODIN_Jahresschichtplan_${year}_${variantFileSuffix(variant)}.xlsx`;
    // (draft titles/descriptions are rendered per month sheet via the row data)

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Year Excel export error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------ */
/* PLANNING BASIS (data used for generation)        */
/* ------------------------------------------------ */

router.get('/planning-basis', requirePageAccess('shiftplan_control', 'view'), async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ ok: false, error: 'month parameter required' });

    const [year, mon] = month.split('-').map(Number);
    const numDays = daysInMonth(year, mon);

    // Employees
    const employees = await loadEmployeesForPlanningYear(year, String(month));
    const manualEmployees = await loadManualEmployeesForDraftMonth(String(month));

    // Absences
    const absRes = await pool.query(
      `SELECT employee_name, start_date, end_date, type FROM absences WHERE start_date <= $1 AND end_date >= $2`,
      [`${month}-${numDays}`, `${month}-01`]
    );

    // Exclusions
    const exclRes = await pool.query(
      `SELECT employee_name, reason, reason_text, valid_from, valid_to FROM assignment_employee_exclusions WHERE is_active = TRUE`
    );

    // Staffing rules
    const staffRes = await pool.query('SELECT * FROM staffing_rules');

    // Wellbeing (previous month)
    const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
    const wbRes = await pool.query(
      `SELECT * FROM wellbeing_metrics WHERE year = $1 AND month = $2`,
      [prevMonth.split('-')[0], parseInt(prevMonth.split('-')[1])]
    );

    res.json({
      ok: true,
      basis: {
        employees,
        absences: absRes.rows,
        exclusions: exclRes.rows,
        staffingRules: staffRes.rows,
        wellbeing: wbRes.rows,
        manualEmployees,
        month,
        daysInMonth: numDays,
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/manual-employees', requirePageAccess('shiftplan_control', 'view'), async (req, res) => {
  try {
    const month = String(req.query?.month || '').trim();
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ ok: false, error: 'month parameter required (YYYY-MM)' });
    }

    const employees = await loadManualEmployeesForDraftMonth(month);
    res.json({ ok: true, employees });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/manual-employees/summary', requirePageAccess('shiftplan_control', 'view'), async (req, res) => {
  try {
    const year = Number.parseInt(String(req.query?.year || ''), 10);
    if (!Number.isInteger(year)) {
      return res.status(400).json({ ok: false, error: 'year parameter required' });
    }

    const months = await loadManualEmployeeSummaryForYear(year);
    res.json({ ok: true, months });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/manual-employees', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  try {
    const month = String(req.body?.month || '').trim();
    const employeeName = normalizeEmployeeName(req.body?.employeeName);
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ ok: false, error: 'month parameter required (YYYY-MM)' });
    }
    if (!employeeName) {
      return res.status(400).json({ ok: false, error: 'employeeName is required' });
    }

    const liveMonthLabel = resolveLiveMonthLabelFromDraftMonth(month);
    if (!liveMonthLabel) {
      return res.status(400).json({ ok: false, error: 'Ungültiges Monatsformat' });
    }

    const duplicateRes = await pool.query(
      `SELECT COALESCE(source, 'import') AS source
         FROM shifts
        WHERE month = $1
          AND employee_name = $2
        LIMIT 1`,
      [liveMonthLabel, employeeName]
    );
    if (duplicateRes.rowCount > 0 && duplicateRes.rows[0]?.source !== 'manual') {
      return res.status(409).json({ ok: false, error: 'Employee already exists in the imported shiftplan for this month' });
    }

    const createdBy = req.user?.displayName || req.user?.email || req.user?.username || 'unknown';
    const { rows } = await pool.query(
      `INSERT INTO manual_shiftplan_employees (month, employee_name, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (month, employee_name) DO NOTHING
       RETURNING employee_name, created_at, created_by`,
      [liveMonthLabel, employeeName, createdBy]
    );

    if (!rows.length) {
      return res.status(409).json({ ok: false, error: 'Manual employee already exists for this month' });
    }

    res.status(201).json({ ok: true, employee: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/manual-employees', requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('MANUAL EMPLOYEES DB CONNECT ERROR:', err);
    return res.status(503).json({ ok: false, error: 'Datenbank momentan nicht erreichbar' });
  }
  try {
    const month = String(req.query?.month || '').trim();
    const employeeName = normalizeEmployeeName(req.query?.employeeName);
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ ok: false, error: 'month parameter required (YYYY-MM)' });
    }
    if (!employeeName) {
      return res.status(400).json({ ok: false, error: 'employeeName is required' });
    }

    const liveMonthLabel = resolveLiveMonthLabelFromDraftMonth(month);
    if (!liveMonthLabel) {
      return res.status(400).json({ ok: false, error: 'Ungültiges Monatsformat' });
    }

    await client.query('BEGIN');
    const deleteManualRes = await client.query(
      `DELETE FROM manual_shiftplan_employees
        WHERE month = $1
          AND employee_name = $2`,
      [liveMonthLabel, employeeName]
    );

    if (deleteManualRes.rowCount === 0) {
      await client.query('ROLLBACK').catch(() => {});
      return res.status(404).json({ ok: false, error: 'Manual employee not found' });
    }

    await client.query(
      `DELETE FROM shifts
        WHERE month = $1
          AND employee_name = $2
          AND COALESCE(source, 'import') = 'manual'`,
      [liveMonthLabel, employeeName]
    );

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

/* ------------------------------------------------ */
/* GENERATE DRAFTS FOR FULL YEAR                    */
/* ------------------------------------------------ */

/* ------------------------------------------------ */
/* GENERATE DRAFTS FOR FULL YEAR                    */
/* ------------------------------------------------ */

router.post(['/drafts/generate-year', '/drafts/generate-quarter'], requirePageAccess('shiftplan_control', 'write'), async (req, res) => {
  const year = Number(req.body?.year);
  const quarter = req.path.endsWith('generate-quarter') ? Number(req.body?.quarter) : null;
  try { getPlanningMonths(year, quarter); }
  catch (error) { return res.status(400).json({ ok: false, error: error.message }); }
  try {
    const result = await generatePeriodDrafts({ year, quarter, note: req.body?.note,
      title: req.body?.title, description: req.body?.description,
      createdBy: req.user?.displayName || req.user?.email || req.user?.loginName || 'system', ownerId: getAuthenticatedUserId(req),
      pool, generateMonth: generateShiftPlan });
    res.json(result);
  } catch (error) {
    console.error('Period generation error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
