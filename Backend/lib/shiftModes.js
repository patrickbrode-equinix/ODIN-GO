export function normalizeShiftModes(modes, fallback = {}) {
  const source = Array.isArray(modes) ? modes : [];
  const valid = source.map((mode, index) => ({
    id: Number.isInteger(Number(mode?.id)) ? Number(mode.id) : index + 1,
    label: String(mode?.label || `Modus ${index + 1}`).trim() || `Modus ${index + 1}`,
    start_time: /^\d{2}:\d{2}$/.test(String(mode?.start_time || '')) ? String(mode.start_time) : String(fallback.start_time || '00:00'),
    end_time: /^\d{2}:\d{2}$/.test(String(mode?.end_time || '')) ? String(mode.end_time) : String(fallback.end_time || '00:00'),
    duration_hours: Math.max(0, Number(mode?.duration_hours ?? fallback.duration_hours ?? 0) || 0),
    free_days_after: Math.max(0, Math.min(14, Number.parseInt(String(mode?.free_days_after ?? 0), 10) || 0)),
  }));
  const unique = valid.filter((mode, index, list) => list.findIndex((item) => item.id === mode.id) === index);
  if (unique.length) return unique.slice(0, 5);
  return [{ id: 1, label: 'Standard', start_time: String(fallback.start_time || '00:00'), end_time: String(fallback.end_time || '00:00'), duration_hours: Math.max(0, Number(fallback.duration_hours) || 0), free_days_after: 0 }];
}

export function applyActiveShiftModes(definitions, activeModes = {}) {
  return definitions.map((definition) => {
    const modes = normalizeShiftModes(definition.modes, definition);
    const requested = Number(activeModes?.[String(definition.code).toUpperCase()]);
    const selected = modes.find((mode) => mode.id === requested) || modes[0];
    return { ...definition, modes, active_mode_id: selected.id, active_mode_label: selected.label, start_time: selected.start_time, end_time: selected.end_time, duration_hours: selected.duration_hours, mode_free_days_after: selected.free_days_after };
  });
}
