import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import db from '../db.js';
import router from '../routes/standaloneIdentity.js';

const users = [
  { id: 1, first_name: 'Patrick', last_name: 'Brode', login_name: 'pbrode@eqx', email: 'patrick.brode@eu.equinix.com', upn: null, approved: true, is_admin: true, is_root: false },
  { id: 2, first_name: 'Nina', last_name: 'Schauer', login_name: 'nschauer@eqx', email: null, upn: null, approved: true, is_admin: false, is_root: false },
  { id: 3, first_name: 'Max', last_name: 'Mustermann', login_name: null, email: 'max.mustermann@equinix.com', upn: null, approved: true, is_admin: false, is_root: false },
  { id: 4, first_name: 'Eva', last_name: 'Zwilling', login_name: null, email: null, upn: null, approved: true, is_admin: false, is_root: false },
  { id: 5, first_name: 'Eva', last_name: 'Zwilling', login_name: null, email: null, upn: null, approved: true, is_admin: false, is_root: false },
];

// Minimal stand-in for the three queries of the route.
db.query = async (text, params = []) => {
  if (/UPDATE users/.test(text)) return { rows: [] };
  if (/WHERE LOWER\(email\) = ANY/.test(text)) {
    const wanted = new Set(params[0]);
    return { rows: users.filter((user) => [user.email, user.upn, user.login_name].some((value) => value && wanted.has(value.toLowerCase()))).slice(0, 2) };
  }
  if (/WHERE approved = TRUE/.test(text)) return { rows: users.filter((user) => user.approved) };
  throw new Error(`unexpected query: ${text.slice(0, 60)}`);
};

async function verify(body) {
  const app = express();
  app.use(express.json());
  app.use('/', router);
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}

test('user name only, e-mail only and both identify the employee', async () => {
  assert.equal((await verify({ jarvisUserName: 'pbrode@eqx' })).body.user.id, 1);
  assert.equal((await verify({ email: 'patrick.brode@eu.equinix.com' })).body.user.id, 1);
  assert.equal((await verify({ email: 'patrick.brode@eu.equinix.com', jarvisUserName: 'someone-else' })).body.user.id, 1);
});

test('Mendix user name that is unknown but the e-mail in the profile menu matches', async () => {
  const result = await verify({ jarvisUserName: 'nschauer', email: 'max.mustermann@equinix.com' });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.id, 3);
});

test('unknown user name falls back to first.last of the e-mail or the reported name', async () => {
  const byEmail = await verify({ jarvisUserName: 'nschauer', email: 'nina.schauer@eu.equinix.com' });
  assert.equal(byEmail.status, 200);
  assert.equal(byEmail.body.user.id, 2);
  const byName = await verify({ jarvisUserName: 'nschauer', displayName: 'Nina Schauer' });
  assert.equal(byName.body.user.id, 2);
});

test('not mapped and ambiguous names are refused', async () => {
  const unknown = await verify({ jarvisUserName: 'nobody', email: 'no.body@equinix.com' });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.code, 'SSO_USER_NOT_MAPPED');
  const twins = await verify({ email: 'eva.zwilling@equinix.com' });
  assert.equal(twins.status, 409);
});
