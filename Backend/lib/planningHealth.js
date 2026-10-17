/* ================================================ */
/* Planning health check                            */
/* Finds settings that contradict each other or     */
/* the wishes of the employees, before a plan is    */
/* generated. Pure function: the route loads the    */
/* data, this module only evaluates it.             */
/* ================================================ */

import { normalizeColoPlanningConfig, getMaxColoStaffPerDay } from './coloPlanning.js';
import { isHardStrength, isIgnoredStrength } from './preferenceStrength.js';

const TYPE_LABEL_DE = { early: 'Frühschicht', late: 'Spätschicht', night: 'Nachtschicht' };
const TYPE_LABEL_EN = { early: 'early shift', late: 'late shift', night: 'night shift' };
const AVERAGE_NIGHT_HOURS = 8.5;

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function codeType(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (['E1', 'E2', 'E1SA', 'E1WE', 'E2SA', 'E2WE', 'EARLY'].includes(normalized)) return 'early';
  if (['L1', 'L2', 'L1WE', 'LATE'].includes(normalized)) return 'late';
  if (['N', 'NK', 'NS', 'NIGHT'].includes(normalized)) return 'night';
  return null;
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Shift types an employee can work at all, from the wishes that are binding (strength 100 %).
 * Returns the set of allowed types, or null when nothing restricts the employee.
 */
export function getAllowedShiftTypes(preference, strengths) {
  const preferredBinding = isHardStrength(strengths.preferred_shifts);
  const unwantedBinding = isHardStrength(strengths.unwanted_shifts);
  const allTypes = ['early', 'late', 'night'];
  let allowed = new Set(allTypes);
  let restricted = false;

  const preferred = asList(preference?.preferred_shifts).map(codeType).filter(Boolean);
  if (preferredBinding && preferred.length > 0) {
    allowed = new Set(preferred);
    restricted = true;
  }
  if (unwantedBinding) {
    const unwantedCodes = asList(preference?.unwanted_shifts).map((code) => String(code || '').trim().toUpperCase());
    // A type is only excluded when every shift of the type is unwanted (E1 and E2, L1 and L2) or the night shift is.
    const excluded = new Set();
    if (unwantedCodes.includes('N') || unwantedCodes.includes('NIGHT')) excluded.add('night');
    if (unwantedCodes.includes('E1') && unwantedCodes.includes('E2')) excluded.add('early');
    if (unwantedCodes.includes('L1') && unwantedCodes.includes('L2')) excluded.add('late');
    for (const type of excluded) {
      allowed.delete(type);
      restricted = true;
    }
  }
  return restricted ? allowed : null;
}

export function analyzePlanningHealth({
  rotation = null,
  planConfig = null,
  wishStrengths = {},
  staffingRules = [],
  dayLimits = [],
  preferences = [],
  employeeCount = 0,
  dbsConfig = { enabled: false, shiftCode: 'DBS' },
  dbsPool = [],
  coloConfig = {},
  weekendsPerMonth = 4,
} = {}) {
  const issues = [];
  const add = (id, level, area, messageDe, messageEn) => issues.push({ id, level, area, messageDe, messageEn });
  const strengths = {
    unwanted_shifts: 100, preferred_shifts: 100, holidays: 100, blocked_days: 100, max_nights: 100, max_weekends: 100, colleagues: 50,
    ...wishStrengths,
  };
  const wishesEnabled = planConfig ? planConfig.respect_employee_wishes !== false : true;

  /* ---------- staffing numbers contradicting themselves ---------- */
  const maximumByType = {};
  const minimumByType = {};
  for (const row of staffingRules) {
    const type = String(row.shift_type || '').toLowerCase();
    const min = toInt(row.min_count, 0);
    const max = row.max_count === null || row.max_count === undefined || row.max_count === '' ? null : toInt(row.max_count, 0);
    minimumByType[type] = min;
    maximumByType[type] = max;
    if (max !== null && max < min) {
      add(`staffing-min-max-${type}`, 'error', 'staffing',
        `${TYPE_LABEL_DE[type] || type}: Die Maximalbesetzung (${max}) ist kleiner als die Mindestbesetzung (${min}).`,
        `${TYPE_LABEL_EN[type] || type}: maximum staffing (${max}) is below minimum staffing (${min}).`);
    }
  }
  for (const row of dayLimits) {
    const min = toInt(row.min_count, 0);
    const max = row.max_count === null || row.max_count === undefined || row.max_count === '' ? null : toInt(row.max_count, 0);
    if (max !== null && max < min) {
      add(`daylimit-min-max-${row.day_context}-${row.shift_type}`, 'error', 'staffing',
        `Besetzung ${row.day_context} / ${TYPE_LABEL_DE[row.shift_type] || row.shift_type}: Maximum (${max}) kleiner als Minimum (${min}).`,
        `Staffing ${row.day_context} / ${TYPE_LABEL_EN[row.shift_type] || row.shift_type}: maximum (${max}) below minimum (${min}).`);
    }
  }

  /* ---------- wishes: master switch and strengths ---------- */
  if (!wishesEnabled) {
    add('wishes-master-off', 'warning', 'wishes',
      'Mitarbeiterwünsche sind ausgeschaltet: Wunschschichten, Sperrtage, Feiertags- und Kollegenwünsche werden nicht beachtet, egal wie die Wunsch-Stärken eingestellt sind.',
      'Employee wishes are switched off: preferred shifts, blocked weekdays, holiday and colleague wishes are ignored, whatever the wish strengths say.');
  } else if (Object.values({ ...strengths }).every((value) => isIgnoredStrength(value))) {
    add('wishes-all-ignored', 'warning', 'wishes',
      'Alle Wunsch-Stärken stehen auf 0 %: Mitarbeiterwünsche haben keine Wirkung.',
      'All wish strengths are 0 %: employee wishes have no effect.');
  }

  /* ---------- wishes against the staffing maximum ---------- */
  if (wishesEnabled && preferences.length > 0) {
    const exclusiveCount = { early: 0, late: 0, night: 0 };
    const exclusiveNames = { early: [], late: [], night: [] };
    for (const preference of preferences) {
      const allowed = getAllowedShiftTypes(preference, strengths);
      if (allowed && allowed.size === 1) {
        const [type] = [...allowed];
        exclusiveCount[type] += 1;
        exclusiveNames[type].push(preference.name || '');
      }
    }
    for (const type of ['early', 'late', 'night']) {
      const max = maximumByType[type];
      if (max !== null && max !== undefined && exclusiveCount[type] > max) {
        add(`wish-exclusive-${type}`, 'warning', 'wishes',
          `${exclusiveCount[type]} Mitarbeitende können laut verbindlichem Wunsch nur ${TYPE_LABEL_DE[type]} arbeiten, die Maximalbesetzung liegt aber bei ${max} pro Tag. Nicht alle können ihre Sollstunden erreichen – Maximalbesetzung erhöhen oder die Wünsche lockern.`,
          `${exclusiveCount[type]} employees can only work the ${TYPE_LABEL_EN[type]} because of binding wishes, but the maximum is ${max} per day. Not everybody can reach their target hours – raise the maximum or relax the wishes.`);
      }
    }
    const nightLimit = toInt(rotation?.max_nights_per_month, 0);
    const monthlyTarget = Number(planConfig?.monthly_target_hours) || 174;
    if (exclusiveCount.night > 0 && nightLimit > 0 && nightLimit * AVERAGE_NIGHT_HOURS < monthlyTarget * 0.8) {
      add('wish-night-only-limit', 'warning', 'wishes',
        `${exclusiveCount.night} Mitarbeitende wünschen ausschließlich Nachtschichten. Das Nachtlimit von ${nightLimit} pro Monat erlaubt nur etwa ${Math.round(nightLimit * AVERAGE_NIGHT_HOURS)} Stunden gegenüber ${monthlyTarget} Stunden Soll. Limit erhöhen oder Wünsche anpassen.`,
        `${exclusiveCount.night} employees wish for night shifts only. The night limit of ${nightLimit} per month allows about ${Math.round(nightLimit * AVERAGE_NIGHT_HOURS)} hours against a target of ${monthlyTarget}. Raise the limit or adjust the wishes.`);
    }

    /* night demand against the people who can and may work nights */
    const nightMin = minimumByType.night ?? 0;
    if (nightMin > 0 && nightLimit > 0) {
      const needed = nightMin * 30;
      const nightCapable = preferences.filter((preference) => {
        const allowed = getAllowedShiftTypes(preference, strengths);
        return !allowed || allowed.has('night');
      }).length + Math.max(employeeCount - preferences.length, 0);
      if (nightCapable * nightLimit < needed) {
        add('night-demand-capacity', 'error', 'rules',
          `Für die Mindestbesetzung der Nacht (${nightMin} pro Nacht, rund ${needed} Nachtdienste im Monat) stehen nur ${nightCapable} Mitarbeitende mit je höchstens ${nightLimit} Nächten zur Verfügung (${nightCapable * nightLimit}). Nachtlimit erhöhen, Mindestbesetzung senken oder mehr Mitarbeitende für Nächte freigeben.`,
          `The night minimum (${nightMin} per night, about ${needed} night shifts a month) can only be met by ${nightCapable} employees with at most ${nightLimit} nights each (${nightCapable * nightLimit}). Raise the night limit, lower the minimum or release more employees for nights.`);
      }
    }

    /* blocked weekdays */
    if (!isIgnoredStrength(strengths.blocked_days)) {
      const heavy = preferences.filter((preference) => asList(preference.blocked_days).length >= 4);
      if (heavy.length > 0) {
        add('blocked-days-heavy', 'warning', 'wishes',
          `${heavy.length} Mitarbeitende haben vier oder mehr Wochentage gesperrt (${heavy.slice(0, 3).map((entry) => entry.name).filter(Boolean).join(', ')}${heavy.length > 3 ? ' …' : ''}). Ihre Sollstunden sind kaum erreichbar.`,
          `${heavy.length} employees blocked four or more weekdays. Their target hours can hardly be reached.`);
      }
    }
  }

  /* ---------- weekend demand against the weekend limit ---------- */
  if (rotation) {
    const maxWeekends = toInt(rotation.max_weekends_per_month, 0);
    const minFreeWeekends = toInt(rotation.min_free_weekends_per_month, 0);
    if (maxWeekends > 0 && minFreeWeekends > weekendsPerMonth - maxWeekends) {
      add('weekends-free-vs-max', 'warning', 'rules',
        `Widerspruch bei Wochenenden: höchstens ${maxWeekends} Wochenenden Arbeit, aber mindestens ${minFreeWeekends} freie Wochenenden gewünscht – in einem Monat mit ${weekendsPerMonth} Wochenenden geht beides nicht gleichzeitig.`,
        `Weekend settings contradict each other: at most ${maxWeekends} weekends of work but at least ${minFreeWeekends} free weekends, which is impossible in a month with ${weekendsPerMonth} weekends.`);
    }
    if (maxWeekends > 0 && employeeCount > 0) {
      const satTotal = (dayLimits.filter((row) => row.day_context === 'saturday').reduce((sum, row) => sum + toInt(row.min_count, 0), 0));
      const sunTotal = (dayLimits.filter((row) => row.day_context === 'sunday').reduce((sum, row) => sum + toInt(row.min_count, 0), 0));
      const perWeekend = Math.max(satTotal, sunTotal) + (minimumByType.night ?? 0);
      const need = perWeekend * weekendsPerMonth;
      if (perWeekend > 0 && need > employeeCount * maxWeekends) {
        add('weekend-demand-capacity', 'error', 'rules',
          `Das Wochenende braucht ${perWeekend} Personen (Früh/Spät/Nacht), das sind ${need} Wochenend-Einsätze im Monat. Bei ${employeeCount} Mitarbeitenden und höchstens ${maxWeekends} Wochenenden pro Person sind nur ${employeeCount * maxWeekends} möglich.`,
          `Weekends need ${perWeekend} people (early/late/night), i.e. ${need} weekend duties a month. With ${employeeCount} employees and at most ${maxWeekends} weekends each only ${employeeCount * maxWeekends} are possible.`);
      }
    }
    if (rotation.late_before_night_required) {
      add('late-before-night', 'error', 'rules',
        'Die Regel „Spätschicht vor Nachtschicht erzwingen" widerspricht den 7-Tage-Nachtblöcken: Ein Nachtblock beginnt immer montags, der Sonntag davor ist aber frei. Es kommen kaum Nachtblöcke zustande.',
        'The rule "late shift before night shift" contradicts seven-night blocks: a night block always starts on Monday while the Sunday before is off. Hardly any night blocks can be planned.');
    }
  }

  /* ---------- DBS ---------- */
  if (dbsConfig.enabled) {
    if (dbsPool.length === 0) {
      add('dbs-pool-empty', 'error', 'special', 'DBS ist aktiv, aber der DBS-Pool ist leer: Es kann keine DBS-Woche geplant werden.', 'DBS is active but the DBS pool is empty: no DBS week can be planned.');
    } else if (dbsPool.length === 1) {
      add('dbs-pool-single', 'warning', 'special', 'Im DBS-Pool ist nur eine Person: Sie müsste jede Woche DBS machen, die Rotation greift nicht.', 'Only one person is in the DBS pool: they would have to cover DBS every week, there is no rotation.');
    }
    for (const entry of dbsPool) {
      const weekdays = asList(entry.working_weekdays);
      if (weekdays.length === 0) {
        add(`dbs-no-days-${entry.employee_name}`, 'error', 'special', `${entry.employee_name} ist im DBS-Pool, hat aber keinen einzigen Arbeitstag im DBS-Block.`, `${entry.employee_name} is in the DBS pool but has no working day in the DBS block.`);
      }
      const preference = preferences.find((candidate) => candidate.name === entry.employee_name);
      if (preference && !isIgnoredStrength(strengths.blocked_days)) {
        const blockedInPattern = asList(preference.blocked_days).map(Number).filter((day) => weekdays.map(Number).includes(day));
        if (blockedInPattern.length > 0) {
          add(`dbs-blocked-${entry.employee_name}`, 'warning', 'special',
            `${entry.employee_name} hat Wochentage gesperrt, die zum DBS-Block gehören. Die DBS-Woche kann nie vollständig geplant werden.`,
            `${entry.employee_name} blocked weekdays that belong to the DBS block. The DBS week can never be planned completely.`);
        }
      }
      const outside = asList(entry.other_shift_codes).map((code) => String(code).toUpperCase());
      if (outside.includes('NIGHT')) {
        add(`dbs-outside-night-${entry.employee_name}`, 'info', 'special',
          `${entry.employee_name}: Außerhalb von DBS sind keine 7-Tage-Blöcke erlaubt. Die Auswahl „Nachtschicht" gilt daher nur für kurze Nachtblöcke.`,
          `${entry.employee_name}: no seven-day blocks outside DBS. The "night shift" choice only applies to short night blocks.`);
      }
    }
  }

  /* ---------- Colo ---------- */
  const colo = normalizeColoPlanningConfig(coloConfig);
  if (colo.enabled) {
    if (colo.requirements.length === 0) {
      add('colo-no-requirements', 'warning', 'special', 'Colo-Planung ist aktiv, aber es ist kein Bedarf eingetragen (Tage, Schicht, Anzahl).', 'Colo planning is active but no demand (days, shift, head count) is entered.');
    }
    const needed = getMaxColoStaffPerDay(colo);
    if (needed > colo.employeePool.length) {
      add('colo-pool-too-small', 'error', 'special',
        `An einem Tag werden bis zu ${needed} Colo-Mitarbeitende gleichzeitig gebraucht, im Pool sind aber nur ${colo.employeePool.length}.`,
        `Up to ${needed} Colo employees are needed on one day, but the pool has only ${colo.employeePool.length}.`);
    }
    for (const requirement of colo.requirements) {
      const typeMax = maximumByType[requirement.shift_type];
      if (typeMax !== null && typeMax !== undefined && requirement.staff > typeMax) {
        add(`colo-requirement-${requirement.id}`, 'error', 'special',
          `Colo-Bedarf ${requirement.staff} Personen in der ${TYPE_LABEL_DE[requirement.shift_type]} ist größer als die Maximalbesetzung dieser Schicht (${typeMax}).`,
          `Colo demand of ${requirement.staff} people in the ${TYPE_LABEL_EN[requirement.shift_type]} exceeds the maximum staffing of that shift (${typeMax}).`);
      }
    }
    const refusing = preferences.filter((preference) => colo.employeePool.includes(preference.name)
      && asList(preference.unwanted_shifts).map((code) => String(code).toUpperCase()).includes('COLO'));
    if (refusing.length > 0) {
      add('colo-pool-refusing', 'info', 'special',
        `${refusing.length} Mitarbeitende im Colo-Pool haben COLO als unerwünscht markiert und werden nicht für Colo eingeteilt.`,
        `${refusing.length} employees in the Colo pool marked COLO as unwanted and will not be planned for Colo.`);
    }
  }

  /* ---------- shift definitions versus rotation ---------- */
  if (rotation) {
    if (toInt(rotation.max_consecutive_workdays, 0) > 0 && toInt(rotation.max_consecutive_workdays, 0) < 5) {
      add('workdays-below-week', 'warning', 'rules',
        `„Maximale Arbeitstage in Folge" steht auf ${rotation.max_consecutive_workdays}: Eine normale Arbeitswoche (Mo–Fr = 5 Tage) ist damit nicht möglich.`,
        `"Maximum consecutive workdays" is ${rotation.max_consecutive_workdays}: a normal working week (Mon–Fri = 5 days) is not possible.`);
    }
  }

  return issues.sort((left, right) => {
    const rank = { error: 0, warning: 1, info: 2 };
    return (rank[left.level] ?? 3) - (rank[right.level] ?? 3);
  });
}
