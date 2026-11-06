// Cloudflare Pages Function — POST /api/lead
// Boltech Group · captura de solicitudes + asesor guiado
//
// Rutas:
//   POST /api/lead  { source: 'advisor_chat', message, history, language }  -> { success, reply }
//   POST /api/lead  { ...datos, consent: true }                             -> { success, registration, assignment }
//
// Almacenamiento (al menos uno debe existir):
//   - Airtable: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME (default "Leads")
//   - KV:       binding LEADS
//   - Correo:   RESEND_API_KEY (notificación a LEAD_NOTIFICATION_EMAIL)
//
// Si no hay ningún almacén configurado el endpoint responde 503 STORAGE_NOT_CONFIGURED
// para no simular un registro que en realidad no ocurrió.

const MAX_BODY_BYTES = 24 * 1024;
const MAX_MESSAGE = 1200;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 12;
const hits = new Map();

const DEFAULT_NOTIFICATION_EMAIL = 'ricardo.boltechgroup@gmail.com';

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    ...extra
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: cors({ 'Content-Type': 'application/json; charset=utf-8' })
  });
}

function clientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  if (hits.size > 5000) {
    for (const [key, value] of hits) {
      if (now - value.start > WINDOW_MS) hits.delete(key);
    }
  }
  return entry.count > MAX_REQUESTS;
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function requestId() {
  return 'WEB-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// ---------------------------------------------------------------------------
// Asesor guiado: respuestas deterministas, sin promesas ni cifras de resultado.
// ---------------------------------------------------------------------------

const REPLIES = {
  es: {
    greeting:
      'Hola. Soy un asistente guiado de Boltech Group (no soy una persona). Puedo orientarte sobre automatizar pedidos, facturas o stock. ¿Qué proceso te quita más tiempo hoy?',
    ops:
      'Trabajamos tres tareas de operación: pedidos que llegan por correo o WhatsApp, facturas y documentos por revisar, y control de stock. Para cada una evaluamos el proceso actual y qué parte conviene automatizar con aprobación humana. ¿Cuál de las tres se parece más a tu caso?',
    pricing:
      'Los precios son de referencia y se confirman por alcance: la prueba de un flujo cuesta US$600 (US$300 al inicio y US$300 tras la entrega verificada) e incluye un flujo y una integración simple. Un agente con alcance general parte de US$900. Ese valor cubre diseño, integración y entrega: no incluye el modelo de IA ni su consumo. Licencias, uso y mantenimiento se cotizan aparte. No hay compra ni pago automático en el sitio.',
    autonomy:
      'La autonomía tiene un costo aparte y hay que decidirla antes de cotizar. Si el agente debe decidir y ejecutar sin aprobación humana, necesita un modelo de IA en operación: ese costo no está incluido en la prueba ni en el alcance base. Se cotiza por separado o lo paga el cliente directamente al proveedor (OpenAI, Google, Anthropic u otro); además exige límites de gasto, registro de acciones y revisión periódica. Si cada acción sensible lleva aprobación humana, no se requiere IA de pago. ¿Tu caso necesita autonomía total o aprobación humana?',
    evaluation:
      'La evaluación es por escrito y no exige demo. Nos cuentas la tarea, revisamos el alcance y respondemos por correo con qué se puede automatizar, qué necesita aprobación humana y qué información falta. Puedes pedirla en /solicitud o dejar tus datos aquí.',
    timeline:
      'El tiempo depende del alcance y de los accesos que existan. Primero entregamos la evaluación por escrito; si el alcance requiere más información, la pedimos por correo y explicamos para qué. No prometemos fechas antes de conocer el proceso.',
    integrations:
      'Nos integramos con las herramientas que ya usas: correo, hojas de cálculo, WhatsApp mediante un proveedor aprobado, formularios y bases de datos. El agente corre en la infraestructura que acordemos contigo, con permisos mínimos. ¿Qué herramientas usas hoy?',
    security:
      'No pedimos contraseñas ni datos privados de tus clientes por este chat. El agente se diseña con permisos mínimos, registro de acciones y aprobación humana en las decisiones sensibles. Puedes leer el aviso de privacidad en /privacidad y cómo retirar el consentimiento en /retiro.',
    data:
      'Usamos tus datos solo para evaluar y responder tu solicitud. Puedes pedir acceso, corrección o eliminación escribiendo a ricardo.boltechgroup@gmail.com. Detalles en /privacidad y /conservacion.',
    human:
      'Puedo tomar tus datos y pasarlos a Ricardo para que te responda por correo con la evaluación por escrito. Usa el botón "Dejar mis datos" o el formulario en /solicitud. También puedes escribir a ricardo.boltechgroup@gmail.com.',
    delivery:
      'La entrega es acompañada: partimos de una plantilla, la personalizamos, la desplegamos contigo y capacitamos a tu equipo. Tú apruebas antes de que algo quede en producción. ¿Quieres que evalúemos tu caso?',
    fallback:
      'Para orientarte bien necesito el proceso concreto: qué tarea quieres automatizar, cómo se hace hoy y qué resultado esperas. Si prefieres, deja tus datos con el botón "Dejar mis datos" o usa /solicitud y te respondemos por escrito.'
  },
  en: {
    greeting:
      'Hi. I am a guided assistant from Boltech Group (not a person). I can help you think through automating orders, invoices or stock. Which process takes the most time today?',
    ops:
      'We work on three operations tasks: orders that arrive by email or WhatsApp, invoices and documents that need review, and stock control. For each one we review the current process and which part is worth automating with human approval. Which one is closest to your case?',
    pricing:
      'Prices are references confirmed by scope: a one-workflow pilot is USD 600 (USD 300 upfront and USD 300 after verified delivery) and includes one workflow and one simple integration. A general-scope agent starts at USD 900. That price covers design, integration and delivery: it does not include the AI model or its usage. Licenses, usage and maintenance are quoted separately. Nothing is purchased or paid automatically on this site.',
    autonomy:
      'Autonomy is a separate cost and must be decided before quoting. If the agent has to decide and act without human approval, it needs an AI model running in production: that cost is not included in the pilot or the base scope. It is quoted separately or paid by the client directly to the provider (OpenAI, Google, Anthropic or another); it also requires spending limits, action logs and periodic review. If every sensitive action keeps human approval, no paid AI is required. Does your case need full autonomy or human approval?',
    evaluation:
      'The assessment is written and does not require a demo. You describe the task, we review scope and reply by email with what can be automated, what needs human approval and what information is missing. Request it at /solicitud or leave your details here.',
    timeline:
      'Timing depends on scope and on the access that already exists. We deliver the written assessment first; if scope needs more information we ask by email and explain why. We do not promise dates before understanding the process.',
    integrations:
      'We integrate with the tools you already use: email, spreadsheets, WhatsApp through an approved provider, forms and databases. The agent runs in the infrastructure we agree on, with least-privilege access. Which tools do you use today?',
    security:
      'We never ask for passwords or your customers private data in this chat. Agents are designed with least privilege, action logs and human approval for sensitive decisions. See /privacidad and /retiro.',
    data:
      'We use your data only to assess and answer your request. You can request access, correction or deletion by writing to ricardo.boltechgroup@gmail.com. Details at /privacidad and /conservacion.',
    human:
      'I can take your details and pass them to Ricardo, who will reply by email with the written assessment. Use the "Leave my details" button or the form at /solicitud. You can also write to ricardo.boltechgroup@gmail.com.',
    delivery:
      'Delivery is accompanied: we start from a template, customise it, deploy it with you and train your team. You approve before anything goes to production. Would you like us to assess your case?',
    fallback:
      'To guide you well I need the concrete process: which task to automate, how it works today and what result you expect. If you prefer, leave your details with the "Leave my details" button or use /solicitud and we will reply in writing.'
  }
};

function advisorReply(message, language) {
  const lang = String(language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  const text = normalize(message);
  const r = REPLIES[lang];

  if (!text) return { lang, reply: r.greeting, intent: 'empty' };
  if (/[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(text) || /\b\d{8,}\b/.test(text)) {
    return {
      lang,
      reply:
        lang === 'en'
          ? 'I do not register contact details from the chat without explicit consent. Use the "Leave my details" button and tick the consent box, or the form at /solicitud.'
          : 'No registro datos de contacto desde el chat sin consentimiento explícito. Usa el botón "Dejar mis datos" y marca la casilla, o el formulario en /solicitud.',
      intent: 'pii'
    };
  }
  if (/(autonom|sin aprobacion|sin supervision|sin intervencion|sin humanos|decida solo|por si mismo|por si solo|autonomous|unattended|without (human )?approval|no human (approval|supervision))/.test(text)) {
    return { lang, reply: r.autonomy, intent: 'autonomy' };
  }
  if (/(precio|costo|cuanto|cobran|tarifa|presupuesto|price|cost|how much|fee|budget)/.test(text)) {
    return { lang, reply: r.pricing, intent: 'pricing' };
  }
  if (/(pedido|factura|stock|inventario|orden|compra|order|invoice|receipt|inventory)/.test(text)) {
    return { lang, reply: r.ops, intent: 'operations' };
  }
  if (/(seguridad|permiso|contrasena|password|privacidad|datos|privacy|data|security|gdpr)/.test(text)) {
    return { lang, reply: /(retir|elimin|borr|delete|remove)/.test(text) ? r.data : r.security, intent: 'security' };
  }
  if (/(integr|whatsapp|correo|email|excel|hoja|api|sistema|erp|crm|herramienta|tool)/.test(text)) {
    return { lang, reply: r.integrations, intent: 'integrations' };
  }
  if (/(entrega|implement|desplieg|capacit|deploy|deliver|training|onboarding)/.test(text)) {
    return { lang, reply: r.delivery, intent: 'delivery' };
  }
  if (/(plazo|tiempo|cuando|demora|deadline|how long|when)/.test(text)) {
    return { lang, reply: r.timeline, intent: 'timeline' };
  }
  if (/(evaluacion|diagnostico|propuesta|assessment|proposal|demo|cotizacion|quote)/.test(text)) {
    return { lang, reply: r.evaluation, intent: 'evaluation' };
  }
  if (/(hola|buenas|hey|hello|hi\b|saludos)/.test(text) && text.length < 40) {
    return { lang, reply: r.greeting, intent: 'greeting' };
  }
  if (/(persona|humano|hablar con|contact|llamar|call|whatsapp)/.test(text)) {
    return { lang, reply: r.human, intent: 'handoff' };
  }
  return { lang, reply: r.fallback, intent: 'fallback' };
}

// ---------------------------------------------------------------------------
// Almacenamiento
// ---------------------------------------------------------------------------

async function saveToAirtable(env, record) {
  const key = env.AIRTABLE_API_KEY;
  const base = env.AIRTABLE_BASE_ID;
  if (!key || !base) return { ok: false, skipped: true };
  const table = env.AIRTABLE_TABLE_ID || env.AIRTABLE_TABLE_NAME || 'Leads';

  const notes = [
    `Solicitud del sitio ${record.requestId}`,
    `Empresa: ${record.companyName || '(no indicada)'}`,
    `Cargo: ${record.jobTitle || '(no indicado)'}`,
    `Tarea: ${record.painPoint || '(sin detalle)'}`,
    `Activo: ${record.assetId}`,
    `Fuente: ${record.source} · Idioma: ${record.language}`,
    `Página: ${record.pageUrl || '(no indicada)'}`,
    `Consentimiento: otorgado ${record.consentAt} · ${record.consentText || 'texto no enviado'}`
  ].join('\n');

  const painCategories = /pedido|factura|stock|operacion|order|invoice|inventory/i.test(record.assetId)
    ? ['Workflow Automation']
    : undefined;

  // Esquema del CRM de Boltech (tabla Leads: Name, Contact Email, Notes…).
  const crmFields = {
    Name: record.contactName || record.email,
    Status: 'To do',
    Source: 'Website',
    'Contact Email': record.email,
    Notes: notes,
    'Consent to Share': true,
    'Commercial Stage': 'Researching',
    'Next Action': 'Revisar la solicitud y responder por escrito con la evaluación.',
    'Experiment Cohort': record.source
  };
  if (painCategories) crmFields['Pain Categories'] = painCategories;

  // Esquema genérico documentado en docs/AIRTABLE-SETUP.md.
  const genericFields = {
    Nombre: record.contactName || record.email,
    Correo: record.email,
    Empresa: record.companyName || '',
    Cargo: record.jobTitle || '',
    Tarea: record.painPoint || '',
    Activo: record.assetId || 'operaciones-general',
    Idioma: record.language,
    Fuente: record.source,
    'Página': record.pageUrl || '',
    Consentimiento: true,
    'Fecha consentimiento': record.consentAt,
    'ID solicitud': record.requestId
  };

  // Mínimo absoluto del CRM, por si la tabla fue recortada.
  const minimalFields = {
    Name: record.contactName || record.email,
    'Contact Email': record.email,
    Notes: notes,
    'Consent to Share': true
  };

  const send = async (payload) =>
    fetch(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: payload, typecast: true })
    });

  const attempts = [
    ['crm', crmFields],
    ['generic', genericFields],
    ['minimal', minimalFields]
  ];

  try {
    let lastStatus = 0;
    for (const [schema, payload] of attempts) {
      const response = await send(payload);
      if (response.ok) return { ok: true, schema };
      lastStatus = response.status;
      const detail = (await response.text()).slice(0, 300);
      if (response.status !== 422) {
        console.error('[airtable] error', response.status, detail);
        return { ok: false, status: response.status, detail };
      }
      console.warn(`[airtable] ${schema} schema rejected (422), trying next:`, detail);
    }
    return { ok: false, status: lastStatus };
  } catch (error) {
    console.error('[airtable] exception', error && error.message);
    return { ok: false, error: String(error && error.message) };
  }
}

async function saveToKv(env, record) {
  if (!env.LEADS || typeof env.LEADS.put !== 'function') return { ok: false, skipped: true };
  try {
    await env.LEADS.put(`lead:${record.requestId}`, JSON.stringify(record), {
      metadata: { email: record.email, source: record.source, at: record.consentAt }
    });
    return { ok: true };
  } catch (error) {
    console.error('[kv] exception', error && error.message);
    return { ok: false, error: String(error && error.message) };
  }
}

async function notifyByEmail(env, record, storage) {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true };
  const to = env.LEAD_NOTIFICATION_EMAIL || DEFAULT_NOTIFICATION_EMAIL;
  const lines = [
    'Nueva solicitud — Boltech Group',
    '',
    `Referencia: ${record.requestId}`,
    `Nombre: ${record.contactName || '(no indicado)'}`,
    `Correo: ${record.email}`,
    `Empresa: ${record.companyName || '(no indicada)'}`,
    `Cargo: ${record.jobTitle || '(no indicado)'}`,
    `Activo: ${record.assetId}`,
    `Fuente: ${record.source}`,
    `Idioma: ${record.language}`,
    `Página: ${record.pageUrl}`,
    '',
    'Tarea / consulta:',
    record.painPoint || '(sin detalle)',
    '',
    `Consentimiento: otorgado ${record.consentAt}`,
    `Texto: ${record.consentText || '(no enviado)'}`,
    `Almacenamiento: ${storage}`,
    '',
    `Responder a: ${record.email}`
  ];
  const text = lines.join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.55"><h2 style="margin:0 0 12px">Nueva solicitud — Boltech Group</h2><pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;background:#f4f4f4;padding:16px;border-radius:8px">${escapeHtml(text)}</pre></div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.LEAD_FROM_EMAIL || 'Boltech Group <onboarding@resend.dev>',
        to: [to],
        reply_to: record.email,
        subject: `Solicitud ${record.requestId} — ${record.companyName || record.email}`,
        text,
        html
      })
    });
    if (response.ok) return { ok: true };
    console.error('[resend] error', response.status, (await response.text()).slice(0, 300));
    return { ok: false, status: response.status };
  } catch (error) {
    console.error('[resend] exception', error && error.message);
    return { ok: false, error: String(error && error.message) };
  }
}

// ---------------------------------------------------------------------------

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return json(
      { ok: false, error: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' },
      429
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413);

  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ ok: false, error: 'INVALID_JSON' }, 400);
  }

  const source = clean(body.source, 60) || 'web_solicitud';
  const language = String(body.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';

  // 1) Asesor: no guarda datos personales, solo responde.
  if (source === 'advisor_chat' || (!body.email && body.message)) {
    const message = clean(body.message, MAX_MESSAGE);
    if (!message) return json({ ok: false, error: 'MESSAGE_REQUIRED' }, 400);
    const answer = advisorReply(message, language);
    return json({ success: true, mode: 'advisor', reply: answer.reply, language: answer.lang });
  }

  // 2) Formulario / recepción guiada: consentimiento explícito obligatorio.
  if (body.consent !== true) {
    return json(
      {
        ok: false,
        success: false,
        error: 'CONSENT_REQUIRED',
        message: 'Se requiere consentimiento explícito para registrar la solicitud.'
      },
      400
    );
  }

  const email = clean(body.email, 160).toLowerCase();
  if (!isEmail(email)) {
    return json({ ok: false, success: false, error: 'INVALID_EMAIL', message: 'Correo electrónico no válido.' }, 400);
  }

  const record = {
    requestId: requestId(),
    email,
    contactName: clean(body.contactName || body.name, 120),
    companyName: clean(body.companyName || body.company || body.domain, 120),
    jobTitle: clean(body.jobTitle, 120),
    painPoint: clean(body.painPoint || body.message || body.outcome, MAX_MESSAGE),
    assetId: clean(body.assetId || body.tarea, 60) || 'operaciones-general',
    source,
    language,
    pageUrl: clean(body.pageUrl, 500),
    consentText: clean(body.consentText, 300),
    consentAt: clean(body.consentAt, 40) || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    extra: {
      workflow: clean(body.workflow, 1000),
      impact: clean(body.impact, 500),
      tools: clean(body.tools, 300),
      decision: clean(body.decision, 500),
      result: clean(body.result, 500),
      limits: clean(body.limits, 500),
      commercialIntent: clean(body.commercialIntent, 300)
    }
  };

  // Resumen de los campos extendidos de la recepción guiada.
  const extras = Object.entries(record.extra)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);
  if (extras.length) record.painPoint = clean(`${record.painPoint}\n\n${extras.join('\n')}`, MAX_MESSAGE);

  const [airtable, kv] = await Promise.all([saveToAirtable(env, record), saveToKv(env, record)]);
  const stored = airtable.ok ? 'airtable' : kv.ok ? 'kv' : null;

  if (!stored) {
    console.error('[lead] no storage configured', record.requestId);
    return json(
      {
        ok: false,
        success: false,
        error: 'STORAGE_NOT_CONFIGURED',
        message:
          'El formulario está en línea pero el almacén de solicitudes aún no está configurado. Escríbenos a ricardo.boltechgroup@gmail.com y registramos tu solicitud a mano.'
      },
      503
    );
  }

  const mail = await notifyByEmail(env, record, stored);
  const contactSyncStatus = stored === 'airtable' ? 'AIRTABLE_RECORDED' : 'KV_RECORDED';

  return json({
    success: true,
    registration: {
      status: 'RECORDED',
      requestId: record.requestId,
      contactSyncStatus,
      emailNotified: mail.ok === true,
      receivedAt: record.receivedAt
    },
    assignment: { owner: 'RSI-01', queue: 'commercial-review', status: 'pending' }
  });
}
