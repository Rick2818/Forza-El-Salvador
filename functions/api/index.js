// Cloudflare Pages Function — POST /api/index
// Compatibilidad con las páginas heredadas /specialist.html y /sales-agent.html.
// Devuelve respuestas guiadas en texto. La voz neuronal (Azure) no está
// configurada en este despliegue: los endpoints de voz responden 503 y la
// página lo informa sin romper el chat.

import { respondAsLeo } from '../../src/leo_sales_runtime.mjs';

const MAX_BODY = 20 * 1024;
const MAX_SPEECH_BODY = 12 * 1024;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  });
}

function xmlEscape(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[character]));
}

async function azureSpeech(text, env) {
  const key = String(env.AZURE_SPEECH_KEY || '').trim();
  const region = String(env.AZURE_SPEECH_REGION || '').trim();
  if (!key || !region) throw Object.assign(new Error('LEO_VOICE_NOT_CONFIGURED'), { statusCode: 503 });
  const ssml = `<speak version="1.0" xml:lang="es-SV"><voice name="es-SV-RodrigoNeural">${xmlEscape(text)}</voice></speak>`;
  const response = await fetch(`https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3',
      'User-Agent': 'Boltech-Leo'
    },
    body: ssml,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Object.assign(new Error('LEO_VOICE_HTTP_' + response.status), { statusCode: 503 });
  return new Response(response.body, { status: 200, headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'X-Boltech-Voice-Id': 'es-SV-RodrigoNeural', 'Cache-Control': 'no-store' } });
}

const SPECIALISTS = {
  chemistry: {
    es: 'Química y farmacia: apoyo para fichas técnicas, control de lotes y trazabilidad documental, con revisión humana antes de cualquier liberación.',
    en: 'Chemistry and pharma: support for technical sheets, batch control and document traceability, with human review before any release.'
  },
  finance: {
    es: 'Finanzas: apoyo para conciliaciones, lectura de facturas y preparación de reportes, con aprobación humana antes de registrar o pagar.',
    en: 'Finance: support for reconciliations, invoice reading and report preparation, with human approval before anything is recorded or paid.'
  },
  logistics: {
    es: 'Logística: apoyo para seguimiento de pedidos, avisos de retraso y control de stock, con revisión humana en las excepciones.',
    en: 'Logistics: support for order tracking, delay alerts and stock control, with human review of exceptions.'
  },
  marketing: {
    es: 'Mercadeo: apoyo para organizar contenidos y responder consultas frecuentes, sin publicar nada sin tu aprobación.',
    en: 'Marketing: support to organise content and answer frequent questions, without publishing anything without your approval.'
  },
  sales: {
    es: 'Ventas: apoyo para calificar solicitudes y preparar propuestas por escrito, sin enviar correos ni cerrar tratos por su cuenta.',
    en: 'Sales: support to qualify requests and prepare written proposals, without sending emails or closing deals on its own.'
  },
  support: {
    es: 'Soporte: apoyo para responder preguntas repetidas y escalar los casos que necesitan una persona.',
    en: 'Support: support to answer repeated questions and escalate cases that need a person.'
  }
};

function reply(type, language, message) {
  const lang = String(language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  const specialist = SPECIALISTS[type] || SPECIALISTS.support;
  if (lang === 'en') {
    return `${specialist.en}\n\nThis assistant is guided and does not commit prices or dates. To receive a written assessment, use the form at /solicitud or write to ricardo.boltechgroup@gmail.com.`;
  }
  return `${specialist.es}\n\nEste asistente es guiado y no compromete precios ni fechas. Para recibir una evaluación por escrito usa el formulario en /solicitud o escribe a ricardo.boltechgroup@gmail.com.`;
}

export async function onRequest(context) {
  const { request, env = {} } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413);

  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ ok: false, error: 'INVALID_JSON' }, 400);
  }

  const url = new URL(request.url);
  const language = String(body.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';

  if (url.searchParams.has('specialist_chat')) {
    return json({ success: true, reply: reply(body.type, language, body.message) });
  }

  if (url.searchParams.has('leo_sales')) {
    try {
      const result = await respondAsLeo(
        { message: body.message, history: body.history, language },
        { env }
      );
      return json({ success: true, ...result });
    } catch (error) {
      const status = Number(error?.statusCode) || 400;
      return json({ success: false, error: String(error?.message || 'LEO_UNAVAILABLE') }, status);
    }
  }

  if (url.searchParams.has('leo_speech') || url.searchParams.has('rodrigo_speech') || url.searchParams.has('maria_speech')) {
    if (raw.length > MAX_SPEECH_BODY) return json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413);
    const text = String(body.text || '').trim().slice(0, 800);
    if (!text) return json({ ok: false, error: 'TEXT_REQUIRED' }, 400);
    try { return await azureSpeech(text, env); } catch (error) { return json({ ok: false, error: String(error?.message || 'LEO_VOICE_UNAVAILABLE') }, Number(error?.statusCode) || 503); }
  }

  return json({ ok: false, error: 'NOT_FOUND' }, 404);
}
