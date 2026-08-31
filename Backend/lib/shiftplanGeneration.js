/* ================================================ */
/* Shiftplan Generation Helpers                     */
/* ================================================ */

export function normalizePlanningShiftTypeKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === 'e' || normalized === 'early') return 'early';
  if (normalized === 'l' || normalized === 'late') return 'late';
  if (normalized === 'n' || normalized === 'night') return 'night';

  return normalized;
}

export function normalizeApplicableDays(value) {
  if (Array.isArray(value)) {
    return [...new Set(value
      .map((entry) => Number.parseInt(String(entry), 10))
      .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6))];
  }

  if (typeof value === 'string') {
    try {
      return normalizeApplicableDays(JSON.parse(value));
    } catch {
      return [0, 1, 2, 3, 4, 5, 6];
    }
  }

  return [0, 1, 2, 3, 4, 5, 6];
}

export function isShiftDefinitionApplicable(definition, dayOfWeek) {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return true;
  return normalizeApplicableDays(definition?.applicable_days).includes(dayOfWeek);
}

export function buildStaffingRulesByShiftType(rows = []) {
  const rules = {};

  for (const row of rows) {
    const key = normalizePlanningShiftTypeKey(row?.shift_type);
    if (!key) continue;
    const minCount = Number.parseInt(String(row?.min_count ?? 0), 10);
    if (!Number.isFinite(minCount) || minCount < 0) continue;
    rules[key] = Math.max(rules[key] || 0, minCount);
  }

  return rules;
}

export function buildShiftSlots(shiftDefinitions = [], staffingRules = {}, dayOfWeek = null) {
  const effectiveDefinitions = Number.isInteger(dayOfWeek)
    ? shiftDefinitions.filter((definition) => isShiftDefinitionApplicable(definition, dayOfWeek))
    : shiftDefinitions;
  const groupedDefinitions = new Map();

  for (const definition of effectiveDefinitions) {
    const typeKey = normalizePlanningShiftTypeKey(definition?.shift_type) || String(definition?.shift_type || 'other');
    if (!groupedDefinitions.has(typeKey)) groupedDefinitions.set(typeKey, []);
    groupedDefinitions.get(typeKey).push(definition);
  }

  const slotCounts = new Map();

  for (const definitions of groupedDefinitions.values()) {
    let baseCount = 0;
    for (const definition of definitions) {
      const minStaff = Math.max(Number.parseInt(String(definition?.min_staff ?? 0), 10) || 0, 0);
      slotCounts.set(definition.code, minStaff);
      baseCount += minStaff;
    }

    const typeKey = normalizePlanningShiftTypeKey(definitions[0]?.shift_type);
    const targetCount = Math.max(baseCount, Number.parseInt(String(staffingRules[typeKey] ?? 0), 10) || 0);
    let remaining = targetCount - baseCount;

    while (remaining > 0) {
      let placedExtraSlot = false;

      for (const definition of definitions) {
        if (remaining <= 0) break;

        const maxStaff = Math.max(Number.parseInt(String(definition?.max_staff ?? 0), 10) || 0, 0);
        const current = slotCounts.get(definition.code) || 0;

        if (maxStaff > 0 && current >= maxStaff) continue;

        slotCounts.set(definition.code, current + 1);
        remaining -= 1;
        placedExtraSlot = true;
      }

      if (!placedExtraSlot) break;
    }
  }

  return effectiveDefinitions.map((definition) => ({
    ...definition,
    planned_slots: slotCounts.get(definition.code) || 0,
  }));
}

export function getShiftDurationHours(definition) {
  const parsed = Number.parseFloat(String(definition?.duration_hours ?? 8));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

const WEEKDAY_ALIASES = new Map([
  ['0', 0], ['7', 0], ['so', 0], ['sonntag', 0], ['sunday', 0], ['sun', 0],
  ['1', 1], ['mo', 1], ['montag', 1], ['monday', 1], ['mon', 1],
  ['2', 2], ['di', 2], ['dienstag', 2], ['tuesday', 2], ['tue', 2],
  ['3', 3], ['mi', 3], ['mittwoch', 3], ['wednesday', 3], ['wed', 3],
  ['4', 4], ['do', 4], ['donnerstag', 4], ['thursday', 4], ['thu', 4],
  ['5', 5], ['fr', 5], ['freitag', 5], ['friday', 5], ['fri', 5],
  ['6', 6], ['sa', 6], ['samstag', 6], ['saturday', 6], ['sat', 6],
]);

export function normalizePreferenceDayValues(value) {
  const entries = Array.isArray(value) ? value : [];
  const days = new Set();

  for (const entry of entries) {
    const raw = String(entry ?? '').trim();
    if (!raw) continue;
    const key = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\.$/, '');
    if (WEEKDAY_ALIASES.has(key)) {
      days.add(WEEKDAY_ALIASES.get(key));
      continue;
    }

    const parsed = Number.parseInt(key, 10);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 7) {
      days.add(parsed === 7 ? 0 : parsed);
    }
  }

  return [...days].sort((left, right) => left - right);
}

export function isDayBlockedByEmployeePreference(preferences, dayOfWeekIndex) {
  if (!preferences || !Number.isInteger(dayOfWeekIndex)) return false;
  return normalizePreferenceDayValues(preferences.blocked_days).includes(dayOfWeekIndex);
}

export function getMonthBoundarySeriesRemaining({ definition, monthStartDayOfWeek } = {}) {
  const configuredSeriesDays = getShiftSeriesDays(definition);
  if (configuredSeriesDays <= 1) return 0;

  const startDow = Number(monthStartDayOfWeek);
  if (!Number.isInteger(startDow) || startDow < 0 || startDow > 6 || startDow === 1) return 0;

  const applicableDays = new Set(normalizeApplicableDays(definition?.applicable_days));
  let remaining = 0;
  for (let offset = 0; offset < configuredSeriesDays; offset++) {
    const currentDow = (startDow + offset) % 7;
    if (offset > 0 && currentDow === 1) break;
    if (!applicableDays.has(currentDow)) break;
    remaining += 1;
  }

  return remaining;
}

const HALF_DAY_SHIFT_CODE_PATTERN = /^H[EL]\d+$/i;
const NON_DRAFT_SHIFT_CODES = new Set(['ABW', 'FS', 'S', 'SEMINAR']);

export function isHalfDayShiftCode(code) {
  return HALF_DAY_SHIFT_CODE_PATTERN.test(String(code || '').trim());
}

export function isShiftDefinitionDraftPlannable(definition) {
  const code = String(definition?.code || '').trim().toUpperCase();
  const typeKey = normalizePlanningShiftTypeKey(definition?.shift_type);

  if (!code) return false;
  if (isHalfDayShiftCode(code)) return false;
  if (NON_DRAFT_SHIFT_CODES.has(code)) return false;
  if (typeKey === 'free' || typeKey === 'absent') return false;

  return true;
}

export function getShiftSeriesDays(definition) {
  const parsed = Number.parseInt(String(definition?.series_days ?? 1), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

const FIXED_SHIFT_SERIES_PATTERNS = {
  E1SA: { series_days: 6, applicable_days: [1, 2, 3, 4, 5, 6] },
  E1WE: { series_days: 7, applicable_days: [1, 2, 3, 4, 5, 6, 0] },
  L1WE: { series_days: 7, applicable_days: [1, 2, 3, 4, 5, 6, 0] },
};

const MONDAY_ANCHORED_SHIFT_CODES = new Set(['E1SA', 'E1WE', 'L1WE', 'N', 'DBS']);

export function applyFixedShiftSeriesPattern(definition) {
  const code = String(definition?.code || '').trim().toUpperCase();
  const pattern = FIXED_SHIFT_SERIES_PATTERNS[code];
  return pattern ? { ...definition, ...pattern } : definition;
}

export function canStartShiftSeries({ day, dayOfWeek, definition } = {}) {
  if (getShiftSeriesDays(definition) <= 1) return true;
  const code = String(definition?.code || '').trim().toUpperCase();
  if (!MONDAY_ANCHORED_SHIFT_CODES.has(code)) return true;
  return Number(dayOfWeek) === 1;
}

export function getTargetHoursScore({ currentHours = 0, targetHours = 174 } = {}) {
  const remaining = Number(targetHours) - Number(currentHours);
  if (!Number.isFinite(remaining)) return 0;
  if (remaining > 0) return 100_000 + remaining * 100;
  return remaining * 12;
}

export function getPreferenceShiftCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (normalized === 'E1SA' || normalized === 'E1WE') return 'E1';
  if (normalized === 'L1WE') return 'L1';
  return normalized;
}

function getPreferenceShiftType(code) {
  const normalized = getPreferenceShiftCode(code);
  if (normalized === 'E1' || normalized === 'E2' || normalized === 'EARLY' || normalized === 'FRUEH') return 'early';
  if (normalized === 'L1' || normalized === 'L2' || normalized === 'LATE' || normalized === 'SPAET') return 'late';
  if (normalized === 'N' || normalized === 'NIGHT' || normalized === 'NACHT') return 'night';
  return null;
}

export function getExclusivePreferredShiftType(preferences) {
  const preferredTypes = new Set(
    (Array.isArray(preferences?.preferred_shifts) ? preferences.preferred_shifts : [])
      .map(getPreferenceShiftType)
      .filter(Boolean)
  );
  if (preferredTypes.size !== 1) return null;

  const [preferredType] = preferredTypes;
  const unwantedTypes = new Set(
    (Array.isArray(preferences?.unwanted_shifts) ? preferences.unwanted_shifts : [])
      .map(getPreferenceShiftType)
      .filter(Boolean)
  );
  const otherTypes = ['early', 'late', 'night'].filter((type) => type !== preferredType);
  return otherTypes.every((type) => unwantedTypes.has(type)) ? preferredType : null;
}

export function getDeterministicRotationRank({ employee, year, month, weekKey, shiftCode } = {}) {
  const seed = [year, month, weekKey, shiftCode, employee]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .join('|');
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isNightShiftRefused(preferences) {
  const unwanted = Array.isArray(preferences?.unwanted_shifts)
    ? preferences.unwanted_shifts.map((code) => String(code || '').trim().toUpperCase())
    : [];
  return unwanted.includes('N') || unwanted.includes('NIGHT') || unwanted.includes('NACHT');
}

export function rankSafeSubstituteCandidates({
  candidates = [],
  shiftType,
  shiftCode,
  coverageDays = [],
  weekendDays = [],
  limit = 3,
} = {}) {
  const normalizedType = normalizePlanningShiftTypeKey(shiftType);
  const requiredDays = new Set(coverageDays.map(Number));
  const requiredWeekendDays = new Set(weekendDays.map(Number));

  return candidates
    .map((candidate) => {
      const assignments = new Set((candidate.assignmentDays || []).map(Number));
      const absences = new Set((candidate.absenceDays || []).map(Number));
      const recoveryDays = new Set((candidate.recoveryDays || []).map(Number));
      const preferences = candidate.preferences || {};
      const fixedShiftType = normalizePlanningShiftTypeKey(candidate.fixedShiftType);

      if ([...requiredDays].some((day) => assignments.has(day))) return null;
      if ([...requiredDays].some((day) => absences.has(day))) return null;
      if ([...requiredDays].some((day) => recoveryDays.has(day))) return null;
      if (fixedShiftType && fixedShiftType !== normalizedType) return null;
      if (normalizedType === 'night' && isNightShiftRefused(preferences)) return null;

      const maxNights = Number.parseInt(String(preferences.max_nights_per_month ?? ''), 10);
      if (normalizedType === 'night' && Number.isInteger(maxNights)) {
        const projectedNights = Number(candidate.currentNights || 0) + requiredDays.size;
        if (projectedNights > maxNights) return null;
      }

      const blockedDays = new Set(normalizePreferenceDayValues(preferences.blocked_days));
      const weekendException = [...requiredWeekendDays].some((day) => blockedDays.has(Number(candidate.dayOfWeekByDay?.[day])));
      const wellbeingScore = Number(candidate.wellbeingScore || 0);
      const preferred = new Set((Array.isArray(preferences.preferred_shifts) ? preferences.preferred_shifts : []).map(getPreferenceShiftCode));
      const preferredMatch = preferred.has(getPreferenceShiftCode(shiftCode)) || preferred.has(normalizedType);
      const hoursDelta = Number(candidate.currentHours || 0) - Number(candidate.targetHours || 0);
      const score = wellbeingScore * 100 + Math.max(hoursDelta, 0) * 2 + (preferredMatch ? -2500 : 0) + (weekendException ? 10000 : 0);

      return {
        employee: candidate.employee,
        score,
        wellbeingScore,
        weekendException,
        reasons: [
          'Keine bestehende Schicht wird durch den Einsatz unterbesetzt',
          `Wellbeing-Belastung: ${wellbeingScore}`,
          ...(preferredMatch ? ['Entspricht dem hinterlegten Schichtwunsch'] : []),
          hoursDelta < 0 ? `${Math.abs(hoursDelta).toFixed(1)} Stunden unter Soll` : `${hoursDelta.toFixed(1)} Stunden über Soll`,
          ...(weekendException ? ['Ausnahme: widerspricht dem Wochenendwunsch'] : []),
        ],
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.score - right.score || String(left.employee).localeCompare(String(right.employee), 'de'))
    .slice(0, Math.max(Number(limit) || 0, 0));
}

export function getShiftContinuityAdjustment({
  previousCode,
  previousType,
  previousDay,
  nextCode,
  nextType,
  day,
} = {}) {
  const gapDays = Number(day) - Number(previousDay);
  if (!previousCode || !previousType || !Number.isFinite(gapDays) || gapDays < 1 || gapDays > 7) {
    return { score: 0, reason: null };
  }

  if (String(previousCode).trim().toUpperCase() === String(nextCode || '').trim().toUpperCase()) {
    return { score: 100, reason: `Schichtkontinuität: ${nextCode} aus dem letzten Block fortgeführt` };
  }

  if (normalizePlanningShiftTypeKey(previousType) === normalizePlanningShiftTypeKey(nextType)) {
    return { score: 50, reason: `Schichtkontinuität: gleiche Schichtart ${nextType}` };
  }

  return { score: -50, reason: `Schichtwechsel gegenüber dem letzten Block (${previousType} -> ${nextType})` };
}

export function buildDailyShiftSlots({
  shiftDefinitions = [],
  staffingRules = {},
  activeEmployees = [],
  employeeHours = {},
  employeeTargetHours = {},
  monthlyTargetHours = 174,
  day = 1,
  numDays = 31,
  dayOfWeek = null,
} = {}) {
  const baseSlots = buildShiftSlots(shiftDefinitions, staffingRules, dayOfWeek);
  const baselineTotalSlots = baseSlots.reduce((sum, definition) => sum + (definition.planned_slots || 0), 0);
  const avgShiftHours = baseSlots.length > 0
    ? baseSlots.reduce((sum, definition) => sum + getShiftDurationHours(definition), 0) / baseSlots.length
    : 8;

  const targetHoursPerEmployee = Number.parseFloat(String(monthlyTargetHours ?? 174));
  const sanitizedTargetHours = Number.isFinite(targetHoursPerEmployee) && targetHoursPerEmployee >= 0
    ? targetHoursPerEmployee
    : 174;
  const targetHoursByEmployee = Object.fromEntries(activeEmployees.map((employee) => {
    const rawEmployeeTarget = Number.parseFloat(String(employeeTargetHours?.[employee] ?? ''));
    const employeeTarget = Number.isFinite(rawEmployeeTarget) && rawEmployeeTarget >= 0
      ? rawEmployeeTarget
      : sanitizedTargetHours;
    return [employee, employeeTarget];
  }));
  const remainingHours = activeEmployees.reduce((sum, employee) => {
    return sum + Math.max(targetHoursByEmployee[employee] - (employeeHours[employee] || 0), 0);
  }, 0);
  const remainingDays = Math.max(numDays - day + 1, 1);
  const isBlockStart = Number(day) === 1 || Number(dayOfWeek) === 1;
  let desiredTotalSlots = Math.ceil(remainingHours / remainingDays / avgShiftHours);

  if (isBlockStart && baseSlots.some((definition) => getShiftSeriesDays(definition) > 1)) {
    const futureBlockStartOffsets = [];
    if (Number(day) === 1 && Number(dayOfWeek) !== 1) futureBlockStartOffsets.push(0);
    for (let offset = 0; offset < remainingDays; offset++) {
      if ((Number(dayOfWeek) + offset) % 7 === 1) futureBlockStartOffsets.push(offset);
    }

    const futureBlockCapacities = futureBlockStartOffsets.map((offset) => {
      const startDay = day + offset;
      const startDayOfWeek = (Number(dayOfWeek) + offset) % 7;
      const definitionsForStart = shiftDefinitions.filter((definition) => isShiftDefinitionApplicable(definition, startDayOfWeek));
      const definitionHours = definitionsForStart.map((definition) => {
        const applicableDays = new Set(normalizeApplicableDays(definition?.applicable_days));
        const maxSeriesDays = Math.min(getShiftSeriesDays(definition), numDays - startDay + 1);
        let effectiveSeriesDays = 0;
        for (let seriesOffset = 0; seriesOffset < maxSeriesDays; seriesOffset++) {
          const seriesDayOfWeek = (startDayOfWeek + seriesOffset) % 7;
          if (!applicableDays.has(seriesDayOfWeek)) break;
          effectiveSeriesDays += 1;
        }
        return getShiftDurationHours(definition) * Math.max(effectiveSeriesDays, 1);
      });
      const averageHours = definitionHours.reduce((sum, hours) => sum + hours, 0) / Math.max(definitionHours.length, 1);
      return {
        averageHours: Math.max(averageHours, avgShiftHours),
        maximumHours: Math.max(...definitionHours, avgShiftHours),
      };
    });
    const futureBlockHourCapacity = futureBlockCapacities.reduce((sum, entry) => sum + entry.averageHours, 0);

    desiredTotalSlots = Math.ceil(remainingHours / Math.max(futureBlockHourCapacity, avgShiftHours));

    const maximumHoursAfterCurrentBlock = futureBlockCapacities
      .slice(1)
      .reduce((sum, entry) => sum + entry.maximumHours, 0);
    const mandatoryStarts = activeEmployees.filter((employee) => {
      const remainingEmployeeHours = Math.max(targetHoursByEmployee[employee] - (employeeHours[employee] || 0), 0);
      return remainingEmployeeHours > maximumHoursAfterCurrentBlock;
    }).length;
    desiredTotalSlots = Math.max(desiredTotalSlots, mandatoryStarts);
  }
  const employeeCapacity = Math.max(activeEmployees.length, baselineTotalSlots);
  const clampedTargetSlots = Math.max(baselineTotalSlots, Math.min(employeeCapacity, desiredTotalSlots));
  let remainingExtraSlots = Math.max(clampedTargetSlots - baselineTotalSlots, 0);

  const slotCounts = new Map(baseSlots.map((definition) => [definition.code, definition.planned_slots || 0]));

  while (remainingExtraSlots > 0) {
    let placedExtraSlot = false;

    for (const definition of baseSlots) {
      if (remainingExtraSlots <= 0) break;

      const maxStaff = Number.parseInt(String(definition?.max_staff ?? definition?.planned_slots ?? 0), 10);
      const normalizedMaxStaff = Number.isFinite(maxStaff) && maxStaff > 0 ? maxStaff : (definition.planned_slots || 0);
      const currentCount = slotCounts.get(definition.code) || 0;

      if (currentCount >= normalizedMaxStaff) continue;

      slotCounts.set(definition.code, currentCount + 1);
      remainingExtraSlots -= 1;
      placedExtraSlot = true;
    }

    if (!placedExtraSlot) break;
  }

  // max_staff is the preferred operational staffing level. Contracted hours
  // can require additional people on a shift when the team is larger.
  while (remainingExtraSlots > 0 && baseSlots.length > 0) {
    const orderedDefinitions = [...baseSlots].sort((left, right) => {
      const countDiff = (slotCounts.get(left.code) || 0) - (slotCounts.get(right.code) || 0);
      if (countDiff !== 0) return countDiff;
      return String(left.code || '').localeCompare(String(right.code || ''), 'de');
    });

    for (const definition of orderedDefinitions) {
      if (remainingExtraSlots <= 0) break;
      slotCounts.set(definition.code, (slotCounts.get(definition.code) || 0) + 1);
      remainingExtraSlots -= 1;
    }
  }

  return baseSlots.map((definition) => ({
    ...definition,
    planned_slots: slotCounts.get(definition.code) || 0,
  }));
}
