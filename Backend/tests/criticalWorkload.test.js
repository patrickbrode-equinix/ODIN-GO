import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCriticalWorkloadSummary,
  buildEmptyCriticalWorkloadSnapshot,
  classifyCriticalTicket,
  compareCriticalTickets,
  getCriticalWorkloadSnapshot,
  getShiftContext,
} from '../assignment/services/criticalWorkload.js';

describe('critical workload classification', () => {
  it('orders critical tickets by the earliest due or scheduled time first', () => {
    const now = new Date('2026-04-26T08:00:00Z');
    const shiftContext = getShiftContext(now);

    const tickets = [
      {
        id: 1,
        external_id: 'TT-HIGH',
        queue_type: 'Trouble Ticket',
        severity: 'high',
        revised_commit_date: '2026-04-27T12:00:00Z',
      },
      {
        id: 2,
        external_id: 'TT-MED',
        queue_type: 'Trouble Ticket',
        severity: 'medium',
        revised_commit_date: '2026-04-26T10:00:00Z',
      },
      {
        id: 3,
        external_id: 'EXPEDITE',
        queue_type: 'SmartHands',
        revised_commit_date: '2026-04-27T18:00:00Z',
        raw_json: { expedite: true },
      },
      {
        id: 4,
        external_id: 'SHIFT',
        queue_type: 'Scheduled',
        sched_start: '2026-04-26T15:00:00Z',
      },
      {
        id: 5,
        external_id: 'LT24',
        queue_type: 'CrossConnect',
        revised_commit_date: '2026-04-26T14:00:00Z',
      },
    ].map((ticket) => ({
      ticket,
      classification: classifyCriticalTicket(ticket, now, shiftContext),
    }));

    const sorted = tickets.sort(compareCriticalTickets);

    assert.deepEqual(
      sorted.map((entry) => entry.ticket.external_id),
      ['TT-MED', 'LT24', 'SHIFT', 'TT-HIGH', 'EXPEDITE']
    );
  });

  it('excludes time-risk tickets outside the configured critical window', () => {
    const now = new Date('2026-04-26T08:00:00Z');
    const shiftContext = getShiftContext(now);

    const classification = classifyCriticalTicket(
      {
        id: 11,
        external_id: 'LT40',
        queue_type: 'CrossConnect',
        revised_commit_date: '2026-04-27T23:59:00Z',
      },
      now,
      shiftContext,
      36
    );

    assert.equal(classification.included, false);
    assert.equal(classification.priorityBucket, null);
  });
});

describe('critical workload summary', () => {
  it('aggregates the final ticket dto shape without requiring an intermediate classification wrapper', () => {
    const summary = buildCriticalWorkloadSummary([
      {
        priorityBucket: 1,
        isExpedite: false,
        remainingTimeMinutes: null,
        odinStatus: 'BLOCKED',
      },
      {
        priorityBucket: 3,
        isExpedite: true,
        remainingTimeMinutes: 180,
        odinStatus: 'ANALYZING',
      },
    ]);

    assert.equal(summary.ttHigh, 1);
    assert.equal(summary.expedites, 1);
    assert.equal(summary.lt24h, 1);
    assert.equal(summary.lt72h, 1);
    assert.equal(summary.blocked, 1);
    assert.equal(summary.unassignedCritical, 2);
    assert.equal(summary.totalCritical, 2);
  });
});

describe('critical workload snapshot', () => {
  it('marks crawler staleness and exposes a safe next action when live queue data is outdated', async () => {
    const now = new Date('2026-04-26T08:00:00Z');
    const staleCrawlerTs = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();

    const queryFn = async (sql) => {
      if (sql.includes('assignment_settings')) {
        return {
          rows: [
            { key: 'assignment.enabled', value: 'true' },
            { key: 'assignment.mode', value: 'live' },
            { key: 'assignment.crawlerMaxAgeMinutes', value: '30' },
          ],
        };
      }

      if (sql.includes('FROM app_settings')) {
        return {
          rows: [{ key: 'threshold.critical_ticket_window_hours', value: '36' }],
        };
      }

      if (sql.includes('assignment_runs')) {
        return {
          rows: [{
            id: 21,
            mode: 'live',
            status: 'completed',
            started_at: now.toISOString(),
            finished_at: now.toISOString(),
            summary: { assigned: 0 },
          }],
        };
      }

      if (sql.includes('crawler_runs')) {
        return { rows: [{ snapshot_at: staleCrawlerTs }] };
      }

      if (sql.includes('shiftplan_upload_log')) {
        return { rows: [{ uploaded_at: now.toISOString() }] };
      }

      if (sql.includes('FROM queue_items')) {
        return {
          rows: [{
            id: 9,
            external_id: 'CC-9',
            queue_type: 'CrossConnect',
            revised_commit_date: '2026-04-27T23:59:00Z',
            status: 'open',
            system_name: 'SYS-9',
            active: true,
          }],
        };
      }

      if (sql.includes('assignment_ticket_decisions')) {
        return { rows: [] };
      }

      if (sql.includes('teams_message_log')) {
        return { rows: [{ cnt: '0' }] };
      }

      return { rows: [] };
    };

    const snapshot = await getCriticalWorkloadSnapshot({ queryFn, now });

    assert.equal(snapshot.logicStatus, 'LIVE');
    assert.equal(snapshot.criticalWindowHours, 36);
    assert.equal(snapshot.assignmentVisualization.mode, 'enterprise');
    assert.equal(snapshot.assignmentVisualization.autoFallbackToEnterprise, true);
    assert.equal(snapshot.crawler.isStale, true);
    assert.equal(snapshot.summary.totalCritical, 0);
    assert.deepEqual(snapshot.tickets, []);
  });

  it('builds a safe empty snapshot for kiosk fallbacks', () => {
    const snapshot = buildEmptyCriticalWorkloadSnapshot(new Date('2026-04-26T08:00:00Z'));

    assert.equal(snapshot.criticalWindowHours, 72);
    assert.equal(snapshot.assignmentVisualization.mode, 'enterprise');
    assert.equal(snapshot.assignmentVisualization.displayReasoningAfterAnimation, true);
    assert.equal(snapshot.logicStatus, 'OFFLINE');
    assert.deepEqual(snapshot.summary, {
      ttHigh: 0,
      ttMedium: 0,
      expedites: 0,
      lt24h: 0,
      lt72h: 0,
      unassignedCritical: 0,
      blocked: 0,
      totalCritical: 0,
    });
    assert.deepEqual(snapshot.tickets, []);
  });
});
