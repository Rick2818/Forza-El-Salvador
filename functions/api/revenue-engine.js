// Protected worker entrypoint for the supervised Leo revenue engine.
// It only claims durable jobs; job handlers must keep external writes closed.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function authorized(request, env) {
  const expected = String(env.REVENUE_ENGINE_CRON_SECRET || '').trim();
  const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return Boolean(expected && supplied && supplied === expected);
}

async function supabaseRpc(env, name, args) {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) throw Object.assign(new Error('REVENUE_ENGINE_SUPABASE_NOT_CONFIGURED'), { code: 'REVENUE_ENGINE_SUPABASE_NOT_CONFIGURED' });
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!response.ok) throw Object.assign(new Error('REVENUE_ENGINE_SUPABASE_RPC_FAILED'), { code: 'REVENUE_ENGINE_SUPABASE_RPC_FAILED', status: response.status });
  return response.json();
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  if (!authorized(request, env)) return json({ success: false, code: 'REVENUE_ENGINE_AUTH_REQUIRED' }, 401);
  const worker = String(env.REVENUE_ENGINE_WORKER_NAME || 'cloudflare-cron').slice(0, 120);
  try {
    const jobs = await supabaseRpc(env, 'claim_crm_jobs', {
      p_worker: worker,
      p_limit: Math.min(Math.max(Number(env.REVENUE_ENGINE_BATCH_SIZE) || 10, 1), 50),
      p_lease_seconds: 300
    });
    return json({ success: true, status: 'CLAIMED_FOR_SUPERVISED_PROCESSING', worker, jobs: Array.isArray(jobs) ? jobs : [] });
  } catch (error) {
    const code = String(error?.code || 'REVENUE_ENGINE_UNAVAILABLE');
    console.error('[revenue-engine]', code);
    return json({ success: false, code }, Number(error?.status) >= 500 ? 502 : 503);
  }
}
