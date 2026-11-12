/* ================================================ */
/* Week consistency of shift codes                   */
/*                                                   */
/* Within one week a person works ONE shift family    */
/* (E1 or E2 or L1 ...) and the suffix of the code    */
/* matches the weekend that is really worked:        */
/*   Saturday + Sunday  -> E1WE / E2WE / L1WE         */
/*   Saturday only      -> E1SA / E2SA                */
/*   no weekend         -> E1 / E2 / L1               */
/* Pure functions, used by the generator and across   */
/* month boundaries (quarter / year runs).            */
/* ================================================ */

const CODE_PATTERN = /^(E1|E2|L1|L2)(SA|WE)?$/;

export function parseFamilyCode(code) {
  const match = CODE_PATTERN.exec(String(code || '').trim().toUpperCase());
  return match ? { base: match[1], suffix: match[2] || '' } : null;
}

const typeOfBase = (base) => (base.startsWith('E') ? 'early' : 'late');

/**
 * cells: [{ offset: 0..6 (Monday..Sunday), code }] of ONE person in ONE week (any code, other codes are ignored).
 * hasCode(code): true when the shift definition exists. Returns { targetCode, cells } with the cells of the dominant
 * shift type that have to carry targetCode, or null when nothing can / has to be aligned.
 */
export function planWeekCodes(cells, hasCode) {
  const parsed = cells
    .map((cell) => ({ ...cell, family: parseFamilyCode(cell.code) }))
    .filter((cell) => cell.family);
  if (parsed.length === 0) return null;
  const typeCounts = new Map();
  for (const cell of parsed) typeCounts.set(typeOfBase(cell.family.base), (typeCounts.get(typeOfBase(cell.family.base)) || 0) + 1);
  const dominantType = [...typeCounts.entries()].sort((left, right) => right[1] - left[1])[0][0];
  const sameType = parsed.filter((cell) => typeOfBase(cell.family.base) === dominantType);

  const baseCounts = new Map();
  for (const cell of sameType) baseCounts.set(cell.family.base, (baseCounts.get(cell.family.base) || 0) + 1);
  const firstOffset = (base) => Math.min(...sameType.filter((cell) => cell.family.base === base).map((cell) => cell.offset));
  const base = [...baseCounts.entries()].sort((left, right) => right[1] - left[1] || firstOffset(left[0]) - firstOffset(right[0]))[0][0];

  const hasSaturday = sameType.some((cell) => cell.offset === 5);
  const hasSunday = sameType.some((cell) => cell.offset === 6);
  let suffix = '';
  if (hasSunday) suffix = 'WE';
  else if (hasSaturday) suffix = hasCode(`${base}SA`) ? 'SA' : (hasCode(`${base}WE`) ? 'WE' : '');
  let targetCode = `${base}${suffix}`;
  if (!hasCode(targetCode)) {
    if (suffix === '' && hasCode(base)) targetCode = base;
    else return null; // e.g. L2 has no weekend variant: leave the week as it is
  }
  return { targetCode, cells: sameType };
}

/**
 * Month boundary of a quarter / year run: the week that starts in month A and ends in month B is aligned as ONE week,
 * on both sides (both drafts are still in memory). plans: [{ month: 'YYYY-MM', result: { shifts, configSnapshot } }]
 * in chronological order. Only relabels cells (same hours, same type), never adds or removes a shift.
 */
export function alignBoundaryWeeks(plans) {
  const changes = [];
  for (let index = 0; index + 1 < plans.length; index++) {
    const first = plans[index];
    const second = plans[index + 1];
    const [yearA, monA] = String(first.month).split('-').map(Number);
    const [yearB, monB] = String(second.month).split('-').map(Number);
    if (new Date(yearA, monA, 1).getTime() !== new Date(yearB, monB - 1, 1).getTime()) continue; // not consecutive
    const lastDay = new Date(yearA, monA, 0).getDate();
    const lastDow = new Date(yearA, monA - 1, lastDay).getDay(); // 0 = Sunday
    if (lastDow === 0) continue; // the week ends with the month
    const offsetOfLast = (lastDow + 6) % 7; // 0 = Monday
    const hasCode = (code) => (first.result.configSnapshot?.shiftDefinitions || []).some((definition) => String(definition.code || '').trim().toUpperCase() === code);
    const hoursOf = (code) => {
      const definition = (first.result.configSnapshot?.shiftDefinitions || []).find((entry) => String(entry.code || '').trim().toUpperCase() === code);
      return Number(definition?.durationHours ?? definition?.duration_hours);
    };

    const byEmployee = new Map();
    const add = (shift, offset) => {
      if (!byEmployee.has(shift.employee_name)) byEmployee.set(shift.employee_name, []);
      byEmployee.get(shift.employee_name).push({ offset, code: String(shift.shift_code || '').trim().toUpperCase(), shift });
    };
    for (const shift of first.result.shifts) {
      const day = Number(shift.day);
      if (day > lastDay - offsetOfLast - 1) add(shift, offsetOfLast - (lastDay - day));
    }
    for (const shift of second.result.shifts) {
      const day = Number(shift.day);
      if (day <= 6 - offsetOfLast) add(shift, offsetOfLast + day);
    }
    for (const [employee, cells] of byEmployee) {
      const plan = planWeekCodes(cells, hasCode);
      if (!plan) continue;
      for (const cell of plan.cells) {
        if (cell.code === plan.targetCode) continue;
        const oldHours = hoursOf(cell.code);
        const newHours = hoursOf(plan.targetCode);
        if (!(oldHours > 0) || oldHours !== newHours) continue;
        changes.push({ employee, day: cell.shift.day, from: cell.code, to: plan.targetCode, month: cell.offset <= offsetOfLast ? first.month : second.month });
        cell.shift.shift_code = plan.targetCode;
      }
    }
  }
  return changes;
}
