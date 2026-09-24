const NON_WORKING_SHIFT_CODES = new Set(['FS', 'ABW', 'S', 'URLAUB', 'KRANK', 'SEMINAR']);

// Colo business rules:
// - Mon-Fri early: preparation and e-mail/phone traffic with the exchange.
// - Every night: line preparation (Mon-Thu) and execution (Fri-Sun).
// - Sat/Sun early: one person for on-site Colo work during the day.
const TASK_DEFINITIONS = {
  preparation: { label: 'Colo Vorbereitung (Börse: E-Mail/Telefon)', weekdays: [1, 2, 3, 4, 5], shiftType: 'early' },
  night: { label: 'Colo Nacht', weekdays: [0, 1, 2, 3, 4, 5, 6], shiftType: 'night' },
  weekend: { label: 'Colo Wochenende (Arbeiten vor Ort)', weekdays: [0, 6], shiftType: 'early' },
};

function taskLabel(taskKey, weekday) {
  if (taskKey === 'night') {
    return [1, 2, 3, 4].includes(weekday) ? 'Colo Nacht – Leitungsvorbereitung' : 'Colo Nacht – Ausführung';
  }
  return TASK_DEFINITIONS[taskKey]?.label || 'Colo';
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  return fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseEmployeePool(value) {
  let entries = value;
  if (typeof value === 'string') {
    try {
      entries = JSON.parse(value);
    } catch {
      entries = value.split(',');
    }
  }
  if (!Array.isArray(entries)) return [];

  const seen = new Set();
  return entries
    .map((entry) => String(entry || '').trim().replace(/\s+/g, ' '))
    .filter((entry) => {
      const key = entry.toLocaleLowerCase('de');
      if (!entry || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeColoPlanningConfig(value = {}) {
  return {
    enabled: parseBoolean(value.enabled, false),
    employeePool: parseEmployeePool(value.employeePool),
    weekdayPreparationStaff: parseNonNegativeInteger(value.weekdayPreparationStaff, 1),
    nightStaff: parseNonNegativeInteger(value.nightStaff, 1),
    weekendDayStaff: parseNonNegativeInteger(value.weekendDayStaff ?? value.weekendInstallationStaff, 1),
  };
}

function normalizePreferenceDays(value) {
  if (!Array.isArray(value)) return [];
  const aliases = {
    so: 0, sonntag: 0, sunday: 0, sun: 0,
    mo: 1, montag: 1, monday: 1, mon: 1,
    di: 2, dienstag: 2, tuesday: 2, tue: 2,
    mi: 3, mittwoch: 3, wednesday: 3, wed: 3,
    do: 4, donnerstag: 4, thursday: 4, thu: 4,
    fr: 5, freitag: 5, friday: 5, fri: 5,
    sa: 6, samstag: 6, saturday: 6, sat: 6,
  };
  return [...new Set(value
    .map((entry) => {
      const numeric = Number.parseInt(String(entry), 10);
      if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) return numeric;
      return aliases[String(entry || '').trim().toLowerCase()];
    })
    .filter((entry) => Number.isInteger(entry)))];
}

function normalizeCodes(value) {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean));
}

function deterministicRank(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function preferenceFor(preferencesByEmployee, employee) {
  if (preferencesByEmployee instanceof Map) {
    return preferencesByEmployee.get(employee)
      || preferencesByEmployee.get(employee.toLocaleLowerCase('de'))
      || null;
  }
  return preferencesByEmployee?.[employee]
    || preferencesByEmployee?.[employee.toLocaleLowerCase('de')]
    || null;
}

export function getColoTaskRequirements(weekday, rawConfig = {}) {
  const config = normalizeColoPlanningConfig(rawConfig);
  const requiredByTask = {
    preparation: config.weekdayPreparationStaff,
    night: config.nightStaff,
    weekend: config.weekendDayStaff,
  };
  return Object.entries(TASK_DEFINITIONS)
    .filter(([, definition]) => definition.weekdays.includes(weekday))
    .map(([key, definition]) => ({ key, shiftType: definition.shiftType, required: requiredByTask[key], label: taskLabel(key, weekday) }))
    .filter((task) => task.required > 0);
}

export function buildColoRolePlan({
  year,
  month,
  numDays,
  startDay = 1,
  endDay = numDays,
  shifts = [],
  shiftDefinitions = [],
  config: rawConfig = {},
  preferencesByEmployee = new Map(),
  respectEmployeeWishes = true,
} = {}) {
  const config = normalizeColoPlanningConfig(rawConfig);
  const assignments = [];
  const conflicts = [];
  const summary = {
    enabled: config.enabled,
    poolSize: config.employeePool.length,
    requiredAssignments: 0,
    assigned: 0,
    missing: 0,
  };

  if (!config.enabled) return { assignments, conflicts, summary, config };
  if (config.employeePool.length === 0) {
    conflicts.push({
      day: null,
      date: null,
      shift: 'COLO',
      severity: 'warning',
      type: 'colo_pool_empty',
      message: 'Colo-Planung ist aktiv, aber es wurden keine Mitarbeiter fuer den Colo-Kompetenzpool ausgewaehlt.',
    });
    return { assignments, conflicts, summary, config };
  }

  const poolByKey = new Map(config.employeePool.map((employee) => [employee.toLocaleLowerCase('de'), employee]));
  const definitionTypeByCode = new Map(shiftDefinitions.map((definition) => [
    String(definition.code || '').trim().toUpperCase(),
    String(definition.shift_type || '').trim().toLowerCase(),
  ]));
  const workingByDay = new Map();

  for (const shift of shifts) {
    const day = Number.parseInt(String(shift.day ?? ''), 10);
    const shiftCode = String(shift.shift_code || '').trim().toUpperCase();
    const employeeKey = String(shift.employee_name || '').trim().toLocaleLowerCase('de');
    const employee = poolByKey.get(employeeKey);
    const shiftType = definitionTypeByCode.get(shiftCode);
    if (!employee || !Number.isInteger(day) || NON_WORKING_SHIFT_CODES.has(shiftCode)) continue;
    if (!workingByDay.has(day)) workingByDay.set(day, []);
    workingByDay.get(day).push({ employee, shiftCode, shiftType });
  }

  const totalByEmployee = new Map(config.employeePool.map((employee) => [employee, 0]));
  const taskByEmployee = new Map(config.employeePool.map((employee) => [employee, {}]));
  const firstDay = Math.max(1, Number.parseInt(String(startDay), 10) || 1);
  const lastDay = Math.min(numDays, Number.parseInt(String(endDay), 10) || numDays);

  let previousDayTask = new Set();
  for (let day = firstDay; day <= lastDay; day++) {
    const todayTask = new Set();
    const date = new Date(year, month - 1, day);
    const weekday = date.getDay();
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const usedToday = new Set();

    for (const task of getColoTaskRequirements(weekday, config)) {
      summary.requiredAssignments += task.required;

      for (let slot = 0; slot < task.required; slot++) {
        const candidates = (workingByDay.get(day) || [])
          .filter(({ employee, shiftType }) => !usedToday.has(employee) && shiftType === task.shiftType)
          .map(({ employee, shiftCode }) => {
            const preferences = preferenceFor(preferencesByEmployee, employee);
            const blockedDays = normalizePreferenceDays(preferences?.blocked_days);
            const unwantedShifts = normalizeCodes(preferences?.unwanted_shifts);
            const preferredShifts = normalizeCodes(preferences?.preferred_shifts);
            if (blockedDays.includes(weekday) || unwantedShifts.has('COLO')) return null;

            const total = totalByEmployee.get(employee) || 0;
            const taskCounts = taskByEmployee.get(employee) || {};
            let score = -(total * 1000) - ((taskCounts[task.key] || 0) * 250);
            if (respectEmployeeWishes && preferredShifts.has('COLO')) score += 500;
            const continuesTask = previousDayTask.has(`${task.key}:${employee}`);
            return {
              employee,
              shiftCode,
              continuesTask,
              score,
              rank: deterministicRank(`${year}-${month}-${day}-${task.key}-${employee}`),
            };
          })
          .filter(Boolean)
          .sort((left, right) => Number(right.continuesTask) - Number(left.continuesTask) || right.score - left.score || left.rank - right.rank || left.employee.localeCompare(right.employee, 'de'));

        const winner = candidates[0];
        if (!winner) {
          summary.missing += 1;
          continue;
        }

        usedToday.add(winner.employee);
        totalByEmployee.set(winner.employee, (totalByEmployee.get(winner.employee) || 0) + 1);
        const taskCounts = taskByEmployee.get(winner.employee) || {};
        taskCounts[task.key] = (taskCounts[task.key] || 0) + 1;
        taskByEmployee.set(winner.employee, taskCounts);
        assignments.push({
          employee_name: winner.employee,
          date: dateKey,
          role_key: 'colo',
          comment: task.label,
          task_key: task.key,
          shift_code: winner.shiftCode,
        });
        todayTask.add(`${task.key}:${winner.employee}`);
        summary.assigned += 1;
      }

      const assignedForTask = assignments.filter((entry) => entry.date === dateKey && entry.task_key === task.key).length;
      if (assignedForTask < task.required) {
        conflicts.push({
          day,
          date: dateKey,
          shift: 'COLO',
          severity: 'warning',
          type: 'colo_understaffed',
          task: task.key,
          required: task.required,
          actual: assignedForTask,
          missing: task.required - assignedForTask,
          message: `${dateKey}: ${task.label} ist mit ${assignedForTask}/${task.required} Personen unterbesetzt. Kein Colo-Pool-Mitarbeiter ist in einer passenden ${task.shiftType === 'night' ? 'Nachtschicht' : 'Frühschicht'} ohne widersprechenden Wunsch eingeplant.`,
        });
      }
    }
    previousDayTask = todayTask;
  }

  return { assignments, conflicts, summary, config };
}
