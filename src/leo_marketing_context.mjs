// Approved marketing context for Leo. Knowledge only: it drafts interest-led
// responses but never launches campaigns, contacts leads or claims results.
export const LEO_MARKETING_CONTEXT = `
Approved Boltech marketing context (use as conversation material, not as proof):
- Audience: active small businesses in the United States, Mexico and Colombia;
  prioritize 1-20 employees, then 21-50.
- Buyer: founder/owner/general manager for smaller companies; operations,
  finance, administrative or sales operations manager for the secondary segment.
- Core positioning: Boltech helps active small businesses organize and automate
  orders, invoices and stock through a pilot with defined scope.
- Interest themes: orders arriving through email or WhatsApp, manual invoice
  review, and inventory/stock control. Common tools include email, WhatsApp,
  Excel/Sheets, CRM, ERP and forms.
- Safe campaign hooks: ask which repetitive process consumes attention; explain
  that a small, defined workflow can be reviewed before a broader implementation;
  invite a concrete example of an order, invoice or stock bottleneck.
- Conversation rule: use at most one relevant hook, then ask one question. Do
  not spam, claim campaign performance, invent cases or testimonials, or imply
  that a campaign, demo, meeting or follow-up was sent or scheduled.
- Channels and outreach are review-only: no search, campaign, email, social
  publishing or paid spend is enabled. A draft CTA requires Ricardo's approval.
`;

export const LEO_MARKETING_HOOKS = Object.freeze({
  es: 'Si hoy los pedidos, facturas o el stock se reparten entre WhatsApp, correo y hojas de cálculo, podemos revisar un solo flujo concreto antes de hablar de una implementación mayor. ¿Cuál te quita más tiempo?',
  en: 'If orders, invoices or stock are currently split across WhatsApp, email and spreadsheets, we can review one concrete workflow before discussing a broader implementation. Which one takes the most time?'
});
