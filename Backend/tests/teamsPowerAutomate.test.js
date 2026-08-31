import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAssignmentAdaptiveCardPayload,
  buildAssignmentNotificationMessage,
  buildTicketAssignmentNotificationDto,
  notifyTicketAssignedToTeams,
  sendTeamsAssignmentNotification,
  sendTeamsAssignmentTestNotification,
  testPowerAutomateWebhook,
} from '../services/teamsMessaging.js';
import db from '../db.js';
import { shouldSendAssignmentNotificationAfterAssignment } from '../assignment/engine/processTicket.js';

describe('Power Automate Teams webhook helpers', () => {
  const originalFetch = global.fetch;
  const originalQuery = db.query;

  beforeEach(() => {
    global.fetch = async () => ({
      ok: true,
      status: 202,
      text: async () => '',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    db.query = originalQuery;
  });

  it('posts an adaptive-card test message to the configured webhook', async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 202, text: async () => '' };
    };

    const result = await testPowerAutomateWebhook('https://example.test/webhook');

    assert.equal(result.sent, true);
    assert.equal(result.status, 202);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.test/webhook');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.type, 'message');
    assert.equal(payload.attachments[0].content.body[0].text, 'ODIN Power Automate Test');
  });

  it('rejects invalid webhook URLs before sending', async () => {
    await assert.rejects(
      () => testPowerAutomateWebhook('not-a-url'),
      /Invalid webhook URL/
    );
  });

  it('builds assignment notification content with ticket and worker details', () => {
    const message = buildAssignmentNotificationMessage({
      ticket: {
        id: 42,
        externalId: '3644526',
        activity: 'A-12345',
        accountName: 'Example Customer',
        systemName: 'FR2-TEST',
        type: 'SmartHands',
        priority: 'high',
        dueAt: '2026-07-06T12:00:00.000Z',
      },
      worker: { name: 'Amine Mohamed Tigoudar' },
      mode: 'live',
      runId: 99,
    });

    assert.equal(message.title, 'ODIN Ticket zugewiesen: 3644526');
    assert.match(message.body, /Mitarbeiter: Amine Mohamed Tigoudar/);
    assert.match(message.body, /Activity: A-12345/);
    assert.match(message.body, /Kunde: Example Customer/);
    assert.match(message.body, /System: FR2-TEST/);
    assert.match(message.body, /Modus: live - Run 99/);
  });

  it('builds the required ODIN_TICKET_ASSIGNMENT adaptive-card payload', () => {
    const notification = buildTicketAssignmentNotificationDto({
      ticket: {
        id: 42,
        externalId: '3644526',
        title: 'Router & Power check / Kunde',
        priority: 'High',
        site: 'FR2',
        dueAt: '2026-07-09T12:00:00.000Z',
        ticketUrl: 'https://odin.example/tickets/42',
      },
      worker: {
        id: 7,
        employeeId: 'emp-7',
        name: 'Amine & Mohamed Tigoudar',
        email: 'amine.tigoudar@example.com',
        entraId: 'entra-7',
      },
      assignedBy: 'ODIN Admin',
      environment: 'production',
      eventId: 'event-1',
      createdAt: '2026-07-09T10:00:00.000Z',
    });
    const payload = buildAssignmentAdaptiveCardPayload(notification);
    const content = payload.attachments[0].content;
    const marker = content.body.find((entry) => String(entry.text || '').startsWith('ODIN_EVENT|')).text;

    assert.equal(payload.type, 'message');
    assert.equal(payload.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
    assert.equal(payload.attachments[0].contentUrl, null);
    assert.equal(content.version, '1.4');
    assert.equal(content.body[0].text, 'Neues Ticket zugewiesen');
    assert.match(marker, /^ODIN_EVENT\|type=ODIN_TICKET_ASSIGNMENT\|eventId=event-1\|/);
    assert.match(marker, /ticketId=42/);
    assert.match(marker, /ticketNumber=3644526/);
    assert.match(marker, /recipientUpn=amine\.tigoudar%40example\.com/);
    assert.match(marker, /recipientName=Amine%20%26%20Mohamed%20Tigoudar/);
    assert.match(marker, /employeeId=emp-7/);
    assert.equal(content.odinEventData.recipientUpn, 'amine.tigoudar@example.com');
    assert.equal(content.odinEventData.employeeId, 'emp-7');
    assert.equal(content.actions[0].title, 'Ticket öffnen');
  });

  it('sends assignment notifications successfully', async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => 'ok' };
    };

    const notification = buildTicketAssignmentNotificationDto({
      ticket: { id: 1, externalId: 'A-1', title: 'Test' },
      worker: { name: 'Patrick Brode', email: 'patrick.brode@example.com' },
      environment: 'test',
      eventId: 'evt-send',
    });
    const result = await sendTeamsAssignmentNotification({
      notification,
      webhookUrl: 'https://example.test/webhook',
      log: false,
    });

    assert.equal(result.success, true);
    assert.equal(result.httpStatus, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].options.body, /ODIN_EVENT/);
  });

  for (const status of [400, 401, 403, 500]) {
    it(`surfaces Teams webhook HTTP ${status} without leaking the webhook URL`, async () => {
      global.fetch = async () => ({
        ok: false,
        status,
        statusText: 'Failure',
        text: async () => 'backend says no',
      });

      const notification = buildTicketAssignmentNotificationDto({
        ticket: { id: 1, externalId: 'A-1' },
        worker: { name: 'User', email: 'user@example.com' },
        eventId: `evt-${status}`,
      });

      await assert.rejects(
        () => sendTeamsAssignmentNotification({ notification, webhookUrl: 'https://secret.example/webhook', log: false }),
        (error) => {
          assert.equal(error.status, status);
          assert.doesNotMatch(error.message, /secret\.example/);
          return true;
        }
      );
    });
  }

  it('respects Retry-After for HTTP 429 and retries once', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? '0' : null) },
          text: async () => 'slow down',
        };
      }
      return { ok: true, status: 202, text: async () => '' };
    };

    const notification = buildTicketAssignmentNotificationDto({
      ticket: { id: 1, externalId: 'A-1' },
      worker: { name: 'User', email: 'user@example.com' },
      eventId: 'evt-429',
    });
    const result = await sendTeamsAssignmentNotification({ notification, webhookUrl: 'https://example.test/webhook', log: false });

    assert.equal(result.httpStatus, 202);
    assert.equal(result.attempts, 2);
  });

  it('skips assignment notifications when disabled or missing webhook config', async () => {
    db.query = async (sql, params) => {
      if (String(sql).includes('teams_settings')) {
        const values = {
          'teams.notificationsEnabled': params?.[0]?.includes('teams.notificationsEnabled') ? 'false' : undefined,
          'teams.sendOnlyForLiveAssignments': 'true',
          'teams.webhookEnabled': 'true',
        };
        return { rows: Object.entries(values).filter(([, value]) => value !== undefined).map(([key, value]) => ({ key, value })) };
      }
      return { rows: [] };
    };

    const disabled = await notifyTicketAssignedToTeams({
      ticket: { id: 1, externalId: 'A-1' },
      worker: { name: 'User', email: 'user@example.com' },
      mode: 'live',
    });
    assert.equal(disabled.skipped, true);
    assert.match(disabled.reason, /disabled/i);

    db.query = async (sql) => {
      if (String(sql).includes('teams_settings')) {
        return { rows: [
          { key: 'teams.notificationsEnabled', value: 'true' },
          { key: 'teams.sendOnlyForLiveAssignments', value: 'true' },
          { key: 'teams.webhookEnabled', value: 'true' },
        ] };
      }
      return { rows: [] };
    };

    const missing = await notifyTicketAssignedToTeams({
      ticket: { id: 1, externalId: 'A-1' },
      worker: { name: 'User', email: 'user@example.com' },
      mode: 'live',
    });
    assert.equal(missing.skipped, true);
    assert.match(missing.reason, /No Power Automate webhook/i);
  });

  it('sends a manual assignment test without touching queue assignment tables', async () => {
    const queriedSql = [];
    db.query = async (sql, params) => {
      queriedSql.push(String(sql));
      if (String(sql).includes('teams_settings')) {
        return { rows: [
          { key: 'teams.communicationMode', value: 'webhook' },
          { key: 'teams.powerAutomateWebhookUrl', value: 'https://example.test/webhook' },
          { key: 'teams.webhookEnabled', value: 'true' },
        ] };
      }
      return { rows: [] };
    };
    global.fetch = async () => ({ ok: true, status: 200, text: async () => '' });

    const result = await sendTeamsAssignmentTestNotification({
      recipientName: 'Patrick Brode',
      recipientUpn: 'patrick.brode@example.com',
      ticketNumber: 'TEST-123456',
      location: 'FR2',
      priority: 'Normal',
    });

    assert.equal(result.success, true);
    assert.ok(result.eventId);
    assert.equal(queriedSql.some((sql) => /queue_items/i.test(sql)), false);
  });

  it('does not send Teams notifications when live assignment persistence failed', () => {
    assert.equal(shouldSendAssignmentNotificationAfterAssignment({ mode: 'live', liveAssignment: { applied: false } }), false);
    assert.equal(shouldSendAssignmentNotificationAfterAssignment({ mode: 'live', liveAssignment: { applied: true } }), true);
    assert.equal(shouldSendAssignmentNotificationAfterAssignment({ mode: 'shadow', liveAssignment: { applied: false } }), true);
  });
});
