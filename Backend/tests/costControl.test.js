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

test('holiday supplement only for national and international bank holidays', () => {
  assert.deepEqual(supplement(2027, 1, 1, 'E1'), { night: 0, sunday: 0, holiday: 8 }); // New Year
  assert.equal(supplement(2026, 12, 25, 'E1').holiday, 8, '1. Weihnachtstag: whole day');
  assert.equal(supplement(2026, 12, 24, 'L1').holiday, 0, 'Heiligabend is a company day, no bank holiday');
  assert.equal(supplement(2026, 12, 31, 'L2').holiday, 0, 'Silvester is no bank holiday');
  assert.equal(supplement(2026, 6, 4, 'E1').holiday, 0, 'Fronleichnam is regional');
  // Night from Heiligabend to Weihnachten: 0:00-6:45 of the 25th minus the break (01:30-02:30)
  assert.equal(supplement(2026, 12, 24, 'N').holiday, 5.75);
  assert.equal(supplement(2027, 1, 6, 'E1').holiday, 0, '06.01. is no holiday in Hesse');
});

test('holidays are listed by name with the hours of every employee', () => {
  const control = buildCostControl([{
    month: '2026-12', config_snapshot: { shiftDefinitions: definitions },
    shifts_json: [
      { employee_name: 'Anna', day: 25, shift_code: 'E1' },
      { employee_name: 'Ben', day: 25, shift_code: 'L1' },
      { employee_name: 'Ben', day: 26, shift_code: 'E1' },
      { employee_name: 'Cara', day: 24, shift_code: 'E1' },
    ],
  }]);
  assert.deepEqual(control.holidays.map((entry) => [entry.date, entry.name, entry.category, entry.hours, entry.shifts]), [
    ['2026-12-25', '1. Weihnachtstag', 'holiday_international', 16, 2],
    ['2026-12-26', '2. Weihnachtstag', 'holiday_international', 8, 1],
  ]);
  assert.deepEqual(control.holidays[0].employees.map((entry) => entry.employee).sort(), ['Anna', 'Ben']);
  const focus = focusCostControl(control, '2026-12', { employeeNames: ['Anna', 'Ben', 'Cara'] });
  assert.equal(focus.holidayDistribution.totalHours, 24);
  assert.equal(focus.holidayDistribution.employees.find((entry) => entry.employee === 'Ben').hours, 16);
  assert.equal(focus.holidayDistribution.employees.find((entry) => entry.employee === 'Cara').hours, 0);
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
  assert.equal(colo.value.richText.map((part) => part.text).join(''), 'L1\nCOLO', 'Colo cell carries a visible COLO badge line');
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

test('management workbook: holiday breakdown by name and shift distribution with weekend segment', async () => {
  const { allocateBarCells, addShiftDistributionSheet } = await import('../routes/shiftplanControl.js');
  assert.equal(allocateBarCells([1, 1, 1]).reduce((sum, value) => sum + value, 0), 50);
  assert.equal(allocateBarCells([3, 1, 0, 6, 0]).reduce((sum, value) => sum + value, 0), 50);
  assert.equal(allocateBarCells([0, 0, 0, 0, 0]).reduce((sum, value) => sum + value, 0), 0);
  const december = {
    month: '2026-12', config_snapshot: { shiftDefinitions: definitions },
    shifts_json: [
      { employee_name: 'Anna', day: 25, shift_code: 'E1' }, // Friday, 1. Weihnachtstag
      { employee_name: 'Anna', day: 28, shift_code: 'L1' }, // Monday
      { employee_name: 'Anna', day: 26, shift_code: 'E1' }, // Saturday: weekend
      { employee_name: 'Ben', day: 29, shift_code: 'N' },
    ],
  };
  const workbook = new ExcelJS.Workbook();
  addCostControlSheet(workbook, [december]);
  const cost = [];
  workbook.getWorksheet('Kostenkontrolle').eachRow((row) => cost.push(row.values.filter((value) => value !== undefined && value !== null).join('|')));
  const text = cost.join('\n');
  assert.match(text, /Feiertage im Detail/);
  assert.match(text, /25\.12\.2026\|1\. Weihnachtstag\|international\|8\|1\|Anna \(8 h\)/);
  assert.match(text, /26\.12\.2026\|2\. Weihnachtstag\|international\|8\|1\|Anna \(8 h\)/);
  assert.match(text, /Verteilung der Feiertagsstunden pro Mitarbeiter/);
  assert.doesNotMatch(text, /24\.12\.2026\|/);

  const { employees, team } = addShiftDistributionSheet(workbook, [december]);
  const anna = employees.find((entry) => entry.employee === 'Anna');
  assert.deepEqual([anna.early, anna.late, anna.night, anna.weekend, anna.total], [1, 1, 0, 1, 3]);
  assert.equal(anna.percent.weekend, 33.3);
  assert.equal(team.total, 4);
  const sheet = workbook.getWorksheet('Schichtverteilung');
  assert.ok(sheet);
  assert.equal(sheet.getCell(5, 1).value, 'Anna');
  assert.equal(sheet.getCell(5, 2).value, 3);
});

test('employees without wishes are highlighted on the cost control and distribution sheets', async () => {
  const { addShiftDistributionSheet } = await import('../routes/shiftplanControl.js');
  const draft = { month: '2026-12', config_snapshot: { shiftDefinitions: definitions }, shifts_json: [{ employee_name: 'Anna', day: 25, shift_code: 'E1' }, { employee_name: 'Ben', day: 25, shift_code: 'E1' }] };
  const workbook = new ExcelJS.Workbook();
  const missing = new Set(['Ben']);
  addCostControlSheet(workbook, [draft], { missingWishEmployees: missing });
  addShiftDistributionSheet(workbook, [draft], { missingWishEmployees: missing });
  const argbOfName = (sheetName, name) => {
    let found = null;
    workbook.getWorksheet(sheetName).eachRow((row) => { if (row.getCell(1).value === name) found = row.getCell(1).fill?.fgColor?.argb ?? null; });
    return found;
  };
  assert.equal(argbOfName('Schichtverteilung', 'Ben'), 'FDE68A');
  assert.notEqual(argbOfName('Schichtverteilung', 'Anna'), 'FDE68A');
  assert.equal(argbOfName('Kostenkontrolle', 'Ben'), 'FDE68A');
  assert.notEqual(argbOfName('Kostenkontrolle', 'Anna'), 'FDE68A');
});

test('continuous plan lists all months one after another and the Colo coverage sheet shows open days', async () => {
  const { addContinuousPlanSheet, addColoCoverageSheet } = await import('../routes/shiftplanControl.js');
  const january2 = { month: '2027-01', config_snapshot: { shiftDefinitions: definitions, planReport: { colo: { enabled: true } }, coloAssignments: [{ employee_name: 'Anna', date: '2027-01-04', comment: 'Früh', task_key: 'a' }] }, conflicts: [{ type: 'colo_understaffed', date: '2027-01-05', task: 'night', required: 1, actual: 0, missing: 1 }], fairness: {}, shifts_json: [{ employee_name: 'Anna', day: 31, shift_code: 'E1' }] };
  const february2 = { month: '2027-02', config_snapshot: { shiftDefinitions: definitions }, conflicts: [], fairness: {}, shifts_json: [{ employee_name: 'Anna', day: 1, shift_code: 'L1' }, { employee_name: 'Ben', day: 28, shift_code: 'N' }] };
  const workbook = new ExcelJS.Workbook();
  const info = addContinuousPlanSheet(workbook, [february2, january2]);
  assert.deepEqual(info, { employees: 2, days: 31 + 28 });
  const sheet = workbook.getWorksheet('Fortlaufender Plan');
  // January 1 is column 2; February 1 is column 2 + 31
  assert.equal(sheet.getCell(2, 2).value, 'Januar 2027');
  assert.equal(sheet.getCell(2, 33).value, 'Februar 2027');
  assert.equal(sheet.getCell(5, 32).value, 'E1', 'Anna Jan 31');
  assert.equal(sheet.getCell(5, 33).value, 'L1', 'Anna Feb 1 directly behind Jan 31');
  assert.equal(sheet.getCell(6, 60).value, 'N', 'Ben Feb 28 is the last column');

  const coverage = addColoCoverageSheet(workbook, [january2, february2]);
  assert.equal(coverage.gapDays, 1);
  assert.equal(coverage.coveredDays, 1);
  const rows = [];
  workbook.getWorksheet('Colo-Abdeckung').eachRow((row) => rows.push(row.values.filter((value) => value !== undefined).join('|')));
  assert.ok(rows.some((line) => /04\.01\.2027\|Mo\|.*Anna \(Früh\).*abgedeckt/.test(line)));
  assert.ok(rows.some((line) => /05\.01\.2027\|Di\|.*night: 0\/1\|Lücke/.test(line)));
});

test('every export starts with the overview sheet: key figures, linked contents and legend', async () => {
  const { buildExcelWorkbook } = await import('../routes/shiftplanControl.js');
  const draft = {
    month: '2027-02', version: 1, status: 'draft', created_at: new Date('2027-01-01'), created_by: 'admin',
    shifts_json: [{ employee_name: 'Anna', day: 3, shift_code: 'E1' }, { employee_name: 'Ben', day: 4, shift_code: 'L1' }],
    conflicts: [{ severity: 'critical', type: 'x' }, { severity: 'warning', type: 'y' }],
    fairness: { Anna: { actualHours: 8, targetHours: 16 }, Ben: { actualHours: 8, targetHours: 16 } },
    config_snapshot: { shiftDefinitions: definitions },
  };
  for (const variant of ['management', 'team']) {
    const workbook = await buildExcelWorkbook([draft], null, { variant });
    const overview = workbook.worksheets[0];
    assert.equal(overview.name, 'Übersicht');
    const cells = [];
    overview.eachRow((row) => row.eachCell((cell) => cells.push(cell.value)));
    const text = cells.map((value) => (value && typeof value === 'object' ? value.text ?? value.richText?.map((part) => part.text).join('') ?? '' : String(value ?? ''))).join('\n');
    assert.match(text, /FR2 Schichtplan/);
    assert.match(text, /Generiert am 01.01.2027/);
    assert.match(text, /Erstellt von admin/);
    assert.match(text, /EQUINIX/, 'placeholder wordmark while no logo file exists');
    assert.match(text, /Februar 2027/);
    assert.match(text, /Legende: Schichten/);
    assert.match(text, /Frühschicht|E1/);
    const link = cells.find((value) => value && typeof value === 'object' && value.hyperlink && value.text === 'Februar 2027');
    assert.equal(link.hyperlink, "#'Februar 2027'!A1");
    if (variant === 'management') {
      assert.match(text, /Vertraulich/);
      assert.match(text, /Konflikte/i);
      assert.ok(cells.includes(2) || cells.includes(0.5), 'shift count and goal reached are written as numbers');
    } else {
      assert.doesNotMatch(text, /Vertraulich|Konflikte|Ist-Stunden/i);
    }
    const month = workbook.getWorksheet('Februar 2027');
    assert.match(month.getCell(1, 1).fill.fgColor.argb, /1E3A5F$/, 'title band');
    assert.equal(month.views[0].showGridLines, false);
    assert.equal(month.pageSetup.orientation, 'landscape');
  }
});

test('cover sheet places the logo image when a PNG file is available', async () => {
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { buildOverviewSheet } = await import('../lib/excelEnterprise.js');
  const file = path.join(os.tmpdir(), 'odin-test-logo.png');
  fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Übersicht');
  buildOverviewSheet(workbook, sheet, { title: 'FR2 Schichtplan', periodLabel: 'Test', variantLabel: 'Teamplan', generatedLabel: 'x', logoPath: file });
  assert.equal(sheet.getImages().length, 1);
  assert.notEqual(sheet.getCell(1, 2).value, 'EQUINIX');
  fs.unlinkSync(file);
});

test('holidays are marked with F under the day and employees who are not planned stay out of the hours lists', async () => {
  const { buildExcelWorkbook } = await import('../routes/shiftplanControl.js');
  const draft = {
    month: '2026-12', version: 1, status: 'draft', created_at: new Date('2026-11-01'), created_by: 'admin',
    shifts_json: [{ employee_name: 'Anna', day: 25, shift_code: 'E1' }, { employee_name: 'Zed', day: 25, shift_code: 'E1' }],
    conflicts: [], fairness: { Anna: { actualHours: 8, targetHours: 160 } },
    config_snapshot: { shiftDefinitions: definitions, excludedEmployeeNames: ['Zed'] },
  };
  const workbook = await buildExcelWorkbook([draft], null, { variant: 'management' });
  const month = workbook.getWorksheet('Dezember 2026');
  const header = month.getCell(4, 26); // 25th = column 26
  assert.equal(header.value, '25\nF', 'day number with F below it');
  assert.match(header.fill.fgColor.argb, /B91C1C$/);
  assert.match(String(header.note?.texts ? header.note.texts.map((part) => part.text).join('') : header.note), /1\. Weihnachtstag/);
  assert.equal(month.getCell(4, 24).value, 23, 'the 23rd is no holiday');
  const lines = [];
  month.eachRow((row) => lines.push(String(row.getCell(1).value ?? '')));
  assert.ok(lines.some((line) => /F = Feiertag:.*25\.12\. 1\. Weihnachtstag/.test(line)));

  const rowOf = (sheet, name) => { let found = null; sheet.eachRow((row) => { if (row.getCell(1).value === name || row.getCell(2).value === name) found = row; }); return found; };
  assert.equal(rowOf(month, 'Zed') !== null, true, 'still in the plan grid');
  assert.ok([null, undefined, ''].includes(rowOf(month, 'Zed').getCell(32).value), 'no hours for Zed');
  assert.equal(rowOf(workbook.getWorksheet('Stunden & Wünsche'), 'Zed'), null);
  assert.equal(rowOf(workbook.getWorksheet('Schichtverteilung'), 'Zed'), null);
  assert.ok(rowOf(workbook.getWorksheet('Schichtverteilung'), 'Anna'));
});
