// Deterministic conversion triggers for Leo. These are recommendations only:
// they never send messages, create meetings, quote without approval or close.

const textOf = value => typeof value === 'string' ? value.trim().slice(0, 900) : '';
const allText = (message, history = []) => [
  ...history.filter(item => item && typeof item.text === 'string').map(item => item.text),
  message
].join(' ').toLowerCase();

export function deriveLeoConversion({ message = '', history = [] } = {}) {
  const current = textOf(message).toLowerCase();
  const corpus = allText(message, Array.isArray(history) ? history : []);
  const rejection = /no me interesa|no gracias|ya no|no continuar|dejen de|stop|unsubscribe|not interested|do not contact/i.test(current);
  const asksPrice = /precio|cu[aá]nto cuesta|cotizaci[oó]n|presupuesto|price|cost|quote|budget/i.test(current);
  const asksDemo = /demo|demostraci[oó]n|ver c[oó]mo|show me|see it/i.test(current);
  const asksMeeting = /reuni[oó]n|llamada|hablar|agenda|meeting|call|schedule/i.test(current);
  const asksPilot = /piloto|prueba|probar|pilot|trial|proof of concept/i.test(current);
  const asksContact = /responsable|decisor|encargad[oa]|contacto|correo|email|decision.?maker/i.test(current);
  const hasProblem = /automat|proceso|tarea|problema|cotizacion|factura|pedido|inventario|workflow|process|task|invoice|order|stock/i.test(corpus);
  const hasTimeline = /hoy|esta semana|este mes|urgente|pronto|today|this week|this month|urgent|soon/i.test(corpus);
  const hasTool = /whatsapp|excel|erp|crm|hubspot|salesforce|shopify|api|sistema|herramienta|tool/i.test(corpus);
  const advancing = asksPrice || asksDemo || asksMeeting || asksPilot || asksContact;

  if (rejection) return {
    stage: 'STOPPED', leadTemperature: 'cold', nextTrigger: 'STOP_FOLLOW_UP',
    reason: 'explicit_rejection', missing: [], authorizedActions: []
  };
  if (asksPilot) return {
    stage: 'PILOT_REVIEW', leadTemperature: 'hot', nextTrigger: 'PREPARE_PILOT_DRAFT',
    reason: 'pilot_interest', missing: hasProblem ? [] : ['problem'], authorizedActions: []
  };
  if (advancing) return {
    stage: asksDemo ? 'DEMO_REVIEW' : 'QUALIFICATION', leadTemperature: 'hot',
    nextTrigger: asksDemo ? 'PREPARE_DEMO_DRAFT' : 'QUALIFY_BEFORE_PROPOSAL',
    reason: asksPrice ? 'pricing_request' : asksMeeting ? 'meeting_request' : 'advancing_response',
    missing: [!hasProblem && 'problem', !hasTool && 'tools', !hasTimeline && 'timeline'].filter(Boolean),
    authorizedActions: []
  };
  return {
    stage: 'DISCOVERY', leadTemperature: 'warm', nextTrigger: 'ASK_ONE_QUALIFYING_QUESTION',
    reason: 'discovery', missing: [!hasProblem && 'problem', !hasTool && 'tools'].filter(Boolean), authorizedActions: []
  };
}

export function conversionAddendum() {
  return `\nConversion triggers (recommendations only): identify the problem, tools, volume, desired outcome, decision-maker and timeline. Treat a request for price, demo, meeting, pilot or responsible contact as an advancing/hot lead, but not as a meeting or sale. Ask one missing qualification question, prepare a draft demo or pilot when appropriate, and stop follow-up after an explicit rejection. Never send, schedule, charge, promise or close automatically.`;
}
