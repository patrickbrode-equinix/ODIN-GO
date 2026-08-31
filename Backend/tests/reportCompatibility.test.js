import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  mapLegacyDecisionTypeToResult,
  normalizeLegacyDecisionRow,
  summarizeDecisionResults,
} from '../assignment/lib/reportCompatibility.js';

describe('reportCompatibility helpers', () => {
  it('maps legacy skipped decisions to manual_review', () => {
    assert.equal(mapLegacyDecisionTypeToResult('skipped_no_candidates'), 'manual_review');
    assert.equal(mapLegacyDecisionTypeToResult('assigned'), 'assigned');
    assert.equal(mapLegacyDecisionTypeToResult('error'), 'error');
  });

  it('normalizes a legacy decision row to the current shape', () => {
    const normalized = normalizeLegacyDecisionRow({
      id: 17,
      run_id: 22,
      ticket_external_id: 'ACT-123',
      queue_type: 'SmartHands',
      system_name: 'SYS-01',
      assigned_to: 'Alice',
      decision_type: 'assigned',
      deciding_rule: 'legacy-best-candidate',
      explanation: 'Assigned by legacy engine',
      candidates_evaluated: [{ name: 'Alice', shift: 'E1', roles: ['smarthands'] }],
      exclusion_reasons: [{ candidate: 'Bob', reason: 'role mismatch' }],
      created_at: '2026-04-12T10:00:00.000Z',
    });

    assert.equal(normalized.result, 'assigned');
    assert.equal(normalized.external_id, 'ACT-123');
    assert.equal(normalized.assigned_worker_name, 'Alice');
    assert.deepEqual(normalized.rule_path, ['legacy-best-candidate']);
    assert.equal(normalized.initial_candidates[0].name, 'Alice');
    assert.equal(normalized.excluded_candidates[0].reason, 'role mismatch');
  });

  it('summarizes decision results by normalized result key', () => {
    const summary = summarizeDecisionResults([
      { result: 'assigned' },
      { result: 'manual_review' },
      { result: 'manual_review' },
    ]);

    assert.deepEqual(summary, {
      assigned: 1,
      manual_review: 2,
    });
  });
});