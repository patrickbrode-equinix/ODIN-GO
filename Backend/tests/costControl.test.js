import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildCostControl, focusCostControl, getIsoWeek, getQuarterKey, getSupplementHours } from '../lib/costControl.js';
import { addCostControlSheet } from '../routes/shiftplanControl.js';

// Same times and durations as the shipped defaults (presence minus paid duration = 1 h unpaid break).
const definitions = [
  { code: 'E1', type: 'early', durationHours: 8, startTime: '06:30', endTime: '15:30', startDayOffset: 0, endDayOffset: 0 },
  { code: 'L1', type: 'late', durationHours: 8, startTime: '13:00', endTime: '22:00', startDayOffset: 0, endDayOffset: 0 },
  { code: 'L2', type: 'late', durationHours: 8, startTime: '15:00', endTime: '00:00', startDayOffset: 0, endDayOffset: 1 },
  { code: 'N', type: 'night', durationHours: 8.5, startTime: '21:15', endTime: '06:45', startDayOffset: 0, endDayOffset: 1 },
];
const supplement = (year, month, day, code) => {
  const definition = definitions.find((entry) => entry.code === code);
  return getSupplementHours({ year, month, day, definition, paidHours: definition.durationHours });
};

test('ISO weeks and quarters', () => {
  assert.deepEqual(getIsoWeek(2027, 1, 1), { year: 2026, week: 53, monday: '2026-12-28' });
  assert.equal(getIsoWeek(2027, 1, 4).week, 1);
  assert.equal(getQuarterKey('2027-03'), '2027-Q1');
  assert.equal(getQuarterKey('2027-04'), '2027-Q2');
});

test('night supplement 20-6 with one unpaid hour', () => {
  assert.deepEqual(supplement(2027, 1, 4, 'N'), { night: 7.75, sunday: 0, holiday: 0 }); // Monday: 8.75 h in 20-6 minus 1 h break
  assert.equal(supplement(2027, 1, 6, 'E1').night, 0);
  assert.equal(supplement(2027, 1, 6, 'L1').night, 2, 'late shift until 22:00: 2 h in the night window');
  assert.equal(supplement(2027, 1, 6, 'L2').night, 4, 'late shift until midnight: 4 h');
});

test('Sunday supplement 0-24: Sunday night shifts get Sunday and night supplement', () => {
  assert.deepEqual(supplement(2027, 1, 10, 'N'), { night: 7.75, sunday: 2.75, holiday: 0 }); // Sunday 21:15-24:00, break is on Monday
  assert.deepEqual(supplement(2027, 1, 9, 'N'), { night: 7.75, sunday: 5.75, holiday: 0 }); // Saturday night: Sunday 0-6:45 minus the break
  assert.deepEqual(supplement(2027, 1, 3, 'E1'), { night: 0, sunday: 8, holiday: 0 });
  assert.deepEqual(supplement(2027, 1, 3, 'L1'), { night: 2, sunday: 8, holiday: 0 });
});

test('holiday supplement; on 24.12. and 31.12. only from 12:00', () => {
  assert.deepEqual(supplement(2027, 1, 1, 'E1'), { night: 0, sunday: 0, holiday: 8 }); // New Year
  assert.equal(supplement(2026, 12, 24, 'L1').holiday, 8, 'Heiligabend late shift is fully after 12:00');
  assert.equal(supplement(2026, 12, 24, 'E1').holiday, 3.5, 'Heiligabend early shift: only 12:00-15:30');
  assert.equal(supplement(2026, 12, 31, 'L2').holiday, 8);
  assert.equal(supplement(2026, 12, 31, 'E1').holiday, 3.5);
  assert.equal(supplement(2026, 12, 25, 'E1').holiday, 8, '1. Weihnachtstag: whole day');
  // Night from Heiligabend to Weihnachten: 21:15-24:00 (after 12:00) + 0:00-6:45 minus the break = 8.5 h
  assert.equal(supplement(2026, 12, 24, 'N').holiday, 8.5);
  assert.equal(supplement(2027, 1, 6, 'E1').holiday, 8 * 0, '06.01. is no holiday in Hesse');
});

const january = {
  month: '2027-01',
  config_snapshot: { shiftDefinitions: definitions },
  shifts_json: [
    { employee_name: 'Anna', day: 4, shift_code: 'N' },   // Monday night: 7.75 night
    { employee_name: 'Anna', day: 5, shift_code: 'N' },
    { employee_name: 'Ben', day: 3, shift_code: 'E1' },   // Sunday: 8 Sunday
    { employee_name: 'Ben', day: 10, shift_code: 'N' },   // Sunday night: 7.75 night + 2.75 Sunday
    { employee_name: 'Cara', day: 6, shift_code: 'E1' },  // nothing
    { employee_name: 'Cara', day: 7, shift_code: 'FS' },  // free marker
    { employee_name: 'Dirk', day: 1, shift_code: 'E1' },  // New Year: 8 holiday
  ],
};
const february = {
  month: '2027-02',
  config_snapshot: { shiftDefinitions: definitions },
  shifts_json: [{ employee_name: 'Anna', day: 7, shift_code: 'E1' }, { employee_name: 'Anna', day: 8, shift_code: 'N' }],
};

test('supplement hours per week, month, quarter and employee', () => {
  const control = buildCostControl([january, february]);
  const month = control.months.find((entry) => entry.month === '2027-01');
  assert.equal(month.nightHours, 7.75 * 3);
  assert.equal(month.sundayHours, 8 + 2.75);
  assert.equal(month.holidayHours, 8);
  assert.equal(month.nightShifts, 3);
  assert.equal(month.sundayShifts, 2);
  assert.equal(month.holidayShifts, 1);
  const firstWeek = control.weeks.find((week) => week.monday === '2027-01-04');
  assert.equal(firstWeek.nightHours, 7.75 * 3);
  assert.equal(firstWeek.sundayHours, 2.75);
  assert.equal(control.weeks.find((week) => week.monday === '2026-12-28').holidayHours, 8, 'New Year belongs to KW 53/2026');
  assert.equal(control.weeks.find((week) => week.monday === '2026-12-28').sundayHours, 8, 'Sunday 03.01. belongs to KW 53/2026');
  const quarter = control.quarters.find((entry) => entry.key === '2027-Q1');
  assert.equal(quarter.nightHours, 7.75 * 4);
  assert.equal(quarter.sundayHours, 8 + 2.75 + 8, 'February 7th is a Sunday: early shift 8 h');
  assert.equal(control.employees.find((entry) => entry.employee === 'Ben').total.nightHours, 7.75);
  assert.equal(control.employees.find((entry) => entry.employee === 'Cara'), undefined);
});

test('old drafts without times use the current definition times', () => {
  const legacy = { month: '2027-01', config_snapshot: { shiftDefinitions: [{ code: 'N', type: 'night', durationHours: 8.5 }] }, shifts_json: [{ employee_name: 'Anna', day: 4, shift_code: 'N' }] };
  const withTimes = new Map([['N', { startTime: '21:15', endTime: '06:45', startDayOffset: 0, endDayOffset: 1 }]]);
  assert.equal(buildCostControl([legacy], { timesByCode: withTimes }).total.nightHours, 7.75);
  assert.equal(buildCostControl([legacy]).total.nightHours, 8.5, 'without any times the paid duration of the night shift is used');
});

test('a week that reaches into an unplanned month is partial', () => {
  const control = buildCostControl([january]);
  assert.equal(control.weeks.find((week) => week.monday === '2026-12-28').partial, true);
  assert.equal(control.weeks.find((week) => week.monday === '2027-01-04').partial, false);
});

test('focus: weeks of the month plus month and quarter totals', () => {
  const focus = focusCostControl(buildCostControl([january, february]), '2027-02');
  assert.equal(focus.quarterKey, '2027-Q1');
  assert.equal(focus.quarterMonthsPlanned, 2);
  assert.equal(focus.monthTotals.nightHours, 7.75);
  assert.deepEqual(focus.weeks.map((week) => week.monday), ['2027-02-01', '2027-02-08', '2027-02-15', '2027-02-22']);
  assert.equal(focus.weeks[2].nightHours, 0, 'weeks without supplement hours are listed with 0 h');
});

test('management sheet contains weeks, months, quarters and employees', () => {
  const workbook = new ExcelJS.Workbook();
  addCostControlSheet(workbook, [january, february]);
  const sheet = workbook.getWorksheet('Kostenkontrolle');
  assert.ok(sheet);
  const text = [];
  sheet.eachRow((row) => text.push(row.values.filter((value) => value !== undefined && value !== null).join('|')));
  const joined = text.join('\n');
  assert.match(joined, /Pro Kalenderwoche/);
  assert.match(joined, /Feiertagszuschlag/);
  assert.match(joined, /Januar 2027\|23\.25\|10\.75\|8\|3\|2\|1/);
  assert.match(joined, /2027 Q1\|31\|18\.75\|8/);
  assert.match(joined, /Pro Mitarbeiter/);
});

test('month sheet marks Colo and late overstaffing in the cell (not in the team variant)', async () => {
  const { buildExcelWorkbook } = await import('../routes/shiftplanControl.js');
  const draft = {
    month: '2027-02', version: 1, status: 'draft', created_at: new Date('2027-01-01'), created_by: 'admin',
    shifts_json: [{ employee_name: 'Anna', day: 3, shift_code: 'L1' }, { employee_name: 'Anna', day: 4, shift_code: 'L1' }],
    conflicts: [], fairness: {},
    config_snapshot: {
      shiftDefinitions: definitions,
      coloAssignments: [{ employee_name: 'Anna', date: '2027-02-03', role_key: 'colo' }],
      planReport: { lateOverflow: [{ employee: 'Anna', day: 4 }] },
    },
  };
  const full = await buildExcelWorkbook([draft], null, { variant: 'management', includeWishes: false, includeWishStatus: false });
  const sheet = full.getWorksheet('Februar 2027');
  const colo = sheet.getCell(5, 4);
  const overflow = sheet.getCell(5, 5);
  assert.equal(colo.value, 'L1');
  assert.equal(String(colo.note?.texts ? colo.note.texts.map((part) => part.text).join('') : colo.note), 'Colo');
  assert.match(String(overflow.note?.texts ? overflow.note.texts.map((part) => part.text).join('') : overflow.note), /Überbesetzung/);
  assert.match(colo.border.top.color.argb, /06B6D4$/);
  assert.match(overflow.border.top.color.argb, /F97316$/);

  const team = await buildExcelWorkbook([draft], null, { variant: 'team' });
  const teamSheet = team.getWorksheet('Februar 2027');
  assert.match(teamSheet.getCell(5, 4).border.top.color.argb, /06B6D4$/, 'Colo stays visible for the team');
  assert.doesNotMatch(String(teamSheet.getCell(5, 5).border?.top?.color?.argb), /F97316$/, 'overstaffing is internal');
  assert.equal(team.getWorksheet('Kostenkontrolle'), undefined);
});
