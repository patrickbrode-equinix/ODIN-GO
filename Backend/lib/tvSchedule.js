export function resolveTvNightScheduleDate(now = new Date()) {
  const current = new Date(now);
  const isMonday = current.getDay() === 1;
  const minutesSinceMidnight = current.getHours() * 60 + current.getMinutes();

  if (isMonday && minutesSinceMidnight < 6 * 60 + 45) {
    current.setDate(current.getDate() - 1);
  }

  return current;
}
