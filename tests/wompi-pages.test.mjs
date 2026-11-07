import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/payments.js';

function kv() {
  const data = new Map();
  return {
    async get(key, options) { const value = data.get(key); return value && options?.type === 'json' ? JSON.parse(value) : value || null; },
    async put(key, value) { data.set(key, value); }
  };
}
function request(url, { method = 'GET', body, headers = {} } = {}) {
  return onRequest({ request: new Request('https://boltech-group.pages.dev' + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env: { PAYMENT_ENV: 'production', WOMPI_APP_ID: 'app', WOMPI_API_SECRET: 'secret', COMMERCE: kv(), COMMERCE_ADMIN_TOKEN: 'admin' } });
}

test('readiness never exposes Wompi secrets', async () => {
  const response = await request('/api/payments?action=readiness');
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.credentialsConfigured, true);
  assert.doesNotMatch(JSON.stringify(payload), /secret|app/);
});

test('missing storage fails closed', async () => {
  const response = await onRequest({ request: new Request('https://example.com/api/payments?action=create-approved', { method: 'POST', body: '{}' }), env: { PAYMENT_ENV: 'production', WOMPI_APP_ID: 'app', WOMPI_API_SECRET: 'secret', COMMERCE_ADMIN_TOKEN: 'admin' } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'COMMERCE_STORAGE_NOT_CONFIGURED');
});

test('create-approved requires operational authorization', async () => {
  const response = await onRequest({ request: new Request('https://example.com/api/payments?action=create-approved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env: { PAYMENT_ENV: 'production', WOMPI_APP_ID: 'app', WOMPI_API_SECRET: 'secret', COMMERCE: kv(), COMMERCE_ADMIN_TOKEN: 'admin' } });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'OPERATIONAL_AUTH_REQUIRED');
});

test('webhook without valid HMAC cannot mark an order paid', async () => {
  const response = await request('/api/payments?action=wompi-webhook', { method: 'POST', body: { IdTransaccion: 'tx' }, headers: { 'Wompi-Hash': 'bad' } });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'INVALID_WEBHOOK_SIGNATURE');
});

test('unsupported action is rejected', async () => {
  const response = await request('/api/payments?action=send-money', { method: 'POST', body: {} });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'ACTION_NOT_ALLOWED');
});

test('approved quote calls official OAuth and EnlacePago without exposing secrets', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: String(init.body || '') });
    if (String(url).includes('connect/token')) return new Response(JSON.stringify({ access_token: 'opaque', expires_in: 300 }), { status: 200 });
    return new Response(JSON.stringify({ idEnlace: 4479000, urlEnlace: 'https://checkout.wompi.sv/4479000', estaProductivo: true }), { status: 200 });
  };
  try {
    const env = { PAYMENT_ENV: 'production', WOMPI_APP_ID: 'app', WOMPI_API_SECRET: 'secret', COMMERCE_ADMIN_TOKEN: 'admin', COMMERCE: kv() };
    const response = await onRequest({
      request: new Request('https://boltech-group.pages.dev/api/payments?action=create-approved', { method: 'POST', headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ approved: true, productId: 'prebuilt', approvedAmountUsd: 600, quoteReference: 'Q-001', customerEmail: 'buyer@example.com' }) }),
      env
    });
    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.order.provider, 'WOMPI_SV');
    assert.match(payload.order.checkoutUrl, /wompi/);
    assert.match(calls[0].url, /id\.wompi\.sv\/connect\/token/);
    assert.match(calls[1].url, /api\.wompi\.sv\/EnlacePago/);
    assert.doesNotMatch(JSON.stringify(payload), /secret|opaque/);
  } finally {
    globalThis.fetch = original;
  }
});
