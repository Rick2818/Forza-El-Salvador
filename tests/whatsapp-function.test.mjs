// Pruebas del webhook de WhatsApp con Leo. Sin red: fetch simulado.

import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/whatsapp.js';

const originalFetch = globalThis.fetch;

function teardown() {
  globalThis.fetch = originalFetch;
}

function fakeFetch() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body });
    return new Response('{}', { status: 200 });
  };
  return calls;
}

const metaEnv = {
  META_WA_ACCESS_TOKEN: 'token',
  META_WA_PHONE_NUMBER_ID: '123',
  META_WA_VERIFY_TOKEN: 'verify-secret',
  META_WA_APP_SECRET: ''
};

function metaMessage(from, text, id) {
  return JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ from, id, type: 'text', text: { body: text } }] } }] }]
  });
}

function post(body, env, headers = { 'content-type': 'application/json' }) {
  return onRequest({
    request: new Request('https://example.com/api/whatsapp', { method: 'POST', headers, body }),
    env
  });
}

test('sin credenciales el estado lo dice y no finge estar conectado', async () => {
  const response = await onRequest({
    request: new Request('https://example.com/api/whatsapp'),
    env: {}
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'PENDING_CREDENTIALS');
  assert.equal(data.provider, null);
  assert.deepEqual(data.meta.missing, [
    'META_WA_ACCESS_TOKEN',
    'META_WA_PHONE_NUMBER_ID',
    'META_WA_VERIFY_TOKEN',
    'META_WA_APP_SECRET'
  ]);
});

test('un mensaje sin credenciales responde 503 y no envía nada', async () => {
  const calls = fakeFetch();
  const response = await post(metaMessage('50370000000', 'hola', 'wamid.x'), {});
  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
  teardown();
});

test('verificación del webhook de Meta exige el token correcto', async () => {
  const ok = await onRequest({
    request: new Request('https://example.com/api/whatsapp?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=abc123'),
    env: metaEnv
  });
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), 'abc123');

  const bad = await onRequest({
    request: new Request('https://example.com/api/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=abc123'),
    env: metaEnv
  });
  assert.equal(bad.status, 403);
});

test('Leo responde precios de referencia por WhatsApp', async () => {
  const calls = fakeFetch();
  const response = await post(metaMessage('50370000001', 'cuanto cuesta', 'wamid.a'), metaEnv);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.results[0].replied, true);

  const sent = JSON.parse(calls.find((c) => c.url.includes('graph.facebook.com')).body);
  assert.equal(sent.messaging_product, 'whatsapp');
  assert.match(sent.text.body, /US\$600/);
  assert.match(sent.text.body, /no incluye el modelo de IA/i);
  assert.doesNotMatch(sent.text.body, /garantiz|100 ?%|el mejor/i);
  teardown();
});

test('Leo explica que la autonomía se cotiza aparte o la paga el cliente', async () => {
  const calls = fakeFetch();
  const response = await post(
    metaMessage('50370000002', 'quiero que el agente trabaje con autonomía, sin aprobación humana', 'wamid.b'),
    metaEnv
  );
  assert.equal(response.status, 200);
  const sent = JSON.parse(calls[0].body);
  assert.match(sent.text.body, /no está incluido/i);
  assert.match(sent.text.body, /se cotiza por separado|directamente al proveedor/i);
  assert.match(sent.text.body, /aprobación humana/i);
  teardown();
});

test('sin consentimiento no guarda el correo que llega por WhatsApp', async () => {
  const calls = fakeFetch();
  const response = await post(metaMessage('50370000003', 'mi correo es ana@empresa.com', 'wamid.c'), metaEnv);
  const data = await response.json();
  assert.equal(data.results[0].leadSaved, false);
  const sent = JSON.parse(calls[0].body);
  assert.match(sent.text.body, /consentimiento/i);
  teardown();
});

test('con consentimiento guarda en Airtable y avisa por correo', async () => {
  const calls = fakeFetch();
  const response = await post(
    metaMessage('50370000004', 'ana@empresa.com acepto que me contacten', 'wamid.d'),
    { ...metaEnv, AIRTABLE_API_KEY: 'k', AIRTABLE_BASE_ID: 'b', AIRTABLE_TABLE_ID: 'tbl', RESEND_API_KEY: 'r' }
  );
  const data = await response.json();
  assert.equal(data.results[0].leadSaved, true);
  assert.ok(calls.some((c) => c.url.includes('api.airtable.com')));
  assert.ok(calls.some((c) => c.url.includes('api.resend.com')));
  teardown();
});

test('un mensaje repetido no se responde dos veces', async () => {
  const calls = fakeFetch();
  const body = metaMessage('50370000005', 'hola', 'wamid.repeat');
  await post(body, metaEnv);
  const second = await post(body, metaEnv);
  const data = await second.json();
  assert.equal(data.results[0].reason, 'DUPLICATE');
  assert.equal(calls.length, 1, 'solo el primer mensaje genera llamada de envío');
  teardown();
});

test('firma inválida de Meta se rechaza', async () => {
  const response = await post(
    metaMessage('50370000006', 'hola', 'wamid.sig'),
    { ...metaEnv, META_WA_APP_SECRET: 'secreto' },
    { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' }
  );
  assert.equal(response.status, 403);
  teardown();
});

test('Twilio sin credenciales responde 503', async () => {
  const response = await post('From=whatsapp:%2B50370000007&Body=hola&MessageSid=SM1', {}, {
    'content-type': 'application/x-www-form-urlencoded'
  });
  assert.equal(response.status, 503);
});

test('Twilio con credenciales responde por la API de Twilio', async () => {
  const calls = fakeFetch();
  const response = await post('From=whatsapp:%2B50370000008&Body=necesito automatizar pedidos&MessageSid=SM2', {
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'tok',
    TWILIO_WHATSAPP_NUMBER: '+15005550006'
  }, { 'content-type': 'application/x-www-form-urlencoded' });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.results[0].replied, true);
  assert.ok(calls[0].url.includes('api.twilio.com'));
  teardown();
});

test('métodos y tipos no soportados', async () => {
  const response = await onRequest({ request: new Request('https://example.com/api/whatsapp', { method: 'DELETE' }), env: {} });
  assert.equal(response.status, 405);
  const wrong = await post('x', metaEnv, { 'content-type': 'text/plain' });
  assert.equal(wrong.status, 415);
});
