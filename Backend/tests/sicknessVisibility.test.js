import test from 'node:test';
import assert from 'node:assert/strict';

import { canSeeSickness, maskAbsenceRows, maskScheduleSickness } from '../lib/sicknessVisibility.js';

const dbWith = (ids) => ({ query: async () => ({ rows: [{ value: JSON.stringify(ids) }] }) });

test('only admins and the selected people may see sick leave', async () => {
  assert.equal(await canSeeSickness(dbWith([5]), { id: 5 }), true);
  assert.equal(await canSeeSickness(dbWith([5]), { id: 6 }), false);
  assert.equal(await canSeeSickness(dbWith([]), { id: 6, is_admin: true }), true);
  assert.equal(await canSeeSickness(dbWith([5]), null), false);
  assert.equal(await canSeeSickness({ query: async () => { throw new Error('db'); } }, { id: 5 }), false, 'no access without a readable list');
});

test('everybody else only sees a neutral absence', () => {
  const schedule = { Anna: { 1: 'E1', 2: 'KRANK', 3: 's' }, Ben: { 1: 'ABW' } };
  const masked = maskScheduleSickness(schedule);
  assert.deepEqual(masked, { Anna: { 1: 'E1', 2: 'ABW', 3: 'ABW' }, Ben: { 1: 'ABW' } });
  assert.equal(schedule.Anna[2], 'KRANK', 'input is not changed');

  const rows = maskAbsenceRows([
    { id: 1, type: 'SICK', note: 'Grippe' },
    { id: 2, type: 'VACATION', note: 'Urlaub' },
  ]);
  assert.equal(rows[0].type, 'ABSENT');
  assert.equal(rows[0].note, null, 'the reason never leaves the server');
  assert.equal(rows[1].type, 'VACATION');
});
