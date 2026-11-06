// Cloudflare Pages Function — POST /api/index
// Compatibilidad con las páginas heredadas /specialist.html y /sales-agent.html.
// Devuelve respuestas guiadas en texto. La voz neuronal (Azure) no está
// configurada en este despliegue: los endpoints de voz responden 503 y la
// página lo informa sin romper el chat.

const MAX_BODY = 20 * 1024;
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
  const { request } = context;
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
    const text = String(body.message || '').trim();
    const greeting =
      language === 'en'
        ? 'Hi, I am Leo, the guided sales assistant. I can help you describe the process you want to automate. I do not send emails, confirm orders or take payments.'
        : 'Hola, soy Leo, el asesor guiado de ventas. Te ayudo a describir el proceso que quieres automatizar. No envío correos, no confirmo pedidos y no proceso pagos.';
    const next =
      language === 'en'
        ? 'Tell me: which task takes the most time, how it works today and what result you expect. For a written assessment use /solicitud.'
        : 'Cuéntame: qué tarea te quita más tiempo, cómo se hace hoy y qué resultado esperas. Para una evaluación por escrito usa /solicitud.';
    return json({ success: true, reply: text ? next : greeting });
  }

  if (url.searchParams.has('maria_speech') || url.searchParams.has('rodrigo_speech')) {
    return json(
      {
        ok: false,
        error: url.searchParams.has('maria_speech') ? 'MARIA_UNAVAILABLE' : 'RODRIGO_UNAVAILABLE',
        message: 'La voz neuronal no está configurada en este despliegue. El chat de texto sigue disponible.'
      },
      503
    );
  }

  return json({ ok: false, error: 'NOT_FOUND' }, 404);
}
