import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunnel, renderFunnelPair } from '../src/funnel.mjs';
import { seoPages, describe, renderSitemap, structuredData, ANSWER_ENGINE_AGENTS } from '../src/seo.mjs';

const es = await loadFunnel('es');
const en = await loadFunnel('en');
const files = renderFunnelPair(es, en);
const esPages = seoPages(es);
const enPages = seoPages(en);

test('every sitemap url is a document that actually exists', () => {
  const sitemap = files['sitemap.xml'];
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(locs.length, esPages.length + enPages.length);
  for (const page of [...esPages, ...enPages]) {
    const route = new URL(page.url).pathname;
    const file = route === '/' ? 'index.html' : `${route.replace(/^\//, '')}index.html`;
    assert.ok(files[file], `sitemap lists ${page.url} but ${file} is not rendered`);
  }
});

test('every rendered page carries exactly one h1 and its own canonical', () => {
  const htmlPages = Object.entries(files).filter(([name]) => name.endsWith('.html'));
  assert.ok(htmlPages.length >= 17, 'both languages must produce their page family');
  for (const [name, html] of htmlPages) {
    const h1s = html.match(/<h1[\s>]/g) || [];
    assert.equal(h1s.length, 1, `${name} must carry exactly one h1`);
    assert.match(html, /<link rel="canonical" href="https:\/\/boltech-group\.vercel\.app\//, `${name} must declare its canonical`);
    assert.match(html, /hreflang="es"/, `${name} must declare its spanish alternate`);
    assert.match(html, /hreflang="en"/, `${name} must declare its english alternate`);
  }
});

test('titles and descriptions stay inside the length a result can show', () => {
  for (const page of [...esPages, ...enPages]) {
    assert.ok(page.title.length <= 65, `title too long: ${page.title}`);
    assert.ok(page.description.length > 0, `missing description: ${page.url}`);
    assert.ok(page.description.length <= 160, `description too long: ${page.description}`);
  }
  const titles = [...esPages, ...enPages].map(page => page.title);
  assert.equal(new Set(titles).size, titles.length, 'two pages must not share a title');
});

test('describe cuts at a word boundary and never invents text', () => {
  const text = 'Una descripción suficientemente larga para tener que cortarse en algún punto razonable y no a mitad de palabra';
  const cut = describe(text, 60);
  assert.ok(cut.length <= 60);
  assert.ok(cut.endsWith('…'));
  assert.ok(cut.slice(0, -1).trim() === cut.slice(0, -1).trimEnd());
  assert.equal(describe('Corto', 60), 'Corto');
});

test('the sitemap and the llms summary agree on the same pages', () => {
  const llms = files['llms.txt'];
  for (const page of esPages) {
    assert.ok(llms.includes(page.url), `llms.txt must list ${page.url}`);
  }
  assert.match(llms, /^# Boltech Group$/m);
  assert.match(llms, /Límites declarados/);
  assert.match(llms, /no ofertas finales/i, 'llms.txt must restate the price limit');
});

test('robots allows every crawler and names the answer engines', () => {
  const robots = files['robots.txt'];
  assert.match(robots, /^User-agent: \*$/m);
  for (const agent of ANSWER_ENGINE_AGENTS) {
    assert.ok(robots.includes(`User-agent: ${agent}`), `robots must name ${agent}`);
  }
  assert.match(robots, /Sitemap: https:\/\/boltech-group\.vercel\.app\/sitemap\.xml/);
  assert.match(robots, /llms\.txt/);
  assert.doesNotMatch(robots, /Disallow: \/(?!$)/, 'robots must not hide the site from crawlers');
});

test('structured data publishes facts, never a final price or a rating', () => {
  const agent = esPages.find(page => page.template === 'agent');
  const nodes = structuredData(agent, es);
  const flat = JSON.stringify(nodes);
  assert.match(flat, /"@type":"Service"/);
  assert.match(flat, /"@type":"BreadcrumbList"/);
  assert.doesNotMatch(flat, /"@type":"Offer"/, 'a reference price must not become an Offer');
  assert.doesNotMatch(flat, /aggregateRating|reviewCount/, 'no invented social proof');

  const pricing = esPages.find(page => page.template === 'pricing');
  const pricingFlat = JSON.stringify(structuredData(pricing, es));
  assert.match(pricingFlat, /"@type":"FAQPage"/);
  assert.doesNotMatch(pricingFlat, /"price":/, 'the pricing page must not publish a machine-readable price');
});

test('the two languages expose the same routes', () => {
  const strip = page => new URL(page.url).pathname.replace(/^\/en/, '') || '/';
  assert.deepEqual(enPages.map(strip), esPages.map(page => new URL(page.url).pathname));
});

test('the sitemap is valid xml with one url entry per page', () => {
  const sitemap = renderSitemap(esPages, enPages, '2026-11-03');
  assert.ok(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(sitemap.trim().endsWith('</urlset>'));
  assert.equal((sitemap.match(/<url>/g) || []).length, esPages.length + enPages.length);
  assert.equal((sitemap.match(/<loc>/g) || []).length, esPages.length + enPages.length);
  assert.doesNotMatch(sitemap, /<loc><\/loc>/);
});
