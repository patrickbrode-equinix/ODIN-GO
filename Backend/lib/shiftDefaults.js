// Operational default values for the regular shift model. Administrators can
// change every value in the settings and restore these defaults at any time.
export const DEFAULT_SHIFT_DEFINITIONS = Object.freeze({
  E1: Object.freeze({ start_time: '06:30', end_time: '15:30', start_day_offset: 0, end_day_offset: 0, duration_hours: 9, min_staff: 1, max_staff: 99 }),
  E2: Object.freeze({ start_time: '07:00', end_time: '16:00', start_day_offset: 0, end_day_offset: 0, duration_hours: 9, min_staff: 1, max_staff: 99 }),
  L1: Object.freeze({ start_time: '13:00', end_time: '22:00', start_day_offset: 0, end_day_offset: 0, duration_hours: 9, min_staff: 1, max_staff: 8 }),
  L2: Object.freeze({ start_time: '15:00', end_time: '00:00', start_day_offset: 0, end_day_offset: 1, duration_hours: 9, min_staff: 1, max_staff: 8 }),
  N: Object.freeze({ start_time: '21:15', end_time: '06:45', start_day_offset: 0, end_day_offset: 1, duration_hours: 9.5, min_staff: 4, max_staff: 5 }),
});

// Cumulative staffing across all definitions of one shift type per day.
// max_count null means unlimited.
export const DEFAULT_STAFFING_RULES = Object.freeze({
  early: Object.freeze({ min_count: 6, max_count: null }),
  late: Object.freeze({ min_count: 4, max_count: 8 }),
  night: Object.freeze({ min_count: 4, max_count: 5 }),
});

export const STAFFING_SHIFT_TYPES = Object.freeze(['early', 'late', 'night']);
