import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { getPlanningMonths, groupPlanningDrafts, buildDraftSheetHeaderText, sanitizeCellText } from '../lib/planningPeriods.js';
import { generatePeriodDrafts } from '../services/planningPeriodDrafts.js';
import { buildExcelWorkbook } from '../routes/shiftplanControl.js';

test('quarter periods select exactly three consecutive months, including Q4', () => {
  assert.deepEqual(getPlanningMonths(2027, 1), ['2027-01', '2027-02', '2027-03']);
  assert.deepEqual(getPlanningMonths(2027, 4), ['2027-10', '2027-11', '2027-12']);
  assert.equal(getPlanningMonths(2028).length, 12);
  for (const quarter of [0, 5, 1.5, NaN]) assert.throws(() => getPlanningMonths(2027, quarter));
  for (const year of [2026, 2041, 2027.5]) assert.throws(() => getPlanningMonths(year, 1));
});

function summary(id, month, batch, version = 1) {
  return { id, month, version, created_at: '2026-10-06T12:00:00Z', planning_batch: batch, note: null };
}

test('groups keep repeated quarter and year runs separate and sort their months', () => {
  const first = { id: 'first', type: 'quarter', year: 2027, quarter: 1 };
  const second = { ...first, id: 'second' };
  const year = { id: 'year', type: 'year', year: 2027, quarter: null };
  const groups = groupPlanningDrafts([
    summary(3, '2027-03', first), summary(1, '2027-01', first), summary(2, '2027-02', first),
    summary(4, '2027-01', second, 2), summary(5, '2027-01', year, 3), summary(6, '2027-01', null, 4),
  ]);
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.find(group => group.id === 'first').drafts.map(draft => draft.id), [1, 2, 3]);
  assert.equal(groups.find(group => group.id === 'second').drafts[0].version, 2);
  assert.equal(groups.find(group => group.id === 'year').type, 'year');
  assert.equal(groups.find(group => group.type === 'month').drafts[0].version, 4);
});

test('legacy standard year runs group by transaction timestamp while monthly versions stay collapsible', () => {
  const rows = [summary(1, '2027-01', null), summary(2, '2027-02', null)];
  rows.forEach(row => { row.note = 'Jahresplanung 2027'; });
  const later = { ...rows[0], id: 3, created_at: '2026-10-07T12:00:00Z', version: 2 };
  const groups = groupPlanningDrafts([...rows, later, summary(4, '2027-03', null), summary(5, '2027-03', null, 2)]);
  assert.equal(groups.filter(group => group.type === 'year').length, 2);
  assert.deepEqual(groups.find(group => group.type === 'month').drafts.map(draft => draft.version), [2, 1]);
});

function fakePool({ failInsert = 0 } = {}) {
  const calls = [];
  let released = false;
  let inserts = 0;
  return {
    calls,
    get released() { return released; },
    async connect() {
      return {
        async query(sql, params) {
          calls.push({ sql, params });
          if (sql.startsWith('SELECT')) return { rows: [{ next_version: 2 }] };
          if (sql.includes('INSERT')) {
            inserts += 1;
            if (inserts === failInsert) throw new Error('insert failed');
            return { rows: [{ id: inserts }] };
          }
          return { rows: [] };
        },
        release() { released = true; },
      };
    },
  };
}

const plan = month => ({ shifts: [], explanations: {}, conflicts: [], fairness: {}, configSnapshot: {}, planReport: { activeEmployees: 1 }, carryState: { lastMonth: month } });

test('quarter generation carries month state, stores a shared group ID and commits all three drafts', async () => {
  const pool = fakePool();
  const carry = [];
  const result = await generatePeriodDrafts({ year: 2027, quarter: 1, createdBy: 'admin', ownerId: 7, pool,
    async generateMonth(year, month, days, createdBy, options) { carry.push(options.carryState); assert.equal(days, month === 2 ? 28 : 31); return plan(month); } });
  assert.deepEqual(carry, [null, { lastMonth: 1 }, { lastMonth: 2 }]);
  assert.equal(result.generated.length, 3);
  assert.equal(pool.calls.at(-1).sql, 'COMMIT');
  assert.equal(pool.released, true);
  const inserts = pool.calls.filter(call => call.sql.includes('INSERT'));
  assert.deepEqual(inserts.map(call => call.params[0]), ['2027-01', '2027-02', '2027-03']);
  for (const { params } of inserts) {
    assert.equal(JSON.parse(params[6]).planningBatch.id, result.groupId);
    assert.equal(JSON.parse(params[6]).planningBatch.quarter, 1);
    assert.equal(params[9], 7);
  }
});

test('a failed period insert rolls back the complete group and releases the connection', async () => {
  const pool = fakePool({ failInsert: 2 });
  await assert.rejects(generatePeriodDrafts({ year: 2027, quarter: 2, createdBy: 'admin', ownerId: 7, pool, generateMonth: async (year, month) => plan(month) }), /insert failed/);
  assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(pool.calls.some(call => call.sql === 'COMMIT'), false);
  assert.equal(pool.released, true);
});

test('failed generation writes no partial period and a full year includes all twelve months', async () => {
  const pool = fakePool();
  await assert.rejects(generatePeriodDrafts({ year: 2027, quarter: 1, pool, generateMonth: async (year, month) => { if (month === 2) throw new Error('generation failed'); return plan(month); } }), /generation failed/);
  assert.equal(pool.calls.length, 0);
  const result = await generatePeriodDrafts({ year: 2028, createdBy: 'admin', ownerId: 7, pool, generateMonth: async (year, month, days) => { if (month === 2) assert.equal(days, 29); return plan(month); } });
  assert.equal(result.total, 12);
  assert.equal(result.generated.at(-1).month, '2028-12');
});

test('quarter and year Excel exports retain monthly versions in chronological worksheet tabs', async () => {
  for (const quarter of [1, null]) {
    const months = getPlanningMonths(2027, quarter);
    const drafts = months.map((month, index) => ({ month, version: index + 2, status: 'draft', shifts_json: [{ employee_name: 'Jane Doe', day: 1, shift_code: 'E1' }], conflicts: [], config_snapshot: {}, fairness: {} }));
    const workbook = await buildExcelWorkbook([...drafts].reverse(), { type: quarter ? 'quarter' : 'year', year: 2027, quarter });
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(await workbook.xlsx.writeBuffer());
    assert.equal(restored.worksheets.length, months.length + 1);
    assert.deepEqual(restored.worksheets.slice(0, months.length).map(sheet => sheet.name), months.map(month => new Date(2027, Number(month.slice(5)) - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })));
    assert.equal(restored.worksheets.at(-1).name, quarter ? 'Quartalsübersicht' : 'Jahresübersicht');
    assert.equal(restored.worksheets.at(-1).getCell(4, 2).value, 2);
    assert.equal(restored.worksheets[0].getCell(5, 2).value, 'E1');
  }
});


test('groupPlanningDrafts exposes group title and description from the batch drafts', () => {
  const batch = { id: 'g1', type: 'quarter', year: 2027, quarter: 1 };
  const groups = groupPlanningDrafts([
    { ...summary(1, '2027-01', batch), title: null, description: null },
    { ...summary(2, '2027-02', batch), title: 'Q1 Plan', description: 'Beschreibung' },
    { ...summary(3, '2027-05', null), title: 'Einzel', description: 'x' },
  ]);
  const group = groups.find(entry => entry.id === 'g1');
  assert.equal(group.title, 'Q1 Plan');
  assert.equal(group.description, 'Beschreibung');
  const month = groups.find(entry => entry.type === 'month');
  assert.equal(month.title, null);
  assert.equal(month.description, null);
});

test('period inserts keep the existing parameter positions and append title/description', async () => {
  const pool = fakePool();
  const result = await generatePeriodDrafts({ year: 2027, quarter: 1, title: '  Q1  ', description: 'Text', createdBy: 'admin', ownerId: 7, pool, generateMonth: async (y, m) => plan(m) });
  assert.equal(result.title, 'Q1');
  for (const { params } of pool.calls.filter(call => call.sql.includes('INSERT'))) {
    assert.equal(params[9], 7);
    assert.equal(params[10], 'Q1');
    assert.equal(params[11], 'Text');
    assert.equal(params.length, 12);
  }
});

test('draft sheet header text combines title, description and meta line safely', () => {
  const meta = 'Version 1 | Status: draft';
  assert.deepEqual(buildDraftSheetHeaderText({ metaLine: meta, sheetName: 'Januar 2027' }),
    { title: 'ODIN Schichtplan – Januar 2027', subtitle: meta, lineCount: 1, rowHeight: 18 });
  const withText = buildDraftSheetHeaderText({ title: 'Mein Plan', description: 'Notiz', metaLine: meta, sheetName: 'Januar 2027' });
  assert.equal(withText.title, 'Mein Plan – Januar 2027');
  assert.equal(withText.subtitle, `Notiz\n${meta}`);
  assert.equal(withText.rowHeight, 30);
  assert.equal(sanitizeCellText('=1+1'), ' =1+1');
});

test('Excel month sheets and summary show title and description', async () => {
  const months = getPlanningMonths(2027, 1);
  const drafts = months.map((month, index) => ({ month, version: 1, status: 'draft', title: 'Q1 Plan', description: 'Beschreibung', shifts_json: [], conflicts: [], config_snapshot: {}, fairness: {}, created_at: '2026-10-06T12:00:00Z', created_by: 'a' }));
  const workbook = await buildExcelWorkbook(drafts, { type: 'quarter', year: 2027, quarter: 1, title: 'Gruppe', description: 'Gruppenbeschreibung' });
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(restored.worksheets.length, 4);
  assert.match(String(restored.worksheets[0].getCell(1, 1).value), /^Gruppe – /);
  assert.match(String(restored.worksheets[0].getCell(2, 1).value), /^Beschreibung\nVersion 1/);
  assert.equal(restored.worksheets.at(-1).getCell(1, 1).value, 'Gruppe');
  assert.equal(restored.worksheets.at(-1).getCell(2, 1).value, 'Gruppenbeschreibung');
  const single = await buildExcelWorkbook([drafts[0]]);
  const one = new ExcelJS.Workbook();
  await one.xlsx.load(await single.xlsx.writeBuffer());
  assert.match(String(one.worksheets[0].getCell(1, 1).value), /^Q1 Plan – /);
  assert.equal(one.worksheets.length, 1);
});

test('team Excel shows only the shifts: no version line, no hours column, short summary', async () => {
  const months = getPlanningMonths(2027, 1);
  const drafts = months.map((month) => ({ month, version: 3, status: 'draft', shifts_json: [{ employee_name: 'Jane Doe', day: 1, shift_code: 'E1' }], conflicts: [], config_snapshot: {}, fairness: { 'Jane Doe': { actualHours: 160 } }, created_at: '2026-10-06T12:00:00Z', created_by: 'secret-author' }));
  const workbook = await buildExcelWorkbook(drafts, { type: 'quarter', year: 2027, quarter: 1 }, { variant: 'team' });
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const month = restored.worksheets[0];
  assert.doesNotMatch(String(month.getCell(2, 1).value), /Version|secret-author/);
  assert.equal(month.getCell(4, 32).value, null); // no "Stunden" column behind the 31 days
  assert.equal(restored.worksheets.at(-1).getCell(3, 2).value, 'Schichten');
  assert.equal(restored.worksheets.at(-1).getCell(3, 4).value, null);
});

test('management Excel puts hours and wish sheets in front of the month sheets', async () => {
  const drafts = [{ month: '2027-01', version: 1, status: 'draft', shifts_json: [{ employee_name: 'Jane Doe', day: 4, shift_code: 'E1' }], conflicts: [], config_snapshot: {}, fairness: { 'Jane Doe': { actualHours: 8, targetHours: 160 } }, created_at: '2026-10-06T12:00:00Z', created_by: 'a' }];
  const workbook = await buildExcelWorkbook(drafts, null, { variant: 'management' });
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.deepEqual(restored.worksheets.map(sheet => sheet.name), ['Stunden & Wünsche', 'Wunschdetails', 'Januar 2027']);
  const overview = restored.worksheets[0];
  assert.equal(overview.getCell(5, 2).value, 'Jane Doe');
  assert.equal(overview.getCell(5, 3).value, 160);
  assert.equal(overview.getCell(5, 4).value, 8);
});
