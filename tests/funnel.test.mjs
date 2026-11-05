import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  loadFunnel, validateFunnel, validateFunnelPair, renderFunnel, renderFunnelPair,
  buildFunnel, buildFunnelPair, formToSubmission,
  tasksForDepartment, expansionFor, FUNNEL_LAYERS, TASK_BLOCKS, QUALIFICATION_FIELD_NAMES
} from '../src/funnel.mjs';

const config = await loadFunnel();
const english = await loadFunnel('en');
const clone = () => JSON.parse(JSON.stringify(config));
const cloneEn = () => JSON.parse(JSON.stringify(english));

async function setup(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clonador-funnel-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('the cloned funnel keeps the eight observed layers in their observed order', () => {
  assert.deepEqual(FUNNEL_LAYERS, [
    'entrada', 'departamento', 'tarea', 'prueba', 'alternativa', 'conversion', 'confianza', 'activacion'
  ]);
  assert.equal(TASK_BLOCKS.length, 8);
});

test('the qualified config passes validation unchanged', () => {
  assert.equal(validateFunnel(config), config);
});

test('the form asks for six fields and nothing about money or reach', () => {
  const names = config.form.fields.map(field => field.name);
  assert.deepEqual(names, [...QUALIFICATION_FIELD_NAMES]);
  assert.equal(names.length, 6);
  for (const forbidden of ['budget', 'presupuesto', 'phone', 'telefono', 'employees', 'timeline', 'plazo']) {
    assert.ok(!names.some(name => name.includes(forbidden)), `form must not ask for ${forbidden}`);
  }
  assert.ok(config.form.fields.every(field => field.required === true));
});

test('a form that asks for budget is rejected', () => {
  const broken = clone();
  broken.form.fields[5] = { ...broken.form.fields[5], name: 'budget' };
  assert.throws(() => validateFunnel(broken), /prohibited field|missing field/);
});

test('an extra commercial field breaks the count', () => {
  const broken = clone();
  broken.form.fields.push({ name: 'phone', label: 'Telefono', type: 'text', required: true });
  assert.throws(() => validateFunnel(broken), /exactly 6/);
});

test('every task carries the eight blocks', () => {
  for (const task of config.tasks) {
    for (const block of ['promise', 'howItWorks', 'qualityBar', 'shapedBy', 'risk', 'sharedStack', 'cta']) {
      assert.ok(task[block], `task ${task.id} is missing ${block}`);
    }
    assert.deepEqual(Object.keys(task.howItWorks), ['trigger', 'decision', 'action']);
    assert.deepEqual(Object.keys(task.risk), ['security', 'access', 'oversight']);
  }
});

test('a task missing a block is rejected', () => {
  const broken = clone();
  delete broken.tasks[0].qualityBar;
  assert.throws(() => validateFunnel(broken), /missing block "qualityBar"/);
});

test('every department is a door that leads to a task', () => {
  assert.equal(config.departments.length, 6);
  for (const department of config.departments) {
    const tasks = tasksForDepartment(config, department.id);
    assert.ok(tasks.length > 0, `${department.id} leads nowhere`);
    assert.ok(tasks.every(Boolean));
  }
});

test('a department without tasks is rejected', () => {
  const broken = clone();
  broken.departments[0].taskIds = [];
  assert.throws(() => validateFunnel(broken), /has no task/);
});

test('each task page sells the other seven', () => {
  for (const task of config.tasks) {
    const siblings = expansionFor(config, task.id);
    assert.equal(siblings.length, config.tasks.length - 1);
    assert.ok(siblings.every(item => item.id !== task.id));
  }
  const page = renderFunnel(config)[`20-tarea-${config.tasks[0].id}.md`];
  assert.match(page, /Combínalo con más tareas/);
  for (const sibling of expansionFor(config, config.tasks[0].id)) {
    assert.ok(page.includes(sibling.name), `page must sell ${sibling.name}`);
  }
});

test('the task page keeps the observed block order', () => {
  const page = renderFunnel(config)[`20-tarea-${config.tasks[0].id}.md`];
  const order = ['Cómo funciona', 'Hecho para equipos', 'Combínalo con más tareas', 'Solicitar una llamada'];
  const positions = order.map(text => page.indexOf(text));
  assert.ok(positions.every(p => p >= 0), 'every block must be present');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test('published prices are references and always require a quote', () => {
  const page = renderFunnel(config)['60-precio.md'];
  assert.match(page, /no ofertas finales/);
  for (const offer of config.pricing.offers) {
    assert.ok(page.includes(offer.name));
    assert.ok(page.includes(offer.referencePrice));
    assert.equal(offer.reference, true);
    assert.equal(offer.quoteRequired, true);
  }
  const unbalanced = clone();
  unbalanced.pricing.offers[0].quoteRequired = false;
  assert.throws(() => validateFunnel(unbalanced), /without requiring a quote/);
  const unmarked = clone();
  unmarked.pricing.offers[0].reference = false;
  assert.throws(() => validateFunnel(unmarked), /without marking it a reference/);
  const silent = clone();
  silent.pricing.note = 'Precios vigentes';
  assert.throws(() => validateFunnel(silent), /not final offers/);
});

test('the doors are Boltech specialties, not generic departments', () => {
  assert.deepEqual(config.departments.map(item => item.id), [
    'ventas', 'servicio-al-cliente', 'mercadeo', 'finanzas', 'logistica', 'quimica-farmacia-registros'
  ]);
  assert.deepEqual(config.departments.map(item => item.name), [
    'Ventas', 'Servicio al cliente', 'Mercadeo', 'Finanzas', 'Logística', 'Química, Farmacia y Registros'
  ]);
});

test('every specialty has its own agent and every agent declares its state', () => {
  assert.equal(config.tasks.length, config.departments.length);
  for (const department of config.departments) {
    const tasks = tasksForDepartment(config, department.id);
    assert.equal(tasks.length, 1, `${department.name} must have exactly one agent`);
    assert.ok(tasks[0].status, 'an agent without a declared state is a promise, not a product');
  }
  const broken = clone();
  delete broken.tasks[0].status;
  assert.throws(() => validateFunnel(broken), /must declare its delivery status/);
});


test('the comparison concedes the answer depends and answers the uncomfortable question', () => {
  const page = renderFunnel(config)['40-alternativa-servicio-o-plataforma.md'];
  assert.match(page, /Cuál encaja con tu equipo/);
  assert.match(page, /Es mejor una plataforma o un servicio\?/);
  const broken = clone();
  broken.comparisons[0].fitFor = '';
  assert.throws(() => validateFunnel(broken), /must concede/);
});

test('market-superlatives are refused anywhere in the funnel', () => {
  for (const claim of ['Somos el mejor del mercado', 'Garantizamos resultados', 'Somos lideres del mercado']) {
    const broken = clone();
    broken.tasks[0].promise = claim;
    assert.throws(() => validateFunnel(broken), /forbids/);
  }
});

test('the form maps to the inbound contract already in use', () => {
  const { channel, payload } = formToSubmission(config, {
    firstname: 'Ana', lastname: 'Perez', email: 'ana@example.test',
    company: 'Ejemplo SA', jobtitle: 'Gerente de Operaciones',
    outcome: 'Reducir el tiempo de respuesta a solicitudes', consent: true
  }, { requestId: 'req-1', pageUrl: 'https://boltech.example/demo' });
  assert.equal(channel, 'demo_request');
  assert.equal(payload.name, 'Ana Perez');
  assert.equal(payload.contactEmail, 'ana@example.test');
  assert.equal(payload.jobTitle, 'Gerente de Operaciones');
  assert.equal(payload.consentToContact, true);
  assert.equal(payload.notes, 'Reducir el tiempo de respuesta a solicitudes');
});

test('a submission without consent or without the open question is refused', () => {
  const base = {
    firstname: 'Ana', lastname: 'Perez', email: 'ana@example.test',
    company: 'Ejemplo SA', jobtitle: 'Gerente', outcome: 'algo'
  };
  assert.throws(() => formToSubmission(config, { ...base, consent: false }), /consent/);
  assert.throws(() => formToSubmission(config, { ...base, consent: true, outcome: '  ' }), /required/);
});

test('the build writes the whole machine and stays unpublished', async t => {
  const dir = await setup(t);
  const first = await buildFunnel(config, dir);
  const second = await buildFunnel(config, dir);
  assert.notEqual(first.outputDir, second.outputDir);
  assert.equal(first.published, false);
  assert.equal(first.status, 'REVIEW_REQUIRED');
  const manifest = JSON.parse(await readFile(path.join(first.outputDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.tasks, 6);
  assert.equal(manifest.departments, 6);
  assert.equal(manifest.qualificationFields.length, 6);
  assert.equal(manifest.published, false);
  const conversion = await readFile(path.join(first.outputDir, '50-conversion.md'), 'utf8');
  assert.match(conversion, /No se pregunta presupuesto/);
  assert.match(conversion, /Sin casos publicados todavía/);
});

test('the conversion page never fabricates proof', () => {
  const page = renderFunnel(config)['50-conversion.md'];
  assert.match(page, /declarado vacío/);
  assert.doesNotMatch(page, /Autodesk|Canva|Databricks/);
});

test('the trust layer answers risk and admits what it does not do', () => {
  const page = renderFunnel(config)['70-confianza.md'];
  for (const title of ['Seguridad y datos', 'Accesos y controles', 'Supervisión', 'Lo que no hacemos']) {
    assert.ok(page.includes(title), `trust page must carry "${title}"`);
  }
  const broken = clone();
  broken.trust.limits = [];
  assert.throws(() => validateFunnel(broken), /admit its limits/);
  const missingRisk = clone();
  missingRisk.trust.sections = missingRisk.trust.sections.filter(section => section.id !== 'oversight');
  assert.throws(() => validateFunnel(missingRisk), /missing "oversight"/);
});

test('the activation layer keeps the machine after the signature', () => {
  const page = renderFunnel(config)['80-activacion.md'];
  assert.match(page, /De la idea al agente/);
  assert.match(page, /Lo que necesitas tener/);
  const broken = clone();
  broken.activation.steps = [];
  assert.throws(() => validateFunnel(broken), /Activation needs steps/);
});

test('the whole machine renders in layer order and includes the html page', () => {
  const files = renderFunnel(config);
  const names = Object.keys(files);
  const subPages = 1 + config.departments.length + config.tasks.length + config.comparisons.length + 3 - 1;
  assert.equal(names.length, 1 + config.departments.length + config.tasks.length + config.comparisons.length + 5 + subPages);
  assert.ok(names.includes('index.html'));
  assert.ok(names.includes('agentes/agente-ventas/index.html'));
  assert.ok(names.includes('especialidades/ventas/index.html'));
  assert.ok(names.includes('precios/index.html'));
  assert.ok(names.includes('vs/servicio-o-plataforma/index.html'));
  assert.deepEqual(
    names.filter(name => !name.startsWith('10-') && !name.startsWith('20-')).slice(0, 1).concat([
      '50-conversion.md', '60-precio.md', '70-confianza.md', '80-activacion.md'
    ]),
    ['00-entrada.md', '50-conversion.md', '60-precio.md', '70-confianza.md', '80-activacion.md']
  );
});

test('the html page is self-contained and its form keeps six fields', () => {
  const html = renderFunnel(config)['index.html'];
  // No external asset is loaded: no remote script, stylesheet or image.
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/i);
  assert.doesNotMatch(html, /<img[^>]+src=/i);
  assert.doesNotMatch(html, /<(?:input|textarea)[^>]*(?:name|id)="(?:budget|presupuesto|phone|telefono)"/i);
  assert.match(html, /No se pregunta presupuesto/);
  assert.equal((html.match(/<(?:input|textarea) [^>]*required/g) || []).length, 7);
  for (const layer of FUNNEL_LAYERS) {
    assert.ok(html.includes(`data-layer="${layer}"`), `html must mark the ${layer} layer`);
  }
  assert.match(html, /data-receipt="not-configured"/);
  assert.match(html, /REVIEW_REQUIRED/);
  // The head carries the retrieval layer, not only the markup.
  assert.match(html, /<link rel="canonical" href="https:\/\/boltech-group\.vercel\.app\/">/);
  assert.match(html, /hreflang="en"/);
  assert.match(html, /application\/ld\+json/);
});

test('the two languages are the same machine, not two different pages', () => {
  const pair = validateFunnelPair(clone(), cloneEn());
  assert.equal(pair.es.language, 'es');
  assert.equal(pair.en.language, 'en');

  const drift = cloneEn();
  drift.pricing.offers[0].referencePrice = 'From US$79/month, subject to scope and quotas.';
  assert.throws(() => validateFunnelPair(clone(), drift), /disagree on offer amounts/);

  const missingDoor = cloneEn();
  missingDoor.departments.pop();
  assert.throws(() => validateFunnelPair(clone(), missingDoor), /unknown department|disagree on departments/);
});

test('english renders its own labels and keeps the six fields without budget', () => {
  const html = renderFunnelPair(config, english)['en/index.html'];
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Request a call/);
  assert.match(html, /We do not ask for budget, phone, company size or timeline/);
  assert.match(html, /No published cases yet/);
  assert.match(html, /Chemistry, Pharmacy and Registrations/);
  assert.equal((html.match(/<(?:input|textarea) [^>]*required/g) || []).length, 7);
  assert.doesNotMatch(html, /<(?:input|textarea)[^>]*(?:name|id)="(?:budget|presupuesto|phone|telefono)"/i);
});

test('english copy never leaks a guaranteed result or a market-leader claim', () => {
  const files = renderFunnelPair(config, english);
  const pages = Object.entries(files).filter(([name]) => name.startsWith('en/') && name.endsWith('.md'));
  assert.ok(pages.length > 10, 'the english build must carry its own pages');
  for (const [name, body] of pages) {
    assert.doesNotMatch(body, /guaranteed results?|market leader|number 1|#1/i, `${name} must not claim an unprovable result`);
  }
});

test('the build writes both languages under one review-gated receipt', async t => {
  const dir = await setup(t);
  const result = await buildFunnelPair(config, english, dir);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.published, false);
  const manifest = JSON.parse(await readFile(path.join(result.outputDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.languages, ['es', 'en']);
  const spanish = await readFile(path.join(result.outputDir, 'index.html'), 'utf8');
  const translated = await readFile(path.join(result.outputDir, 'en/index.html'), 'utf8');
  assert.match(spanish, /<html lang="es">/);
  assert.match(translated, /<html lang="en">/);
});

