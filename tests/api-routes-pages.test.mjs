// Regression guard for Cloudflare Pages routing.
// The legacy pages called /api/index?... which Pages resolves to a static asset,
// producing an empty 405. Functions live at /api.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/index.js';

const PUBLIC = new URL('../public/', import.meta.url);

function call(search, { method = 'POST', body = {} } = {}) {
  return onRequest({
    request: new Request('https://boltech-group.pages.dev/api' + search, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body) : undefined
    })
  });
}

test('pages never call /api/index on Cloudflare Pages', () => {
  for (const name of ['sales-agent.html', 'specialist.html']) {
    const html = readFileSync(new URL(name, PUBLIC), 'utf8');
    assert.doesNotMatch(html, /\/api\/index\?/, name);
  }
});

test('Leo sales chat answers on the real route /api?leo_sales=1', async () => {
  const response = await call('?leo_sales=1', { body: { message: 'hola', language: 'es' } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.success, true);
  assert.match(data.reply, /tarea|Hola/i);
});

test('specialist chat answers on /api?specialist_chat=1', async () => {
  const response = await call('?specialist_chat=1', {
    body: { type: 'sales', language: 'en', message: 'hi' }
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.success, true);
  assert.equal(typeof data.reply, 'string');
});

test('a wrong method returns the documented 405 with a body', async () => {
  const response = await call('', { method: 'GET' });
  assert.equal(response.status, 405);
  assert.equal((await response.json()).error, 'METHOD_NOT_ALLOWED');
});

test('Leo speech uses Azure voice and the sales page has no Rodrigo label', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /tts\.speech\.microsoft\.com/);
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };
  try {
    const response = await onRequest({
      request: new Request('https://boltech-group.pages.dev/api?leo_speech=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hola, soy Leo.' })
      }),
      env: { AZURE_SPEECH_KEY: 'key', AZURE_SPEECH_REGION: 'eastus' }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Boltech-Voice-Id'), 'es-SV-RodrigoNeural');
    assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
    const html = readFileSync(new URL('sales-agent.html', PUBLIC), 'utf8');
    assert.doesNotMatch(html, /Rodrigo|rodrigo_speech/);
  } finally { globalThis.fetch = original; }
});
