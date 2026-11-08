import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkflowError } from './marketing.mjs';
import { seoPages, renderHead, buildSeoKit } from './seo.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = message => { throw new WorkflowError('INVALID_FUNNEL', message); };

// The eight layers, in the order they were observed. The order is the mechanism:
// a buyer walks down them, and each layer answers the previous one's objection.
export const FUNNEL_LAYERS = Object.freeze([
  'entrada',
  'departamento',
  'tarea',
  'prueba',
  'alternativa',
  'conversion',
  'confianza',
  'activacion'
]);

// The eight blocks every task page carries, in the order they were observed.
// A task page missing any of them does not sell: it describes.
export const TASK_BLOCKS = Object.freeze([
  'promise',
  'howItWorks',
  'qualityBar',
  'shapedBy',
  'risk',
  'sharedStack',
  'expansion',
  'cta'
]);

// The landing is a sequence, not a poster. These are the blocks in their observed order.
export const LANDING_BLOCKS = Object.freeze([
  'hero', 'roi', 'enterprise', 'integrations', 'ctaBand',
  'proofBand', 'resources', 'framework', 'catalog', 'specialties', 'closing'
]);

// Page chrome, per language. Content comes from the config; only labels live here.
const UI = Object.freeze({
  es: {
    nav: ['Inicio', 'Especialidades', 'Solicitar', 'Precio', 'Confianza', 'Cómo empezamos'],
    howItWorks: 'Cómo funciona',
    enterprise: 'Hecho para equipos que responden por el resultado',
    expansion: 'Combínalo con más tareas',
    faq: 'Preguntas frecuentes',
    request: 'Solicitar una llamada',
    formNote: 'No se pregunta presupuesto, teléfono, tamaño de empresa ni plazo. Eso se descubre en la llamada.',
    formOffline: 'Formulario sin conectar: en este entorno no envía nada.',
    trustLimits: 'Lo que no hacemos',
    requirements: 'Lo que necesitas tener',
    proof: 'Prueba',
    noProof: 'Sin casos publicados todavía.',
    footer: 'Estado: REVIEW_REQUIRED. Sin publicar. Texto propio; no se copian marcas, diseño ni código de terceros.',
    switchLabel: 'English',
    themeToggle: 'Cambiar tema',
    statusLabel: 'Estado',
    delegable: 'Tareas que este equipo puede delegar hoy.',
    department: 'Departamento',
    security: 'Seguridad y datos',
    access: 'Accesos y controles',
    oversight: 'Supervisión',
    trigger: 'Se activa cuando',
    decide: 'Decide',
    act: 'Actúa',
    scopeLine: 'Solicitar una llamada. El alcance se escribe antes de cualquier importe.',
    steps: 'Pasos',
    docs: 'Documentación',
    fitTitle: 'Cuál encaja con tu equipo',
    diffTitle: 'Dónde somos distintos',
    switchTitle: 'Cambiarse es fácil',
    tableTitle: 'Cómo se comparan',
    tableHeaders: ['Dimensión', 'Servicio acompañado', 'Plataforma'],
    tableRows: [
      ['Quién construye', 'Nosotros', 'Tu equipo'],
      ['Quién mantiene', 'Nosotros', 'Tu equipo'],
      ['Quién responde por el resultado', 'Nosotros', 'Nadie fuera de tu equipo'],
      ['Alcance', 'Escrito antes de empezar', 'Lo defines tú']
    ]
  },
  en: {
    nav: ['Home', 'Specialties', 'Request', 'Pricing', 'Trust', 'How we start'],
    howItWorks: 'How it works',
    enterprise: 'Built for teams that answer for the outcome',
    expansion: 'Combine it with more agents',
    faq: 'Frequently asked questions',
    request: 'Request a call',
    formNote: 'We do not ask for budget, phone, company size or timeline. That is discovered on the call.',
    formOffline: 'Form not connected: nothing is sent in this environment.',
    trustLimits: 'What we do not do',
    requirements: 'What you need to have',
    proof: 'Proof',
    noProof: 'No published cases yet.',
    footer: 'Status: REVIEW_REQUIRED. Unpublished. Own copy; no third-party trademarks, design or code is copied.',
    switchLabel: 'Español',
    themeToggle: 'Switch theme',
    statusLabel: 'Status',
    delegable: 'Tasks this team can delegate today.',
    department: 'Department',
    security: 'Security and data',
    access: 'Access and controls',
    oversight: 'Oversight',
    trigger: 'It starts when',
    decide: 'It decides',
    act: 'It acts',
    scopeLine: 'Request a call. Scope is written before any amount.',
    steps: 'Steps',
    docs: 'Documentation',
    fitTitle: 'Which one fits your team',
    diffTitle: 'Where we differ',
    switchTitle: 'Switching is easy',
    tableTitle: 'How they compare',
    tableHeaders: ['Dimension', 'Accompanied service', 'Platform'],
    tableRows: [
      ['Who builds', 'Us', 'Your team'],
      ['Who maintains', 'Us', 'Your team'],
      ['Who answers for the outcome', 'Us', 'Nobody outside your team'],
      ['Scope', 'Written before work starts', 'You define it']
    ]
  }
});

const ui = language => UI[language] || UI.es;

// Six commercial fields. No budget, no phone, no headcount, no timeline.
// Budget is discovered in the call, not demanded at the door.
export const QUALIFICATION_FIELD_NAMES = Object.freeze([
  'firstname', 'lastname', 'email', 'company', 'jobtitle', 'outcome'
]);

const FORBIDDEN_CLAIMS = [
  /\bgarantizamos\b/i,
  /\b(guaranteed results?|market leader|number 1|#1)\b/i,
  /\b(resultados? garantizados?|lider del mercado|lideres del mercado|el mejor|numero 1|#1)\b/i
];
const AMOUNT = /(?:\bUSD\b|\bEUR\b|\bMXN\b|\$|\u20ac)\s?\d/i;

// Language-aware rules: the pair must pass both.
const isNotFinalOffer = note => /no ofertas finales/i.test(note) || /not final offers/i.test(note);
const UNCOMFORTABLE = /(\bmejor\b|\bbetter\b|\bworth\b)/i;

export async function loadFunnel(language = 'es') {
  const file = language === 'en' ? 'config/funnel.en.json' : 'config/funnel.json';
  return JSON.parse(await readFile(path.join(root, file), 'utf8'));
}

function noForbiddenClaims(value, where) {
  if (typeof value === 'string') {
    for (const pattern of FORBIDDEN_CLAIMS) {
      if (pattern.test(value)) fail(`${where} contains a claim the repository forbids`);
    }
    return;
  }
  if (Array.isArray(value)) { value.forEach((item, i) => noForbiddenClaims(item, `${where}[${i}]`)); return; }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) noForbiddenClaims(item, `${where}.${key}`);
  }
}

export function validateFunnel(config) {
  if (config?.schemaVersion !== 1) fail('Unsupported funnel schemaVersion');
  if (typeof config.brand !== 'string' || !config.brand.trim()) fail('A brand is required');

  const tasks = Array.isArray(config.tasks) ? config.tasks : fail('tasks must be an array');
  const departments = Array.isArray(config.departments) ? config.departments : fail('departments must be an array');

  const ids = new Set();
  for (const task of tasks) {
    if (!task.id || ids.has(task.id)) fail(`Duplicate or missing task id: ${task.id}`);
    ids.add(task.id);
    for (const block of TASK_BLOCKS) {
      if (block === 'expansion' || block === 'risk') continue;
      if (!task[block]) fail(`Task ${task.id} is missing block "${block}"`);
    }
    for (const key of ['security', 'access', 'oversight']) {
      if (!task.risk?.[key]) fail(`Task ${task.id} risk is missing "${key}"`);
    }
    for (const key of ['trigger', 'decision', 'action']) {
      if (!task.howItWorks?.[key]) fail(`Task ${task.id} howItWorks is missing "${key}"`);
    }
    if (!departments.some(department => department.id === task.departmentId)) {
      fail(`Task ${task.id} points to an unknown department`);
    }
    // Boltech's specialties are fixed; every task must declare its real delivery state.
    if (!task.status) fail(`Task ${task.id} must declare its delivery status`);
  }

  // Every department is a door. A door with no task behind it leads nowhere.
  for (const department of departments) {
    if (!Array.isArray(department.taskIds) || department.taskIds.length === 0) {
      fail(`Department ${department.id} has no task`);
    }
    for (const taskId of department.taskIds) {
      if (!ids.has(taskId)) fail(`Department ${department.id} references unknown task ${taskId}`);
    }
  }

  const form = config.form || fail('A form is required');
  const fieldNames = (form.fields || []).map(field => field.name);
  if (fieldNames.length !== QUALIFICATION_FIELD_NAMES.length) {
    fail(`The form must carry exactly ${QUALIFICATION_FIELD_NAMES.length} commercial fields`);
  }
  for (const name of QUALIFICATION_FIELD_NAMES) {
    if (!fieldNames.includes(name)) fail(`The form is missing field "${name}"`);
  }
  // The clone's core rule: what the seller must not ask at the door.
  for (const prohibited of form.prohibitedFields || []) {
    const hit = fieldNames.find(name => name.toLowerCase().includes(prohibited.toLowerCase()));
    if (hit) fail(`The form asks for a prohibited field: ${hit}`);
  }
  if (!(form.fields || []).every(field => field.required === true)) fail('Every commercial field must be required');

  noForbiddenClaims(config, 'funnel');

  const pricing = config.pricing || fail('A pricing block is required');
  const offers = Array.isArray(pricing.offers) ? pricing.offers : fail('Pricing must list the entry offers');
  if (offers.length === 0) fail('Pricing must list at least one entry offer');
  for (const offer of offers) {
    if (!offer.id || !offer.name || !offer.description) fail(`Pricing offer ${offer.id} is incomplete`);
    if (offer.reference !== true) fail(`Offer ${offer.id} publishes an amount without marking it a reference`);
    if (offer.quoteRequired !== true) fail(`Offer ${offer.id} publishes an amount without requiring a quote`);
    // A published amount is allowed only as a reference that still requires a quote.
    if (typeof offer.referencePrice === 'string' && AMOUNT.test(offer.referencePrice)) {
      if (!offer.referencePrice.trim()) fail(`Offer ${offer.id} has an empty reference price`);
    }
  }
  if (!pricing.note || !isNotFinalOffer(pricing.note)) {
    fail('Pricing must state that published amounts are not final offers');
  }
  if (!Array.isArray(pricing.faq) || pricing.faq.length === 0) fail('Pricing needs objection questions');

  const landing = config.landing || fail('A landing block is required');
  if (!Array.isArray(landing.blocks) || landing.blocks.length !== LANDING_BLOCKS.length) {
    fail(`The landing must carry the ${LANDING_BLOCKS.length} observed blocks`);
  }
  landing.blocks.forEach((block, index) => {
    if (block !== LANDING_BLOCKS[index]) fail(`Landing block ${index} must be "${LANDING_BLOCKS[index]}"`);
  });
  if (!landing.hero?.headline || !landing.hero?.subline || !landing.hero?.primaryCta) fail('Landing hero is incomplete');
  for (const key of ['framework', 'catalog', 'specialties', 'closing']) {
    if (!landing[key]?.headline) fail(`Landing block "${key}" needs a headline`);
  }
  if (!Array.isArray(landing.framework.steps) || landing.framework.steps.length === 0) fail('The framework needs steps');
  if (!Array.isArray(landing.resources?.items) || landing.resources.items.length === 0) fail('The resources block needs items');
  // Proof that does not exist cannot be faked: it must be declared empty.
  if (config.proof?.cases?.length === 0 && landing.proofBand?.status !== 'PENDING_OWNER_DECISION') {
    fail('An empty proof band must declare its state');
  }

  // Layer 7 answers the risk before it is asked, and admits what it does not do.
  const trust = config.trust || fail('A trust block is required');
  const trustIds = (trust.sections || []).map(section => section.id);
  for (const id of ['security', 'access', 'oversight']) {
    if (!trustIds.includes(id)) fail(`Trust block is missing "${id}"`);
    const section = trust.sections.find(item => item.id === id);
    if (!Array.isArray(section.points) || section.points.length === 0) fail(`Trust "${id}" has no points`);
  }
  if (!Array.isArray(trust.limits) || trust.limits.length === 0) fail('Trust block must admit its limits');

  // Layer 8: the machine keeps existing after the signature.
  const activation = config.activation || fail('An activation block is required');
  if (!Array.isArray(activation.steps) || activation.steps.length === 0) fail('Activation needs steps');
  if (!Array.isArray(activation.requirements) || activation.requirements.length === 0) fail('Activation needs requirements');


  for (const comparison of config.comparisons || []) {
    if (!comparison.fitFor) fail(`Comparison ${comparison.id} must concede that the answer depends`);
    const questions = (comparison.faq || []).map(item => item.q.toLowerCase()).join(' ');
    if (!UNCOMFORTABLE.test(questions)) fail(`Comparison ${comparison.id} must answer the uncomfortable question`);
  }

  return config;
}

export function tasksForDepartment(config, departmentId) {
  const department = config.departments.find(item => item.id === departmentId);
  if (!department) fail(`Unknown department: ${departmentId}`);
  return department.taskIds.map(id => config.tasks.find(task => task.id === id));
}

// Each task page sells the other seven. One product is the door; the catalog is the revenue.
export function expansionFor(config, taskId) {
  return config.tasks.filter(task => task.id !== taskId);
}

function taskPage(task, config) {
  const t = ui(config.language);
  const siblings = expansionFor(config, task.id);
  const department = config.departments.find(item => item.id === task.departmentId);
  return [
    `# ${task.name}`,
    '',
    `_${t.statusLabel}: ${task.status}_`,
    '',
    `**${task.promise}**`,
    '',
    `${t.department}: ${department.name}`,
    '',
    `## ${t.howItWorks}`,
    '',
    `- ${t.trigger}: ${task.howItWorks.trigger}`,
    `- ${t.decide}: ${task.howItWorks.decision}`,
    `- ${t.act}: ${task.howItWorks.action}`,
    '',
    `## ${task.qualityBar}`,
    '',
    task.shapedBy,
    '',
    `## ${t.enterprise}`,
    '',
    `- ${t.security}: ${task.risk.security}`,
    `- ${t.access}: ${task.risk.access}`,
    `- ${t.oversight}: ${task.risk.oversight}`,
    '',
    `## ${t.expansion}`,
    '',
    siblings.map(item => `- ${item.name}: ${item.promise}`).join('\n'),
    '',
    `## ${task.sharedStack}`,
    '',
    `## ${task.cta.label}`,
    '',
    t.scopeLine,
    ''
  ].join('\n');
}

function departmentPage(department, config) {
  const t = ui(config.language);
  const tasks = tasksForDepartment(config, department.id);
  return [
    `# ${department.name}`,
    '',
    t.delegable,
    '',
    tasks.map(task => `## ${task.name}\n\n${task.promise}\n\n${t.request}.\n`).join('\n'),
    ''
  ].join('\n');
}

function comparisonPage(comparison, config) {
  const t = ui(config.language);
  return [
    `# ${comparison.title}`,
    '',
    `## ${t.fitTitle}`,
    '',
    comparison.fitFor,
    '',
    `## ${t.diffTitle}`,
    '',
    comparison.differences.map(item => `- ${item}`).join('\n'),
    '',
    `## ${t.tableTitle}`,
    '',
    `| ${t.tableHeaders.join(' | ')} |`,
    '|---|---|---|',
    t.tableRows.map(row => `| ${row.join(' | ')} |`).join('\n'),
    '',
    `## ${t.switchTitle}`,
    '',
    comparison.switching.map(item => `- ${item}`).join('\n'),
    '',
    `## ${comparison.title}: ${t.faq}`,
    '',
    comparison.faq.map(item => `### ${item.q}\n\n${item.a}\n`).join('\n'),
    '',
    `## ${comparison.cta}`,
    ''
  ].join('\n');
}

function pricingPage(config) {
  const t = ui(config.language);
  const { pricing } = config;
  return [
    `# ${pricing.headline}`,
    '',
    `_${pricing.note}_`,
    '',
    pricing.offers.map(offer => [
      `## ${offer.name}`,
      '',
      offer.description,
      '',
      `**${offer.referencePrice}**`,
      '',
      `- ${offer.cta}`,
      ''
    ].join('\n')).join('\n'),
    `**${pricing.cta}**`,
    '',
    `## ${t.faq}`,
    '',
    pricing.faq.map(item => `### ${item.q}\n\n${item.a}\n`).join('\n'),
    ''
  ].join('\n');
}

function conversionPage(config) {
  const t = ui(config.language);
  const { form, proof } = config;
  const proofLines = proof.cases.length
    ? proof.cases.map(item => `- ${item.name}: ${item.figure} (${item.source})`).join('\n')
    : `- ${t.noProof}`;
  return [
    `# ${form.intro}`,
    '',
    `## ${t.request}`,
    '',
    form.fields.map((field, index) => `${index + 1}. ${field.label}${field.required ? ' *' : ''} (${field.type})`).join('\n'),
    '',
    `> ${t.formNote}`,
    '',
    `**${form.submitLabel}**`,
    '',
    `## ${t.proof}`,
    '',
    proofLines,
    '',
    `_${proof.policy}_`,
    ''
  ].join('\n');
}

function landingPage(config) {
  const t = ui(config.language);
  const { landing, departments, proof } = config;
  const proofLine = proof.cases.length
    ? proof.cases.map(item => `- ${item.name}: ${item.figure} (${item.source})`).join('\n')
    : `- ${t.noProof}`;
  const blocks = {
    hero: () => [`# ${landing.hero.headline}`, '', landing.hero.subline, '', `**${landing.hero.primaryCta}**  |  ${landing.hero.secondaryCta}`, ''],
    roi: () => [`## ${landing.roi.headline}`, '', landing.roi.body, ''],
    enterprise: () => [`## ${landing.enterprise.headline}`, '', landing.enterprise.pillars.map(item => `- ${item}`).join('\n'), ''],
    integrations: () => [`## ${landing.integrations.headline}`, '', landing.integrations.body, ''],
    ctaBand: () => [`## ${landing.ctaBand.headline}`, '', landing.ctaBand.body, '', `**${landing.ctaBand.cta}**`, ''],
    proofBand: () => [`## ${landing.proofBand.headline}`, '', proofLine, '', `_${landing.proofBand.note}_`, ''],
    resources: () => [`## ${landing.resources.headline}`, '', landing.resources.items.map(item => `### ${item.title}\n\n${item.body}`).join('\n\n'), ''],
    framework: () => [`## ${landing.framework.headline}`, '', landing.framework.steps.map((step, index) => `${index + 1}. ${step.title}: ${step.body}`).join('\n'), ''],
    catalog: () => [`## ${landing.catalog.headline}`, '', landing.catalog.body, '', config.tasks.map(task => `- ${task.name}: ${task.promise}`).join('\n'), ''],
    specialties: () => [`## ${landing.specialties.headline}`, '', landing.specialties.body, '', departments.map(department => `- ${department.name}`).join('\n'), ''],
    closing: () => [`## ${landing.closing.headline}`, '', landing.closing.body, '', `**${landing.closing.cta}**`, '']
  };
  return landing.blocks.map(block => blocks[block]().join('\n')).join('\n');
}

function trustPage(config) {
  const t = ui(config.language);
  const { trust } = config;
  return [
    `# ${trust.headline}`,
    '',
    trust.sections.map(section => [
      `## ${section.title}`,
      '',
      section.points.map(point => `- ${point}`).join('\n'),
      ''
    ].join('\n')).join('\n'),
    `## ${t.trustLimits}`,
    '',
    trust.limits.map(limit => `- ${limit}`).join('\n'),
    ''
  ].join('\n');
}

function activationPage(config) {
  const t = ui(config.language);
  const { activation } = config;
  return [
    `# ${activation.headline}`,
    '',
    `## ${t.steps}`,
    '',
    activation.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
    '',
    `## ${t.requirements}`,
    '',
    activation.requirements.map(item => `- ${item}`).join('\n'),
    '',
    `## ${t.docs}`,
    '',
    activation.docs.map(item => `### ${item.title}\n\n${item.body}\n`).join('\n'),
    ''
  ].join('\n');
}

function subPageBody(page, config) {
  const t = ui(config.language);
  const base = langPath(config);
  if (page.template === 'use-case') {
    const department = config.departments.find(item => item.id === page.departmentId);
    return `<p class="lead">${escapeHtml(department.name)} · ${escapeHtml(config.brand)}</p>
<ul class="doors">${page.taskIds.map(id => {
      const task = config.tasks.find(item => item.id === id);
      return `<li><a href="${base}/agentes/${escapeHtml(task.id)}/">${escapeHtml(task.name)}<span class="muted"> ${escapeHtml(task.promise)}</span></a></li>`;
    }).join('')}</ul>
<p><a class="cta" href="${base}/#conversion">${escapeHtml(config.form.submitLabel)}</a></p>`;
  }
  if (page.template === 'agent') {
    const task = config.tasks.find(item => item.id === page.taskId);
    return taskArticle(task, config, id => `${base}/agentes/${id}/`);
  }
  if (page.template === 'comparison') {
    const item = config.comparisons.find(entry => entry.id === page.comparisonId);
    return comparisonArticle(item, config);
  }
  if (page.template === 'pricing') {
    const { pricing } = config;
    return `<p class="muted">${escapeHtml(pricing.note)}</p>
${pricing.offers.map(offer => `<div class="offer"><h3>${escapeHtml(offer.name)}</h3><p>${escapeHtml(offer.description)}</p><p class="price">${escapeHtml(offer.referencePrice)}</p><p><a class="cta" href="${base}/#conversion">${escapeHtml(offer.cta)}</a></p></div>`).join('')}
<h2>${escapeHtml(t.faq)}</h2>
${pricing.faq.map(entry => `<details><summary>${escapeHtml(entry.q)}</summary><p>${escapeHtml(entry.a)}</p></details>`).join('')}`;
  }
  if (page.template === 'trust') {
    const { trust } = config;
    return `<p class="lead">${escapeHtml(trust.headline)}</p>
${trust.sections.map(section => `<h2>${escapeHtml(section.title)}</h2><ul>${section.points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`).join('')}
<h2>${escapeHtml(t.trustLimits)}</h2>
<ul>${trust.limits.map(limit => `<li>${escapeHtml(limit)}</li>`).join('')}</ul>`;
  }
  const { activation } = config;
  return `<p class="lead">${escapeHtml(activation.headline)}</p>
<ol class="steps">${activation.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
<h2>${escapeHtml(t.requirements)}</h2>
<ul>${activation.requirements.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
${activation.docs.map(item => `<h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.body)}</p>`).join('')}`;
}

// Every page in the sitemap is a real document with its own head, one H1, a
// breadcrumb back to the hub, and a link to the form. That is the whole SEO bet.
export function renderSubPageHtml(page, config) {
  const c = validateFunnel(config);
  const t = ui(c.language);
  const base = langPath(c);
  const home = `${base}/`;
  const other = c.language === 'en' ? page.route.replace(/^\/en/, '') || '/' : `/en${page.route === '/' ? '/' : page.route}`;
  return `<!doctype html>
<html lang="${escapeHtml(c.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${THEME_INIT_SCRIPT}
${renderHead(page, c)}
<style>${SITE_CSS}</style>
</head>
<body>
<div id="scroll-progress" aria-hidden="true"></div>
<header>
  <strong><a href="${escapeHtml(home)}">${escapeHtml(c.brand)}</a></strong>
  <div class="header-actions">
    <nav>
      <a href="${escapeHtml(home)}">${escapeHtml(t.nav[0])}</a>
      <a href="${escapeHtml(home)}#catalogo">${escapeHtml(t.nav[1])}</a>
      <a href="${escapeHtml(home)}#conversion">${escapeHtml(t.nav[2])}</a>
      <a href="${escapeHtml(base)}/precios/">${escapeHtml(t.nav[3])}</a>
      <a href="${escapeHtml(base)}/confianza/">${escapeHtml(t.nav[4])}</a>
      <a href="${escapeHtml(other)}" hreflang="${c.language === 'en' ? 'es' : 'en'}">${escapeHtml(t.switchLabel)}</a>
    </nav>
    ${themeToggleHtml(c)}
  </div>
</header>
<main>
  <p class="crumbs"><a href="${escapeHtml(home)}">${escapeHtml(t.nav[0])}</a> › ${escapeHtml(page.h1)}</p>
  <section>
    <h1>${escapeHtml(page.h1)}</h1>
    ${subPageBody(page, c)}
  </section>
</main>
<footer>${escapeHtml(t.footer)}</footer>
${THEME_PROGRESS_SCRIPT}
</body>
</html>
`;
}

export function renderFunnel(config) {
  const normalized = validateFunnel(config);
  return {
    '00-entrada.md': landingPage(normalized),
    ...Object.fromEntries(normalized.departments.map(department => [`10-departamento-${department.id}.md`, departmentPage(department, normalized)])),
    ...Object.fromEntries(normalized.tasks.map(task => [`20-tarea-${task.id}.md`, taskPage(task, normalized)])),
    ...Object.fromEntries(normalized.comparisons.map(item => [`40-alternativa-${item.id}.md`, comparisonPage(item, normalized)])),
    '50-conversion.md': conversionPage(normalized),
    '60-precio.md': pricingPage(normalized),
    '70-confianza.md': trustPage(normalized),
    '80-activacion.md': activationPage(normalized),
    'index.html': renderFunnelHtml(normalized),
    ...Object.fromEntries(seoPages(normalized)
      .filter(page => page.template !== 'home')
      .map(page => [`${page.route.replace(/^\//, '')}index.html`, renderSubPageHtml(page, normalized)]))
  };
}

// Crawler files: sitemap, robots and llms.txt, generated from the same pages.
export function renderSeoFiles(es, en, options) {
  const kit = buildSeoKit(es, en, options);
  return {
    'sitemap.xml': kit['sitemap.xml'],
    'robots.txt': kit['robots.txt'],
    'llms.txt': kit['llms.txt'],
    'en/llms.txt': kit['en/llms.txt']
  };
}

// Bilingual: the two languages are the same machine. If a block, a door, a task,
// a field or a price drifts, the pair is not renderable.
export function validateFunnelPair(es, en) {
  validateFunnel(es);
  validateFunnel(en);
  if (es.language === en.language) fail('The pair must carry two different languages');

  const same = (label, a, b) => {
    const left = JSON.stringify(a);
    const right = JSON.stringify(b);
    if (left !== right) fail(`The two languages disagree on ${label}: ${left} vs ${right}`);
  };

  same('landing blocks', es.landing.blocks, en.landing.blocks);
  same('departments', es.departments.map(d => [d.id, d.taskIds]), en.departments.map(d => [d.id, d.taskIds]));
  same('tasks', es.tasks.map(t => [t.id, t.departmentId]), en.tasks.map(t => [t.id, t.departmentId]));
  same('comparisons', es.comparisons.map(c => c.id), en.comparisons.map(c => c.id));
  same('form fields', es.form.fields.map(f => [f.name, f.type, f.required]), en.form.fields.map(f => [f.name, f.type, f.required]));
  same('legal fields', (es.form.legalFields || []).map(f => f.name), (en.form.legalFields || []).map(f => f.name));
  // Prices are written in each language, so the invariant is the numbers, not the words.
  const amounts = offer => [offer.id, ...(String(offer.referencePrice).match(/\d[\d.,]*/g) || [])];
  same('offer amounts', es.pricing.offers.map(amounts), en.pricing.offers.map(amounts));
  same('trust sections', es.trust.sections.map(s => s.id), en.trust.sections.map(s => s.id));
  same('proof state', [es.proof.status, es.proof.cases.length], [en.proof.status, en.proof.cases.length]);

  return { es, en };
}

export function renderFunnelPair(es, en) {
  const pair = validateFunnelPair(es, en);
  const spanish = renderFunnel(pair.es);
  const english = renderFunnel(pair.en);
  const seo = renderSeoFiles(pair.es, pair.en);
  return {
    ...spanish,
    ...Object.fromEntries(Object.entries(english).map(([name, body]) => [name.startsWith('en/') ? name : `en/${name}`, body])),
    ...seo
  };
}

const escapeHtml = value => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function landingHtml(config) {
  const { landing, departments, tasks, proof } = config;
  const proofLine = proof.cases.length
    ? `<ul>${proof.cases.map(item => `<li><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.figure)} <span class="muted">(${escapeHtml(item.source)})</span></li>`).join('')}</ul>`
    : `<p class="muted">${escapeHtml(ui(config.language).noProof)}</p>`;
  const blocks = {
    hero: () => `<section id="entrada" data-layer="entrada"><p class="eyebrow">${escapeHtml(landing.hero.eyebrow)}</p><h1>${escapeHtml(landing.hero.headline)}</h1><p class="lead">${escapeHtml(landing.hero.subline)}</p><div class="actions"><a class="cta" href="#conversion">${escapeHtml(landing.hero.primaryCta)}</a><a href="#catalogo">${escapeHtml(landing.hero.secondaryCta)}</a></div></section>`,
    roi: () => `<section><h2>${escapeHtml(landing.roi.headline)}</h2><p class="lead">${escapeHtml(landing.roi.body)}</p></section>`,
    enterprise: () => `<section><h2>${escapeHtml(landing.enterprise.headline)}</h2><div class="pillars">${landing.enterprise.pillars.map(title => `<div class="pillar"><h4>${escapeHtml(title)}</h4><ul>${(config.trust.sections.find(section => section.title === title)?.points || []).map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul></div>`).join('')}</div></section>`,
    integrations: () => `<section><h2>${escapeHtml(landing.integrations.headline)}</h2><p class="lead">${escapeHtml(landing.integrations.body)}</p></section>`,
    ctaBand: () => `<section class="band"><h2>${escapeHtml(landing.ctaBand.headline)}</h2><p>${escapeHtml(landing.ctaBand.body)}</p><p><a class="cta" href="#conversion">${escapeHtml(landing.ctaBand.cta)}</a></p></section>`,
    proofBand: () => `<section id="prueba" data-layer="prueba"><h2>${escapeHtml(landing.proofBand.headline)}</h2>${proofLine}<p class="muted">${escapeHtml(landing.proofBand.note)}</p></section>`,
    resources: () => `<section><h2>${escapeHtml(landing.resources.headline)}</h2><div class="pillars">${landing.resources.items.map(item => `<div class="pillar"><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.body)}</p></div>`).join('')}</div></section>`,
    framework: () => `<section><h2>${escapeHtml(landing.framework.headline)}</h2><ol class="steps">${landing.framework.steps.map(step => `<li><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.body)}</span></li>`).join('')}</ol></section>`,
    catalog: () => `<section id="catalogo"><h2>${escapeHtml(landing.catalog.headline)}</h2><p class="lead">${escapeHtml(landing.catalog.body)}</p><ul class="doors">${tasks.map(task => `<li><a href="#task-${escapeHtml(task.id)}">${escapeHtml(task.name)}</a></li>`).join('')}</ul></section>`,
    specialties: () => `<section data-layer="departamento"><h2>${escapeHtml(landing.specialties.headline)}</h2><p class="lead">${escapeHtml(landing.specialties.body)}</p><ul class="doors">${departments.map(department => `<li><a href="#task-${escapeHtml(department.taskIds[0])}">${escapeHtml(department.name)}</a></li>`).join('')}</ul></section>`,
    closing: () => `<section class="band"><h2>${escapeHtml(landing.closing.headline)}</h2><p>${escapeHtml(landing.closing.body)}</p><p><a class="cta" href="#conversion">${escapeHtml(landing.closing.cta)}</a></p></section>`
  };
  return landing.blocks.map(block => blocks[block]()).join('\n');
}

// Graphite Signal — the owner-requested visual identity. Dark-first, warm amber
// accent on deep paper, mono type for system labels, blueprint grid atmosphere,
// kinetic page load with a hard reduced-motion escape hatch. No fonts, SVGs or
// scripts are fetched from the network.
const SITE_CSS = `
  @layer reset, tokens, base, layout, components, motion;
  @layer reset {
    *, *::before, *::after { box-sizing: border-box; }
    body, h1, h2, h3, h4, p, ol, ul { margin: 0; }
  }
  @layer tokens {
    :root, [data-theme="dark"] {
      color-scheme: dark;
      --bg: #0D1116;
      --bg-grad: #12171E;
      --surface: #161D26;
      --surface-2: #1B2430;
      --line: #273242;
      --line-strong: #35465A;
      --ink: #EDEFF4;
      --muted: #8E9AA9;
      --accent: #FFB454;
      --accent-strong: #FFCC85;
      --teal: #5CE0C6;
      --danger: #FF7A6B;
      --accent-ghost: rgba(255,180,84,.12);
      --teal-ghost: rgba(92,224,198,.10);
      --glow-accent: 0 6px 24px rgba(255,180,84,.26);
      --card-depth: 0 28px 60px rgba(0,0,0,.46);
      --noise: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.05'/></svg>");
    }
    [data-theme="light"] {
      color-scheme: light;
      --bg: #F2F3F5;
      --bg-grad: #FFFFFF;
      --surface: #FFFFFF;
      --surface-2: #F6F7F9;
      --line: #DDE1E7;
      --line-strong: #C5CBD4;
      --ink: #131A22;
      --muted: #55636F;
      --accent: #8A4E00;
      --accent-strong: #6B3D00;
      --teal: #0B7A5E;
      --danger: #B42318;
      --accent-ghost: rgba(138,78,0,.09);
      --teal-ghost: rgba(11,122,94,.08);
      --glow-accent: 0 8px 24px rgba(138,78,0,.22);
      --card-depth: 0 22px 48px rgba(19,26,34,.12);
      --noise: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.028'/></svg>");
    }
  }
  @layer base {
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% -8%, rgba(255,180,84,.10), transparent 42%),
        radial-gradient(circle at 88% 4%, rgba(92,224,198,.10), transparent 46%),
        linear-gradient(180deg, var(--bg-grad) 0%, var(--bg) 340px);
      background-attachment: fixed;
      font: 16px/1.62 ui-sans-serif, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      transition: color .25s ease, background .25s ease;
    }
    body::before {
      content: "";
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background-image:
        linear-gradient(var(--line) 1px, transparent 1px),
        linear-gradient(90deg, var(--line) 1px, transparent 1px),
        var(--noise);
      background-size: 72px 72px, 72px 72px, 160px 160px;
      opacity: .30;
      mask-image: radial-gradient(circle at 50% 0%, black, transparent 72%);
      -webkit-mask-image: radial-gradient(circle at 50% 0%, black, transparent 72%);
    }
    main, header, footer { position: relative; z-index: 1; }
    ::selection { background: var(--accent); color: #131A22; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 999px; }
    ::-webkit-scrollbar-track { background: transparent; }
  }
  @layer layout {
    header {
      position: sticky; top: 0; z-index: 20;
      display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
      padding: 14px 26px;
      background: color-mix(in srgb, var(--bg) 78%, transparent);
      backdrop-filter: blur(14px) saturate(1.15);
      border-bottom: 1px solid var(--line);
    }
    header strong { font-size: 18px; letter-spacing: .02em; }
    header strong a { color: inherit; text-decoration: none; display: inline-flex; align-items: center; gap: 10px; }
    header strong a::before {
      content: "";
      width: 12px; height: 12px; border-radius: 2px;
      background: conic-gradient(from 45deg, var(--accent), var(--teal) 40%, var(--accent));
      box-shadow: 0 0 12px rgba(255,180,84,.55);
    }
    nav { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .header-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    nav a {
      color: var(--muted); text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: .02em;
      padding: 8px 12px; border-radius: 999px; border: 1px solid transparent; transition: .2s ease;
    }
    nav a:hover { color: var(--ink); border-color: var(--line); background: var(--surface-2); }
    main { max-width: 1040px; margin: 0 auto; padding: 0 26px 96px; }
    section { padding: 56px 0; border: 0; }
    section + section { border-top: 1px solid var(--line); }
    .crumbs { font-size: 13px; color: var(--muted); padding: 18px 0 0; letter-spacing: .02em; }
    .crumbs a { color: var(--teal); }
  }
  @layer components {
    h1 {
      font-size: clamp(2.6rem, 6.2vw, 4rem); line-height: 1.02; font-weight: 800;
      letter-spacing: -0.035em; text-wrap: balance; margin: 0 0 18px;
    }
    h2 { font-size: clamp(1.6rem, 3vw, 2.2rem); line-height: 1.14; letter-spacing: -0.02em; font-weight: 780; margin: 0 0 18px; text-wrap: balance; }
    h3 { font-size: 1.4rem; letter-spacing: -0.02em; font-weight: 760; margin: 0 0 10px; }
    h4 { font-size: .78rem; margin: 26px 0 12px; font-family: ui-monospace, "SF Mono", Consolas, monospace; text-transform: uppercase; letter-spacing: .14em; color: var(--teal); }
    p { margin: 0 0 14px; }
    .muted { color: var(--muted); font-size: 14px; }
    .lead { font-size: 1.08rem; color: #B6C0CB; max-width: 60ch; line-height: 1.6; }
    [data-theme="light"] .lead { color: var(--muted); }
    .eyebrow {
      display: inline-flex; align-items: center; gap: 10px;
      font-family: ui-monospace, "SF Mono", Consolas, monospace;
      font-size: .68rem; letter-spacing: .18em; text-transform: uppercase; color: var(--teal);
      border: 1px solid color-mix(in srgb, var(--teal) 40%, transparent);
      background: var(--teal-ghost); border-radius: 999px; padding: 7px 14px; margin: 0 0 18px;
    }
    .eyebrow .dot {
      width: 8px; height: 8px; border-radius: 999px; background: var(--teal);
      box-shadow: 0 0 0 0 rgba(92,224,198,.6); animation: ping 2.2s ease-out infinite;
    }
    .promise { font-size: 1.1rem; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; max-width: 58ch; }
    .doors { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: 12px; padding: 0; list-style: none; }
    .doors a {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 15px 16px; border: 1px solid var(--line); border-radius: 14px;
      color: var(--ink); text-decoration: none; background: var(--surface);
      transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease; position: relative; overflow: hidden;
    }
    .doors a::after { content: "→"; color: var(--muted); transition: transform .22s ease; }
    .doors a:hover { transform: translateY(-3px); border-color: var(--line-strong); box-shadow: var(--card-depth); }
    .doors a:hover::after { transform: translateX(6px); color: var(--accent); }
    .actions { display: flex; gap: 14px; flex-wrap: wrap; margin: 26px 0 6px; }
    .cta {
      display: inline-flex; align-items: center; gap: 10px;
      font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: .82rem; font-weight: 700; letter-spacing: .06em;
      text-transform: uppercase;
      color: #14110A; text-decoration: none; background: var(--accent);
      padding: 15px 22px; border-radius: 10px; border: 1px solid var(--accent-strong);
      box-shadow: var(--glow-accent); transition: transform .2s ease, box-shadow .2s ease;
    }
    .cta:hover { transform: translateY(-2px); box-shadow: 0 12px 34px rgba(255,180,84,.4); color: #14110A; }
    .band {
      border: 1px solid var(--line-strong); border-radius: 18px;
      background:
        radial-gradient(circle at 20% -30%, rgba(255,180,84,.18), transparent 55%),
        radial-gradient(circle at 90% 120%, rgba(92,224,198,.16), transparent 55%),
        var(--surface);
      padding: 40px 38px; margin: 24px 0;
      box-shadow: var(--card-depth);
    }
    .pillars { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 18px; }
    .pillar {
      border: 1px solid var(--line); border-radius: 16px; padding: 22px; background: var(--surface);
      transition: transform .25s ease, border-color .25s ease;
    }
    .pillar:hover { transform: translateY(-4px); border-color: var(--line-strong); }
    .pillar h4 { margin-top: 0; }
    .steps { display: grid; gap: 0; padding: 0; list-style: none; counter-reset: step; }
    .steps li {
      display: grid; grid-template-columns: 44px 1fr; gap: 16px; align-items: start;
      padding: 14px 0 22px; position: relative;
      border-left: 1px solid var(--line-strong); padding-left: 28px; margin-left: 21px;
    }
    .steps li::before {
      counter-increment: step; content: counter(step);
      position: absolute; left: -22px; top: 14px;
      width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center;
      background: linear-gradient(145deg, var(--surface-2), var(--surface));
      border: 1px solid var(--line-strong);
      color: var(--accent); font-family: ui-monospace, monospace; font-weight: 700;
    }
    .steps li:last-child { padding-bottom: 0; }
    .steps span { display: block; color: var(--muted); font-size: .95rem; max-width: 52ch; }
    .task, .comparison {
      border: 1px solid var(--line); border-radius: 18px; background: var(--surface);
      padding: 28px; margin: 18px 0; box-shadow: var(--card-depth);
    }
    .status {
      display: inline-block; font-family: ui-monospace, monospace; font-size: .64rem;
      letter-spacing: .16em; text-transform: uppercase; color: var(--teal);
      border: 1px solid color-mix(in srgb, var(--teal) 40%, transparent);
      background: var(--teal-ghost); border-radius: 999px; padding: 4px 12px; margin: 4px 0 12px;
    }
    .offer {
      border: 1px solid var(--line); border-radius: 16px; padding: 22px; background: var(--surface);
      position: relative; overflow: hidden; margin: 14px 0;
    }
    .offer::before {
      content: ""; position: absolute; inset: 0 auto 0 0; width: 3px;
      background: linear-gradient(180deg, var(--accent), var(--teal));
    }
    .price { font-size: 1.1rem; font-weight: 800; letter-spacing: -0.01em; color: var(--accent); }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 18px; margin: 12px 0; }
    dt { font-family: ui-monospace, monospace; font-size: .72rem; align-self: start; color: var(--teal); letter-spacing: .06em; }
    dd { margin: 0; color: var(--ink); }
    label { display: grid; gap: 7px; font-size: .82rem; font-weight: 700; color: var(--muted); letter-spacing: .04em; }
    input, textarea, select {
      font: inherit; color: var(--ink); padding: 12px 14px; border-radius: 10px;
      border: 1px solid var(--line-strong); background: var(--surface-2); transition: .2s ease;
    }
    input:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent); }
    button {
      font: inherit; font-weight: 800; letter-spacing: .06em; justify-self: start;
      color: #14110A; background: var(--accent); border: 0; padding: 14px 20px; border-radius: 10px;
      cursor: pointer; box-shadow: var(--glow-accent); transition: transform .2s ease;
    }
    button:hover { transform: translateY(-2px); }
    .check { display: flex; align-items: center; gap: 10px; font-weight: 500; }
    details { border-bottom: 1px solid var(--line); padding: 12px 0 14px; }
    summary { cursor: pointer; font-weight: 700; }
    .siblings { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; list-style: none; }
    .siblings a { color: var(--teal); text-decoration: none; border: 1px solid var(--line); padding: 7px 11px; border-radius: 999px; font-size: .86rem; }
    .siblings a:hover { border-color: var(--teal); }
    footer { padding: 34px 26px; color: var(--muted); font-size: .82rem; border-top: 1px solid var(--line); }
    #scroll-progress {
      position: fixed; top: 0; left: 0; height: 2px; width: 0%; z-index: 30;
      background: linear-gradient(90deg, var(--accent), var(--teal));
      transition: width .08s linear;
    }
    .theme-toggle {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px;
      background: var(--surface-2); border: 1px solid var(--line); color: var(--muted);
      cursor: pointer; font-family: ui-monospace, monospace; font-size: .64rem; letter-spacing: .12em; text-transform: uppercase;
    }
    .theme-toggle svg { width: 14px; height: 14px; }
    [data-theme="dark"] .theme-toggle .moon { display: none; }
    [data-theme="light"] .theme-toggle .sun { display: none; }
    .theme-toggle:hover { color: var(--ink); border-color: var(--teal); }
  }
  @layer motion {
    section { animation: rise .55s cubic-bezier(.2,.7,.3,1) both; }
    main > section:nth-of-type(1) { animation-delay: .02s; }
    main > section:nth-of-type(2) { animation-delay: .09s; }
    main > section:nth-of-type(3) { animation-delay: .16s; }
    main > section:nth-of-type(4) { animation-delay: .23s; }
    main > section:nth-of-type(5) { animation-delay: .30s; }
    main > section:nth-of-type(6) { animation-delay: .37s; }
    main > section:nth-of-type(7) { animation-delay: .44s; }
    main > section:nth-of-type(8) { animation-delay: .51s; }
    main > section:nth-of-type(9) { animation-delay: .58s; }
    main > section:nth-of-type(10) { animation-delay: .65s; }
    main > section:nth-of-type(11) { animation-delay: .72s; }
    main > section:nth-of-type(n+12) { animation-delay: .78s; }
    @keyframes rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
    @keyframes ping { 0% { box-shadow: 0 0 0 0 rgba(92,224,198,.55); } 100% { box-shadow: 0 0 0 9px rgba(92,224,198,0); } }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      html { scroll-behavior: auto; }
    }
    @media (max-width: 680px) {
      .lead { font-size: 1rem; }
      dl { grid-template-columns: 1fr; gap: 2px 0; }
      .steps li { margin-left: 18px; padding-left: 22px; }
      main { padding: 0 16px 64px; }
      section { padding: 40px 0; }
      .band { padding: 28px 22px; }
    }
  }
`;

// Theme bootstrap. Runs before CSS paints so the page never flashes the wrong theme.
const THEME_INIT_SCRIPT = `<script>(function () { try { var saved = localStorage.getItem('boltech-theme'); var theme = saved === 'light' || saved === 'dark' ? saved : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); document.documentElement.dataset.theme = theme; } catch (_) { document.documentElement.dataset.theme = 'dark'; } })();</script>`;

const THEME_TOGGLE_SVG = `<svg class="sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><svg class="moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.4 15.4A8.5 8.5 0 0 1 8.6 3.6a8.5 8.5 0 1 0 11.8 11.8Z" fill="currentColor"/></svg>`;

const themeToggleHtml = config => `<button class="theme-toggle" id="theme-toggle" type="button" aria-label="${escapeHtml(ui(config.language).themeToggle)}" aria-pressed="false">${THEME_TOGGLE_SVG}<span class="sr-only">${escapeHtml(ui(config.language).themeToggle)}</span></button>`;

const THEME_PROGRESS_SCRIPT = `<script>(function () { var root = document.documentElement; function updateThemeButton() { var button = document.getElementById('theme-toggle'); if (button) button.setAttribute('aria-pressed', String(root.dataset.theme === 'light')); } var button = document.getElementById('theme-toggle'); if (button) { button.addEventListener('click', function () { var next = root.dataset.theme === 'light' ? 'dark' : 'light'; root.dataset.theme = next; try { localStorage.setItem('boltech-theme', next); } catch (_) {} updateThemeButton(); }); } updateThemeButton(); var bar = document.getElementById('scroll-progress'); if (bar) { var update = function () { var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight); bar.style.width = (window.scrollY / max * 100).toFixed(2) + '%'; }; window.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update, { passive: true }); update(); } })();</script>`;

const langPath = config => (config.language === 'en' ? '/en' : '');

// One task article, reused by the landing page and by the task's own page.
function taskArticle(task, config, siblingHref = id => `#task-${id}`) {
  const t = ui(config.language);
  const department = config.departments.find(item => item.id === task.departmentId);
  const siblings = expansionFor(config, task.id);
  return `
<article class="task" id="task-${escapeHtml(task.id)}" data-layer="tarea">
  <p class="eyebrow">${escapeHtml(department.name)}</p>
  <h3>${escapeHtml(task.name)}</h3>
  <p class="status">${escapeHtml(task.status)}</p>
  <p class="promise">${escapeHtml(task.promise)}</p>
  <h4>${escapeHtml(t.howItWorks)}</h4>
  <dl>
    <dt>${escapeHtml(t.trigger)}</dt><dd>${escapeHtml(task.howItWorks.trigger)}</dd>
    <dt>${escapeHtml(t.decide)}</dt><dd>${escapeHtml(task.howItWorks.decision)}</dd>
    <dt>${escapeHtml(t.act)}</dt><dd>${escapeHtml(task.howItWorks.action)}</dd>
  </dl>
  <h4>${escapeHtml(task.qualityBar)}</h4>
  <p>${escapeHtml(task.shapedBy)}</p>
  <h4>${escapeHtml(t.enterprise)}</h4>
  <ul>
    <li><strong>${escapeHtml(t.security)}:</strong> ${escapeHtml(task.risk.security)}</li>
    <li><strong>${escapeHtml(t.access)}:</strong> ${escapeHtml(task.risk.access)}</li>
    <li><strong>${escapeHtml(t.oversight)}:</strong> ${escapeHtml(task.risk.oversight)}</li>
  </ul>
  <h4>${escapeHtml(t.expansion)}</h4>
  <ul class="siblings">${siblings.map(item => `<li><a href="${escapeHtml(siblingHref(item.id))}">${escapeHtml(item.name)}</a></li>`).join('')}</ul>
  <h4>${escapeHtml(task.sharedStack)}</h4>
  <p><a class="cta" href="${langPath(config)}/#conversion">${escapeHtml(task.cta.label)}</a></p>
</article>`;
}

function comparisonArticle(item, config) {
  const t = ui(config.language);
  return `
<article class="comparison" data-layer="alternativa">
  <h3>${escapeHtml(item.title)}</h3>
  <h4>${escapeHtml(t.fitTitle)}</h4>
  <p>${escapeHtml(item.fitFor)}</p>
  <h4>${escapeHtml(t.diffTitle)}</h4>
  <ul>${item.differences.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
  <h4>${escapeHtml(t.switchTitle)}</h4>
  <ul>${item.switching.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
  <h4>${escapeHtml(t.faq)}</h4>
  ${item.faq.map(entry => `<details><summary>${escapeHtml(entry.q)}</summary><p>${escapeHtml(entry.a)}</p></details>`).join('')}
  <p><a class="cta" href="${langPath(config)}/#conversion">${escapeHtml(item.cta)}</a></p>
</article>`;
}

// One self-contained page so the whole machine can be opened and read in order.
// No external assets, no network calls, no submission endpoint.
export function renderFunnelHtml(config) {
  const c = validateFunnel(config);
  const t = ui(c.language);
  const proofCases = c.proof.cases.length
    ? `<ul>${c.proof.cases.map(item => `<li><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.figure)} <span class="muted">(${escapeHtml(item.source)})</span></li>`).join('')}</ul>`
    : `<p class="muted">${escapeHtml(t.noProof)}</p>`;

  const formFields = c.form.fields.map(field => {
    const control = field.type === 'textarea'
      ? `<textarea id="${field.name}" name="${field.name}" rows="4" required></textarea>`
      : `<input id="${field.name}" name="${field.name}" type="${field.type}" required>`;
    return `<label for="${field.name}">${escapeHtml(field.label)} <span aria-hidden="true">*</span>${control}</label>`;
  }).join('');

  const legalFields = (c.form.legalFields || []).map(field =>
    `<label class="check"><input id="${field.name}" name="${field.name}" type="checkbox" required> ${escapeHtml(field.label)}</label>`
  ).join('');

  const tasks = c.tasks.map(task => taskArticle(task, c)).join('');

  const comparison = c.comparisons.map(item => comparisonArticle(item, c)).join('');

  const home = seoPages(c).find(page => page.template === 'home');
  return `<!doctype html>
<html lang="${escapeHtml(c.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${THEME_INIT_SCRIPT}
${renderHead(home, c)}
<style>
${SITE_CSS}
</style>
</head>
<body>
<div id="scroll-progress" aria-hidden="true"></div>
<header>
  <strong>${escapeHtml(c.brand)}</strong>
  <div class="header-actions">
    <nav>
      <a href="#entrada">${escapeHtml(t.nav[0])}</a>
      <a href="#catalogo">${escapeHtml(t.nav[1])}</a>
      <a href="#conversion">${escapeHtml(t.nav[2])}</a>
      <a href="#precio">${escapeHtml(t.nav[3])}</a>
      <a href="#confianza">${escapeHtml(t.nav[4])}</a>
      <a href="#activacion">${escapeHtml(t.nav[5])}</a>
      <a href="${c.language === 'en' ? '../index.html' : 'en/index.html'}" hreflang="${c.language === 'en' ? 'es' : 'en'}">${escapeHtml(t.switchLabel)}</a>
    </nav>
    ${themeToggleHtml(c)}
  </div>
</header>
<main>
  ${landingHtml(c)}

  <section>
    ${tasks}
  </section>

  <section id="alternativa">${comparison}</section>

  <section id="conversion" data-layer="conversion">
    <h2>${escapeHtml(t.request)}</h2>
    <p class="lead">${escapeHtml(c.form.intro)}</p>
    <p class="muted">${escapeHtml(t.formNote)}</p>
    <form method="post" action="#" data-receipt="not-configured">
      ${formFields}
      ${legalFields}
      <button type="submit">${escapeHtml(c.form.submitLabel)}</button>
      <p class="muted">${escapeHtml(t.formOffline)}</p>
    </form>
    <h4>${escapeHtml(t.proof)}</h4>
    <div data-layer="prueba">
    ${proofCases}
    <p class="muted">${escapeHtml(c.proof.policy)}</p>
    </div>
  </section>

  <section id="precio" data-layer="conversion">
    <h2>${escapeHtml(c.pricing.headline)}</h2>
    <p class="muted">${escapeHtml(c.pricing.note)}</p>
    ${c.pricing.offers.map(offer => `<div class="offer"><h3>${escapeHtml(offer.name)}</h3><p>${escapeHtml(offer.description)}</p><p class="price">${escapeHtml(offer.referencePrice)}</p><p><a class="cta" href="#conversion">${escapeHtml(offer.cta)}</a></p></div>`).join('')}
    <p><a class="cta" href="#conversion">${escapeHtml(c.pricing.cta)}</a></p>
    <h4>${escapeHtml(t.faq)}</h4>
    ${c.pricing.faq.map(entry => `<details><summary>${escapeHtml(entry.q)}</summary><p>${escapeHtml(entry.a)}</p></details>`).join('')}
  </section>

  <section id="confianza" data-layer="confianza">
    <h2>${escapeHtml(c.trust.headline)}</h2>
    ${c.trust.sections.map(section => `<h4>${escapeHtml(section.title)}</h4><ul>${section.points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`).join('')}
    <h4>${escapeHtml(t.trustLimits)}</h4>
    <ul>${c.trust.limits.map(limit => `<li>${escapeHtml(limit)}</li>`).join('')}</ul>
  </section>

  <section id="activacion" data-layer="activacion">
    <h2>${escapeHtml(c.activation.headline)}</h2>
    <ol>${c.activation.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    <h4>${escapeHtml(t.requirements)}</h4>
    <ul>${c.activation.requirements.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    ${c.activation.docs.map(item => `<h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.body)}</p>`).join('')}
  </section>
</main>
<footer>${escapeHtml(t.footer)}</footer>
${THEME_PROGRESS_SCRIPT}
</body>
</html>
`;
}

// The form produces the same envelope the inbound registry already understands.
export function formToSubmission(config, values, { requestId, pageUrl } = {}) {
  validateFunnel(config);
  const payload = { requestId, pageUrl };
  for (const field of config.form.fields) {
    const value = values?.[field.name];
    if (field.required && (typeof value !== 'string' || !value.trim())) {
      fail(`Field "${field.name}" is required`);
    }
    if (field.name === 'firstname' || field.name === 'lastname') {
      payload.name = [values.firstname, values.lastname].filter(Boolean).join(' ').trim();
    } else {
      payload[field.mapsTo] = value.trim();
    }
  }
  for (const field of config.form.legalFields || []) {
    payload[field.mapsTo] = values?.[field.name] === true;
  }
  if (payload.consentToContact !== true) fail('Explicit contact consent is required');
  return { channel: 'demo_request', payload };
}

export async function buildFunnel(config, stateDir) {
  const files = renderFunnel(config);
  return writeFunnelBuild(files, stateDir, config);
}

export async function buildFunnelPair(es, en, stateDir) {
  const files = renderFunnelPair(es, en);
  const pair = validateFunnelPair(es, en);
  return writeFunnelBuild(files, stateDir, pair.es, { languages: [pair.es.language, pair.en.language] });
}

async function writeFunnelBuild(files, stateDir, config, extra = {}) {
  const base = path.join(stateDir, 'funnel');
  await mkdir(base, { recursive: true });
  const { mkdtemp } = await import('node:fs/promises');
  const outputDir = await mkdtemp(path.join(base, 'build-'));
  for (const [name, body] of Object.entries(files)) {
    const target = path.join(outputDir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, 'utf8');
  }
  const manifest = {
    schemaVersion: 1,
    status: 'REVIEW_REQUIRED',
    published: false,
    generatedAt: new Date().toISOString(),
    layers: FUNNEL_LAYERS,
    taskBlocks: TASK_BLOCKS,
    qualificationFields: QUALIFICATION_FIELD_NAMES,
    tasks: config.tasks.length,
    departments: config.departments.length,
    ...extra,
    files: Object.keys(files)
  };
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { status: 'REVIEW_REQUIRED', outputDir, files: Object.keys(files).length, published: false };
}
