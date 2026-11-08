import test from 'node:test';
import assert from 'node:assert/strict';
import { commercialIdempotencyKey, scoreOpportunity, transitionOpportunity } from '../src/leo_commercial_engine.mjs';

test('commercial score explains prioritization without contacting a platform', () => {
  const result = scoreOpportunity({ compatibility: 1, budget: .8, urgency: .9, intent: .8, quality: .9, complexity: .4, profitability: .8, evidence: .7 });
  assert.equal(result.score, 82);
  assert.equal(result.priority, 'HIGH');
  assert.ok(result.reasons.includes('compatibility'));
  assert.ok(result.gaps.includes('complexity') === false);
});

test('contact, proposal and won require provider evidence', () => {
  assert.deepEqual(transitionOpportunity({ from: 'QUALIFIED', to: 'PROPOSAL_SENT' }), { ok: false, code: 'OPPORTUNITY_EVIDENCE_REQUIRED' });
  assert.equal(transitionOpportunity({ from: 'PROPOSAL_READY', to: 'PROPOSAL_SENT', evidence: { source: 'upwork', receipt: 'r-1' } }).ok, true);
});

test('commercial idempotency is stable for the same event', () => {
  const input = { platform: 'EXPLEE', sourceId: 'lead-1', action: 'qualify', payload: { score: 70 } };
  assert.equal(commercialIdempotencyKey(input), commercialIdempotencyKey(input));
});
