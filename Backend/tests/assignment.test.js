/* ================================================ */
/* Assignment Engine — Unit Tests                   */
/* ================================================ */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Normalization
import {
  mapType, mapStatus, mapPriority, mapSite, mapDates,
  mapResponsibility, mapTicketId, normalizeTicket, validateNormalizedTicket,
  mapHandoverType, mapScheduledStart, mapSystemName,
} from '../assignment/normalization/normalizeTicket.js';

// Relevance
import { checkRelevance } from '../assignment/relevance/checkRelevance.js';

// Eligibility
import {
  hasUserMapping, isWorkerAutoAssignable, isAvailable, isNotOnBreak, isNotAbsent,
  isShiftActive, matchesSite, matchesResponsibility, applyEligibilityRules,
  checkRole, checkQueueClean,
} from '../assignment/eligibility/rules.js';

// Priority / Selection
import { sortTickets, selectWorker, resolveWorkerTie, getPriorityTier, buildTicketPrioritySnapshot, explainTicketOrderDecision } from '../assignment/priority/sortAndSelect.js';

// Logging
import { buildDecisionLog, buildRunSummary, buildTicketExplanation } from '../assignment/logging/decisionLog.js';

// V2 Rules
import { checkCrawlerFreshness } from '../assignment/rules/crawlerGuard.js';
import { applyRoleFilter } from '../assignment/rules/roleFilter.js';
import { checkExclusionList } from '../assignment/rules/exclusionList.js';
import { routeHandover } from '../assignment/rules/handoverRouter.js';
import { checkQueuePurity } from '../assignment/rules/queuePurity.js';
import { evaluateTicketCapacity } from '../assignment/rules/ticketCapacity.js';
import { evaluateSystemGrouping } from '../assignment/rules/systemGrouping.js';
import { PRIORITY_TIERS, CRAWLER_MAX_AGE_MS } from '../assignment/constants.js';
import { refreshAssignmentRuntimeRules } from '../assignment/services/runtimeRules.js';
import { assignmentRotationRepository } from '../assignment/repositories/index.js';
import {
  isShiftCodeActiveNow,
  isWorkingShiftCode,
  getPlanningContextsForMoment,
  getShiftWindowForPlanEntry,
  isMomentInShiftWindow,
  resolveEffectiveWorkerRole,
} from '../assignment/candidates/loadCandidates.js';
import {
  decisionMatchesTicketIdentifier,
  parseInternalTicketId,
  resolveTicketIdentity,
} from '../assignment/lib/ticketIdentity.js';
import { mapLegacyDecisionTypeToResult } from '../assignment/lib/reportCompatibility.js';
import { resolveActiveExistingOwner } from '../assignment/lib/ownerIdentity.js';

/* ================================================ */
/* mapType                                          */
/* ================================================ */
describe('mapType', () => {
  it('maps "troubleticket" -> TroubleTicket', () => {
    const r = mapType('troubleticket');
    assert.equal(r.value, 'TroubleTicket');
    assert.equal(r.warning, null);
  });
  it('maps "TroubleTickets" -> TroubleTicket', () => {
    assert.equal(mapType('TroubleTickets').value, 'TroubleTicket');
  });
  it('maps "TT" -> TroubleTicket', () => {
    assert.equal(mapType('TT').value, 'TroubleTicket');
  });
  it('maps "SmartHands" -> SmartHands', () => {
    assert.equal(mapType('SmartHands').value, 'SmartHands');
  });
  it('maps "crossconnect" -> CrossConnect', () => {
    assert.equal(mapType('crossconnect').value, 'CrossConnect');
  });
  it('maps "xc" -> CrossConnect', () => {
    assert.equal(mapType('xc').value, 'CrossConnect');
  });
  it('maps "CCInstalls" -> CrossConnect', () => {
    assert.equal(mapType('CCInstalls').value, 'CrossConnect');
  });
  it('maps "other" -> Other', () => {
    assert.equal(mapType('other').value, 'Other');
  });
  it('returns Unknown for unknown types', () => {
    const r = mapType('foobar');
    assert.equal(r.value, 'Unknown');
    assert.ok(r.warning);
  });
  it('returns Unknown with warning for null', () => {
    const r = mapType(null);
    assert.equal(r.value, 'Unknown');
    assert.ok(r.warning);
  });
});

describe('run summary helpers', () => {
  it('counts crawler_stale results in buildRunSummary', () => {
    const summary = buildRunSummary([
      { result: 'assigned' },
      { result: 'crawler_stale' },
    ]);

    assert.equal(summary.assigned, 1);
    assert.equal(summary.crawler_stale, 1);
    assert.equal(summary.totalDecisions, 2);
  });

  it('maps legacy skip decisions to manual review for report compatibility', () => {
    assert.equal(mapLegacyDecisionTypeToResult('skipped_manual_exclusion'), 'manual_review');
  });
});

/* ================================================ */
/* mapStatus                                        */
/* ================================================ */
describe('mapStatus', () => {
  it('maps "open" -> open', () => {
    assert.equal(mapStatus('open').value, 'open');
  });
  it('maps "Open-Dispatch" -> active', () => {
    assert.equal(mapStatus('Open-Dispatch').value, 'active');
  });
  it('maps "Open-Accepted" -> active', () => {
    assert.equal(mapStatus('Open-Accepted').value, 'active');
  });
  it('maps "Customer Updated" -> pending', () => {
    assert.equal(mapStatus('Customer Updated').value, 'pending');
  });
  it('maps "Completed Pending Migration" -> pending', () => {
    assert.equal(mapStatus('Completed Pending Migration').value, 'pending');
  });
  it('maps "new" -> open', () => {
    assert.equal(mapStatus('new').value, 'open');
  });
  it('maps "in progress" -> active', () => {
    assert.equal(mapStatus('in progress').value, 'active');
  });
  it('maps "resolved" -> closed', () => {
    assert.equal(mapStatus('resolved').value, 'closed');
  });
  it('maps "canceled" -> cancelled', () => {
    assert.equal(mapStatus('canceled').value, 'cancelled');
  });
  it('returns unknown for null', () => {
    assert.equal(mapStatus(null).value, 'unknown');
  });
  it('returns unknown for unexpected value', () => {
    const r = mapStatus('xyz');
    assert.equal(r.value, 'unknown');
    assert.ok(r.warning);
  });
});

/* ================================================ */
/* mapPriority                                      */
/* ================================================ */
describe('mapPriority', () => {
  it('maps "critical" -> critical', () => {
    assert.equal(mapPriority('critical').value, 'critical');
  });
  it('maps "P1" -> critical', () => {
    assert.equal(mapPriority('P1').value, 'critical');
  });
  it('maps "normal" -> medium', () => {
    assert.equal(mapPriority('normal').value, 'medium');
  });
  it('maps "urgent" -> high', () => {
    assert.equal(mapPriority('urgent').value, 'high');
  });
  it('returns unknown for null', () => {
    assert.equal(mapPriority(null).value, 'unknown');
  });
});

/* ================================================ */
/* mapSite                                          */
/* ================================================ */
describe('mapSite', () => {
  it('returns trimmed site', () => {
    assert.equal(mapSite('  FR2  ').value, 'FR2');
  });
  it('returns null for empty', () => {
    const r = mapSite('');
    assert.equal(r.value, null);
  });
  it('returns null for null', () => {
    const r = mapSite(null);
    assert.equal(r.value, null);
  });
});

/* ================================================ */
/* mapDates                                         */
/* ================================================ */
describe('mapDates', () => {
  it('parses valid dates', () => {
    const r = mapDates('2026-03-01T10:00:00Z', '2026-02-28T08:00:00Z');
    assert.ok(r.dueAt);
    assert.ok(r.createdAt);
    assert.equal(r.warnings.length, 0);
  });
  it('returns null for invalid dueAt with warning', () => {
    const r = mapDates('not-a-date', null);
    assert.equal(r.dueAt, null);
    assert.equal(r.warnings.length, 1);
  });
});

/* ================================================ */
/* normalizeTicket                                  */
/* ================================================ */
describe('normalizeTicket', () => {
  it('normalizes a standard ticket', () => {
    const nt = normalizeTicket({
      id: 42,
      type: 'TroubleTicket',
      status: 'open',
      priority: 'high',
      site: 'FR2',
      due_at: '2026-03-10T12:00:00Z',
      created_at: '2026-03-01T08:00:00Z',
    });
    assert.equal(nt.id, '42');
    assert.equal(nt.type, 'TroubleTicket');
    assert.equal(nt.status, 'open');
    assert.equal(nt.priority, 'high');
    assert.equal(nt.site, 'FR2');
    assert.equal(nt.manualHold, false);
    assert.equal(nt.autoAssignable, true);
  });

  it('normalizes queue_type TroubleTickets from queue items', () => {
    const nt = normalizeTicket({
      id: 77,
      queue_type: 'TroubleTickets',
      status: 'open',
      severity: 'high',
    });

    assert.equal(nt.type, 'TroubleTicket');
    assert.equal(nt.priority, 'high');
  });

  it('captures warnings for unknown fields', () => {
    const nt = normalizeTicket({ id: 1, type: 'foobar', status: 'xyz' });
    assert.ok(nt.normalizationWarnings.length > 0);
    assert.equal(nt.type, 'Unknown');
    assert.equal(nt.status, 'unknown');
  });

  it('preserves raw data', () => {
    const raw = { id: 99, custom: 'value' };
    const nt = normalizeTicket(raw);
    assert.equal(nt.raw, raw);
  });
});

/* ================================================ */
/* validateNormalizedTicket                          */
/* ================================================ */
describe('validateNormalizedTicket', () => {
  it('returns no issues for valid ticket', () => {
    const issues = validateNormalizedTicket({
      id: '1', type: 'TroubleTicket', status: 'open',
      rawType: 'TroubleTicket', rawStatus: 'open'
    });
    assert.equal(issues.length, 0);
  });

  it('returns issues for missing ID', () => {
    const issues = validateNormalizedTicket({ id: '', type: 'TroubleTicket', status: 'open' });
    assert.ok(issues.length > 0);
  });
});

/* ================================================ */
/* checkRelevance                                   */
/* ================================================ */
describe('checkRelevance', () => {
  it('marks open tickets as relevant', () => {
    const r = checkRelevance({ id: '1', status: 'open', type: 'TroubleTicket', manualHold: false, autoAssignable: true });
    assert.equal(r.relevant, true);
  });

  it('marks closed tickets as not relevant', () => {
    const r = checkRelevance({ id: '1', status: 'closed', type: 'TroubleTicket', manualHold: false, autoAssignable: true });
    assert.equal(r.relevant, false);
  });

  it('marks cancelled tickets as not relevant', () => {
    const r = checkRelevance({ id: '1', status: 'cancelled', type: 'TroubleTicket', manualHold: false, autoAssignable: true });
    assert.equal(r.relevant, false);
  });

  it('marks manual hold tickets as not relevant', () => {
    const r = checkRelevance({ id: '1', status: 'open', type: 'TroubleTicket', manualHold: true, autoAssignable: true });
    assert.equal(r.relevant, false);
  });

  it('marks non-auto-assignable as not relevant', () => {
    const r = checkRelevance({ id: '1', status: 'open', type: 'TroubleTicket', manualHold: false, autoAssignable: false });
    assert.equal(r.relevant, false);
  });

  it('marks Unknown type as relevant (for manual_review)', () => {
    const r = checkRelevance({ id: '1', status: 'active', type: 'Unknown', manualHold: false, autoAssignable: true });
    assert.equal(r.relevant, true);
  });

  it('respects planning window', () => {
    const futureDate = new Date(Date.now() + 100 * 60 * 60 * 1000).toISOString(); // 100h from now
    const r = checkRelevance(
      { id: '1', status: 'open', type: 'TroubleTicket', manualHold: false, autoAssignable: true, dueAt: futureDate },
      { planningWindowHours: '72' }
    );
    assert.equal(r.relevant, false);
  });

  it('uses scheduledStart as the planning-window reference for scheduled tickets', () => {
    const scheduledStart = new Date(Date.now() + 100 * 60 * 60 * 1000).toISOString();
    const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const r = checkRelevance(
      {
        id: '1',
        status: 'open',
        type: 'Scheduled',
        manualHold: false,
        autoAssignable: true,
        scheduledStart,
        dueAt,
      },
      { planningWindowHours: '72' }
    );
    assert.equal(r.relevant, false);
  });
});

/* ================================================ */
/* Eligibility Rules                                */
/* ================================================ */
describe('Eligibility Rules', () => {
  const baseWorker = { id: 1, name: 'Test', autoAssignable: true, blocked: false, onBreak: false, absent: false, site: 'FR2', responsibility: 'c-ops' };
  const baseTicket = { id: '1', site: 'FR2', responsibility: 'c-ops', queue: 'c-ops' };
  const baseSettings = { siteStrictness: 'true', responsibilityStrictness: 'false' };

  it('isWorkerAutoAssignable passes for assignable worker', () => {
    assert.ok(isWorkerAutoAssignable(baseWorker).eligible);
  });
  it('hasUserMapping fails for unmapped weekly-plan workers in live mode', () => {
    assert.ok(!hasUserMapping({ ...baseWorker, userMapped: false, plannedEmployeeName: 'Max Mustermann' }).eligible);
  });
  it('hasUserMapping passes for unmapped weekly-plan workers in shadow mode', () => {
    assert.ok(hasUserMapping({ ...baseWorker, userMapped: false, plannedEmployeeName: 'Max Mustermann' }, { executionMode: 'shadow' }).eligible);
  });
  it('isWorkerAutoAssignable fails for non-assignable', () => {
    assert.ok(!isWorkerAutoAssignable({ ...baseWorker, autoAssignable: false }).eligible);
  });
  it('isAvailable passes for non-blocked', () => {
    assert.ok(isAvailable(baseWorker).eligible);
  });
  it('isAvailable fails for blocked', () => {
    assert.ok(!isAvailable({ ...baseWorker, blocked: true }).eligible);
  });
  it('isNotOnBreak passes', () => {
    assert.ok(isNotOnBreak(baseWorker).eligible);
  });
  it('isNotOnBreak fails', () => {
    assert.ok(!isNotOnBreak({ ...baseWorker, onBreak: true }).eligible);
  });
  it('isNotAbsent passes', () => {
    assert.ok(isNotAbsent(baseWorker).eligible);
  });
  it('isNotAbsent fails', () => {
    assert.ok(!isNotAbsent({ ...baseWorker, absent: true }).eligible);
  });
  it('excludes a night-shift worker when the scheduled ticket starts before the night shift begins', () => {
    const result = isShiftActive(
      { ...baseWorker, shiftCode: 'N', shiftActive: true },
      { ...baseTicket, type: 'Scheduled', scheduledStart: '2026-03-08T21:00:00' }
    );
    assert.equal(result.eligible, false);
  });
  it('keeps a late-shift worker eligible when the scheduled ticket starts during late shift coverage', () => {
    const result = isShiftActive(
      { ...baseWorker, shiftCode: 'L1', shiftActive: true },
      { ...baseTicket, type: 'Scheduled', scheduledStart: '2026-03-08T21:00:00' }
    );
    assert.equal(result.eligible, true);
  });

  it('rejects a scheduled ticket on the next day even when the shift code matches by time of day', () => {
    const now = new Date('2026-03-08T08:00:00');
    const result = isShiftActive(
      {
        ...baseWorker,
        shiftCode: 'E1',
        shiftActive: true,
        shiftPlanningDate: '2026-03-08',
        shiftStart: new Date('2026-03-08T06:30:00').toISOString(),
        shiftEnd: new Date('2026-03-08T15:30:00').toISOString(),
      },
      { ...baseTicket, type: 'Scheduled', scheduledStart: '2026-03-09T07:00:00' },
      now,
    );

    assert.equal(result.eligible, false);
    assert.match(result.reason, /Schichtinstanz/);
  });

  it('keeps a scheduled ticket within the same active shift instance eligible', () => {
    const now = new Date('2026-03-08T08:00:00');
    const result = isShiftActive(
      {
        ...baseWorker,
        shiftCode: 'E1',
        shiftActive: true,
        shiftPlanningDate: '2026-03-08',
        shiftStart: new Date('2026-03-08T06:30:00').toISOString(),
        shiftEnd: new Date('2026-03-08T15:30:00').toISOString(),
      },
      { ...baseTicket, type: 'Scheduled', scheduledStart: '2026-03-08T14:00:00' },
      now,
    );

    assert.equal(result.eligible, true);
  });

  it('treats E1WE as early shift and rejects tickets starting in late shift', () => {
    const window = getShiftWindowForPlanEntry('E1WE', '2026-03-08');
    assert.equal(window.start.toISOString(), new Date('2026-03-08T06:30:00').toISOString());
    assert.equal(window.end.toISOString(), new Date('2026-03-08T15:30:00').toISOString());

    const now = new Date('2026-03-08T08:00:00');
    const result = isShiftActive(
      {
        ...baseWorker,
        shiftCode: 'E1WE',
        shiftActive: true,
        shiftPlanningDate: '2026-03-08',
        shiftStart: new Date('2026-03-08T06:30:00').toISOString(),
        shiftEnd: new Date('2026-03-08T15:30:00').toISOString(),
      },
      { ...baseTicket, type: 'SmartHands', scheduledStart: '2026-03-08T16:30:00' },
      now,
    );

    assert.equal(result.eligible, false);
    assert.match(result.reason, /Ticket-Starts/);
  });

  it('treats L1WE as late shift and allows tickets starting during late shift', () => {
    const window = getShiftWindowForPlanEntry('L1WE', '2026-03-08');
    assert.equal(window.start.toISOString(), new Date('2026-03-08T13:00:00').toISOString());
    assert.equal(window.end.toISOString(), new Date('2026-03-08T22:00:00').toISOString());

    const now = new Date('2026-03-08T13:30:00');
    const result = isShiftActive(
      {
        ...baseWorker,
        shiftCode: 'L1WE',
        shiftActive: true,
        shiftPlanningDate: '2026-03-08',
        shiftStart: new Date('2026-03-08T13:00:00').toISOString(),
        shiftEnd: new Date('2026-03-08T22:00:00').toISOString(),
      },
      { ...baseTicket, type: 'SmartHands', scheduledStart: '2026-03-08T16:30:00' },
      now,
    );

    assert.equal(result.eligible, true);
  });

  it('allows a future scheduled ticket for a planned future shift when current-shift-only is disabled', () => {
    const now = new Date('2026-03-08T08:00:00');
    const result = isShiftActive(
      {
        ...baseWorker,
        shiftCode: 'E1',
        shiftActive: false,
        shiftPlanningDate: '2026-03-09',
        shiftStart: new Date('2026-03-09T06:30:00').toISOString(),
        shiftEnd: new Date('2026-03-09T15:30:00').toISOString(),
      },
      { ...baseTicket, type: 'Scheduled', scheduledStart: '2026-03-09T07:00:00' },
      { currentShiftOnly: 'false' },
      now,
    );

    assert.equal(result.eligible, true);
    assert.match(result.reason, /future shift instance|zukünftige Ticket/i);
  });

  it('matchesSite passes when sites match', () => {
    assert.ok(matchesSite(baseWorker, baseTicket, baseSettings).eligible);
  });
  it('matchesSite fails when sites differ', () => {
    assert.ok(!matchesSite({ ...baseWorker, site: 'AM3' }, baseTicket, baseSettings).eligible);
  });
  it('matchesSite passes for unmapped weekly-plan workers in shadow mode without site metadata', () => {
    assert.ok(matchesSite({ ...baseWorker, site: null, userMapped: false, plannedEmployeeName: 'Max Mustermann' }, baseTicket, { ...baseSettings, executionMode: 'shadow' }).eligible);
  });
  it('matchesSite passes when strictness disabled', () => {
    assert.ok(matchesSite({ ...baseWorker, site: 'AM3' }, baseTicket, { siteStrictness: 'false' }).eligible);
  });

  it('matchesResponsibility passes when disabled', () => {
    assert.ok(matchesResponsibility(baseWorker, baseTicket, baseSettings).eligible);
  });
  it('matchesResponsibility works when enabled', () => {
    const s = { responsibilityStrictness: 'true' };
    assert.ok(matchesResponsibility(baseWorker, baseTicket, s).eligible);
    assert.ok(!matchesResponsibility({ ...baseWorker, responsibility: 'f-ops' }, baseTicket, s).eligible);
  });

  it('applyEligibilityRules returns eligible for good worker', () => {
    const r = applyEligibilityRules(baseWorker, baseTicket, baseSettings);
    assert.ok(r.eligible);
    assert.equal(r.exclusions.length, 0);
  });
  it('applyEligibilityRules returns exclusions for blocked worker', () => {
    const r = applyEligibilityRules({ ...baseWorker, blocked: true }, baseTicket, baseSettings);
    assert.ok(!r.eligible);
    assert.ok(r.exclusions.length > 0);
  });
  it('applyEligibilityRules excludes unmapped weekly-plan workers in live mode', () => {
    const r = applyEligibilityRules({ ...baseWorker, userMapped: false, plannedEmployeeName: 'Max Mustermann' }, baseTicket, baseSettings);
    assert.ok(!r.eligible);
    assert.ok(r.exclusions.some(excl => excl.rule === 'hasUserMapping'));
  });
  it('applyEligibilityRules allows unmapped weekly-plan workers in shadow mode', () => {
    const r = applyEligibilityRules(
      { ...baseWorker, site: null, userMapped: false, plannedEmployeeName: 'Max Mustermann' },
      baseTicket,
      { ...baseSettings, executionMode: 'shadow' }
    );
    assert.ok(r.eligible);
  });
});

describe('Weekly Plan Shift Windows', () => {
  it('marks FS as non-working', () => {
    assert.equal(isWorkingShiftCode('FS'), false);
  });

  it('marks E1 as active during early shift window', () => {
    const activeAt = new Date('2026-03-08T07:30:00');
    assert.equal(isShiftCodeActiveNow('E1', activeAt), true);
  });

  it('marks L1 as inactive during early morning', () => {
    const activeAt = new Date('2026-03-08T07:30:00');
    assert.equal(isShiftCodeActiveNow('L1', activeAt), false);
  });

  it('keeps night shift active across midnight window', () => {
    const activeAt = new Date('2026-03-08T02:30:00');
    assert.equal(isShiftCodeActiveNow('N', activeAt), true);
  });

  it('builds a cross-midnight shift window for the planning date', () => {
    const window = getShiftWindowForPlanEntry('N', '2026-03-08');
    assert.equal(window.planningDate, '2026-03-08');
    assert.equal(window.start?.toISOString(), new Date('2026-03-08T21:15:00').toISOString());
    assert.equal(window.end?.toISOString(), new Date('2026-03-09T06:45:00').toISOString());
  });

  it('recognizes the previous day context after midnight', () => {
    const contexts = getPlanningContextsForMoment(new Date('2026-03-09T02:30:00'));
    assert.deepEqual(contexts.map((context) => context.today), ['2026-03-09', '2026-03-08']);
  });

  it('loads future planning contexts when lookahead is enabled', () => {
    const contexts = getPlanningContextsForMoment(new Date('2026-03-09T02:30:00'), {
      includeFuture: true,
      lookaheadHours: 30,
    });
    assert.deepEqual(contexts.map((context) => context.today), ['2026-03-09', '2026-03-08', '2026-03-10']);
  });

  it('marks a previous-day night shift instance as active after midnight', () => {
    const window = getShiftWindowForPlanEntry('N', '2026-03-08');
    assert.equal(isMomentInShiftWindow(new Date('2026-03-09T02:30:00'), window), true);
    assert.equal(isMomentInShiftWindow(new Date('2026-03-09T21:30:00'), window), false);
  });

  it('maps weekplan aliases for CC and Deutsche Boerse roles', () => {
    assert.equal(resolveEffectiveWorkerRole('cross connect', null), 'cross_connect');
    assert.equal(resolveEffectiveWorkerRole('dbs', null), 'deutsche_boerse');
    assert.equal(resolveEffectiveWorkerRole('project', null), 'project');
  });
});

describe('Weekly Plan Role Resolution', () => {
  it('uses the weekplan role when one is assigned for today', () => {
    assert.equal(resolveEffectiveWorkerRole('dispatcher', 'support'), 'dispatcher');
  });

  it('falls back to the defined user role when no weekplan role exists for today', () => {
    assert.equal(resolveEffectiveWorkerRole(null, 'project'), 'project');
    assert.equal(resolveEffectiveWorkerRole(null, 'cross connect'), 'cross_connect');
  });

  it('treats unknown weekplan role keys as normal', () => {
    assert.equal(resolveEffectiveWorkerRole('unknown-role', 'dispatcher'), 'normal');
  });
});

/* ================================================ */
/* sortTickets                                      */
/* ================================================ */
describe('sortTickets', () => {
  it('sorts overdue tickets first', () => {
    const pastDue = new Date(Date.now() - 3600000).toISOString();
    const futureDue = new Date(Date.now() + 3600000).toISOString();
    const sorted = sortTickets([
      { id: 'A', priority: 'medium', type: 'SmartHands', dueAt: futureDue },
      { id: 'B', priority: 'medium', type: 'SmartHands', dueAt: pastDue },
    ]);
    assert.equal(sorted[0].id, 'B'); // overdue first
  });

  it('sorts SmartHands in same KPI tier regardless of internal priority', () => {
    // In V2, SmartHands are all tier 3 (KPI). Within tier, sort by remaining time then ID.
    const sorted = sortTickets([
      { id: 'A', priority: 'medium', type: 'SmartHands' },
      { id: 'B', priority: 'critical', type: 'SmartHands' },
    ]);
    // Without due dates, falls to ID comparison: 'A' < 'B'
    assert.equal(sorted[0].id, 'A');
  });

  it('sorts TroubleTicket before SmartHands at same priority', () => {
    const sorted = sortTickets([
      { id: 'A', priority: 'medium', type: 'SmartHands' },
      { id: 'B', priority: 'medium', type: 'TroubleTicket' },
    ]);
    assert.equal(sorted[0].id, 'B');
  });

  it('sorts CC and SH in same KPI tier — break by ID', () => {
    // In V2, both CrossConnect and SmartHands are tier 3 (KPI).
    // Without due dates, falls to ID comparison: 'A' < 'B'
    const sorted = sortTickets([
      { id: 'A', priority: 'medium', type: 'SmartHands' },
      { id: 'B', priority: 'medium', type: 'CrossConnect' },
    ]);
    assert.equal(sorted[0].id, 'A');
  });

  it('sorts older tickets first at equal rank', () => {
    const sorted = sortTickets([
      { id: 'A', priority: 'medium', type: 'SmartHands', createdAt: '2026-03-02T10:00:00Z' },
      { id: 'B', priority: 'medium', type: 'SmartHands', createdAt: '2026-03-01T10:00:00Z' },
    ]);
    assert.equal(sorted[0].id, 'B');
  });

  it('builds traceable priority snapshots and comparison reasons', () => {
    const NOW = new Date('2026-03-08T12:00:00Z').getTime();
    const winner = {
      id: 'TT-1',
      externalId: 'TT-1',
      priority: 'critical',
      type: 'TroubleTicket',
      dueAt: '2026-03-08T13:00:00Z',
    };
    const runnerUp = {
      id: 'SCH-9',
      externalId: 'SCH-9',
      priority: 'medium',
      type: 'Scheduled',
      scheduledStart: '2026-03-08T12:30:00Z',
    };

    const snapshot = buildTicketPrioritySnapshot(winner, NOW);
    const comparison = explainTicketOrderDecision(winner, runnerUp, NOW);

    assert.equal(snapshot.priorityTier, PRIORITY_TIERS.TT_HIGH);
    assert.ok(snapshot.factors.length >= 4);
    assert.match(comparison, /priority tier/i);
  });
});

/* ================================================ */
/* selectWorker                                     */
/* ================================================ */
describe('selectWorker', () => {
  it('returns null for empty candidates', async () => {
    const r = await selectWorker([], { site: 'FR2' }, {});
    assert.equal(r.worker, null);
  });

  it('returns only candidate when one', async () => {
    const r = await selectWorker([{ id: 1, name: 'A', site: 'FR2' }], { site: 'FR2' }, {});
    assert.equal(r.worker.id, 1);
  });

  it('uses lowest worker ID as final deterministic tie-breaker', async () => {
    // In V2 selectWorker, tie-breaking is: system grouping → purity → workload → worker ID
    // With no current tickets, all scores equal → falls to lowest ID
    const r = await selectWorker(
      [
        { id: 5, name: 'E' },
        { id: 3, name: 'C' },
      ],
      { type: 'TroubleTicket', systemName: null },
      {}
    );
    assert.equal(r.worker.id, 3); // lowest ID
  });

  it('prefers worker with lower workload', async () => {
    const workerTicketsMap = new Map([
      [1, [{ type: 'SmartHands' }, { type: 'SmartHands' }]], // 2 tickets
      [2, [{ type: 'SmartHands' }]],                          // 1 ticket
    ]);
    const r = await selectWorker(
      [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      { type: 'SmartHands', systemName: null },
      {},
      workerTicketsMap
    );
    assert.equal(r.worker.id, 2); // fewer tickets
  });

  it('keeps successive assignments evenly distributed among eligible workers', async () => {
    const candidates = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ];
    const workerTicketsMap = new Map(candidates.map((worker) => [worker.id, []]));

    for (let index = 0; index < 9; index++) {
      const result = await selectWorker(
        candidates,
        { id: `T-${index}`, type: 'TroubleTicket', systemName: 'SAME-SYSTEM' },
        {},
        workerTicketsMap,
      );
      workerTicketsMap.get(result.worker.id).push({ type: 'TroubleTicket', systemName: 'SAME-SYSTEM' });
    }

    assert.deepEqual(candidates.map((worker) => workerTicketsMap.get(worker.id).length), [3, 3, 3]);
  });

  it('returns structured ranking details for the audit trace', async () => {
    const workerTicketsMap = new Map([
      [1, [{ type: 'SmartHands' }, { type: 'SmartHands' }]],
      [2, [{ type: 'SmartHands' }]],
    ]);

    const r = await selectWorker(
      [
        { id: 1, name: 'Worker A', shiftCode: 'EARLY' },
        { id: 2, name: 'Worker B', shiftCode: 'EARLY' },
      ],
      { type: 'SmartHands', systemName: null },
      {},
      workerTicketsMap,
    );

    assert.equal(r.worker.id, 2);
    assert.equal(r.ranking.length, 2);
    assert.equal(r.ranking[0].employeeId, 2);
    assert.equal(r.ranking[0].selected, true);
    assert.ok(r.ranking[0].rankingFactors.some((factor) => /workload/i.test(factor)));
  });
});

/* ================================================ */
/* resolveWorkerTie                                 */
/* ================================================ */
describe('resolveWorkerTie (deprecated)', () => {
  it('always uses stable-id (lowest ID) in V2', () => {
    // resolveWorkerTie is now a deprecated legacy function that simply picks lowest ID
    const r = resolveWorkerTie(
      [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }],
      { enableRotationTieBreaker: 'true' },
      { last_assigned_worker_id: 1 },
      {}
    );
    assert.equal(r.worker.id, 1); // lowest ID — rotation no longer applies
  });

  it('returns lowest ID regardless of rotation state', () => {
    const r = resolveWorkerTie(
      [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      { enableRotationTieBreaker: 'true' },
      { last_assigned_worker_id: 2 },
      {}
    );
    assert.equal(r.worker.id, 1); // lowest ID
  });

  it('returns lowest ID with explicit stable-id setting', () => {
    const r = resolveWorkerTie(
      [{ id: 5, name: 'E' }, { id: 3, name: 'C' }],
      { enableRotationTieBreaker: 'false' },
      null,
      {}
    );
    assert.equal(r.worker.id, 3); // lowest ID
  });
});

/* ================================================ */
/* buildDecisionLog / buildRunSummary               */
/* ================================================ */
describe('buildDecisionLog', () => {
  it('builds a complete decision log', () => {
    const log = buildDecisionLog({
      ticket: { id: '42', type: 'TroubleTicket', status: 'open', priority: 'high', site: 'FR2', normalizationWarnings: [], raw: {} },
      result: 'assigned',
      assignedWorker: { id: 1, name: 'Marco D.' },
      selectionReason: 'Best match',
      rulePath: ['relevance', 'eligibility', 'worker-selection'],
      initialCandidates: [{ id: 1, name: 'Marco D.' }, { id: 2, name: 'Patrick A.' }],
      excludedCandidates: [{ id: 2, name: 'Patrick A.', reason: 'On break' }],
      remainingCandidates: [{ id: 1, name: 'Marco D.' }],
    });
    assert.equal(log.result, 'assigned');
    assert.equal(log.assignedWorkerId, 1);
    assert.equal(log.assignedWorkerName, 'Marco D.');
    assert.ok(log.shortReason.includes('Marco D.'));
    assert.equal(log.initialCandidates.length, 2);
    assert.equal(log.excludedCandidates.length, 1);
  });
});

describe('buildRunSummary', () => {
  it('counts result types correctly', () => {
    const summary = buildRunSummary([
      { result: 'assigned' },
      { result: 'assigned' },
      { result: 'manual_review' },
      { result: 'no_candidate' },
      { result: 'error' },
    ]);
    assert.equal(summary.totalDecisions, 5);
    assert.equal(summary.assigned, 2);
    assert.equal(summary.manual_review, 1);
    assert.equal(summary.no_candidate, 1);
    assert.equal(summary.error, 1);
  });
});

/* ================================================ */
/* buildTicketExplanation                           */
/* ================================================ */
describe('buildTicketExplanation', () => {
  it('builds markdown and structured explanation', () => {
    const decision = {
      ticket_id: '42',
      external_id: 'TT-12345',
      result: 'assigned',
      short_reason: 'Zugewiesen an Marco D.',
      ticket_type: 'TroubleTicket',
      ticket_status: 'open',
      ticket_priority: 'high',
      ticket_site: 'FR2',
      normalization_warnings: [],
      initial_candidates: [{ id: 1, name: 'Marco D.' }],
      excluded_candidates: [],
      remaining_candidates: [{ id: 1, name: 'Marco D.' }],
      assigned_worker_name: 'Marco D.',
      assigned_worker_id: 1,
      selection_reason: 'Only one eligible candidate',
      rule_path: ['relevance', 'eligibility', 'worker-selection'],
      normalized_ticket: { id: '42', queue: 'TroubleTicket', externalId: 'TT-12345' },
      raw_ticket: { id: 42, external_id: 'TT-12345', queue_type: 'TroubleTicket' },
    };
    const exp = buildTicketExplanation(decision);
    assert.ok(exp.markdown.includes('Marco D.'));
    assert.equal(exp.structured.result, 'assigned');
    assert.equal(exp.structured.assignedWorkerName, 'Marco D.');
    assert.equal(exp.structured.displayTicketNumber, 'TT-12345');
    assert.equal(exp.structured.queueOrigin, 'TroubleTicket');
  });

  it('groups excluded candidates and exposes enriched ticket context', () => {
    const decision = {
      ticket_id: '314',
      external_id: 'CC-314',
      result: 'no_candidate',
      short_reason: 'CC-Mix nicht erlaubt',
      ticket_type: 'TroubleTicket',
      ticket_status: 'open',
      ticket_priority: 'high',
      ticket_site: 'FR2',
      run_mode: 'shadow',
      normalization_warnings: [],
      initial_candidates: [{ id: 7, name: 'Chris C.', role: 'cross_connect' }],
      excluded_candidates: [
        { id: 7, name: 'Chris C.', role: 'cross_connect', rule: 'queuePurity', reason: 'Worker has CrossConnect tickets — cannot mix with "TroubleTicket"' },
        { id: 7, name: 'Chris C.', role: 'cross_connect', rule: 'ticketCapacity', reason: 'Rollen-/Klassenlimit cross_connect + TroubleTicket = 1 erreicht (aktuell 1)' },
      ],
      remaining_candidates: [],
      rule_path: ['relevance', 'eligibility', 'queuePurity', 'ticketCapacity', 'worker-selection'],
      normalized_ticket: {
        id: '314',
        queue: 'TroubleTicket',
        externalId: 'CC-314',
        systemName: 'SYS-CC-01',
        activity: 'Customer Trouble',
        remainingHours: 5.5,
      },
      raw_ticket: {
        id: 314,
        external_id: 'CC-314',
        owner: 'Current Owner',
        commit_date: '2026-03-09T10:00:00Z',
        revised_commit_date: '2026-03-09T12:00:00Z',
        'Sched. Start': '2026-03-09T08:30:00Z',
      },
    };

    const exp = buildTicketExplanation(decision);
    assert.equal(exp.structured.mode, 'shadow');
    assert.equal(exp.structured.ticketContext.systemName, 'SYS-CC-01');
    assert.equal(exp.structured.ticketContext.activity, 'Customer Trouble');
    assert.equal(exp.structured.ticketContext.currentOwner, 'Current Owner');
    assert.equal(exp.structured.ticketContext.remainingTimeLabel, '5 h 30 min');
    assert.equal(exp.structured.excludedCandidateGroups.length, 1);
    assert.equal(exp.structured.excludedCandidateGroups[0].reasons.length, 2);
    assert.ok(exp.structured.decisionTrace.length >= 4);
  });

  it('exposes structured prioritization and ranking trace data', () => {
    const log = buildDecisionLog({
      ticket: {
        id: '777',
        externalId: 'TT-777',
        type: 'TroubleTicket',
        status: 'open',
        priority: 'high',
        site: 'FR2',
        normalizationWarnings: [],
        raw: {},
      },
      result: 'assigned',
      assignedWorker: { id: 5, name: 'Alice' },
      selectionReason: 'Selected by: workload: 0 tickets, worker ID: 5',
      rulePath: ['relevance', 'eligibility', 'worker-selection'],
      initialCandidates: [{ id: 5, name: 'Alice' }, { id: 8, name: 'Bob' }],
      excludedCandidates: [{ id: 8, name: 'Bob', reason: 'Not in active shift', rule: 'isShiftActive' }],
      remainingCandidates: [{ id: 5, name: 'Alice' }],
      decisionTraceInput: {
        configSnapshot: {
          mode: 'shadow',
          currentShiftOnly: 'true',
          planningWindowHours: '24',
          fallbackTieBreaker: 'stable-id',
        },
        selectionTieBreaker: 'queue-purity',
        ticketSelection: {
          prioritizationRank: 1,
          totalEligibleTickets: 3,
          totalRemainingTickets: 3,
          priorityTier: 1,
          selectedNextReason: 'TT-777 outranks SH-9 because priority tier 1 beats tier 3',
          prioritizationFactors: [
            { key: 'priority-tier', label: 'Priority tier', value: 'Tier 1' },
          ],
          comparedTickets: [
            {
              ticketId: 'SH-9',
              displayTicketNumber: 'SH-9',
              rank: 2,
              selectedFirstBy: 'Priority tier comparison',
              factors: [],
            },
          ],
        },
        candidateRanking: [
          {
            employeeId: 5,
            employeeName: 'Alice',
            workload: 0,
            selectionBlocked: false,
            rankingFactors: ['Current workload 0'],
            scoreBreakdown: { workload: 0 },
            finalRank: 1,
            selected: true,
          },
        ],
      },
    });

    const exp = buildTicketExplanation(log);

    assert.equal(log.decisionTrace.ticketSelection.prioritizationRank, 1);
    assert.equal(log.decisionTrace.candidateRanking[0].selected, true);
    assert.equal(log.decisionTrace.finalDecision.tieBreaker, 'queue-purity');
    assert.equal(exp.structured.ticketSelection?.prioritizationRank, 1);
    assert.equal(exp.structured.configSnapshot.currentShiftOnly, true);
    assert.equal(exp.structured.finalDecision?.tieBreaker, 'queue-purity');
    assert.equal(exp.structured.candidateRanking.length, 1);
    assert.ok(exp.structured.decisionTrace.length >= 6);
  });
});

describe('ticket identity helpers', () => {
  it('prefers internal queue_items ids while preserving external ids', () => {
    const identity = resolveTicketIdentity({
      id: '42',
      externalId: 'TT-12345',
      queue: 'TroubleTicket',
    });

    assert.equal(identity.internalId, 42);
    assert.equal(identity.externalId, 'TT-12345');
    assert.equal(identity.queueType, 'TroubleTicket');
  });

  it('falls back to external id plus queue type when no internal id exists', () => {
    const identity = resolveTicketIdentity({
      externalId: 'SH-9',
      raw: { queue_type: 'SmartHands' },
    });

    assert.equal(identity.internalId, null);
    assert.equal(identity.externalId, 'SH-9');
    assert.equal(identity.queueType, 'SmartHands');
  });

  it('matches assignment decisions by internal and external ticket identifiers', () => {
    const decision = {
      ticket_id: '42',
      external_id: 'TT-12345',
      normalized_ticket: { id: '42', externalId: 'TT-12345' },
    };

    assert.equal(decisionMatchesTicketIdentifier(decision, '42'), true);
    assert.equal(decisionMatchesTicketIdentifier(decision, 'TT-12345'), true);
    assert.equal(decisionMatchesTicketIdentifier(decision, 'TT-99999'), false);
  });

  it('only parses positive numeric values as internal ticket ids', () => {
    assert.equal(parseInternalTicketId('42'), 42);
    assert.equal(parseInternalTicketId('TT-12345'), null);
    assert.equal(parseInternalTicketId('0'), null);
  });
});

/* ================================================================ */
/* V2 Rules — Crawler Guard                                         */
/* ================================================================ */
describe('Crawler Stale Protection', () => {
  const NOW = new Date('2026-03-08T12:00:00Z').getTime();

  it('rejects missing timestamp', () => {
    const r = checkCrawlerFreshness(null, NOW);
    assert.equal(r.fresh, false);
    assert.match(r.reason, /No crawler timestamp/);
  });

  it('rejects invalid timestamp', () => {
    const r = checkCrawlerFreshness('not-a-date', NOW);
    assert.equal(r.fresh, false);
    assert.match(r.reason, /Invalid/);
  });

  it('accepts fresh data (< 10 min)', () => {
    const fiveMin = new Date(NOW - 5 * 60 * 1000).toISOString();
    const r = checkCrawlerFreshness(fiveMin, NOW);
    assert.equal(r.fresh, true);
  });

  it('rejects stale data (> 10 min)', () => {
    const fifteenMin = new Date(NOW - 15 * 60 * 1000).toISOString();
    const r = checkCrawlerFreshness(fifteenMin, NOW);
    assert.equal(r.fresh, false);
    assert.match(r.reason, /15 minutes/);
  });

  it('rejects data exactly at boundary + 1s', () => {
    const overLimit = new Date(NOW - CRAWLER_MAX_AGE_MS - 1000).toISOString();
    const r = checkCrawlerFreshness(overLimit, NOW);
    assert.equal(r.fresh, false);
  });

  it('accepts data just under 10 min', () => {
    const justUnder = new Date(NOW - CRAWLER_MAX_AGE_MS + 1000).toISOString();
    const r = checkCrawlerFreshness(justUnder, NOW);
    assert.equal(r.fresh, true);
  });

  it('supports custom max age', () => {
    const fiveMin = new Date(NOW - 5 * 60 * 1000).toISOString();
    const r = checkCrawlerFreshness(fiveMin, NOW, 3 * 60 * 1000);
    assert.equal(r.fresh, false);
  });
});

/* ================================================================ */
/* V2 Rules — Role Filter                                           */
/* ================================================================ */
describe('Role Exclusions', () => {
  const NOW = new Date('2026-03-08T12:00:00Z').getTime();
  const ttTicket  = { type: 'TroubleTicket', priority: 'high', handoverType: null, dueAt: null };
  const ccTicket  = { type: 'CrossConnect', priority: 'medium', handoverType: null, dueAt: '2026-03-10T12:00:00Z' };
  const shTicket  = { type: 'SmartHands', priority: 'medium', handoverType: null };
  const otTicket  = { type: 'TroubleTicket', priority: 'medium', handoverType: 'other_teams' };

  it('excludes Dispatcher from normal tickets', () => {
    const r = applyRoleFilter({ role: 'dispatcher' }, ttTicket, NOW);
    assert.equal(r.eligible, false);
    assert.match(r.reason, /Dispatcher.*does not receive normal/);
  });

  it('allows Dispatcher for OtherTeams handover', () => {
    const r = applyRoleFilter({ role: 'dispatcher' }, otTicket, NOW);
    assert.equal(r.eligible, true);
  });

  it('excludes OtherTeams handover from normal staff', () => {
    const r = applyRoleFilter({ role: 'normal' }, otTicket, NOW);
    assert.equal(r.eligible, false);
    assert.match(r.reason, /OtherTeams.*Dispatcher/);
  });

  it('excludes Large Order', () => {
    assert.equal(applyRoleFilter({ role: 'large_order' }, ttTicket, NOW).eligible, false);
  });

  it('excludes Project', () => {
    assert.equal(applyRoleFilter({ role: 'project' }, ttTicket, NOW).eligible, false);
  });

  it('excludes Leads', () => {
    assert.equal(applyRoleFilter({ role: 'leads' }, ttTicket, NOW).eligible, false);
  });

  it('allows Deutsche Börse for TroubleTickets', () => {
    assert.equal(applyRoleFilter({ role: 'deutsche_boerse' }, ttTicket, NOW).eligible, true);
  });

  it('allows Deutsche Börse for CC > 24h', () => {
    assert.equal(applyRoleFilter({ role: 'deutsche_boerse' }, ccTicket, NOW).eligible, true);
  });

  it('excludes Deutsche Börse for CC <= 24h', () => {
    const shortCC = { ...ccTicket, dueAt: '2026-03-09T10:00:00Z' };
    assert.equal(applyRoleFilter({ role: 'deutsche_boerse' }, shortCC, NOW).eligible, false);
  });

  it('excludes Deutsche Börse for SmartHands', () => {
    assert.equal(applyRoleFilter({ role: 'deutsche_boerse' }, shTicket, NOW).eligible, false);
  });

  it('allows Cross Connect role only for CC tickets', () => {
    assert.equal(applyRoleFilter({ role: 'cross_connect' }, ccTicket, NOW).eligible, true);
    assert.equal(applyRoleFilter({ role: 'cross_connect' }, ttTicket, NOW).eligible, false);
    assert.equal(applyRoleFilter({ role: 'cross_connect' }, shTicket, NOW).eligible, false);
  });

  it('excludes Support (secondary worker)', () => {
    const r = applyRoleFilter({ role: 'support' }, ttTicket, NOW);
    assert.equal(r.eligible, false);
    assert.match(r.reason, /secondary/i);
  });

  it('allows Buddy and Neustarter', () => {
    assert.equal(applyRoleFilter({ role: 'buddy' }, ttTicket, NOW).eligible, true);
    assert.equal(applyRoleFilter({ role: 'neustarter' }, ttTicket, NOW).eligible, true);
  });

  it('allows Normal for all tickets', () => {
    assert.equal(applyRoleFilter({ role: 'normal' }, ttTicket, NOW).eligible, true);
  });

  it('defaults to normal if role missing', () => {
    assert.equal(applyRoleFilter({}, ttTicket, NOW).eligible, true);
  });
});

/* ================================================================ */
/* V2 Rules — Exclusion List                                        */
/* ================================================================ */
describe('Exclusion List', () => {
  const list = ['SYS-ALPHA', 'sys-beta', 'GAMMA-PROD'];

  it('excludes matching system name', () => {
    assert.equal(checkExclusionList({ systemName: 'SYS-ALPHA' }, list).excluded, true);
  });

  it('is case-insensitive', () => {
    assert.equal(checkExclusionList({ systemName: 'sys-alpha' }, list).excluded, true);
  });

  it('does not exclude non-matching name', () => {
    assert.equal(checkExclusionList({ systemName: 'SYS-DELTA' }, list).excluded, false);
  });

  it('does not exclude ticket with no system name', () => {
    assert.equal(checkExclusionList({ systemName: null }, list).excluded, false);
  });

  it('does not exclude when list is empty', () => {
    assert.equal(checkExclusionList({ systemName: 'SYS-ALPHA' }, []).excluded, false);
  });
});

/* ================================================================ */
/* V2 Rules — Handover Routing                                      */
/* ================================================================ */
describe('Handover Routing', () => {
  it('treats Workload as normal', () => {
    const r = routeHandover({ type: 'TroubleTicket', handoverType: 'workload' });
    assert.equal(r.action, 'normal');
    assert.equal(r.effectiveType, 'TroubleTicket');
  });

  it('treats Terminated as Scheduled', () => {
    const r = routeHandover({ type: 'TroubleTicket', handoverType: 'terminated' });
    assert.equal(r.action, 'scheduled');
    assert.equal(r.effectiveType, 'Scheduled');
  });

  it('routes OtherTeams to dispatcher_only', () => {
    const r = routeHandover({ type: 'TroubleTicket', handoverType: 'other_teams' });
    assert.equal(r.action, 'dispatcher_only');
  });

  it('treats unknown handover as manual_review', () => {
    const r = routeHandover({ type: 'TroubleTicket', handoverType: 'something_new' });
    assert.equal(r.action, 'manual_review');
  });

  it('treats missing handover as normal', () => {
    const r = routeHandover({ type: 'TroubleTicket', handoverType: null });
    assert.equal(r.action, 'normal');
  });
});

/* ================================================================ */
/* V2 Rules — Queue Purity                                          */
/* ================================================================ */
describe('Queue Purity', () => {
  const NOW = new Date('2026-03-08T12:00:00Z').getTime();

  it('allows any type when worker has no current tickets', () => {
    assert.equal(checkQueuePurity({}, { type: 'SmartHands' }, [], false, NOW).pure, true);
  });

  it('allows SH → SH', () => {
    assert.equal(checkQueuePurity({}, { type: 'SmartHands' }, [{ type: 'SmartHands' }], false, NOW).pure, true);
  });

  it('blocks SH → CC', () => {
    assert.equal(checkQueuePurity({}, { type: 'CrossConnect' }, [{ type: 'SmartHands' }], false, NOW).pure, false);
  });

  it('allows CC → CC', () => {
    assert.equal(checkQueuePurity({}, { type: 'CrossConnect' }, [{ type: 'CrossConnect' }], false, NOW).pure, true);
  });

  it('blocks CC → SH', () => {
    assert.equal(checkQueuePurity({}, { type: 'SmartHands' }, [{ type: 'CrossConnect' }], false, NOW).pure, false);
  });

  it('allows CC worker → TT when insufficient resources + CC > 24h', () => {
    const existing = [{ type: 'CrossConnect', dueAt: '2026-03-10T12:00:00Z' }]; // 48h
    assert.equal(checkQueuePurity({}, { type: 'TroubleTicket' }, existing, true, NOW).pure, true);
  });

  it('blocks CC worker → TT when insufficient resources but CC <= 24h', () => {
    const existing = [{ type: 'CrossConnect', dueAt: '2026-03-09T10:00:00Z' }]; // 22h
    assert.equal(checkQueuePurity({}, { type: 'TroubleTicket' }, existing, true, NOW).pure, false);
  });

  it('blocks CC worker → TT when resources are sufficient', () => {
    const existing = [{ type: 'CrossConnect', dueAt: '2026-03-10T12:00:00Z' }]; // 48h
    assert.equal(checkQueuePurity({}, { type: 'TroubleTicket' }, existing, false, NOW).pure, false);
  });

  it('allows TT → Scheduled', () => {
    assert.equal(checkQueuePurity({}, { type: 'Scheduled' }, [{ type: 'TroubleTicket' }], false, NOW).pure, true);
  });

  it('allows configured CC mix only for matching system and priority', async () => {
    try {
      await refreshAssignmentRuntimeRules({
        client: {
          query: async () => ({
            rows: [
              {
                rule_key: 'cross_connect_only',
                enabled: true,
                config_json: {
                  allow: ['CrossConnect'],
                  allow_mixed_types: ['TroubleTicket'],
                  allow_same_system_only: true,
                  same_priority_only: true,
                },
              },
            ],
          }),
        },
      });

      const existing = [{ type: 'CrossConnect', systemName: 'SYS-A', priority: 'high' }];
      const allowed = checkQueuePurity({}, { type: 'TroubleTicket', systemName: 'SYS-A', priority: 'high' }, existing, false, NOW);
      const blocked = checkQueuePurity({}, { type: 'TroubleTicket', systemName: 'SYS-B', priority: 'high' }, existing, false, NOW);

      assert.equal(allowed.pure, true);
      assert.equal(blocked.pure, false);
    } finally {
      await refreshAssignmentRuntimeRules({ client: { query: async () => ({ rows: [] }) } });
    }
  });
});

describe('Ticket Capacity', () => {
  it('blocks per-role and per-type caps with explicit reasons', () => {
    const result = evaluateTicketCapacity(
      { role: 'cross_connect' },
      { type: 'TroubleTicket' },
      [{ type: 'TroubleTicket' }],
      {
        maxTicketsPerWorker: 0,
        maxTicketsPerType: { TroubleTicket: 1 },
        maxTicketsPerRole: { cross_connect: 2 },
        maxTicketsPerRoleAndType: { cross_connect: { TroubleTicket: 1 } },
      },
    );

    assert.equal(result.eligible, false);
    assert.ok(result.reason.includes('Ticketklassenlimit TroubleTicket = 1'));
    assert.ok(result.reason.includes('Rollen-/Klassenlimit cross_connect + TroubleTicket = 1'));
  });

  it('surfaces ticketCapacity as an eligibility exclusion', async () => {
    try {
      await refreshAssignmentRuntimeRules({
        client: {
          query: async () => ({
            rows: [
              {
                rule_key: 'max_tickets_per_worker',
                enabled: true,
                config_json: {
                  max: 0,
                  per_role_type: {
                    cross_connect: { TroubleTicket: 1 },
                  },
                },
              },
            ],
          }),
        },
      });

      const worker = {
        id: 9,
        name: 'Chris C.',
        role: 'cross_connect',
        autoAssignable: true,
        blocked: false,
        onBreak: false,
        absent: false,
        shiftActive: true,
        userMapped: true,
        site: 'FR2',
        responsibility: 'c-ops',
      };
      const ticket = { id: '22', type: 'TroubleTicket', site: 'FR2', responsibility: 'c-ops' };
      const currentTickets = [{ type: 'TroubleTicket' }];

      const result = applyEligibilityRules(worker, ticket, { siteStrictness: 'true', responsibilityStrictness: 'true' }, currentTickets, false);

      assert.equal(result.eligible, false);
      assert.ok(result.exclusions.some((entry) => entry.rule === 'ticketCapacity'));
    } finally {
      await refreshAssignmentRuntimeRules({ client: { query: async () => ({ rows: [] }) } });
    }
  });
});

/* ================================================================ */
/* V2 Rules — System Name Grouping                                  */
/* ================================================================ */
describe('System Name Grouping', () => {
  const NOW = new Date('2026-03-08T12:00:00Z').getTime();

  it('returns no grouping for ticket without system name', () => {
    const r = evaluateSystemGrouping({}, { type: 'SmartHands' }, [], NOW);
    assert.equal(r.grouped, false);
    assert.equal(r.score, 0);
  });

  it('returns no grouping when worker has no tickets for that system', () => {
    const r = evaluateSystemGrouping({}, { type: 'SmartHands', systemName: 'SYS-A' }, [], NOW);
    assert.equal(r.grouped, false);
  });

  it('groups SmartHands up to max 3 per worker per system', () => {
    const existing = [
      { systemName: 'SYS-A', type: 'SmartHands' },
      { systemName: 'SYS-A', type: 'SmartHands' },
    ];
    const r = evaluateSystemGrouping({}, { type: 'SmartHands', systemName: 'SYS-A' }, existing, NOW);
    assert.equal(r.grouped, true);
    assert.ok(r.score > 0);
  });

  it('blocks SmartHands at max 3 per worker per system', () => {
    const existing = [
      { systemName: 'SYS-A', type: 'SmartHands' },
      { systemName: 'SYS-A', type: 'SmartHands' },
      { systemName: 'SYS-A', type: 'SmartHands' },
    ];
    const r = evaluateSystemGrouping({}, { type: 'SmartHands', systemName: 'SYS-A' }, existing, NOW);
    assert.equal(r.grouped, false);
    assert.equal(r.blocked, true);
    assert.equal(r.score, -1);
  });

  it('groups CrossConnect with similar remaining times (< 6h)', () => {
    const existing = [
      { systemName: 'SYS-B', type: 'CrossConnect', dueAt: '2026-03-08T16:00:00Z' },
    ];
    const ticket = { type: 'CrossConnect', systemName: 'SYS-B', dueAt: '2026-03-08T18:00:00Z' };
    assert.equal(evaluateSystemGrouping({}, ticket, existing, NOW).grouped, true);
  });

  it('does not group CrossConnect with > 6h time difference', () => {
    const existing = [
      { systemName: 'SYS-B', type: 'CrossConnect', dueAt: '2026-03-08T14:00:00Z' },
    ];
    const ticket = { type: 'CrossConnect', systemName: 'SYS-B', dueAt: '2026-03-09T12:00:00Z' };
    assert.equal(evaluateSystemGrouping({}, ticket, existing, NOW).grouped, false);
  });

  it('is case-insensitive on system name', () => {
    const existing = [{ systemName: 'sys-a', type: 'SmartHands' }];
    assert.equal(evaluateSystemGrouping({}, { type: 'SmartHands', systemName: 'SYS-A' }, existing, NOW).grouped, true);
  });
});

/* ================================================================ */
/* V2 — Priority Tiers                                              */
/* ================================================================ */
describe('Priority Tiers', () => {
  it('returns correct tier for each ticket type/priority combination', () => {
    assert.equal(getPriorityTier({ type: 'TroubleTicket', priority: 'critical' }), PRIORITY_TIERS.TT_HIGH);
    assert.equal(getPriorityTier({ type: 'TroubleTicket', priority: 'high' }), PRIORITY_TIERS.TT_HIGH);
    assert.equal(getPriorityTier({ type: 'TroubleTicket', priority: 'medium' }), PRIORITY_TIERS.TT_MEDIUM);
    assert.equal(getPriorityTier({ type: 'SmartHands', priority: 'medium' }), PRIORITY_TIERS.KPI_QUEUE);
    assert.equal(getPriorityTier({ type: 'CrossConnect', priority: 'low' }), PRIORITY_TIERS.KPI_QUEUE);
    assert.equal(getPriorityTier({ type: 'Scheduled', priority: 'medium' }), PRIORITY_TIERS.SCHEDULED);
    assert.equal(getPriorityTier({ type: 'TroubleTicket', priority: 'low' }), PRIORITY_TIERS.TT_LOW);
    assert.equal(getPriorityTier({ type: 'Other', priority: 'medium' }), PRIORITY_TIERS.OTHER);
  });

  it('sorts TT-High > TT-Medium > KPI > Scheduled > TT-Low in correct order', () => {
    const NOW = new Date('2026-03-08T12:00:00Z').getTime();
    const tickets = [
      { id: 'low', type: 'TroubleTicket', priority: 'low' },
      { id: 'sched', type: 'Scheduled', priority: 'medium' },
      { id: 'sh', type: 'SmartHands', priority: 'medium', dueAt: '2026-03-08T14:00:00Z' },
      { id: 'high', type: 'TroubleTicket', priority: 'high' },
      { id: 'med', type: 'TroubleTicket', priority: 'medium' },
    ];
    const sorted = sortTickets(tickets, NOW);
    assert.deepEqual(sorted.map(t => t.id), ['high', 'med', 'sh', 'sched', 'low']);
  });

  it('sorts KPI tickets by lowest remaining time', () => {
    const NOW = new Date('2026-03-08T12:00:00Z').getTime();
    const tickets = [
      { id: 'sh2', type: 'SmartHands', priority: 'medium', dueAt: '2026-03-08T20:00:00Z' },
      { id: 'cc1', type: 'CrossConnect', priority: 'medium', dueAt: '2026-03-08T14:00:00Z' },
      { id: 'sh1', type: 'SmartHands', priority: 'medium', dueAt: '2026-03-08T18:00:00Z' },
    ];
    const sorted = sortTickets(tickets, NOW);
    assert.equal(sorted[0].id, 'cc1');
    assert.equal(sorted[1].id, 'sh1');
    assert.equal(sorted[2].id, 'sh2');
  });

  it('breaks final ties by ticket ID', () => {
    const NOW = new Date('2026-03-08T12:00:00Z').getTime();
    const sorted = sortTickets([
      { id: 'b', type: 'TroubleTicket', priority: 'high' },
      { id: 'a', type: 'TroubleTicket', priority: 'high' },
    ], NOW);
    assert.equal(sorted[0].id, 'a');
  });
});

/* ================================================================ */
/* V2 — Normalization New Fields                                    */
/* ================================================================ */
describe('Normalization — V2 Fields', () => {
  it('normalizes Scheduled ticket type', () => {
    assert.equal(mapType('scheduled').value, 'Scheduled');
    assert.equal(mapType('Scheduled').value, 'Scheduled');
  });

  it('normalizes handover types', () => {
    assert.equal(mapHandoverType('workload').value, 'workload');
    assert.equal(mapHandoverType('terminated').value, 'terminated');
    assert.equal(mapHandoverType('other_teams').value, 'other_teams');
    assert.equal(mapHandoverType('otherteams').value, 'other_teams');
  });

  it('preserves system name', () => {
    assert.equal(mapSystemName('SYS-ALPHA').value, 'SYS-ALPHA');
    assert.equal(mapSystemName(null).value, null);
    assert.equal(mapSystemName('').value, null);
  });

  it('includes V2 fields in normalizeTicket output', () => {
    const raw = {
      id: 42,
      queue_type: 'SmartHands',
      status: 'open',
      severity: 'medium',
      system_name: 'PROD-DB-01',
      handover_type: 'workload',
      sched_start: '2026-03-09T08:00:00Z',
      commit_date: '2026-03-10T12:00:00Z',
      first_seen_at: '2026-03-07T10:00:00Z',
      remaining_hours: 48,
    };
    const ticket = normalizeTicket(raw);
    assert.equal(ticket.type, 'SmartHands');
    assert.equal(ticket.systemName, 'PROD-DB-01');
    assert.equal(ticket.handoverType, 'workload');
    assert.equal(ticket.remainingHours, 48);
  });
});

/* ================================================================ */
/* V2 — Eligibility with Role + Queue Purity                        */
/* ================================================================ */
describe('Eligibility — V2 Role + Purity', () => {
  const settings = { siteStrictness: 'false', responsibilityStrictness: 'false' };
  const ttTicket = { type: 'TroubleTicket', priority: 'high', handoverType: null, site: null, responsibility: null };

  it('excludes by role filter', () => {
    const w = { name: 'Test', autoAssignable: true, blocked: false, onBreak: false, absent: false, shiftActive: true, role: 'project' };
    const r = applyEligibilityRules(w, ttTicket, settings);
    assert.equal(r.eligible, false);
    assert.ok(r.exclusions.some(e => e.rule === 'roleFilter'));
  });

  it('does not hard-exclude by queue purity because purity is ranked later', () => {
    const w = { name: 'Test', autoAssignable: true, blocked: false, onBreak: false, absent: false, shiftActive: true, role: 'normal' };
    const shTicket = { type: 'SmartHands', priority: 'medium', handoverType: null, site: null, responsibility: null };
    const currentTickets = [{ type: 'CrossConnect' }];
    const r = applyEligibilityRules(w, shTicket, settings, currentTickets);
    assert.equal(r.eligible, true);
    assert.equal(r.exclusions.some(e => e.rule === 'queuePurity'), false);
  });

  it('accepts normal worker with clean queue', () => {
    const w = { name: 'Test', autoAssignable: true, blocked: false, onBreak: false, absent: false, shiftActive: true, role: 'normal' };
    const r = applyEligibilityRules(w, ttTicket, settings, []);
    assert.equal(r.eligible, true);
    assert.equal(r.exclusions.length, 0);
  });
});

/* ================================================================ */
/* V2 — Worker Selection Tie-Breaking                               */
/* ================================================================ */
describe('V2 Worker Selection', () => {
  const NOW = new Date('2026-03-08T12:00:00Z').getTime();

  it('prefers lower workload over existing system name grouping', async () => {
    const candidates = [
      { id: 1, name: 'Worker A' },
      { id: 2, name: 'Worker B' },
    ];
    const wMap = new Map([
      [1, []],
      [2, [{ systemName: 'SYS-A', type: 'SmartHands' }]],
    ]);
    const r = await selectWorker(candidates, { type: 'SmartHands', systemName: 'SYS-A', dueAt: '2026-03-08T16:00:00Z' }, {}, wMap, false, NOW);
    assert.equal(r.worker.id, 1);
    assert.equal(r.tieBreaker, 'workload');
  });

  it('prefers queue purity when no grouping difference', async () => {
    const candidates = [
      { id: 1, name: 'Worker A' },
      { id: 2, name: 'Worker B' },
    ];
    const wMap = new Map([
      [1, [{ type: 'CrossConnect' }]],  // impure for SH
      [2, [{ type: 'SmartHands' }]],     // pure for SH
    ]);
    const r = await selectWorker(candidates, { type: 'SmartHands', systemName: null }, {}, wMap, false, NOW);
    assert.equal(r.worker.id, 2);
  });

  it('prefers least workload when grouping and purity equal', async () => {
    const candidates = [
      { id: 1, name: 'Worker A' },
      { id: 2, name: 'Worker B' },
    ];
    const wMap = new Map([
      [1, [{ type: 'SmartHands' }, { type: 'SmartHands' }]],
      [2, [{ type: 'SmartHands' }]],
    ]);
    const r = await selectWorker(candidates, { type: 'SmartHands', systemName: null }, {}, wMap, false, NOW);
    assert.equal(r.worker.id, 2);
  });

  it('falls back to lowest worker ID', async () => {
    const r = await selectWorker(
      [{ id: 5, name: 'E' }, { id: 3, name: 'C' }],
      { type: 'SmartHands', systemName: null },
      {},
      new Map([[5, []], [3, []]]),
      false, NOW,
    );
    assert.equal(r.worker.id, 3);
  });

  it('uses round-robin when rotation tie-breaker is explicitly enabled', async () => {
    const originalGetForSite = assignmentRotationRepository.getForSite;
    assignmentRotationRepository.getForSite = async () => ({ last_assigned_worker_id: 3 });

    try {
      const r = await selectWorker(
        [{ id: 3, name: 'Worker C' }, { id: 5, name: 'Worker E' }],
        { type: 'SmartHands', systemName: null, site: 'FRA1' },
        { enableRotationTieBreaker: 'true', fallbackTieBreaker: 'stable-id' },
        new Map([[3, []], [5, []]]),
        false,
        NOW,
      );

      assert.equal(r.worker.id, 5);
      assert.equal(r.tieBreaker, 'round-robin');
      assert.match(r.reason, /round-robin rotation/i);
    } finally {
      assignmentRotationRepository.getForSite = originalGetForSite;
    }
  });

  it('uses random fallback when configured and rotation is disabled', async () => {
    const originalRandom = Math.random;
    Math.random = () => 0.99;

    try {
      const r = await selectWorker(
        [{ id: 3, name: 'Worker C' }, { id: 5, name: 'Worker E' }],
        { type: 'SmartHands', systemName: null, site: 'FRA1' },
        { enableRotationTieBreaker: 'false', fallbackTieBreaker: 'random' },
        new Map([[3, []], [5, []]]),
        false,
        NOW,
      );

      assert.equal(r.worker.id, 5);
      assert.equal(r.tieBreaker, 'random');
      assert.match(r.reason, /random fallback/i);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('still assigns a worker when only queue-impure candidates remain', async () => {
    const candidates = [
      { id: 5, name: 'Worker A' },
      { id: 7, name: 'Worker B' },
    ];
    const wMap = new Map([
      [5, [{ type: 'CrossConnect', systemName: 'SYS-X', priority: 'medium' }]],
      [7, [{ type: 'CrossConnect', systemName: 'SYS-Y', priority: 'medium' }]],
    ]);

    const r = await selectWorker(candidates, { type: 'TroubleTicket', systemName: 'SYS-TT', priority: 'high' }, {}, wMap, false, NOW);
    assert.equal(r.worker.id, 5);
    assert.equal(r.tieBreaker, 'worker-id');
    assert.equal(r.ranking[0].queuePure, false);
    assert.equal(r.ranking[1].queuePure, false);
  });

  it('prefers the empty worker before queue purity needs to break a tie', async () => {
    const candidates = [
      { id: 5, name: 'Worker A' },
      { id: 7, name: 'Worker B' },
    ];
    const wMap = new Map([
      [5, [{ type: 'CrossConnect', systemName: 'SYS-X', priority: 'medium' }]],
      [7, []],
    ]);

    const r = await selectWorker(candidates, { type: 'TroubleTicket', systemName: 'SYS-TT', priority: 'high' }, {}, wMap, false, NOW);
    assert.equal(r.worker.id, 7);
    assert.equal(r.tieBreaker, 'workload');
    assert.equal(r.ranking[0].employeeId, 7);
    assert.equal(r.ranking[1].employeeId, 5);
  });

  it('returns the only candidate', async () => {
    const r = await selectWorker([{ id: 42, name: 'Solo' }], { type: 'SmartHands' }, {}, new Map(), false, NOW);
    assert.equal(r.worker.id, 42);
    assert.match(r.reason, /Only one/);
  });

  it('returns null for no candidates', async () => {
    const r = await selectWorker([], { type: 'SmartHands' }, {}, new Map(), false, NOW);
    assert.equal(r.worker, null);
  });
});

describe('Existing owner resolution', () => {
  it('matches an active in-shift worker by Jarvis owner code', () => {
    const ticket = { raw: { owner: 'MMUST' } };
    const candidates = [
      {
        id: 1,
        name: 'Max Mustermann',
        plannedEmployeeName: 'Mustermann Max',
        jarvisOwnerCode: 'MMUST',
        jarvisDisplayName: 'Mustermann, Max',
        shiftActive: true,
      },
      {
        id: 2,
        name: 'Erika Musterfrau',
        jarvisOwnerCode: 'EMUST',
        shiftActive: true,
      },
    ];

    const result = resolveActiveExistingOwner(ticket, candidates);
    assert.equal(result?.id, 1);
    assert.equal(result?.name, 'Max Mustermann');
  });

  it('ignores matching owners who are not active in the current shift', () => {
    const ticket = { raw: { owner: 'MMUST' } };
    const candidates = [
      {
        id: 1,
        name: 'Max Mustermann',
        jarvisOwnerCode: 'MMUST',
        shiftActive: false,
      },
      {
        id: 2,
        name: 'Erika Musterfrau',
        jarvisOwnerCode: 'EMUST',
        shiftActive: true,
      },
    ];

    const result = resolveActiveExistingOwner(ticket, candidates);
    assert.equal(result, null);
  });
});
