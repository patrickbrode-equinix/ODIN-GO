import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createVacationRouter } from '../routes/userVacations.js';
import { recomputeConflictsInternal } from '../routes/absences.js';

async function withApi(t, query, policy = 'write') {
  const app = express();
  app.use(express.json());
  const recomputed = [];
  app.use('/users/:userId/vacations', createVacationRouter({ query }, {
    authenticate(req, res, next) { req.user = { approved: true, accessPolicy: { user_management: policy } }; next(); },
    async recomputeConflicts(...args) { recomputed.push(args); },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/users/7/vacations`;
  const request = (suffix = '', method = 'GET', body) => fetch(url + suffix, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { request, recomputed };
}

const employee = { id: 7, employee_name: 'Jane Doe' };

test('yearly vacation API scopes the account to a user and permits negative balances', async t => {
  const calls = [];
  const { request } = await withApi(t, async (sql, params) => {
    calls.push({ sql, params });
    return { rows: sql.includes('FROM users') ? [employee] : [{ id: 9, start_date: '2026-01-01', end_date: '2026-02-28' }] };
  });
  const response = await request('?year=2026');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).remaining, -12);
  assert.deepEqual(calls[1].params, [7, 'Jane Doe', '2026-01-01', '2026-12-31']);
  assert.match(calls[1].sql, /employee_id = \$1/);
});

test('creating vacation uses the canonical employee and recomputes conflicts', async t => {
  const calls = [];
  const { request, recomputed } = await withApi(t, async (sql, params) => {
    calls.push({ sql, params });
    return { rows: sql.includes('FROM users') ? [employee] : [{ id: 10 }] };
  });
  const response = await request('', 'POST', { start_date: '2026-10-02', end_date: '2026-10-06', note: ' Break ' });
  assert.equal(response.status, 201);
  assert.deepEqual(calls[1].params, ['Jane Doe', 7, '2026-10-02', '2026-10-06', 'Break']);
  assert.deepEqual(recomputed, [['Jane Doe', '2026-10-02', '2026-10-06']]);
  assert.match(calls[1].sql, /'VACATION'/);
});

test('invalid or reversed dates never create a vacation record', async t => {
  const { request } = await withApi(t, async sql => {
    assert.match(sql, /FROM users/);
    return { rows: [employee] };
  });
  for (const [start_date, end_date] of [['2026-02-29', '2026-03-01'], ['2026-10-06', '2026-10-02']]) {
    assert.equal((await request('', 'POST', { start_date, end_date })).status, 400);
  }
});

test('read-only user management cannot add or delete vacation', async t => {
  const { request } = await withApi(t, async sql => {
    assert.match(sql, /FROM users/);
    return { rows: [employee] };
  }, 'view');
  assert.equal((await request('', 'POST', { start_date: '2026-10-02', end_date: '2026-10-06' })).status, 403);
  assert.equal((await request('/10', 'DELETE')).status, 403);
});

test('deletion is restricted to vacations of the selected employee', async t => {
  const { request } = await withApi(t, async (sql, params) => {
    if (sql.includes('FROM users')) return { rows: [employee] };
    assert.match(sql, /type = 'VACATION'/);
    assert.match(sql, /employee_id = \$2/);
    assert.deepEqual(params, [99, 7, 'Jane Doe']);
    return { rows: [] };
  });
  assert.equal((await request('/99', 'DELETE')).status, 404);
});

test('deleting the last absence clears conflicts without recreating them', async () => {
  const calls = [];
  await recomputeConflictsInternal('Jane Doe', '2026-10-02', '2026-10-06', {
    async query(sql) { calls.push(sql); return { rows: [] }; },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /DELETE FROM absence_conflicts/);
  assert.match(calls[1], /FROM absences/);
});

test('recomputeConflictsInternal normalises local-midnight Date inputs to calendar date keys', async () => {
  const deleteParams = [];
  await recomputeConflictsInternal('Jane Doe', new Date(2026, 9, 2), new Date(2026, 9, 6), {
    async query(sql, params) { if (sql.includes('DELETE FROM absence_conflicts')) deleteParams.push(params); return { rows: [] }; },
  });
  assert.deepEqual(deleteParams[0], ['Jane Doe', '2026-10-02', '2026-10-06']);
});

test('vacation spans above 366 days are rejected', async t => {
  const { request } = await withApi(t, async sql => ({ rows: sql.includes('FROM users') ? [employee] : [] }));
  assert.equal((await request('', 'POST', { start_date: '2026-01-01', end_date: '2027-12-31' })).status, 400);
});

test('deleting a vacation entry restores the annual account', async t => {
  let entries = [{ id: 10, employee_name: 'Jane Doe', employee_id: 7, start_date: '2026-10-05', end_date: '2026-10-09', type: 'VACATION' }];
  const { request, recomputed } = await withApi(t, async sql => {
    if (sql.includes('FROM users')) return { rows: [employee] };
    if (sql.includes('DELETE FROM absences')) { const removed = entries; entries = []; return { rows: removed }; }
    return { rows: entries };
  });
  assert.equal((await (await request('?year=2026')).json()).remaining, 25);
  assert.equal((await request('/10', 'DELETE')).status, 200);
  assert.equal((await (await request('?year=2026')).json()).remaining, 30);
  assert.deepEqual(recomputed, [['Jane Doe', '2026-10-05', '2026-10-09']]);
});

test('users without user management access cannot read vacation records', async t => {
  const { request } = await withApi(t, async () => { throw new Error('Unauthorized database access'); }, 'none');
  assert.equal((await request('?year=2026')).status, 403);
});

test('overlapping absences retain real shift conflicts and ABW is never a staffing conflict', async () => {
  const conflicts = [];
  await recomputeConflictsInternal('Jane Doe', '2026-10-24', '2026-10-26', {
    async query(sql, params) {
      if (sql.includes('FROM absences')) return { rows: [{ start_date: '2026-10-25', end_date: '2026-10-26' }] };
      if (sql.includes('FROM shifts')) return { rows: [{ shift_code: params[2] === 25 ? 'ABW' : 'E1' }] };
      if (sql.includes('INSERT INTO absence_conflicts')) conflicts.push(params);
      return { rows: [] };
    },
  });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0][1], '2026-10-26');
});
