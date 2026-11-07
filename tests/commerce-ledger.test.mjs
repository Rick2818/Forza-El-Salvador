import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/payments.js';

function kv() {
  const data = new Map();
  return {
    async get(key, options) { const value = data.get(key); return value && options?.type === 'json' ? JSON.parse(value) : value || null; },
    async put(key, value) { data.set(key, value); },
    data
  };
}

async function signature(raw, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))), b => b.toString(16).padStart(2, '0')).join('');
}

test('verified webhook is recorded once and provisions an active tenant', async () => {
  const store = kv();
  const env = { PAYMENT_ENV: 'production', WOMPI_APP_ID: 'app', WOMPI_API_SECRET: 'secret', COMMERCE_ADMIN_TOKEN: 'admin', COMMERCE: store };
  const order = { orderId: 'quote-ledger-test', status: 'PENDING_PAYMENT', provider: 'WOMPI_SV', environment: 'production', product: { id: 'prebuilt', name: 'Agentes preelaborados', limit: 500 }, amount: 600, customerEmail: 'buyer@example.com', providerInvoiceId: 'link-1' };
  await store.put('order:' + order.orderId, JSON.stringify(order));
  const original = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('connect/token')
    ? new Response(JSON.stringify({ access_token: 'opaque' }), { status: 200 })
    : new Response(JSON.stringify({ idTransaccion: 'tx-1', esAprobada: true, esReal: true, monto: 600, resultadoTransaccion: 'APPROVED' }), { status: 200 });
  const body = { IdTransaccion: 'tx-1', Monto: 600, ResultadoTransaccion: 'APPROVED', EsProductiva: true, EnlacePago: { IdentificadorEnlaceComercio: order.orderId, Id: 'link-1' } };
  const raw = JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json', 'Wompi-Hash': await signature(raw, 'secret') };
  const request = () => onRequest({ request: new Request('https://example.com/api/payments?action=wompi-webhook', { method: 'POST', headers, body: raw }), env });
  try {
    const first = await request();
    const second = await request();
    assert.equal(first.status, 200);
    assert.equal((await first.json()).fulfillment, 'TENANT_ACTIVE_INTEGRATIONS_PENDING_AUTH');
    assert.equal((await second.json()).duplicate, true);
    assert.ok([...store.data.keys()].some(key => key.startsWith('event:wompi:')));
    const tenant = JSON.parse(store.data.get('tenant:tenant-' + order.orderId));
    assert.equal(tenant.status, 'ACTIVE');
    assert.equal(tenant.integrations.status, 'PENDING_CUSTOMER_AUTH');
  } finally { globalThis.fetch = original; }
});
