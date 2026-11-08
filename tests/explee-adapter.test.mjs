import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpleeClient, expleeConfig } from '../src/explee_client.mjs';
import { onRequest } from '../functions/api/explee.js';

test('Explee is fail-closed without an API key', () => {
  assert.equal(expleeConfig({}).configured, false);
  assert.throws(() => createExpleeClient({}), /EXPLEE_NOT_CONFIGURED/);
});

test('Explee client uses official API key header and read endpoint', async () => {
  let seen;
  const client = createExpleeClient({ EXPLEE_API_KEY: 'secret', EXPLEE_PROJECT_ID: 'p1' }, async (url, init) => {
    seen = { url: String(url), init };
    return new Response(JSON.stringify({ campaigns: [] }), { status: 200 });
  });
  await client.hotLeads({ project_id: 'p1' });
  assert.match(seen.url, /api\.explee\.com\/public\/api\/v1\/autogtm\/hot-leads/);
  assert.equal(seen.init.headers['X-API-Key'], 'secret');
});

test('public status never exposes Explee credentials', async () => {
  const response = await onRequest({ request: new Request('https://example.com/api/explee?action=status'), env: { EXPLEE_API_KEY: 'secret' } });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.configured, true);
  assert.equal(data.apiKey, undefined);
  assert.equal(data.outreachMutationRoute, 'disabled');
});

test('private Explee reads require an internal token', async () => {
  const response = await onRequest({ request: new Request('https://example.com/api/explee?action=hot-leads'), env: { EXPLEE_API_KEY: 'secret', EXPLEE_INTERNAL_TOKEN: 'internal' } });
  assert.equal(response.status, 401);
});

test('search stays disabled by default and cannot spend credits accidentally', async () => {
  const response = await onRequest({ request: new Request('https://example.com/api/explee?action=search-companies', { method: 'POST', headers: { Authorization: 'Bearer internal', 'Content-Type': 'application/json' }, body: '{}' }), env: { EXPLEE_API_KEY: 'secret', EXPLEE_INTERNAL_TOKEN: 'internal' } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'EXPLEE_SEARCH_DISABLED');
});
