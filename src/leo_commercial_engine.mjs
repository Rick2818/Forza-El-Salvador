// Pure commercial decision helpers. They do not contact platforms, write CRM,
// send proposals or change payments; persistence/execution belongs to an
// authorized adapter and must carry the returned evidence.

export const OPPORTUNITY_STATES = Object.freeze([
  'DISCOVERED', 'RESEARCHING', 'QUALIFIED', 'DISQUALIFIED',
  'PENDING_APPROVAL', 'CONTACTED', 'ENGAGED', 'NEEDS_ANALYSIS',
  'PROPOSAL_READY', 'PROPOSAL_SENT', 'NEGOTIATING', 'WON', 'LOST', 'ON_HOLD'
]);

const WEIGHTS = Object.freeze({ compatibility: 20, budget: 15, urgency: 15, intent: 15, quality: 10, complexity: 10, profitability: 10, evidence: 5 });
const number = value => Math.max(0, Math.min(1, Number(value) || 0));

export function scoreOpportunity(input = {}) {
  const factors = Object.fromEntries(Object.keys(WEIGHTS).map(key => [key, number(input[key])]));
  const score = Math.round(Object.entries(WEIGHTS).reduce((total, [key, weight]) => total + factors[key] * weight, 0));
  const reasons = Object.entries(factors).filter(([, value]) => value >= 0.7).map(([key]) => key);
  const gaps = Object.entries(factors).filter(([, value]) => value < 0.4).map(([key]) => key);
  return { score, factors, reasons, gaps, priority: score >= 75 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW' };
}

const EVIDENCE_REQUIRED = new Set(['CONTACTED', 'PROPOSAL_SENT', 'WON']);

export function transitionOpportunity({ from, to, evidence = null } = {}) {
  if (!OPPORTUNITY_STATES.includes(from) || !OPPORTUNITY_STATES.includes(to)) {
    return { ok: false, code: 'OPPORTUNITY_STATE_INVALID' };
  }
  if (EVIDENCE_REQUIRED.has(to) && (!evidence || !String(evidence.receipt || '').trim() || !String(evidence.source || '').trim())) {
    return { ok: false, code: 'OPPORTUNITY_EVIDENCE_REQUIRED' };
  }
  return { ok: true, from, to, evidence: evidence || null };
}

export function commercialIdempotencyKey({ tenantId = 'boltech', platform, sourceId, action, payload = {} } = {}) {
  const canonical = JSON.stringify({ tenantId, platform, sourceId, action, payload });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `crm:${hash.toString(16).padStart(8, '0')}`;
}
