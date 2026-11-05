// SEO/AEO layer: the retrieval mechanism observed on the reference site, rebuilt as
// original code over Boltech's own content.
//
// Observed structure (evidence: .clonador/seo/ra-*.{xml,txt,json}):
//   1. one sitemap listing programmatic page families at scale
//   2. robots.txt that allows every crawler and explicitly allows answer-engine bots
//   3. an llms.txt that summarises the site for language models
//   4. one H1 per page, matched to the query the page answers
//   5. per-template structured data (Organization, WebPage, BreadcrumbList,
//      ItemList / CollectionPage, FAQPage, Service)
//   6. title + description written per page, canonical, and internal links up to a hub
//
// Nothing here copies their copy, their slugs, their design or their code. Only the
// mechanism is replicated, and every fact comes from config/funnel*.json.

const escapeHtml = value => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const jsonLd = value => JSON.stringify(value).replace(/</g, '\\u003c');

// The page families the sitemap is built from. Each one exists as a document later,
// so the sitemap never lists a URL that returns nothing.
export const SEO_TEMPLATES = Object.freeze([
  'home', 'use-case', 'agent', 'comparison', 'pricing', 'trust', 'activation'
]);

// The crawler list the reference site publishes as explicitly allowed.
export const ANSWER_ENGINE_AGENTS = Object.freeze([
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended'
]);

const TRUNCATE = 160;

// Descriptions are cut at a word boundary so the meta tag never ends mid-word.
export function describe(text, max = TRUNCATE) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const boundary = cut.lastIndexOf(' ');
  return `${cut.slice(0, boundary > 60 ? boundary : max - 1).replace(/[,;:.\s]+$/, '')}…`;
}

const UI = Object.freeze({
  es: {
    homeTitle: brand => `${brand} · Agentes de IA para empresas`,
    useCaseTitle: name => `${name}: agentes de IA para ese equipo`,
    agentTitle: (name, brand) => `${name} · ${brand}`,
    comparisonTitle: (brand, competitor) => `${brand} frente a ${competitor}`,
    pricingTitle: brand => `Precios de referencia y formas de empezar · ${brand}`,
    trustTitle: brand => `Seguridad, accesos y supervisión · ${brand}`,
    activationTitle: brand => `Cómo empezamos · ${brand}`,
    hubs: { home: 'Inicio', specialties: 'Especialidades', agents: 'Agentes', pricing: 'Precios', trust: 'Confianza', activation: 'Cómo empezamos', comparison: 'Comparativa' },
    llmsIntro: 'Resumen del sitio para asistentes y motores de respuesta. Todo el texto es propio; los precios son de referencia.',
    llmsSections: { product: 'Producto', specialties: 'Especialidades', agents: 'Agentes', compare: 'Comparativas', resources: 'Recursos', limits: 'Límites declarados' }
  },
  en: {
    homeTitle: brand => `${brand} · AI agents for companies`,
    useCaseTitle: name => `${name}: AI agents for that team`,
    agentTitle: (name, brand) => `${name} · ${brand}`,
    comparisonTitle: (brand, competitor) => `${brand} vs ${competitor}`,
    pricingTitle: brand => `Reference pricing and ways to start · ${brand}`,
    trustTitle: brand => `Security, access and oversight · ${brand}`,
    activationTitle: brand => `How we start · ${brand}`,
    hubs: { home: 'Home', specialties: 'Specialties', agents: 'Agents', pricing: 'Pricing', trust: 'Trust', activation: 'How we start', comparison: 'Comparison' },
    llmsIntro: 'Site overview for assistants and answer engines. All copy is our own; prices are references.',
    llmsSections: { product: 'Product', specialties: 'Specialties', agents: 'Agents', compare: 'Comparisons', resources: 'Resources', limits: 'Declared limits' }
  }
});

const ui = language => UI[language] || UI.es;

const slug = value => String(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function absolute(baseUrl, route) {
  const base = String(baseUrl).replace(/\/+$/, '');
  if (route === '/' || route === '') return `${base}/`;
  return `${base}${route.startsWith('/') ? route : `/${route}`}`;
}

// Every page is one object with the same fields, so the head, the sitemap and the
// llms.txt are generated from one source instead of three that drift apart.
export function seoPages(config) {
  const t = ui(config.language);
  const { brand } = config;
  const baseUrl = config.seo?.baseUrl;
  const prefix = config.language === 'en' ? '/en' : '';
  const pages = [];

  const add = page => pages.push({
    ...page,
    title: describe(page.title, 65),
    description: describe(page.description),
    route: page.route
  });

  add({
    template: 'home',
    route: `${prefix}/`,
    title: t.homeTitle(brand),
    description: describe(`${config.landing.hero.subline} ${config.landing.hero.primaryCta}.`),
    h1: config.landing.hero.headline,
    nav: 'home'
  });

  for (const department of config.departments) {
    const tasks = config.tasks.filter(task => task.departmentId === department.id);
    add({
      template: 'use-case',
      route: `${prefix}/especialidades/${department.id}/`,
      title: t.useCaseTitle(department.name),
      description: describe(tasks.map(task => task.promise).join(' ')),
      h1: department.name,
      nav: 'specialties',
      departmentId: department.id,
      taskIds: department.taskIds
    });
  }

  for (const task of config.tasks) {
    add({
      template: 'agent',
      route: `${prefix}/agentes/${task.id}/`,
      title: t.agentTitle(task.name, brand),
      description: describe(task.promise + ' ' + task.qualityBar),
      h1: task.name,
      nav: 'agents',
      taskId: task.id
    });
  }

  for (const comparison of config.comparisons) {
    add({
      template: 'comparison',
      route: `${prefix}/vs/${comparison.id}/`,
      title: t.comparisonTitle(brand, comparison.competitor),
      description: describe(comparison.fitFor),
      h1: comparison.title,
      nav: 'comparison',
      comparisonId: comparison.id
    });
  }

  add({
    template: 'pricing',
    route: `${prefix}/precios/`,
    title: t.pricingTitle(brand),
    description: describe(`${config.pricing.headline}. ${config.pricing.note}`),
    h1: config.pricing.headline,
    nav: 'pricing'
  });

  add({
    template: 'trust',
    route: `${prefix}/confianza/`,
    title: t.trustTitle(brand),
    description: describe(config.trust.headline),
    h1: config.trust.headline,
    nav: 'trust'
  });

  add({
    template: 'activation',
    route: `${prefix}/como-empezamos/`,
    title: t.activationTitle(brand),
    description: describe(config.activation.headline + ' ' + config.activation.steps[0]),
    h1: config.activation.headline,
    nav: 'activation'
  });

  return pages.map(page => ({ ...page, url: absolute(baseUrl, page.route) }));
}

function breadcrumb(page, config) {
  const t = ui(config.language);
  const items = [{ name: t.hubs.home, url: absolute(config.seo.baseUrl, config.language === 'en' ? '/en/' : '/') }];
  const hub = t.hubs[page.nav];
  if (page.nav !== 'home' && hub) items.push({ name: hub, url: page.url });
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url }))
  };
}

// Structured data is built only from facts the config already publishes. There is no
// Offer node: a reference price is not a final offer, so it is declared as text.
export function structuredData(page, config) {
  const { brand } = config;
  const org = {
    '@type': 'Organization',
    name: brand,
    url: absolute(config.seo.baseUrl, '/'),
    description: config.landing.hero.subline
  };
  const nodes = [org];
  const web = { '@type': 'WebPage', '@id': page.url, url: page.url, name: page.title, description: page.description, inLanguage: config.language, isPartOf: { '@type': 'WebSite', name: brand, url: absolute(config.seo.baseUrl, '/') } };
  nodes.push(web);

  if (page.template === 'home') {
    nodes.push({ '@type': 'WebSite', name: brand, url: absolute(config.seo.baseUrl, '/'), inLanguage: config.language });
  }

  if (page.template === 'use-case') {
    web['@type'] = 'CollectionPage';
    nodes.push({
      '@type': 'ItemList',
      itemListElement: page.taskIds.map((id, index) => {
        const task = config.tasks.find(item => item.id === id);
        return { '@type': 'ListItem', position: index + 1, name: task.name, url: absolute(config.seo.baseUrl, `${config.language === 'en' ? '/en' : ''}/agentes/${task.id}/`) };
      })
    });
  }

  if (page.template === 'agent') {
    const task = config.tasks.find(item => item.id === page.taskId);
    nodes.push({ '@type': 'Service', name: task.name, description: task.promise, provider: { '@type': 'Organization', name: brand }, serviceType: task.name, areaServed: 'LatAm' });
  }

  if (page.template === 'comparison' || page.template === 'pricing') {
    const faq = page.template === 'comparison'
      ? config.comparisons.find(item => item.id === page.comparisonId).faq
      : config.pricing.faq;
    nodes.push({
      '@type': 'FAQPage',
      mainEntity: faq.map(entry => ({
        '@type': 'Question',
        name: entry.q,
        acceptedAnswer: { '@type': 'Answer', text: entry.a }
      }))
    });
  }

  if (page.template !== 'home') nodes.push(breadcrumb(page, config));
  return nodes;
}

export function alternates(page, config) {
  const base = config.seo.baseUrl;
  const es = page.route.startsWith('/en') ? page.route.slice(3) || '/' : page.route;
  const en = `/en${es === '/' ? '/' : es}`;
  return [
    { hreflang: 'es', href: absolute(base, es) },
    { hreflang: 'en', href: absolute(base, en) },
    { hreflang: 'x-default', href: absolute(base, es) }
  ];
}

export function renderHead(page, config) {
  const { brand } = config;
  const image = config.seo?.socialImage ? absolute(config.seo.baseUrl, config.seo.socialImage) : null;
  const tags = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<link rel="canonical" href="${escapeHtml(page.url)}">`,
    ...alternates(page, config).map(alt => `<link rel="alternate" hreflang="${alt.hreflang}" href="${escapeHtml(alt.href)}">`),
    `<meta name="robots" content="index,follow,max-image-preview:large">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(brand)}">`,
    `<meta property="og:title" content="${escapeHtml(page.title)}">`,
    `<meta property="og:description" content="${escapeHtml(page.description)}">`,
    `<meta property="og:url" content="${escapeHtml(page.url)}">`,
    `<meta property="og:locale" content="${config.language === 'en' ? 'en_US' : 'es_ES'}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}">`
  ];
  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(image)}">`);
  }
  for (const node of structuredData(page, config)) {
    tags.push(`<script type="application/ld+json">${jsonLd(node)}</script>`);
  }
  return tags.join('\n');
}

// The sitemap lists exactly the routes seoPages() produced, in both languages.
export function renderSitemap(esPages, enPages, lastmod) {
  const all = [...esPages, ...enPages];
  const rows = all.map(page => `  <url>\n    <loc>${escapeHtml(page.url)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${page.template === 'home' ? '1.0' : '0.7'}</priority>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

// Every crawler is allowed; answer engines are named explicitly, as observed.
export function renderRobots(baseUrl) {
  const lines = ['# All crawlers are welcome.', 'User-agent: *', 'Allow:', ''];
  for (const agent of ANSWER_ENGINE_AGENTS) {
    lines.push(`# Answer engines may read and cite the site.`, `User-agent: ${agent}`, 'Allow:', '');
  }
  lines.push('# Curated overview for language models:', `# ${absolute(baseUrl, '/llms.txt')}`, '');
  lines.push(`Sitemap: ${absolute(baseUrl, '/sitemap.xml')}`, '');
  return lines.join('\n');
}

export function renderLlmsTxt(config) {
  const t = ui(config.language);
  const pages = seoPages(config);
  const by = template => pages.filter(page => page.template === template);
  const link = page => `- [${page.h1}](${page.url}): ${page.description}`;
  const lines = [
    `# ${config.brand}`,
    '',
    `> ${config.landing.hero.subline}`,
    '',
    t.llmsIntro,
    '',
    `## ${t.llmsSections.product}`,
    link(by('home')[0]),
    link(by('pricing')[0]),
    link(by('trust')[0]),
    link(by('activation')[0]),
    '',
    `## ${t.llmsSections.specialties}`,
    ...by('use-case').map(link),
    '',
    `## ${t.llmsSections.agents}`,
    ...by('agent').map(link),
    '',
    `## ${t.llmsSections.compare}`,
    ...by('comparison').map(link),
    '',
    `## ${t.llmsSections.limits}`,
    ...config.trust.limits.map(limit => `- ${limit}`),
    ''
  ];
  return lines.join('\n');
}

// One call, one kit: the head tags and the three crawler files.
export function buildSeoKit(es, en, { lastmod = new Date().toISOString().slice(0, 10) } = {}) {
  const esPages = seoPages(es);
  const enPages = seoPages(en);
  if (!es.seo?.baseUrl || !en.seo?.baseUrl) throw new Error('SEO: baseUrl is required');
  if (es.seo.baseUrl !== en.seo.baseUrl) throw new Error('SEO: the two languages must share one baseUrl');
  const routes = new Set(esPages.map(page => page.route));
  for (const page of enPages) {
    if (!routes.has(page.route.replace(/^\/en/, '') || '/')) throw new Error(`SEO: english route ${page.route} has no spanish twin`);
  }
  return {
    'sitemap.xml': renderSitemap(esPages, enPages, lastmod),
    'robots.txt': renderRobots(es.seo.baseUrl),
    'llms.txt': renderLlmsTxt(es),
    'en/llms.txt': renderLlmsTxt(en),
    pages: { es: esPages, en: enPages }
  };
}
