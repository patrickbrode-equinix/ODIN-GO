export function normalizeHolidayStaffingConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawConfig).map(([holidayName, limits]) => {
      const safeLimits = limits && typeof limits === 'object' && !Array.isArray(limits) ? limits : {};
      return [holidayName, {
        early: Math.max(Number.parseInt(String(safeLimits.early ?? 0), 10) || 0, 0),
        late: Math.max(Number.parseInt(String(safeLimits.late ?? 0), 10) || 0, 0),
      }];
    })
  );
}

export function getHolidayShiftStaffingLimit(config, holidayName, shiftType) {
  if (!holidayName || (shiftType !== 'early' && shiftType !== 'late')) return null;
  const holidayConfig = config?.[holidayName];
  if (!holidayConfig || typeof holidayConfig !== 'object') return null;
  const rawLimit = Number.parseInt(String(holidayConfig[shiftType] ?? 0), 10) || 0;
  return rawLimit > 0 ? rawLimit : null;
}

export function applyHolidayWorkPreferenceScore({
  score,
  reasons,
  holidayName,
  preferredHolidays,
  softWishesPriority,
}) {
  let nextScore = score;
  const nextReasons = [...reasons];

  if (holidayName && preferredHolidays.includes(holidayName)) {
    nextScore += softWishesPriority * 12;
    nextReasons.push(`Mitarbeiterwunsch: ${holidayName} arbeiten`);
  }

  return { score: nextScore, reasons: nextReasons };
}
