# api/lead.js — Captura de leads con Airtable + Correo

Fecha: 2026-11-05 · Reemplaza al archivo actual en `api/lead.js`

Este endpoint:
1. Valida que el consentimiento esté marcado (`consent: true`)
2. Guarda el lead en tu tabla de Airtable
3. Te envía un correo con todos los datos
4. Responde OK al formulario

## Cómo usar
Sustituye el contenido de tu archivo `api/lead.js` por este código.

Luego configura en tu host (Netlify, Vercel, etc.) estas variables de entorno:
- `AIRTABLE_API_KEY` — tu clave de Airtable (empieza por `pat...`)
- `AIRTABLE_BASE_ID` — el ID de tu base (empieza por `app...`)
- `AIRTABLE_TABLE_NAME` — normalmente `Leads`

Si no tienes Airtable configurado, el endpoint sigue funcionando y solo te envía el correo.

---

import { applyStrictBankingHeaders, resolveCorsOrigin, checkRateLimit } from '../lib/fiduciary_core.js';
import { dispatchUniversalEmail } from '../lib/universal_email_engine.js';

export default async function handler(req, res) {
  applyStrictBankingHeaders(res);
  const origin = req.headers.origin;
  const allowed = resolveCorsOrigin(origin, process.env.NODE_ENV !== 'production');
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const rl = checkRateLimit('lead:' + (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ip'), 5, 10 * 60 * 1000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.remainingSeconds));
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta de nuevo en ' + Math.ceil(rl.remainingSeconds / 60) + ' min.' });
  }

  const { email, domain, message, timestamp, consent, consentText, consentAt, source, assetId, language, pageUrl, contactName, jobTitle } = req.body || {};

  // Consentimiento explícito obligatorio
  if (consent !== true) {
    return res.status(400).json({ ok: false, error: 'CONSENT_REQUIRED', message: 'Se requiere consentimiento explícito.' });
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanCompany = String(company || domain || 'tu empresa').trim().substring(0, 120);
  const cleanPainPoint = String(message || '').trim().substring(0, 1000);
  const cleanContactName = String(contactName || '').trim().substring(0, 120);
  const cleanJobTitle = String(jobTitle || '').trim().substring(0, 120);

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Dirección de correo electrónico no válida' });
  }

  const consentRecord = {
    granted: true,
    grantedAt: String(consentAt || new Date().toISOString()).slice(0, 40),
    text: String(consentText || '').slice(0, 300),
    source: String(source || 'web_solicitud').slice(0, 60),
    assetId: String(assetId || 'operaciones-general').slice(0, 60),
    pageUrl: String(pageUrl || '').slice(0, 500),
    language: language === 'en' ? 'en' : 'es',
    contactName: cleanContactName,
    jobTitle: cleanJobTitle
  };

  // 1. Guardar en Airtable (si está configurado)
  let airtableOk = false;
  const airtableUrl = process.env.AIRTABLE_URL;
  const airtableKey = process.env.AIRTABLE_API_KEY;
  const airtableBase = process.env.AIRTABLE_BASE_ID;
  const airtableTable = process.env.AIRTABLE_TABLE_NAME || 'Leads';

  if (airtableUrl && airtableKey && airtableBase) {
    try {
      const fetch = (await import('node-fetch')).default;
      const resp = await fetch(`${airtableBase}/${airtableTable}`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + airtableKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Nombre': cleanContactName || cleanEmail,
            'Correo': cleanEmail,
            'Empresa': cleanCompany,
            'Cargo': cleanJobTitle,
            'Tarea': cleanPainPoint,
            'Activo': consentRecord.assetId,
            'Idioma': consentRecord.language,
            'Fuente': consentRecord.source,
            'Página': consentRecord.pageUrl,
            'Consentimiento': consentRecord.granted,
            'Fecha consentimiento': consentRecord.grantedAt,
            'ID solicitud': 'WEB-' + Date.now()
          }
        })
      });
      if (resp.ok) airtableOk = true;
      else console.error('[AIRTABLE] error ' + resp.status + ' ' + await resp.text());
    } catch (e) {
      console.error('[AIRTABLE] exception:', e?.message || e);
    }
  }

  // 2. Enviar correo al propietario
  const subject = 'Nueva solicitud de evaluación - ' + cleanCompany + ' (' + consentRecord.assetId + ')';
  const text = [
    'Nueva solicitud de evaluación por escrito',
    '',
    'Nombre: ' + cleanContactName,
    'Correo: ' + cleanEmail,
    'Empresa: ' + cleanCompany,
    'Cargo: ' + cleanJobTitle,
    'Tarea: ' + cleanPainPoint,
    'Activo: ' + consentRecord.assetId,
    'Idioma: ' + consentRecord.language,
    'Página: ' + consentRecord.pageUrl,
    'Consentimiento: ' + consentRecord.grantedAt,
    'Airtable: ' + (airtableOk ? 'Guardado' : 'No configurado'),
    'ID: WEB-' + Date.now(),
    '',
    'Responder a: ' + cleanEmail
  ].join('\n');

  const html = '<pre style="font-family:monospace;white-space:pre-wrap">' + text.replace(/</g, '&lt;') + '</pre>';

  try {
    await dispatchUniversalEmail({ to: 'ricardo.boltechgroup@gmail.com', subject, text, html });
  } catch (e) {
    console.error('[EMAIL] dispatch failed:', e?.message || e);
  }

  return res.status(200).json({
    success: true,
    registration: {
      status: 'RECORDED',
      requestId: 'WEB-' + Date.now(),
      contactSyncStatus: airtableOk ? 'AIRTABLE_RECORDED' : 'EMAIL_NOTIFIED'
    }
  });
}
