import test from 'node:test';
import assert from 'node:assert/strict';

import { notifyPlanActivated, notifyShiftChanges, notifySickAbsence, formatPlanDate } from '../lib/planNotifications.js';

function fakeDb({ settings = {}, users = [] } = {}) {
  const notifications = [];
  const recipients = [];
  return {
    notifications,
    recipients,
    async query(sql, params = []) {
      if (/FROM app_settings/.test(sql)) return { rows: settings[params[0]] === undefined ? [] : [{ value: settings[params[0]] }] };
      if (/FROM users/.test(sql)) return { rows: users };
      if (/INSERT INTO jarvis_notifications/.test(sql)) {
        const id = notifications.length + 1;
        notifications.push({ id, title: params[0], body: params[1], kind: params[2], createdBy: params[4] });
        return { rows: [{ id }] };
      }
      if (/INSERT INTO jarvis_notification_recipients/.test(sql)) {
        recipients.push({ notificationId: params[0], userId: params[1] });
        return { rows: [] };
      }
      throw new Error(`unhandled query: ${sql.slice(0, 80)}`);
    },
  };
}

const USERS = [
  { id: 1, first_name: 'Patrick', last_name: 'Brode', provisioned_employee_name: 'Brode, Patrick' },
  { id: 2, first_name: 'Anna', last_name: 'Dietz', provisioned_employee_name: 'Dietz, Anna' },
  { id: 3, first_name: 'Ben', last_name: 'Keller', provisioned_employee_name: null },
];
const recipientsOf = (db, notificationId) => db.recipients.filter((row) => row.notificationId === notificationId).map((row) => row.userId);

test('a plan change tells the person concerned and the admin', async () => {
  const db = fakeDb({ users: USERS });
  const result = await notifyShiftChanges({
    db,
    changes: [{ employee_name: 'Dietz, Anna', date: '2027-01-05', old_value: 'E1', new_value: 'L1' }],
    actor: 'Chef',
    actorUserId: 99,
  });
  assert.equal(result.sent, 2);
  const person = db.notifications[0];
  assert.equal(person.title, 'Dein Dienstplan wurde geändert');
  assert.match(person.body, /Di 05\.01\.: E1 → L1/);
  assert.deepEqual(recipientsOf(db, person.id), [2]);
  const admin = db.notifications[1];
  assert.match(admin.title, /Dienstplan geändert/);
  assert.deepEqual(recipientsOf(db, admin.id), [1], 'default admin: the plan owner');
});

test('the person who made the change is not notified about it, matching works with first/last name too', async () => {
  const db = fakeDb({ users: USERS, settings: { 'shiftplan.plan_notify_admin_user_ids': '[2]' } });
  await notifyShiftChanges({
    db,
    changes: [{ employee_name: 'Ben Keller', date: '2027-01-06', old_value: null, new_value: 'N' }, { employee_name: 'Dietz, Anna', date: '2027-01-06', old_value: 'E1', new_value: null }],
    actor: 'Anna Dietz',
    actorUserId: 2,
  });
  const targets = db.recipients.map((row) => row.userId);
  assert.ok(targets.includes(3), 'Ben Keller (matched by first + last name) is told');
  assert.ok(!targets.includes(2), 'the actor and configured admin Anna is not told about her own change');
});

test('sick: the admin gets an instruction, also when the plan sets KRANK', async () => {
  const db = fakeDb({ users: USERS });
  await notifyShiftChanges({
    db,
    changes: [{ employee_name: 'Dietz, Anna', date: '2027-01-07', old_value: 'E1', new_value: 'KRANK' }],
    actor: 'Chef',
    actorUserId: 99,
  });
  const sick = db.notifications.find((notification) => /Krankmeldung/.test(notification.title));
  assert.ok(sick, 'sick notice exists');
  assert.equal(sick.kind, 'instruction');
  assert.deepEqual(recipientsOf(db, sick.id), [1]);

  const direct = fakeDb({ users: USERS });
  const sent = await notifySickAbsence({ db: direct, entries: [{ employee_name: 'Dietz, Anna', start_date: '2027-01-11', end_date: '2027-01-13' }], actor: 'Chef' });
  assert.equal(sent.sent, 1);
  assert.match(direct.notifications[0].body, /Mo 11\.01\. bis Mi 13\.01\./);
});

test('the setting can switch plan notifications off', async () => {
  const db = fakeDb({ users: USERS, settings: { 'shiftplan.plan_notifications_enabled': 'false' } });
  const result = await notifyShiftChanges({ db, changes: [{ employee_name: 'Dietz, Anna', date: '2027-01-05', old_value: 'E1', new_value: 'L1' }], actor: 'Chef', actorUserId: 99 });
  assert.equal(result.sent, 0);
  assert.equal(db.notifications.length, 0);
});

test('activation: differences for an existing plan, "published" for a new month', async () => {
  const changed = fakeDb({ users: USERS });
  await notifyPlanActivated({
    db: changed, year: 2027, month: 1, monthLabel: 'Januar 2027', actor: 'Chef', actorUserId: 99,
    previous: [{ employee_name: 'Dietz, Anna', day: 4, shift_code: 'E2' }],
    next: [{ employee_name: 'Dietz, Anna', day: 4, shift_code: 'L1' }],
  });
  assert.match(changed.notifications[0].body, /E2 → L1/);

  const fresh = fakeDb({ users: USERS });
  await notifyPlanActivated({
    db: fresh, year: 2027, month: 2, monthLabel: 'Februar 2027', actor: 'Chef', actorUserId: 99,
    previous: [],
    next: [{ employee_name: 'Dietz, Anna', day: 1, shift_code: 'E1' }, { employee_name: 'Dietz, Anna', day: 2, shift_code: 'E1' }],
  });
  assert.match(fresh.notifications[0].title, /Februar 2027 ist veröffentlicht/);
  assert.match(fresh.notifications[0].body, /2 Schichten/);
});

test('a failing database never throws into the request', async () => {
  const broken = { query: async () => { throw new Error('db down'); } };
  const result = await notifyShiftChanges({ db: broken, changes: [{ employee_name: 'X', date: '2027-01-05', old_value: 'E1', new_value: 'L1' }], actor: 'Chef' });
  assert.equal(result.sent, 0);
  assert.equal(formatPlanDate('2027-01-05'), 'Di 05.01.');
});
