#!/usr/bin/env node
// Tiny mock of the backend for looking at the admin screens without PostgreSQL.
// Sign in with any password. Data comes from the same defaults the tests use.
// node scripts/mockApi.mjs [port]
import http from 'node:http';
import { buildDefaultDefinitions, buildDefaultRotation } from '../tests/helpers/fakePlanningDb.js';
import { analyzePlanningHealth } from '../lib/planningHealth.js';

const port = Number(process.argv[2] || 5055);
const definitions = buildDefaultDefinitions().filter((d) => d.code !== 'NK').map((d) => ({ ...d, min_staff: d.min_staff, color_hex: d.color_hex }));
const rotation = buildDefaultRotation();
const fairness = { balance_nights: true, balance_weekends: true, balance_total_load: true, max_deviation_percent: 20, fairness_vs_preference: 'fairness' };
const planning = { respect_employee_wishes: true, hard_rules_priority: 100, soft_wishes_priority: 50, fairness_priority: 80, admin_override_priority: 90, monthly_target_hours: 174, annual_target_hours: 2088 };
const staffing = [
  { shift_type: 'early', min_count: 6, max_count: null },
  { shift_type: 'late', min_count: 4, max_count: 8 },
  { shift_type: 'night', min_count: 4, max_count: 5 },
];
const employees = ['Anna Adler', 'Ben Berg', 'Carla Conrad', 'Dario Dietz', 'Eva Engel', 'Finn Fuchs'];
const settings = {
  'shiftplan.dbs_enabled': 'true',
  'shiftplan.colo_enabled': 'true',
  'shiftplan.colo_pool': JSON.stringify(['Anna Adler', 'Ben Berg']),
};
const dbsPool = [{ employee_name: 'Ben Berg', shift_code: 'DBS', working_weekdays: [1, 2, 3, 4, 5], other_shift_codes: [], monthly_max_assignments: 31, sort_order: 0, is_active: true }];

const prefs1 = { preferredShifts: ['E1'], unwantedShifts: ['N'], preferredHolidays: [], preferredDays: [], blockedDays: [6, 0], avoidColleagues: [], maxNightsPerMonth: null, maxWeekendsPerMonth: 1, nightModel: 'SEVEN_DAY', monthlyPreferences: {}, notes: null };

const routes = {
  'POST /api/standalone-admin/unlock': () => ({ token: 'mock-token', expiresIn: '4h' }),
  'GET /api/app-settings': () => settings,
  'PUT /api/app-settings': (body) => { Object.assign(settings, Object.fromEntries(Object.entries(body || {}).map(([k, v]) => [k, String(v)]))); return settings; },
  'GET /api/shift-config/definitions': () => ({ ok: true, definitions }),
  'GET /api/shift-config/rotation-rules': () => ({ ok: true, rules: rotation }),
  'PUT /api/shift-config/rotation-rules': (body) => ({ ok: true, rules: Object.assign(rotation, body) }),
  'GET /api/shift-config/fairness-rules': () => ({ ok: true, rules: fairness }),
  'PUT /api/shift-config/fairness-rules': (body) => ({ ok: true, rules: Object.assign(fairness, body) }),
  'GET /api/shift-config/planning-config': () => ({ ok: true, config: planning }),
  'PUT /api/shift-config/planning-config': (body) => ({ ok: true, config: Object.assign(planning, body) }),
  'GET /api/shift-config/exclusions': () => ({ ok: true, exclusions: [] }),
  'GET /api/shift-config/admin-flags': () => ({ ok: true, flags: [] }),
  'GET /api/shift-config/short-night-options': () => ({ ok: true, options: { mode: 'MIXED', enabled: true, start_time: '21:45', end_time: '06:45', free_days_after: 2, series_days: 3 } }),
  'PUT /api/shift-config/short-night-options': (body) => ({ ok: true, options: body }),
  'GET /api/shift-config/staffing-rules': () => ({ ok: true, rules: staffing, day_limits: [] }),
  'GET /api/shift-config/defaults': () => ({ ok: true, definitions: {} }),
  'GET /api/shift-config/special-pools/DBS': () => ({ ok: true, assignments: dbsPool }),
  'PUT /api/shift-config/special-pools/DBS': (body) => ({ ok: true, assignments: body?.assignments || [] }),
  'GET /api/shift-config/planning-health': () => ({
    ok: true,
    issues: analyzePlanningHealth({
      rotation, planConfig: planning, staffingRules: staffing, employeeCount: employees.length,
      preferences: Array.from({ length: 9 }, (_, i) => ({ name: `Spät ${i}`, preferred_shifts: ['L1'] })),
      dbsConfig: { enabled: true, shiftCode: 'DBS' }, dbsPool,
      coloConfig: { enabled: true, employeePool: ['Anna Adler'], requirements: [{ id: 'a', weekdays: [1, 2, 3, 4, 5], shift_type: 'early', staff: 2 }] },
    }),
  }),
  'GET /api/shiftplan-control/planning-basis': () => ({ basis: { employees } }),
  'GET /api/admin/users': () => employees.map((name, index) => {
    const [firstName, lastName] = name.split(' ');
    return { id: index + 1, firstName, lastName, loginName: name.toLowerCase().replace(' ', '.'), email: null, group: 'c-ops', approved: true, isAdmin: false, provisionedEmployeeName: name, hasShiftPreferences: index === 0 };
  }),
  'GET /api/admin/users/1/preferences': () => ({ user: { id: 1 }, preferredColleaguesEnabled: true, preferences: { ...prefs1, preferredColleagues: [{ id: 2, name: 'Berg, Ben' }] } }),
  'PUT /api/admin/users/1/preferences': (body) => { Object.assign(prefs1, { preferredShifts: body.preferred_shifts, unwantedShifts: body.unwanted_shifts, blockedDays: body.blocked_days, maxNightsPerMonth: body.max_nights_per_month, maxWeekendsPerMonth: body.max_weekends_per_month, nightModel: body.night_model }); return { success: true, userId: 1 }; },
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body = null;
    try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null; } catch { body = null; }
    const handler = routes[`${req.method} ${url.pathname}`];
    res.setHeader('Content-Type', 'application/json');
    if (handler) { res.end(JSON.stringify(handler(body))); return; }
    console.log('[mock] unhandled', req.method, url.pathname);
    res.end(req.method === 'GET' ? '[]' : '{}');
  });
}).listen(port, '0.0.0.0', () => console.log(`mock api on ${port}`));
