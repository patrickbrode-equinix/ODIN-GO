export type ShiftTimeMap = Record<string, string>;

type ShiftDefinitionTiming = {
  code?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  is_active?: boolean;
};

function formatClockTime(value: unknown): string {
  const normalized = String(value || '').trim();
  return /^\d{2}:\d{2}/.test(normalized) ? normalized.slice(0, 5) : '';
}

export function buildShiftTimeMap(definitions: ShiftDefinitionTiming[] | unknown): ShiftTimeMap {
  if (!Array.isArray(definitions)) return {};

  return definitions.reduce<ShiftTimeMap>((times, definition) => {
    const code = String(definition?.code || '').trim().toUpperCase();
    const start = formatClockTime(definition?.start_time);
    const end = formatClockTime(definition?.end_time);
    if (code && definition?.is_active !== false && start && end) times[code] = `${start}-${end}`;
    return times;
  }, {});
}
