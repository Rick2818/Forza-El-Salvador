// El asesor del sitio debe separar el costo de la IA del precio del servicio.

import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/lead.js';

const originalFetch = globalThis.fetch;

function ask(message, language = 'es') {
  return onRequest({
    request: new Request('https://example.com/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.50' },
      body: JSON.stringify({ source: 'advisor_chat', message, language })
    }),
    env: {}
  });
}

test('asesor (es): la autonomía se cotiza aparte y requiere IA', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const response = await ask('quiero que el agente trabaje con autonomía, sin aprobación humana');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.match(data.reply, /no está incluido/i);
  assert.match(data.reply, /se cotiza por separado|directamente al proveedor/i);
  assert.match(data.reply, /límites de gasto|registro de acciones/i);
  assert.doesNotMatch(data.reply, /garantiz|100 ?%|el mejor/i);
  globalThis.fetch = originalFetch;
});

test('asesor (en): autonomy is quoted separately', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const response = await ask('can the agent work autonomously without human approval', 'en');
  const data = await response.json();
  assert.equal(data.language, 'en');
  assert.match(data.reply, /not included/i);
  assert.match(data.reply, /quoted separately|directly to the provider/i);
  globalThis.fetch = originalFetch;
});

test('asesor: el precio de referencia aclara que la IA no está incluida', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const response = await ask('cuanto cuesta');
  const data = await response.json();
  assert.match(data.reply, /US\$600/);
  assert.match(data.reply, /no incluye el modelo de IA/i);
  globalThis.fetch = originalFetch;
});
