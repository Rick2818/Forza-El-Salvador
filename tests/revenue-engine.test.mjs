import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/revenue-engine.js';

const request = (method = 'POST', token = 'secret') => new Request('https://example.test/api/revenue-engine', {
  method,
  headers: token === null ? {} : { authorization: `Bearer ${token}` }
});

test('revenue engine requires POST and its own bearer secret', async () => {
  const env = { REVENUE_ENGINE_CRON_SECRET: 'secret' };
  assert.equal((await onRequest({ request: request('GET'), env })).status, 405);
  assert.equal((await onRequest({ request: request('POST', 'wrong'), env })).status, 401);
  assert.equal((await onRequest({ request: request('POST', null), env })).status, 401);
});

test('revenue engine fails closed when Supabase is not configured', async () => {
  const response = await onRequest({ request: request(), env: { REVENUE_ENGINE_CRON_SECRET: 'secret' } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { success: false, code: 'REVENUE_ENGINE_SUPABASE_NOT_CONFIGURED' });
});

test('revenue engine claims jobs through the allowlisted RPC without external writes', async () => {
  const originalFetch = globalThis.fetch;
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url: String(url), options };
    return new Response(JSON.stringify([{ id: 'job-1', status: 'RUNNING' }]), { status: 200 });
  };
  try {
    const response = await onRequest({
      request: request(),
      env: {
        REVENUE_ENGINE_CRON_SECRET: 'secret',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only',
        REVENUE_ENGINE_WORKER_NAME: 'test-worker',
        REVENUE_ENGINE_BATCH_SIZE: '3'
      }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      status: 'CLAIMED_FOR_SUPERVISED_PROCESSING',
      worker: 'test-worker',
      jobs: [{ id: 'job-1', status: 'RUNNING' }]
    });
    assert.equal(call.url, 'https://project.supabase.co/rest/v1/rpc/claim_crm_jobs');
    assert.deepEqual(JSON.parse(call.options.body), { p_worker: 'test-worker', p_limit: 3, p_lease_seconds: 300 });
    assert.equal(call.options.headers.Authorization, 'Bearer server-only');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
