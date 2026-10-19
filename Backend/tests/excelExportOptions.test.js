import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pool from '../db.js';
import { buildExcelWorkbook } from '../routes/shiftplanControl.js';
import { createFakePlanningDb } from './helpers/fakePlanningDb.js';

// Three employees: Anna has submitted wishes, Ben has none stored, Carla never saved anything.
function setup() {
  const { db, query } = createFakePlanningDb();
  pool.query = query;
  db.preferences = [
    { user_id: 1, first_name: 'Anna', last_name: 'Adler', provisioned_employee_name: 'Anna Adler', preferred_shifts: ['E1'], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [], max_nights_per_month: null, monthly_preferences: {}, preferred_colleagues: [] },
    { user_id: 2, first_name: 'Ben', last_name: 'Berg', provisioned_employee_name: 'Ben Berg', preferred_shifts: [], unwanted_shifts: [], blocked_days: [], preferred_holidays: [], preferred_days: [], max_nights_per_month: null, monthly_preferences: {}, preferred_colleagues: [] },
  ];
  const draft = {
    id: 1, month: '2027-03', version: 1, status: 'draft', title: null, description: null,
    created_at: new Date('2027-02-01T10:00:00Z'), created_by: 'tester',
    shifts_json: [
      { employee_name: 'Anna Adler', day: 1, shift_code: 'E1' },
      { employee_name: 'Ben Berg', day: 1, shift_code: 'E1' },
      { employee_name: 'Carla Conrad', day: 2, shift_code: 'E1' },
    ],
    fairness: {
      'Anna Adler': { targetHours: 168, actualHours: 160 },
      'Ben Berg': { targetHours: 168, actualHours: 170 },
      'Carla Conrad': { targetHours: 168, actualHours: 150 },
    },
    config_snapshot: { shiftDefinitions: [{ code: 'E1', type: 'early', durationHours: 8 }], planReport: {} },
    conflicts: [], explanations: {},
  };
  return { draft };
}

const headersOf = (sheet, row) => sheet.getRow(row).values.slice(1).filter((value) => value !== undefined && value !== null);
const rowOf = (sheet, name, nameColumn = 2) => {
  for (let row = 1; row <= sheet.rowCount; row++) if (sheet.getCell(row, nameColumn).value === name) return row;
  return -1;
};
const isMissingFill = (cell) => String(cell.fill?.fgColor?.argb || '').endsWith('FDE68A');

describe('management Excel export: chosen content', () => {
  it('contains hours, wishes and the wish status by default and marks employees without wishes', async () => {
    const { draft } = setup();
    const workbook = await buildExcelWorkbook([draft], null, { variant: 'management' });
    const sheet = workbook.getWorksheet('Stunden & Wünsche');
    assert.ok(sheet, 'overview sheet exists');
    assert.ok(workbook.getWorksheet('Wunschdetails'), 'wish detail sheet exists');
    const headers = headersOf(sheet, 4);
    for (const expected of ['Soll (h)', 'Ist (h)', 'Wünsche abgegeben', 'Wunscherfüllung']) assert.ok(headers.includes(expected), `${expected} column`);

    const submittedColumn = headers.indexOf('Wünsche abgegeben') + 1;
    assert.equal(sheet.getCell(rowOf(sheet, 'Anna Adler'), submittedColumn).value, 'Ja');
    assert.equal(sheet.getCell(rowOf(sheet, 'Ben Berg'), submittedColumn).value, 'Nein');
    assert.equal(sheet.getCell(rowOf(sheet, 'Carla Conrad'), submittedColumn).value, 'Nein');
    assert.ok(!isMissingFill(sheet.getCell(rowOf(sheet, 'Anna Adler'), 2)), 'employee with wishes is not highlighted');
    assert.ok(isMissingFill(sheet.getCell(rowOf(sheet, 'Ben Berg'), 2)), 'employee without wishes is highlighted');
    assert.ok(isMissingFill(sheet.getCell(rowOf(sheet, 'Carla Conrad'), 2)));

    const month = workbook.getWorksheet('März 2027');
    assert.ok(isMissingFill(month.getCell(rowOf(month, 'Ben Berg', 1), 1)), 'highlighted on the month sheet too');
    assert.ok(!isMissingFill(month.getCell(rowOf(month, 'Anna Adler', 1), 1)));
  });

  it('only hours: no wish sheet, no wish columns, no highlighting', async () => {
    const { draft } = setup();
    const workbook = await buildExcelWorkbook([draft], null, { variant: 'management', includeHours: true, includeWishes: false, includeWishStatus: false });
    assert.equal(workbook.getWorksheet('Wunschdetails'), undefined);
    const sheet = workbook.getWorksheet('Stunden');
    const headers = headersOf(sheet, 4);
    assert.ok(headers.includes('Soll (h)') && headers.includes('Ist (h)'));
    assert.ok(!headers.includes('Wünsche abgegeben') && !headers.includes('Wunscherfüllung'));
    const month = workbook.getWorksheet('März 2027');
    assert.ok(!isMissingFill(month.getCell(rowOf(month, 'Ben Berg', 1), 1)));
  });

  it('only wish status: no hours anywhere, the people without wishes stand out', async () => {
    const { draft } = setup();
    const workbook = await buildExcelWorkbook([draft], null, { variant: 'management', includeHours: false, includeWishes: false, includeWishStatus: true });
    const sheet = workbook.getWorksheet('Wunsch-Status');
    const headers = headersOf(sheet, 4);
    assert.ok(headers.includes('Wünsche abgegeben'));
    assert.ok(!headers.includes('Soll (h)') && !headers.includes('Ist (h)'));
    assert.ok(isMissingFill(sheet.getCell(rowOf(sheet, 'Carla Conrad'), 2)));
    const month = workbook.getWorksheet('März 2027');
    assert.ok(!month.getRow(4).values.includes('Stunden'), 'no hours column on the month sheet');
  });

  it('the team export stays free of hours and wish data', async () => {
    const { draft } = setup();
    const workbook = await buildExcelWorkbook([draft], null, { variant: 'team' });
    assert.equal(workbook.getWorksheet('Stunden & Wünsche'), undefined);
    assert.equal(workbook.getWorksheet('Wunschdetails'), undefined);
  });
});
