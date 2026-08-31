import type { LanguageCode } from '../../context/LanguageContext';

export function formatCriticalDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(locale, {
    timeZone: 'Europe/Berlin',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRemainingTimeMinutes(minutes: number | null, language: LanguageCode): string {
  if (minutes == null) return language === 'de' ? 'Nicht relevant' : 'Not applicable';
  if (minutes < 0) return language === 'de' ? 'Überfällig' : 'Overdue';

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) {
    return language === 'de' ? `${restMinutes} Min` : `${restMinutes} min`;
  }

  return language === 'de'
    ? `${hours} Std ${restMinutes} Min`
    : `${hours}h ${restMinutes}m`;
}

export function getCriticalityTone(level: string | null, isTroubleTicket: boolean): string {
  if (isTroubleTicket || level === 'critical') {
    return 'border-red-500/40 bg-red-500/12 text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.18)]';
  }
  if (level === 'high') {
    return 'border-amber-400/35 bg-amber-400/10 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.14)]';
  }
  return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.12)]';
}

export function getOdinStatusTone(status: string): string {
  switch (status) {
    case 'ASSIGNED':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'BLOCKED':
      return 'border-red-500/30 bg-red-500/10 text-red-200';
    case 'EXCLUDED':
      return 'border-slate-500/30 bg-slate-500/10 text-slate-200';
    case 'RETRY_PENDING':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-100';
    default:
      return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100';
  }
}

export function getStepTone(status: string): string {
  switch (status) {
    case 'passed':
      return 'border-emerald-400/35 bg-emerald-400';
    case 'warning':
      return 'border-amber-400/35 bg-amber-400';
    case 'failed':
      return 'border-red-500/40 bg-red-500';
    default:
      return 'border-cyan-400/30 bg-cyan-400';
  }
}

export function formatLogicStatus(status: string, language: LanguageCode): string {
  switch (status) {
    case 'LIVE':
      return language === 'de' ? 'Live' : 'Live';
    case 'SHADOW':
      return language === 'de' ? 'Shadow' : 'Shadow';
    case 'ERROR':
      return language === 'de' ? 'Fehler' : 'Error';
    default:
      return language === 'de' ? 'Offline' : 'Offline';
  }
}

export function formatBucket(bucket: number | null, language: LanguageCode): string {
  if (bucket == null) return language === 'de' ? 'Beobachtung' : 'Monitoring';
  return language === 'de' ? `Priorität ${bucket}` : `Priority ${bucket}`;
}