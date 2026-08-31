/* ------------------------------------------------ */
/* SHIFTPLAN – MONTH UTILITIES                      */
/* ------------------------------------------------ */

export const MONTH_MAP: Record<string, number> = {
  januar: 1, january: 1, jan: 1,
  februar: 2, february: 2, feb: 2,
  märz: 3, maerz: 3, mrz: 3, march: 3, mar: 3,
  april: 4, apr: 4,
  mai: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  juli: 7, july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  oktober: 10, october: 10, okt: 10, oct: 10,
  november: 11, nov: 11,
  dezember: 12, december: 12, dez: 12, dec: 12,
};

export const MONTH_NAMES_DE: Record<number, string> = {
  1: "Januar",
  2: "Februar",
  3: "März",
  4: "April",
  5: "Mai",
  6: "Juni",
  7: "Juli",
  8: "August",
  9: "September",
  10: "Oktober",
  11: "November",
  12: "Dezember",
};

export function normalizePlansByMonth(
  plansByMonth: Record<string, any>,
  baseYear?: number
) {
  const entries = Object.entries(plansByMonth);
  const result: { label: string; plan: any }[] = [];

  /* ------------------------------------------------ */
  /* YEAR BASIS                                       */
  /* ------------------------------------------------ */

  let currentYear = Number.isFinite(baseYear as any)
    ? (baseYear as number)
    : new Date().getFullYear();
  let lastMonthIndex: number | null = null;

  for (const [key, plan] of entries) {
    // New format: plan.meta.label already has correct label
    if (plan.meta?.label && plan.meta?.month && plan.meta?.year) {
      result.push({ label: plan.meta.label, plan });
      lastMonthIndex = plan.meta.month;
      currentYear = plan.meta.year;
      continue;
    }

    // Legacy format fallback
    const rawLabel = plan.meta?.label || key || "";
    const firstToken = rawLabel.trim().split(/\s+/)[0].toLowerCase();
    const monthIndex = MONTH_MAP[firstToken];

    if (!monthIndex) {
      result.push({ label: rawLabel, plan });
      continue;
    }

    if (lastMonthIndex !== null && monthIndex < lastMonthIndex) {
      currentYear += 1;
    }

    lastMonthIndex = monthIndex;

    result.push({
      label: `${MONTH_NAMES_DE[monthIndex]} ${currentYear}`,
      plan,
    });
  }

  return result;
}
