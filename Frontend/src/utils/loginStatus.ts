export function formatAbsoluteDateTime(value: string | null | undefined, locale: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatRelativeTime(value: string | null | undefined, locale: string) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;

  const diffMs = timestamp - Date.now();
  const absMs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60000);
  const hours = Math.round(diffMs / 3600000);
  const days = Math.round(diffMs / 86400000);
  const weeks = Math.round(diffMs / 604800000);
  const months = Math.round(diffMs / 2629800000);

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (absMs < 3600000) return formatter.format(minutes, 'minute');
  if (absMs < 86400000) return formatter.format(hours, 'hour');
  if (absMs < 604800000) return formatter.format(days, 'day');
  if (absMs < 2629800000) return formatter.format(weeks, 'week');
  return formatter.format(months, 'month');
}