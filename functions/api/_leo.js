// Leo — motor de respuestas del agente de ventas para WhatsApp.
// Respuestas deterministas: sin promesas de resultado, sin cifras inventadas.
// El mismo texto se usa en el sitio (asesor flotante) y en WhatsApp.

const PRICE_ES =
  'Los precios son de referencia y se confirman por alcance: la prueba de un flujo cuesta US$600 (US$300 al inicio y US$300 tras la entrega verificada) e incluye un flujo y una integración simple. Un agente con alcance general parte de US$900. Licencias, uso y mantenimiento se cotizan aparte.';
const PRICE_EN =
  'Prices are references confirmed by scope: a one-workflow pilot is USD 600 (USD 300 upfront and USD 300 after verified delivery) and includes one workflow and one simple integration. A general-scope agent starts at USD 900. Licenses, usage and maintenance are quoted separately.';

export const REPLIES = {
  es: {
    greeting:
      'Hola, soy Leo, el asistente de ventas de Boltech Group (no soy una persona). Te ayudo a ver si vale la pena automatizar pedidos, facturas o control de stock. ¿Qué tarea te quita más tiempo hoy?',
    ops:
      'Trabajamos tres tareas: pedidos que llegan por correo o WhatsApp, facturas y documentos por revisar, y control de stock. Revisamos cómo se hace hoy y qué parte conviene automatizar con aprobación humana. ¿Cuál se parece más a tu caso?',
    pricing: PRICE_ES + ' Ese valor cubre diseño, integración y entrega: no incluye el modelo de IA ni su consumo. No hay cobro automático por este medio.',
    autonomy:
      'La autonomía tiene un costo aparte y hay que decidirla antes de cotizar. Si el agente debe decidir y ejecutar sin aprobación humana, necesita un modelo de IA en operación: ese costo no está incluido en la prueba ni en el alcance base. Se cotiza por separado o lo paga el cliente directamente al proveedor (OpenAI, Google, Anthropic u otro); además exige límites de gasto, registro de acciones y revisión periódica. Si cada acción sensible lleva aprobación humana, no se requiere IA de pago. ¿Tu caso necesita autonomía total o aprobación humana?',
    evaluation:
      'La evaluación es por escrito y no exige demo: nos cuentas la tarea, revisamos el alcance y respondemos con qué se puede automatizar, qué necesita aprobación humana y qué información falta. Si quieres, deja tu correo aquí y la enviamos.',
    timeline:
      'El tiempo depende del alcance y de los accesos disponibles. Primero entregamos la evaluación por escrito; no prometemos fechas antes de conocer el proceso.',
    integrations:
      'Nos integramos con las herramientas que ya usas: correo, hojas de cálculo, WhatsApp mediante un proveedor aprobado, formularios y bases de datos. La operación corre en la infraestructura que acordemos, con permisos mínimos. ¿Qué usas hoy?',
    security:
      'No pedimos contraseñas ni datos privados de tus clientes por WhatsApp. El agente se diseña con permisos mínimos, registro de acciones y aprobación humana en las decisiones sensibles.',
    data:
      'Usamos tus datos solo para evaluar y responder tu solicitud. Puedes pedir acceso, corrección o eliminación escribiendo a ricardo.boltechgroup@gmail.com.',
    human:
      'Puedo tomar tus datos y pasarlos a Ricardo para que te responda con la evaluación por escrito. Escribe tu correo y confirma con "acepto que me contacten".',
    delivery:
      'La entrega es acompañada: partimos de una plantilla, la personalizamos, la desplegamos contigo y capacitamos a tu equipo. Tú apruebas antes de que algo quede en producción.',
    thanks:
      'Gracias. Ricardo revisa la información y responde por correo con la evaluación por escrito. Si el alcance necesita más datos, te los pedimos explicando para qué.',
    fallback:
      'Para orientarte bien necesito el proceso concreto: qué tarea quieres automatizar, cómo se hace hoy y qué resultado esperas. Si prefieres, escribe tu correo y "acepto que me contacten".'
  },
  en: {
    greeting:
      'Hi, I am Leo, the sales assistant at Boltech Group (not a person). I help you see whether automating orders, invoices or stock is worth it. Which task takes the most time today?',
    ops:
      'We work on three tasks: orders that arrive by email or WhatsApp, invoices and documents that need review, and stock control. We review how it works today and which part is worth automating with human approval. Which one is closest to your case?',
    pricing: PRICE_EN + ' That price covers design, integration and delivery: it does not include the AI model or its usage. Nothing is charged automatically here.',
    autonomy:
      'Autonomy is a separate cost and must be decided before quoting. If the agent has to decide and act without human approval, it needs an AI model running in production: that cost is not included in the pilot or the base scope. It is quoted separately or paid by the client directly to the provider (OpenAI, Google, Anthropic or another); it also requires spending limits, action logs and periodic review. If every sensitive action keeps human approval, no paid AI is required. Does your case need full autonomy or human approval?',
    evaluation:
      'The assessment is written and does not require a demo: you describe the task, we review scope and reply with what can be automated, what needs human approval and what is missing. Leave your email here and we will send it.',
    timeline:
      'Timing depends on scope and available access. We deliver the written assessment first; we do not promise dates before understanding the process.',
    integrations:
      'We integrate with what you already use: email, spreadsheets, WhatsApp through an approved provider, forms and databases. The operation runs on the infrastructure we agree on, with least privilege. What do you use today?',
    security:
      'We never ask for passwords or your customers’ private data over WhatsApp. The agent is designed with least privilege, action logs and human approval for sensitive decisions.',
    data:
      'We use your data only to assess and answer your request. You can ask for access, correction or deletion at ricardo.boltechgroup@gmail.com.',
    human:
      'I can take your details and pass them to Ricardo so he can send the written assessment. Write your email and confirm with "I agree to be contacted".',
    delivery:
      'Delivery is guided: we start from a template, customize it, deploy it with you and train your team. You approve before anything reaches production.',
    thanks:
      'Thank you. Ricardo reviews the information and replies by email with the written assessment. If scope needs more detail, we will ask and explain why.',
    fallback:
      'To guide you well I need the concrete process: which task you want to automate, how it works today and what result you expect. If you prefer, write your email and "I agree to be contacted".'
  }
};

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
const CONSENT_RE = /(acepto|autorizo|consiento|de acuerdo|pueden contactarme|i agree|i consent|you can contact me)/i;

export function detectLanguage(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(the|and|invoice|order|stock|price|help|need|hello|hi)\b/.test(t) && !/\b(el|la|los|pedido|factura|precio|hola)\b/.test(t)) {
    return 'en';
  }
  return 'es';
}

export function extractEmail(text) {
  const m = String(text || '').match(EMAIL_RE);
  return m ? m[0].toLowerCase() : '';
}

export function hasConsent(text) {
  return CONSENT_RE.test(String(text || ''));
}

export function pickIntent(text) {
  const t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (EMAIL_RE.test(t)) return 'email';
  if (/(autonom|sin aprobacion|sin supervision|sin intervencion|sin humanos|decida solo|por si mismo|por si solo|autonomous|unattended|without (human )?approval|no human (approval|supervision))/.test(t)) return 'autonomy';
  if (/(precio|cuesta|cuanto|tarifa|presupuesto|price|cost|quote|how much)/.test(t)) return 'pricing';
  if (/(pedido|factura|stock|inventario|order|invoice|inventory)/.test(t)) return 'ops';
  if (/(seguridad|datos|privacidad|security|privacy|data)/.test(t)) return 'security';
  if (/(plazo|tiempo|cuando|demora|deadline|how long|timeline)/.test(t)) return 'timeline';
  if (/(integrac|correo|excel|hoja|whatsapp|api|integration|sheet)/.test(t)) return 'integrations';
  if (/(evaluacion|evaluar|diagnostico|assessment|evaluate)/.test(t)) return 'evaluation';
  if (/(entrega|implementa|capacita|delivery|deploy)/.test(t)) return 'delivery';
  if (/(persona|humano|hablar con|human|speak to)/.test(t)) return 'human';
  if (/(hola|buenas|hey|hello|hi|good morning)/.test(t)) return 'greeting';
  return 'fallback';
}

/**
 * Devuelve la respuesta de Leo.
 * @param {string} message mensaje del cliente
 * @param {{emailSaved?: boolean, language?: string}} options
 */
export function leoReply(message, options = {}) {
  const language = options.language || detectLanguage(message);
  const set = REPLIES[language] || REPLIES.es;
  const intent = pickIntent(message);

  if (intent === 'email') {
    if (options.emailSaved) return set.thanks;
    if (hasConsent(message)) return set.thanks;
    return language === 'en'
      ? 'I have your email. To store it and contact you I need your explicit consent: reply "I agree to be contacted". Without it I cannot save your details.'
      : 'Tengo tu correo. Para guardarlo y contactarte necesito tu consentimiento explícito: responde "acepto que me contacten". Sin eso no puedo guardar tus datos.';
  }
  return set[intent] || set.fallback;
}
