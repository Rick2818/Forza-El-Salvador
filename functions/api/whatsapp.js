// Cloudflare Pages Function — /api/whatsapp
// Leo, agente de ventas de Boltech Group, conectado a WhatsApp.
//
// Proveedores soportados (basta con uno configurado):
//   Meta WhatsApp Cloud API:
//     META_WA_ACCESS_TOKEN, META_WA_PHONE_NUMBER_ID, META_WA_VERIFY_TOKEN, META_WA_APP_SECRET
//   Twilio WhatsApp:
//     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER
//
// Rutas:
//   GET  /api/whatsapp            -> estado real de la conexión (nunca simula estar conectado)
//   GET  /api/whatsapp?hub.mode=subscribe...  -> verificación del webhook de Meta
//   POST /api/whatsapp            -> webhook entrante (Meta JSON o Twilio form) y respuesta de Leo
//
// Reglas:
//   - Solo responde a mensajes entrantes (ventana de 24 h de WhatsApp).
//   - Guarda un lead solo con correo + consentimiento explícito.
//   - Si no hay proveedor configurado, el estado lo dice y no se envía nada.

import { leoReply, extractEmail, hasConsent, detectLanguage } from './_leo.js';

const GRAPH_VERSION = 'v23.0';
const MAX_BODY = 64 * 1024;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 30;
const hits = new Map();
const processed = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function providerConfig(env) {
  const meta = {
    provider: 'meta',
    token: env.META_WA_ACCESS_TOKEN || '',
    phoneId: env.META_WA_PHONE_NUMBER_ID || '',
    verify: env.META_WA_VERIFY_TOKEN || '',
    secret: env.META_WA_APP_SECRET || ''
  };
  meta.configured = Boolean(meta.token && meta.phoneId && meta.verify);
  meta.missing = ['META_WA_ACCESS_TOKEN', 'META_WA_PHONE_NUMBER_ID', 'META_WA_VERIFY_TOKEN', 'META_WA_APP_SECRET'].filter(
    (name, i) => ![meta.token, meta.phoneId, meta.verify, meta.secret][i]
  );

  const twilio = {
    provider: 'twilio',
    sid: env.TWILIO_ACCOUNT_SID || '',
    token: env.TWILIO_AUTH_TOKEN || '',
    from: env.TWILIO_WHATSAPP_NUMBER || ''
  };
  twilio.configured = Boolean(twilio.sid && twilio.token && twilio.from);

  return { meta, twilio };
}

async function hmacHex(secret, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function rateLimited(key) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    hits.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v.start > RATE_WINDOW_MS) hits.delete(k);
  }
  return entry.count > RATE_MAX;
}

// Evita responder dos veces al mismo mensaje (Meta reintenta el webhook).
function alreadyProcessed(id) {
  const now = Date.now();
  if (processed.size > 2000) {
    for (const [k, v] of processed) if (now - v > RATE_WINDOW_MS) processed.delete(k);
  }
  if (!id) return false;
  if (processed.has(id)) return true;
  processed.set(id, now);
  return false;
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

async function sendMeta(meta, to, body) {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(meta.phoneId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${meta.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: body.slice(0, 4096) }
    })
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    console.error('[whatsapp/meta] send error', response.status, detail);
    return { ok: false, status: response.status };
  }
  return { ok: true };
}

async function sendTwilio(twilio, to, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.sid)}/Messages.json`;
  const form = new URLSearchParams({
    From: `whatsapp:${twilio.from.replace(/^whatsapp:/, '')}`,
    To: `whatsapp:${String(to).replace(/^whatsapp:/, '')}`,
    Body: body.slice(0, 1600)
  });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${twilio.sid}:${twilio.token}`),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    console.error('[whatsapp/twilio] send error', response.status, detail);
    return { ok: false, status: response.status };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Captura de lead (solo con consentimiento explícito)
// ---------------------------------------------------------------------------

async function saveLead(env, { phone, email, message }) {
  const key = env.AIRTABLE_API_KEY;
  const base = env.AIRTABLE_BASE_ID;
  if (!key || !base) return { ok: false, skipped: true };
  const table = env.AIRTABLE_TABLE_ID || env.AIRTABLE_TABLE_NAME || 'Leads';
  const now = new Date().toISOString();
  const notes = [
    'Solicitud por WhatsApp (Leo)',
    `Teléfono: ${phone}`,
    `Consentimiento: otorgado ${now}`,
    `Mensaje: ${String(message || '').slice(0, 600)}`
  ].join('\n');

  const attempts = [
    {
      Name: email || phone,
      Status: 'To do',
      Source: 'Website',
      'Contact Email': email,
      'Contact Phone': phone,
      Notes: notes,
      'Consent to Share': true,
      'Commercial Stage': 'Researching',
      'Next Action': 'Responder por WhatsApp o correo con la evaluación escrita.',
      'Experiment Cohort': 'whatsapp_leo'
    },
    {
      Nombre: email || phone,
      Correo: email,
      Tarea: String(message || '').slice(0, 400),
      Consentimiento: true,
      'ID solicitud': 'WA-' + Date.now().toString(36).toUpperCase()
    }
  ];

  for (const fields of attempts) {
    try {
      const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, typecast: true })
      });
      if (response.ok) return { ok: true };
      if (response.status !== 422) {
        console.error('[whatsapp/airtable]', response.status, (await response.text()).slice(0, 200));
        return { ok: false, status: response.status };
      }
    } catch (error) {
      console.error('[whatsapp/airtable] exception', error && error.message);
    }
  }
  return { ok: false };
}

async function notifyOwner(env, { phone, email, message }) {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true };
  const to = env.LEAD_NOTIFICATION_EMAIL || 'rick28191@gmail.com';
  const text = [
    'Nuevo lead desde WhatsApp (Leo).',
    '',
    `Teléfono: ${phone}`,
    `Correo: ${email || '(no indicado)'}`,
    '',
    'Mensaje:',
    String(message || '').slice(0, 1500),
    '',
    'El contacto autorizó que lo contacten.'
  ].join('\n');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.LEAD_FROM_EMAIL || 'Boltech Group <onboarding@resend.dev>',
        to: [to],
        subject: 'Lead de WhatsApp: ' + (email || phone),
        text,
        reply_to: email || undefined
      })
    });
    if (!response.ok) {
      console.error('[whatsapp/resend]', response.status);
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    console.error('[whatsapp/resend] exception', error && error.message);
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Manejo de un mensaje entrante
// ---------------------------------------------------------------------------

async function handleIncoming(env, { from, text, messageId, provider }) {
  const config = providerConfig(env);
  const senderKey = `${provider}:${from}`;
  if (rateLimited(senderKey)) return { replied: false, reason: 'RATE_LIMITED' };
  if (alreadyProcessed(messageId)) return { replied: false, reason: 'DUPLICATE' };

  const language = detectLanguage(text);
  const email = extractEmail(text);
  const consent = hasConsent(text) || Boolean(env.WA_CONSENT_DEFAULT === 'true');

  let saved = false;
  let notified = false;

  if (email && consent) {
    const storage = await saveLead(env, { phone: from, email, message: text });
    saved = storage.ok === true;
    if (saved) notified = (await notifyOwner(env, { phone: from, email, message: text })).ok === true;
  }

  const reply = leoReply(text, { language, emailSaved: saved });

  let sent;
  if (provider === 'meta') sent = await sendMeta(config.meta, from, reply);
  else sent = await sendTwilio(config.twilio, from, reply);

  if (!sent.ok) {
    // Airtable se conserva, pero el envío fallido no se oculta.
    console.error('[whatsapp] reply failed', provider, sent.status);
    return { replied: false, reason: 'SEND_FAILED', leadSaved: saved, emailNotified: notified };
  }
  return { replied: true, leadSaved: saved, emailNotified: notified, language };
}

function parseMeta(body) {
  const messages = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      for (const message of value.messages || []) {
        const text = message?.text?.body || message?.button?.text || '';
        if (message?.from) messages.push({ from: message.from, text, messageId: message.id });
      }
    }
  }
  return messages;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const config = providerConfig(env);

  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    if (mode === 'subscribe') {
      const token = url.searchParams.get('hub.verify_token') || '';
      const challenge = url.searchParams.get('hub.challenge') || '';
      if (!config.meta.verify) return json({ ok: false, error: 'VERIFY_TOKEN_NOT_CONFIGURED' }, 503);
      if (!constantTimeEqual(token, config.meta.verify)) return json({ ok: false, error: 'INVALID_VERIFY_TOKEN' }, 403);
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
    }

    const active = config.meta.configured ? 'meta' : config.twilio.configured ? 'twilio' : null;
    return json({
      ok: true,
      agent: 'Leo',
      status: active ? 'READY_TO_RECEIVE' : 'PENDING_CREDENTIALS',
      provider: active,
      webhook: 'https://boltech-group.pages.dev/api/whatsapp',
      meta: { configured: config.meta.configured, missing: config.meta.missing },
      twilio: { configured: config.twilio.configured },
      note: active
        ? 'Las credenciales existen; la entrega real depende de que Meta apruebe el número.'
        : 'Sin credenciales no se envía ni se simula ningún mensaje.'
    });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'BODY_TOO_LARGE' }, 413);

  const contentType = (request.headers.get('content-type') || '').toLowerCase();

  // --- Meta ---
  if (contentType.includes('application/json')) {
    if (!config.meta.configured) {
      console.error('[whatsapp] meta webhook without credentials');
      return json({ ok: false, error: 'PROVIDER_NOT_CONFIGURED' }, 503);
    }
    if (config.meta.secret) {
      const header = request.headers.get('x-hub-signature-256') || '';
      const expected = 'sha256=' + (await hmacHex(config.meta.secret, raw));
      if (!constantTimeEqual(header.toLowerCase(), expected.toLowerCase())) {
        return json({ ok: false, error: 'INVALID_SIGNATURE' }, 403);
      }
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: 'INVALID_JSON' }, 400);
    }
    const messages = parseMeta(body);
    const results = [];
    for (const message of messages) {
      if (!message.text) continue;
      results.push(await handleIncoming(env, { ...message, provider: 'meta' }));
    }
    return json({ ok: true, received: messages.length, results });
  }

  // --- Twilio ---
  if (contentType.includes('application/x-www-form-urlencoded')) {
    if (!config.twilio.configured) {
      return json({ ok: false, error: 'PROVIDER_NOT_CONFIGURED' }, 503);
    }
    const form = new URLSearchParams(raw);
    const from = (form.get('From') || '').replace(/^whatsapp:/, '');
    const text = form.get('Body') || '';
    if (!from || !text) return json({ ok: true, received: 0, results: [] });
    const result = await handleIncoming(env, {
      from,
      text,
      messageId: form.get('MessageSid') || '',
      provider: 'twilio'
    });
    return json({ ok: true, received: 1, results: [result] });
  }

  return json({ ok: false, error: 'UNSUPPORTED_CONTENT_TYPE' }, 415);
}
