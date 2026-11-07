// Wompi SV checkout exported from the protected Vercel flow.
// Cloudflare Pages version: dedicated KV, signed callbacks, idempotent orders.
// This file never receives card data and never marks a service paid from a redirect.

const W_AUTH = 'https://id.wompi.sv/connect/token';
const W_API = 'https://api.wompi.sv';
const MAX_BODY = 24 * 1024;
const TERMS_VERSION = 'boltech-terms-2026-11-07';
const PRODUCTS = Object.freeze({
  prebuilt: { name: 'Agentes preelaborados', minimumUsd: 600, limit: 500 },
  custom: { name: 'Agente a medida', minimumUsd: 900, limit: 1000 }
});
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Wompi-Hash', 'Cache-Control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 320));

function cfg(env) {
  return { appId: clean(env.WOMPI_APP_ID), apiSecret: clean(env.WOMPI_API_SECRET), env: clean(env.PAYMENT_ENV).toLowerCase(), storage: env.COMMERCE && typeof env.COMMERCE.get === 'function' && typeof env.COMMERCE.put === 'function', base: clean(env.LEO_APP_BASE_URL) || 'https://boltech-group.pages.dev' };
}
function requireConfig(env) {
  const c = cfg(env);
  if (!c.appId || !c.apiSecret) throw Object.assign(new Error('WOMPI_CREDENTIALS_NOT_CONFIGURED'), { status: 503 });
  if (!['production', 'sandbox'].includes(c.env)) throw Object.assign(new Error('PAYMENT_ENV_NOT_CONFIGURED'), { status: 503 });
  if (!c.storage) throw Object.assign(new Error('COMMERCE_STORAGE_NOT_CONFIGURED'), { status: 503 });
  return c;
}
async function parseBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 });
  try { return { raw, data: raw ? JSON.parse(raw) : {} }; } catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
}
async function get(env, key) { return env.COMMERCE.get(key, { type: 'json' }); }
async function put(env, key, value, ttl = 60 * 60 * 24 * 365) { return env.COMMERCE.put(key, JSON.stringify(value), { expirationTtl: ttl }); }
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''); }
async function recordEvent(env, fingerprint, record) { await put(env, 'event:wompi:' + fingerprint, record, 60 * 60 * 24 * 90); }
async function provisionTenant(env, order) {
  const tenantId = 'tenant-' + order.orderId;
  const existing = await get(env, 'tenant:' + tenantId);
  if (existing) return existing;
  const tenant = { tenantId, orderId: order.orderId, status: 'ACTIVE', plan: order.product.id, planName: order.product.name, limits: { monthlyTasks: order.product.limit }, customerEmail: order.customerEmail, integrations: { status: 'PENDING_CUSTOMER_AUTH', connected: [] }, activatedAt: new Date().toISOString() };
  await put(env, 'tenant:' + tenantId, tenant);
  await put(env, 'tenant-by-order:' + order.orderId, { tenantId, status: tenant.status });
  return tenant;
}
async function id(prefix) { return prefix + '-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); }
async function stableId(prefix, value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))); return prefix + '-' + Array.from(new Uint8Array(digest).slice(0, 16), b => b.toString(16).padStart(2, '0')).join(''); }
function product(body) { const p = PRODUCTS[clean(body.productId)]; const amount = Number(body.approvedAmountUsd); if (!p || body.approved !== true || !clean(body.quoteReference, 160) || !Number.isFinite(amount) || amount < p.minimumUsd || amount > 100000 || Math.abs(amount * 100 - Math.round(amount * 100)) > .000001) throw Object.assign(new Error('INVALID_APPROVED_QUOTE'), { status: 400 }); return { id: clean(body.productId), name: p.name, amount, limit: p.limit, quoteReference: clean(body.quoteReference, 160) }; }
async function token(c) { const response = await fetch(W_AUTH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c.appId, client_secret: c.apiSecret, audience: 'wompi_api' }).toString(), signal: AbortSignal.timeout(12000) }); const data = await response.json().catch(() => ({})); if (!response.ok || !data.access_token) throw Object.assign(new Error('WOMPI_AUTH_FAILED'), { status: 502 }); return data.access_token; }
async function wompi(c, path, options = {}) {
  const access = await token(c);
  const response = await fetch(W_API + path, { ...options, headers: { Authorization: 'Bearer ' + access, Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) }, signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error('WOMPI_HTTP_' + response.status), { status: 502 });
  return data;
}
async function hmac(value, secret) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join(''); }
async function equalHmac(value, supplied, secret) { const expected = await hmac(value, secret); const actual = clean(supplied, 200).toLowerCase(); return expected.length === actual.length && expected.split('').every((char, i) => char === actual[i]); }
async function createLink(c, order) {
  const data = await wompi(c, '/EnlacePago', { method: 'POST', body: JSON.stringify({ identificadorEnlaceComercio: order.orderId, monto: order.amount, nombreProducto: order.product.name, configuracion: { urlRedirect: `${c.base}/?payment_return=wompi&orderId=${encodeURIComponent(order.orderId)}`, urlRetorno: c.base, urlWebhook: `${c.base}/api/payments?action=wompi-webhook`, emailsNotificacion: 'ricardo.boltechgroup@gmail.com', esMontoEditable: false, esCantidadEditable: false, cantidadPorDefecto: 1, duracionInterfazIntentoMinutos: 30, notificarTransaccionCliente: true }, limitesDeUso: { cantidadMaximaPagosExitosos: 1, cantidadMaximaPagosFallidos: 5 } }) });
  if (!data.idEnlace || !data.urlEnlace || Boolean(data.estaProductivo) !== (c.env === 'production')) throw Object.assign(new Error('WOMPI_ENVIRONMENT_OR_LINK_INVALID'), { status: 502 });
  return { providerInvoiceId: String(data.idEnlace), checkoutUrl: String(data.urlEnlace), productive: Boolean(data.estaProductivo) };
}
function webhookParts(payload) { return { transactionId: clean(payload?.IdTransaccion || payload?.idTransaccion, 120), orderId: clean(payload?.EnlacePago?.IdentificadorEnlaceComercio || payload?.enlacePago?.identificadorEnlaceComercio, 120), amount: Number(payload?.Monto ?? payload?.monto ?? 0), result: clean(payload?.ResultadoTransaccion || payload?.resultadoTransaccion, 80), productive: Boolean(payload?.EsProductiva ?? payload?.esProductiva ?? payload?.EsReal ?? payload?.esReal) }; }
function transactionParts(payload) { return { id: clean(payload?.idTransaccion || payload?.IdTransaccion || payload?.id, 120), approved: Boolean(payload?.esAprobada ?? payload?.EsAprobada), real: Boolean(payload?.esReal ?? payload?.EsReal ?? payload?.EsProductiva), amount: Number(payload?.monto ?? payload?.Monto ?? 0), result: clean(payload?.resultadoTransaccion || payload?.ResultadoTransaccion, 80) }; }
async function verifyPaid(c, order, parts) {
  if (!parts.transactionId) return { ok: false, code: 'TRANSACTION_ID_REQUIRED' };
  const tx = transactionParts(await wompi(c, '/TransaccionCompra/' + encodeURIComponent(parts.transactionId)));
  const checks = {
    approved: tx.approved === true,
    environment: order.environment === c.env && tx.real === (c.env === 'production') && parts.productive === (c.env === 'production'),
    amountProvider: Math.abs(tx.amount - order.amount) <= .005,
    amountWebhook: Math.abs(parts.amount - order.amount) <= .005,
    transaction: tx.id === parts.transactionId,
    link: String(order.providerInvoiceId || '') === String(parts.linkId || ''),
    result: parts.result === 'APPROVED'
  };
  return { ok: Object.values(checks).every(Boolean), checks, tx };
}

export async function onRequest({ request, env = {} }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url); const action = clean(url.searchParams.get('action'));
  if (request.method === 'GET' && action === 'readiness') { const c = cfg(env); return json({ success: true, provider: 'WOMPI_SV', officialOAuth: true, credentialsConfigured: Boolean(c.appId && c.apiSecret), paymentEnvironment: c.env || null, storageConfigured: c.storage, writeEnabled: Boolean(c.appId && c.apiSecret && c.storage && clean(env.COMMERCE_ADMIN_TOKEN)), termsVersion: TERMS_VERSION }); }
  if (request.method === 'GET' && action === 'status') { if (!cfg(env).storage) return json({ success: false, code: 'COMMERCE_STORAGE_NOT_CONFIGURED' }, 503); const order = await get(env, 'order:' + clean(url.searchParams.get('orderId'), 120)); return order ? json({ success: true, order: { orderId: order.orderId, status: order.status, provider: order.provider, amount: order.amount, paidAt: order.paidAt || null, fulfillmentStatus: order.fulfillmentStatus || 'NOT_READY', tenantId: order.tenantId || null } }) : json({ success: false, code: 'ORDER_NOT_FOUND' }, 404); }
  if (request.method === 'GET' && action === 'wompi-return') { try { const c = requireConfig(env); const orderId = clean(url.searchParams.get('identificadorEnlaceComercio') || url.searchParams.get('orderId'), 120); const transactionId = clean(url.searchParams.get('idTransaccion'), 120); const linkId = clean(url.searchParams.get('idEnlace'), 120); const amount = clean(url.searchParams.get('monto'), 50); const hash = clean(url.searchParams.get('hash'), 200); if (!await equalHmac(orderId + transactionId + linkId + amount, hash, c.apiSecret)) return json({ success: false, code: 'INVALID_REDIRECT_HASH' }, 401); const order = await get(env, 'order:' + orderId); if (!order) return json({ success: false, code: 'ORDER_NOT_FOUND' }, 404); const result = await verifyPaid(c, order, { transactionId, linkId, amount: Number(amount), productive: c.env === 'production', result: 'APPROVED' }); if (!result.ok) return json({ success: false, code: 'PROVIDER_MISMATCH' }, 422); order.status = 'PAID'; order.providerTransactionId = transactionId; order.paidAt = order.paidAt || new Date().toISOString(); const tenant = await provisionTenant(env, order); order.tenantId = tenant.tenantId; order.fulfillmentStatus = 'TENANT_ACTIVE_INTEGRATIONS_PENDING_AUTH'; await put(env, 'order:' + orderId, order); return Response.redirect(c.base + '/?payment=verified&orderId=' + encodeURIComponent(orderId), 302); } catch (error) { return json({ success: false, code: clean(error.code || error.message || 'PAYMENT_RETURN_FAILED') }, Number(error.status) || 400); } }
  if (request.method !== 'POST') return json({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const c = requireConfig(env);
    if (action === 'create-approved') {
      const { data } = await parseBody(request); const auth = clean(request.headers.get('authorization')); if (!env.COMMERCE_ADMIN_TOKEN || auth !== 'Bearer ' + env.COMMERCE_ADMIN_TOKEN) return json({ success: false, code: 'OPERATIONAL_AUTH_REQUIRED' }, 401);
      if (!validEmail(data.customerEmail)) throw Object.assign(new Error('CUSTOMER_EMAIL_REQUIRED'), { status: 400 });
      const offer = product(data); const orderId = await stableId('quote', offer.quoteReference); const existing = await get(env, 'order:' + orderId); if (existing) { if (existing.amount !== offer.amount || existing.customerEmail !== clean(data.customerEmail, 320) || existing.product.id !== offer.id) return json({ success: false, code: 'QUOTE_CONFLICT' }, 409); return json({ success: true, duplicate: true, order: { orderId, checkoutUrl: existing.checkoutUrl, status: existing.status } }); }
      const order = { orderId, status: 'CREATED', provider: 'WOMPI_SV', environment: c.env, product: offer, amount: offer.amount, customerEmail: clean(data.customerEmail, 320), createdAt: new Date().toISOString(), termsVersion: TERMS_VERSION };
      const link = await createLink(c, order); order.status = 'PENDING_PAYMENT'; Object.assign(order, link); await put(env, 'order:' + orderId, order); return json({ success: true, order: { orderId, status: order.status, checkoutUrl: order.checkoutUrl, provider: order.provider, amount: order.amount, currency: 'USD' } }, 201);
    }
    if (action === 'wompi-webhook') {
      const { raw, data } = await parseBody(request);
      const fingerprint = await sha256(raw);
      const signature = request.headers.get('wompi_hash') || request.headers.get('Wompi-Hash') || '';
      if (!await equalHmac(raw, signature, c.apiSecret)) {
        await recordEvent(env, fingerprint, { fingerprint, provider: 'WOMPI_SV', status: 'REJECTED', reason: 'INVALID_SIGNATURE', receivedAt: new Date().toISOString() });
        return json({ success: false, code: 'INVALID_WEBHOOK_SIGNATURE' }, 401);
      }
      const prior = await get(env, 'event:wompi:' + fingerprint);
      if (prior) return json({ success: true, duplicate: true, event: { fingerprint, status: prior.status } });
      await recordEvent(env, fingerprint, { fingerprint, provider: 'WOMPI_SV', status: 'PROCESSING', receivedAt: new Date().toISOString() });
      const parts = webhookParts(data);
      const order = parts.orderId ? await get(env, 'order:' + parts.orderId) : null;
      if (!order) {
        await recordEvent(env, fingerprint, { fingerprint, provider: 'WOMPI_SV', status: 'REJECTED', reason: 'ORDER_NOT_FOUND', receivedAt: new Date().toISOString() });
        return json({ success: false, code: 'ORDER_NOT_FOUND' }, 404);
      }
      if (order.status === 'PAID') {
        const tenant = await provisionTenant(env, order);
        await recordEvent(env, fingerprint, { fingerprint, provider: 'WOMPI_SV', status: 'DONE', orderId: order.orderId, tenantId: tenant.tenantId, receivedAt: new Date().toISOString() });
        return json({ success: true, duplicate: true, tenantId: tenant.tenantId });
      }
      const verified = await verifyPaid(c, order, { ...parts, linkId: data?.EnlacePago?.Id || data?.enlacePago?.id });
      if (!verified.ok) {
        await recordEvent(env, fingerprint, { fingerprint, provider: 'WOMPI_SV', status: 'REJECTED', reason: 'PROVIDER_MISMATCH', orderId: order.orderId, checks: verified.checks, receivedAt: new Date().toISOString() });
        return json({ success: false, code: 'PROVIDER_MISMATCH', checks: verified.checks }, 422);
      }
      order.status = 'PAID';
      order.providerTransactionId = parts.transactionId;
      order.providerEvidence = verified.tx;
      order.paidAt = new Date().toISOString();
      const tenant = await provisionTenant(env, order);
      order.tenantId = tenant.tenantId;
      order.fulfillmentStatus = 'TENANT_ACTIVE_INTEGRATIONS_PENDING_AUTH';
      await put(env, 'order:' + order.orderId, order);
      await recordEvent(env, fingerprint, { fingerprint, provider: 'WOMPI_SV', status: 'DONE', orderId: order.orderId, tenantId: tenant.tenantId, transactionId: parts.transactionId, receivedAt: new Date().toISOString() });
      return json({ success: true, paid: true, orderId: order.orderId, tenantId: tenant.tenantId, fulfillment: order.fulfillmentStatus });
    }
    return json({ success: false, code: 'ACTION_NOT_ALLOWED' }, 403);
  } catch (error) { return json({ success: false, code: clean(error.code || error.message || 'PAYMENT_FAILED') }, Number(error.status) || 400); }
}
