// Pruebas de contrato del endpoint de Cloudflare Pages: functions/api/lead.js
// No usan red: Airtable y Resend se simulan con fetch falso.

import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/lead.js';

const originalFetch = globalThis.fetch;

function request(payload, ip = '203.0.113.1', method = 'POST') {
  return new Request('https://example.com/api/lead', {
    method,
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: method === 'POST' ? JSON.stringify(payload) : undefined
  });
}

function fakeFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return calls;
}

function teardown() {
  globalThis.fetch = originalFetch;
}

const lead = {
  email: 'persona@empresa.com',
  companyName: 'Empresa Demo',
  contactName: 'Ana Pérez',
  jobTitle: 'Gerente de Operaciones',
  painPoint: 'Registrar pedidos que llegan por correo.',
  consent: true,
  consentText: 'Autorizo que me contacten por este medio.',
  consentAt: '2026-11-06T10:00:00.000Z',
  source: 'web_solicitud',
  assetId: 'operaciones-pedidos',
  language: 'es',
  pageUrl: 'https://example.com/solicitud'
};

test('asesor: responde precios de referencia sin guardar datos', async () => {
  const calls = fakeFetch(() => new Response('{}', { status: 200 }));
  const response = await onRequest({
    request: request({ source: 'advisor_chat', message: '¿cuánto cuesta?', language: 'es' }, '198.51.100.1'),
    env: {}
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.match(data.reply, /US\$600/);
  assert.match(data.reply, /US\$900/);
  assert.doesNotMatch(data.reply, /garantiz|100 ?%|el mejor/i);
  assert.equal(calls.length, 0, 'el asesor no debe llamar a Airtable ni a Resend');
  teardown();
});

test('asesor: responde en inglés cuando se pide', async () => {
  fakeFetch(() => new Response('{}', { status: 200 }));
  const response = await onRequest({
    request: request({ source: 'advisor_chat', message: 'I need invoices automated', language: 'en' }, '198.51.100.2'),
    env: {}
  });
  const data = await response.json();
  assert.equal(data.language, 'en');
  assert.match(data.reply, /invoices/i);
  teardown();
});

test('asesor: no registra un correo escrito en el chat', async () => {
  fakeFetch(() => new Response('{}', { status: 200 }));
  const response = await onRequest({
    request: request({ source: 'advisor_chat', message: 'mi correo es ana@empresa.com', language: 'es' }, '198.51.100.3'),
    env: {}
  });
  const data = await response.json();
  assert.match(data.reply, /consentimiento/i);
  teardown();
});

test('formulario: exige consentimiento explícito', async () => {
  const calls = fakeFetch(() => new Response('{}', { status: 200 }));
  const response = await onRequest({
    request: request({ ...lead, consent: false }, '198.51.100.4'),
    env: {}
  });
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.equal(data.error, 'CONSENT_REQUIRED');
  assert.equal(calls.length, 0);
  teardown();
});

test('formulario: valida el correo', async () => {
  fakeFetch(() => new Response('{}', { status: 200 }));
  const response = await onRequest({
    request: request({ ...lead, email: 'sin-arroba' }, '198.51.100.5'),
    env: {}
  });
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.equal(data.error, 'INVALID_EMAIL');
  teardown();
});

test('formulario: guarda en el esquema del CRM y responde RECORDED', async () => {
  const calls = fakeFetch((url) => {
    if (url.includes('api.airtable.com')) return new Response(JSON.stringify({ id: 'rec1' }), { status: 200 });
    if (url.includes('api.resend.com')) return new Response(JSON.stringify({ id: 'mail1' }), { status: 200 });
    return new Response('{}', { status: 404 });
  });

  const response = await onRequest({
    request: request(lead, '198.51.100.6'),
    env: {
      AIRTABLE_API_KEY: 'pat_test',
      AIRTABLE_BASE_ID: 'app_test',
      AIRTABLE_TABLE_ID: 'tbl_test',
      RESEND_API_KEY: 're_test',
      LEAD_NOTIFICATION_EMAIL: 'owner@example.com'
    }
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.registration.status, 'RECORDED');
  assert.equal(data.registration.contactSyncStatus, 'AIRTABLE_RECORDED');
  assert.equal(data.registration.emailNotified, true);
  assert.match(data.registration.requestId, /^WEB-/);
  assert.deepEqual(data.assignment, { owner: 'RSI-01', queue: 'commercial-review', status: 'pending' });

  const airtableCall = calls.find((c) => c.url.includes('api.airtable.com'));
  assert.ok(airtableCall, 'debe llamar a Airtable');
  assert.match(airtableCall.url, /app_test\/tbl_test$/);
  const fields = JSON.parse(airtableCall.init.body).fields;
  assert.equal(fields['Contact Email'], 'persona@empresa.com');
  assert.equal(fields.Name, 'Ana Pérez');
  assert.equal(fields.Status, 'To do');
  assert.equal(fields.Source, 'Website');
  assert.equal(fields['Consent to Share'], true);
  assert.match(fields.Notes, /WEB-/);
  assert.match(fields.Notes, /operaciones-pedidos/);

  const mailCall = calls.find((c) => c.url.includes('api.resend.com'));
  assert.ok(mailCall, 'debe intentar el aviso por correo');
  const mail = JSON.parse(mailCall.init.body);
  assert.deepEqual(mail.to, ['owner@example.com']);
  assert.equal(mail.reply_to, 'persona@empresa.com');
  teardown();
});

test('formulario: sin almacén configurado responde 503 y no finge éxito', async () => {
  fakeFetch(() => new Response('{}', { status: 200 }));
  const response = await onRequest({
    request: request(lead, '198.51.100.7'),
    env: {}
  });
  const data = await response.json();
  assert.equal(response.status, 503);
  assert.equal(data.success, false);
  assert.equal(data.error, 'STORAGE_NOT_CONFIGURED');
  teardown();
});

test('formulario: Airtable caído usa KV y avisa por correo', async () => {
  let kvWrites = 0;
  fakeFetch((url) => {
    if (url.includes('api.airtable.com')) return new Response('{"error":"AUTH"}', { status: 403 });
    if (url.includes('api.resend.com')) return new Response('{}', { status: 200 });
    return new Response('{}', { status: 404 });
  });
  const response = await onRequest({
    request: request(lead, '198.51.100.8'),
    env: {
      AIRTABLE_API_KEY: 'pat_test',
      AIRTABLE_BASE_ID: 'app_test',
      RESEND_API_KEY: 're_test',
      LEADS: {
        put: async () => {
          kvWrites += 1;
        }
      }
    }
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.registration.contactSyncStatus, 'KV_RECORDED');
  assert.equal(kvWrites, 1);
  teardown();
});

test('recepción guiada: incluye los campos extendidos en la nota', async () => {
  const calls = fakeFetch(() => new Response('{}', { status: 200 }));
  const response = await onRequest({
    request: request(
      {
        source: 'RSI01_WEB',
        consent: true,
        email: 'guia@empresa.com',
        companyName: 'Guía SA',
        painPoint: 'Pedidos por WhatsApp',
        workflow: 'Llegan al chat y se copian a mano',
        impact: 'Dos horas al día',
        tools: 'WhatsApp y Excel',
        decision: 'El gerente aprueba',
        result: 'Menos errores de registro',
        limits: 'No confirmar precios',
        commercialIntent: 'Prueba de US$600'
      },
      '198.51.100.9'
    ),
    env: { AIRTABLE_API_KEY: 'pat_test', AIRTABLE_BASE_ID: 'app_test' }
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.registration.status, 'RECORDED');
  const fields = JSON.parse(calls[0].init.body).fields;
  assert.match(fields.Notes, /workflow: Llegan al chat/);
  assert.match(fields.Notes, /commercialIntent: Prueba de US\$600/);
  teardown();
});

test('método no permitido y preflight', async () => {
  let response = await onRequest({ request: request({}, '198.51.100.10', 'GET'), env: {} });
  assert.equal(response.status, 405);
  response = await onRequest({ request: request({}, '198.51.100.11', 'OPTIONS'), env: {} });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});
