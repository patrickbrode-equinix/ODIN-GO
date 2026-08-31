const BERLIN_TIME_ZONE = "Europe/Berlin";

function getBerlinDateParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: BERLIN_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function getIsoWeekKey(year, month, day) {
  const target = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const weekday = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - weekday);
  const weekYear = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((target - yearStart) / 86_400_000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

export function getNotificationOccurrenceKey(recurrence, date = new Date()) {
  if (recurrence === "once") return "once";

  const { year, month, day } = getBerlinDateParts(date);
  if (recurrence === "daily") return `daily:${year}-${month}-${day}`;
  if (recurrence === "weekly") return `weekly:${getIsoWeekKey(year, month, day)}`;
  if (recurrence === "monthly") return `monthly:${year}-${month}`;
  throw new Error(`Unsupported notification recurrence: ${recurrence}`);
}

export function getCurrentNotificationOccurrenceKeys(date = new Date()) {
  return {
    daily: getNotificationOccurrenceKey("daily", date),
    weekly: getNotificationOccurrenceKey("weekly", date),
    monthly: getNotificationOccurrenceKey("monthly", date),
  };
}
