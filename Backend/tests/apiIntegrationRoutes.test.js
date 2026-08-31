import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';

import db from '../db.js';
import handoverRoutes from '../routes/handover.js';
import assignmentRoutes from '../routes/assignment.js';
import assignmentActionsRoutes from '../routes/assignmentActions.js';
import { config } from '../config/index.js';

const JWT_SECRET = 'api-integration-test-secret';

function startApp(routerPath, router) {
  const app = express();
  app.use(express.json());
  app.use(routerPath, router);

  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function authHeaders() {
  if (config.isShiftplannerMode) {
    return {
      'x-shiftplanner-key': config.SHIFTPLANNER_API_KEY,
      'x-shiftplanner-admin': jwt.sign({ scope: 'shiftplanner_admin' }, config.JWT_SECRET),
    };
  }
  const token = jwt.sign({ userId: 1 }, JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

function authUserRow() {
  return {
    id: 1,
    login_name: 'root',
    email: 'root@example.test',
    user_group: 'Admin',
    approved: true,
    is_root: true,
    is_admin: true,
    must_change_password: false,
    access_override: {},
  };
}

const queueTicket = {
  id: 3644528,
  external_id: '3644528',
  activity: '3644528',
  queue_type: 'SmartHands',
  active: true,
  assigned_worker_id: 10,
  owner: null,
};

const employeeRow = {
  id: 10,
  name: 'Test Employee',
  first_name: 'Test',
  last_name: 'Employee',
  email: 'test.employee@example.test',
  assignment_role: 'employee',
  shift_active: true,
  is_sick: false,
  absent: false,
  auto_assignable: true,
  assignment_eligible: true,
  jarvis_display_name: 'Test Employee',
  jarvis_initials: 'TE',
  jarvis_owner_code: 'TE',
  queue_eligibility: {},
  blocked: false,
};

function makeMockQuery({ settingsRows = [], runningAction = null } = {}) {
  return async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('FROM users') && text.includes('WHERE id = $1') && params[0] === 1) {
      return { rowCount: 1, rows: [authUserRow()] };
    }
    if (text.includes('UPDATE users') && text.includes('last_seen_at')) {
      return { rowCount: 1, rows: [] };
    }
    if (text.includes('FROM handover_files')) {
      return { rows: [] };
    }
    if (text.includes('assignment_decisions') || text.includes('assignment_ticket_decisions')) {
      return { rows: [] };
    }
    if (text.includes('FROM queue_items') && text.includes('id = $1')) {
      return { rows: [queueTicket] };
    }
    if (text.includes('FROM users') && text.includes('WHERE id = $1') && params[0] === 10) {
      return { rows: [employeeRow] };
    }
    if (text.includes('FROM users') && text.includes('jarvis_display_name') && text.includes('jarvis_owner_code')) {
      return { rows: [employeeRow] };
    }
    if (text.includes('FROM assignment_settings')) {
      return { rows: settingsRows };
    }
    if (text.includes('UPDATE queue_items') && text.includes('assigned_worker_id')) {
      return {
        rows: [{
          ...queueTicket,
          assigned_worker_id: params[1],
          owner: params[2],
        }],
      };
    }
    if (text.includes('FROM assignment_actions') && text.includes("execution_status IN ('executing','unassigning','reassigning')")) {
      return { rows: runningAction ? [runningAction] : [] };
    }
    return { rowCount: 0, rows: [] };
  };
}

describe('API integration safety routes', () => {
  let originalQuery;

  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    originalQuery = db.query;
  });

  afterEach(() => {
    db.query = originalQuery;
  });

  it('missing handover files returns 200 with an empty files array', async () => {
    db.query = makeMockQuery();
    const app = await startApp('/api/handover', handoverRoutes);
    try {
      const res = await fetch(`${app.baseUrl}/api/handover/2/files`, { headers: authHeaders() });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.handoverId, 2);
      assert.deepEqual(body.files, []);
    } finally {
      await app.close();
    }
  });

  it('missing assignment explanation returns 200 with an empty explanation', async () => {
    db.query = makeMockQuery();
    const app = await startApp('/api/assignment', assignmentRoutes);
    try {
      const res = await fetch(`${app.baseUrl}/api/assignment/tickets/3644526/explanation?runId=54848`, { headers: authHeaders() });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ticketId, '3644526');
      assert.equal(body.runId, 54848);
      assert.equal(body.explanation, null);
      assert.deepEqual(body.decisionTrace, []);
    } finally {
      await app.close();
    }
  });

  it('writeback disabled returns structured 409', async () => {
    db.query = makeMockQuery({ settingsRows: [{ key: 'writeback.enabled', value: 'false' }] });
    const app = await startApp('/api/assignment-actions', assignmentActionsRoutes);
    try {
      const res = await fetch(`${app.baseUrl}/api/assignment-actions/tickets/3644528/writeback`, {
        method: 'POST',
        headers: authHeaders(),
      });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.error, 'WRITEBACK_BLOCKED');
      assert.equal(body.reason, 'writeback_disabled');
      assert.equal(body.executionStatus, 'skipped');
    } finally {
      await app.close();
    }
  });

  it('shadow mode returns structured 409', async () => {
    db.query = makeMockQuery({
      settingsRows: [
        { key: 'writeback.enabled', value: 'true' },
        { key: 'writeback.mode', value: 'shadow_only' },
      ],
    });
    const app = await startApp('/api/assignment-actions', assignmentActionsRoutes);
    try {
      const res = await fetch(`${app.baseUrl}/api/assignment-actions/tickets/3644528/writeback`, {
        method: 'POST',
        headers: authHeaders(),
      });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.error, 'WRITEBACK_BLOCKED');
      assert.equal(body.reason, 'shadow_only_mode');
      assert.equal(body.executionStatus, 'shadow_validated');
    } finally {
      await app.close();
    }
  });

  it('duplicate writeback returns structured 409', async () => {
    db.query = makeMockQuery({
      settingsRows: [
        { key: 'writeback.enabled', value: 'true' },
        { key: 'writeback.mode', value: 'manual_confirm' },
      ],
      runningAction: {
        id: 99,
        activity_number: '3644528',
        execution_status: 'executing',
      },
    });
    const app = await startApp('/api/assignment-actions', assignmentActionsRoutes);
    try {
      const res = await fetch(`${app.baseUrl}/api/assignment-actions/tickets/3644528/writeback`, {
        method: 'POST',
        headers: authHeaders(),
      });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.error, 'WRITEBACK_BLOCKED');
      assert.equal(body.reason, 'execution_already_running');
      assert.equal(body.executionStatus, 'executing');
    } finally {
      await app.close();
    }
  });

  it('loads writeback employees for manual single-ticket testing', async () => {
    db.query = makeMockQuery();
    const app = await startApp('/api/assignment-actions', assignmentActionsRoutes);
    try {
      const res = await fetch(`${app.baseUrl}/api/assignment-actions/writeback-employees`, {
        headers: authHeaders(),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.employees.length, 1);
      assert.equal(body.employees[0].id, 10);
      assert.equal(body.employees[0].jarvisOwnerCode, 'TE');
    } finally {
      await app.close();
    }
  });

  it('sets a local ODIN owner so the ticket can be written back by the crawler', async () => {
    db.query = makeMockQuery();
    const app = await startApp('/api/assignment-actions', assignmentActionsRoutes);
    try {
      const res = await fetch(`${app.baseUrl}/api/assignment-actions/tickets/3644528/odin-owner`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: 10 }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.ticket.assigned_worker_id, 10);
      assert.equal(body.ticket.owner, 'TE');
      assert.match(body.message, /writeback/i);
    } finally {
      await app.close();
    }
  });
});
