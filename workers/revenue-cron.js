// Cloudflare Worker scheduler for the supervised Leo revenue engine.
// It claims the durable Supabase queue; it does not contact marketplaces directly.

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    return run(env);
  }
};

async function run(env) {
  const secret = String(env.REVENUE_ENGINE_CRON_SECRET || '').trim();
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!secret || !base || !key) return new Response(JSON.stringify({ success: false, code: 'REVENUE_CRON_NOT_CONFIGURED' }), { status: 503 });
  const response = await fetch(`${base}/rest/v1/rpc/claim_crm_jobs`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_worker: 'cloudflare-cron', p_limit: 10, p_lease_seconds: 300 })
  });
  const body = await response.text();
  return new Response(JSON.stringify({
    success: response.ok,
    status: response.ok ? 'CLAIMED_FOR_SUPERVISED_PROCESSING' : 'SUPABASE_RPC_FAILED',
    httpStatus: response.status,
    error: response.ok ? null : body.slice(0, 500),
    jobs: response.ok ? JSON.parse(body || '[]') : []
  }), { status: response.ok ? 200 : 502, headers: { 'Content-Type': 'application/json' } });
}
