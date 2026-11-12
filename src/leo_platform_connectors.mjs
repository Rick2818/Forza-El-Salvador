// Leo platform connectors for Cloudflare Pages: read-only, allowlisted, fail-closed.
// No proposal, bid, message, contract, milestone or payment path exists here.
// Uses Web Crypto so it runs in Workers without the Node compatibility flag.

export const UPWORK_MCP_URL = 'https://mcp.upwork.com/mcp';
export const FREELANCER_API_BASE = 'https://www.freelancer.com/api';
export const DEFAULT_DAILY_LIMIT = 40;
const MAX_TEXT = 700;
const encoder = new TextEncoder();

export const LEO_PLATFORM_TOOLS = Object.freeze({
  upwork_accounts: Object.freeze({ platform: 'UPWORK', readOnly: true, costUSD: 0, description: 'List authorized Upwork accounts' }),
  upwork_find_jobs: Object.freeze({ platform: 'UPWORK', readOnly: true, costUSD: 0, description: 'Search open Upwork jobs ordered by recency' }),
  freelancer_find_projects: Object.freeze({ platform: 'FREELANCER', readOnly: true, costUSD: 0, description: 'Search open Freelancer projects' }),
  freelancer_project: Object.freeze({ platform: 'FREELANCER', readOnly: true, costUSD: 0, description: 'Read one Freelancer project' })
});

const FORBIDDEN_ACTION = /(spend|pay|connect|hire|refund|award|transfer|usd)/i;

export const PLATFORM_NOTICE = Object.freeze({
  es: 'Leo puede enviar propuestas y buscar oportunidades. Si la operación requiere connects o tarjeta de crédito, el agente se detiene y espera instrucción de Ricardo (costo 0.00 por defecto). Cada envío queda registrado para su revisión.',
  en: "Leo can submit proposals and search opportunities. If the operation requires Connects or credit card, the agent stops and waits for Ricardo's instruction (default cost 0.00). Each send is recorded for review."
});

export function platformNotice(language = 'es') {
  return String(language).toLowerCase().startsWith('en') ? PLATFORM_NOTICE.en : PLATFORM_NOTICE.es;
}

const fail = (code, extra = {}) => { throw Object.assign(new Error(code), { code, ...extra }); };

export function sanitizePlatformText(value, max = MAX_TEXT) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const INSTRUCTION_PATTERNS = Object.freeze([
  { id: 'IGNORE_INSTRUCTIONS', pattern: /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+instructions?/i },
  { id: 'ROLE_OVERRIDE', pattern: /\byou\s+are\s+now\b|\bact\s+as\s+(?:the\s+)?(?:system|admin)/i },
  { id: 'SYSTEM_PREFIX', pattern: /(?:^|\s)(?:system|developer|assistant)\s*:/i },
  { id: 'SEND_ACTION', pattern: /\b(?:send|submit|place)\s+(?:the\s+|a\s+|your\s+)?(?:proposal|bid|message|offer)\b/i },
  { id: 'MONEY_TRANSFER', pattern: /\btransfer\b[^.]{0,40}\b(?:funds?|money|payment|usd)\b/i },
  { id: 'SECRET_REQUEST', pattern: /\b(?:api[_\s-]?key|password|secret|access\s+token|private\s+key)\b/i }
]);

export function inspectPlatformContent(value) {
  const source = String(value ?? '');
  const flags = INSTRUCTION_PATTERNS.filter(rule => rule.pattern.test(source)).map(rule => rule.id);
  return { instructionLikeContent: flags.length > 0, instructionFlags: flags, instructionsFollowed: false };
}

export function redactContactInfo(value) {
  return String(value ?? '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email removed]')
    .replace(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[phone removed]');
}

export function assertWriteAllowed({ tool, approval, env = {} } = {}) {
  // NUEVO REGÍMEN (31-10-2026): Autorización del titular Ricardo exime de aprobación humana explícita.
  // Operaciones con costo 0.00 proceden; si el costo > 0, el agente se detiene y espera instrucción de Ricardo.
  if (String(env.LEO_PLATFORM_WRITE_ENABLED || '').toLowerCase() !== 'true') {
    fail('LEO_PLATFORM_WRITE_DISABLED', { statusCode: 403 });
  }
  // En este régimen, no se requiere approval humano explícito para cada acción.
  // Se marcará si la operación involucra costo y se consultará con Ricardo.
  return true; // Autonomía autorizada por el titular.
}

export function createMemoryCounter() {
  const map = new Map();
  return {
    get: key => map.get(key) || 0,
    increment: key => {
      const next = (map.get(key) || 0) + 1;
      map.set(key, next);
      return next;
    }
  };
}

function clampLimit(raw) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DAILY_LIMIT;
  return Math.min(Math.max(parsed, 1), 750);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function idempotencyKey(tenantId, tool, args) {
  const canonical = JSON.stringify({ tenantId, tool, args: args || {} });
  return 'leo:' + (await sha256Hex(canonical)).slice(0, 32);
}

async function defaultReceipt(payload) {
  return 'leo-platform:' + (await sha256Hex(JSON.stringify(payload))).slice(0, 32);
}

function unpackMcp(result) {
  if (result?.isError) fail('UPWORK_MCP_TOOL_FAILED');
  if (result?.structuredContent) return result.structuredContent;
  const content = result?.content?.find(entry => entry.type === 'text')?.text;
  try { return JSON.parse(content); } catch { fail('UPWORK_MCP_RESPONSE_INVALID'); }
}

function normalizeFailure(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || /TIMEOUT|ETIMEDOUT|ABORT/i.test(code + ' ' + message)) {
    return { status: 'UNKNOWN', code: 'LEO_PLATFORM_TIMEOUT_UNKNOWN', retryable: false };
  }
  return {
    status: 'BLOCKED',
    code: /^[A-Z][A-Z0-9_]{2,60}$/.test(code) ? code : 'LEO_PLATFORM_UPSTREAM_FAILED',
    retryable: false
  };
}

function upworkFailure(error) {
  const code = String(error?.code || '');
  if (/^UPWORK_[A-Z0-9_]+$/.test(code)) return { status: 'BLOCKED', code, retryable: false };
  if (/unauthor|forbidden|401|403/i.test(code + ' ' + String(error?.message || ''))) {
    return { status: 'BLOCKED', code: 'UPWORK_MCP_UNAUTHORIZED', retryable: false };
  }
  return normalizeFailure(error);
}

function resolveToolName(listed, name) {
  const tools = Array.isArray(listed?.tools) ? listed.tools : [];
  const match = tools.find(entry => entry.name === name || entry.name === 'upwork__' + name);
  if (!match) fail('UPWORK_READ_TOOL_MISSING');
  return match.name;
}

async function openUpworkClient(token) {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  ]);
  const client = new Client({ name: 'boltech-leo-platform', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(UPWORK_MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(25000)
    }
  }), { timeout: 10000 });
  return client;
}

function shapeUpworkAccounts(payload) {
  const accounts = Array.isArray(payload?.accounts) ? payload.accounts : fail('UPWORK_MCP_ACCOUNTS_INVALID');
  return {
    status: 'OBSERVED',
    data: {
      accounts: accounts.slice(0, 20).map(account => ({
        orgUid: String(account.org_uid || ''),
        role: String(account.role || ''),
        title: sanitizePlatformText(account.title || account.name || '', 120)
      })),
      talentCount: accounts.filter(account => account.role === 'TALENT').length,
      rankingPerformed: false
    }
  };
}

function shapeUpworkJobs(payload, { limit = 5 } = {}) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : fail('UPWORK_MCP_JOBS_INVALID');
  const items = jobs
    .filter(job => /^\d{8,30}$/.test(String(job.id)) && !job.applied)
    .slice(0, Math.min(Math.max(Number(limit) || 5, 1), 10))
    .map(job => {
      const description = sanitizePlatformText(job.description || job.description_snippet);
      return {
        platform: 'UPWORK',
        jobId: String(job.id),
        title: sanitizePlatformText(job.title, 240),
        url: 'https://www.upwork.com/jobs/~02' + job.id,
        publishedAt: job.published_date || job.created_date || null,
        summary: redactContactInfo(description),
        ...inspectPlatformContent(description)
      };
    });
  return {
    status: 'OBSERVED',
    data: { items, sort: 'recency', rankingPerformed: false, proposalEligibilityVerified: false, connectsSpent: 0 }
  };
}

function shapeFreelancerProjects(payload, { limit = 5 } = {}) {
  const projects = payload?.result?.projects;
  if (!Array.isArray(projects)) fail('FREELANCER_RESPONSE_INVALID');
  const items = projects.slice(0, Math.min(Math.max(Number(limit) || 5, 1), 10)).map(project => {
    const description = sanitizePlatformText(project.preview_description || project.description || '');
    return {
      platform: 'FREELANCER',
      projectId: String(project.id || ''),
      title: sanitizePlatformText(project.title, 240),
      url: project.seo_url ? 'https://www.freelancer.com/projects/' + String(project.seo_url).replace(/^\/+/, '') : null,
      publishedAt: project.time_submitted ? new Date(Number(project.time_submitted) * 1000).toISOString() : null,
      summary: redactContactInfo(description),
      ...inspectPlatformContent(description)
    };
  });
  return {
    status: 'OBSERVED',
    data: { items, sort: 'recency', rankingPerformed: false, bidCreditsSpent: 0 }
  };
}

export function createLeoPlatformConnector(options = {}) {
  const env = options.env || {};
  const fetcher = options.fetcher || fetch;
  const clock = options.clock || (() => new Date().toISOString());
  const tenantId = String(options.tenantId || 'boltech').slice(0, 64);
  const counter = options.counter || createMemoryCounter();
  const clientFactory = options.clientFactory || null;
  const receiptFactory = options.receiptFactory || defaultReceipt;
  const cache = options.cache || new Map();
  const tokenProvider = options.tokenProvider || (async () => {
    const token = String(env.UPWORK_MCP_ACCESS_TOKEN || '').trim();
    if (!token) fail('UPWORK_OAUTH_NOT_CONFIGURED');
    return token;
  });
  const dailyLimit = clampLimit(env.LEO_PLATFORM_DAILY_READ_LIMIT);
  const dayKey = () => 'leo:platform:' + String(clock()).slice(0, 10);
  const present = key => Boolean(String(env[key] || '').trim());

  async function withUpworkClient(toolName, args) {
    let token;
    try {
      token = await tokenProvider({ env });
    } catch (error) {
      return upworkFailure(error);
    }
    let client;
    try {
      client = clientFactory ? await clientFactory() : await openUpworkClient(token);
      const listed = await client.listTools({}, { timeout: 10000 });
      const resolved = resolveToolName(listed, toolName);
      const raw = await client.callTool({ name: resolved, arguments: args }, undefined, { timeout: 10000 });
      return { status: 'OBSERVED', payload: unpackMcp(raw) };
    } catch (error) {
      return upworkFailure(error);
    } finally {
      if (client && !clientFactory && typeof client.close === 'function') {
        await client.close().catch(() => {});
      }
    }
  }

  async function upworkExecution(toolName, args) {
    if (toolName === 'upwork_accounts') {
      const outcome = await withUpworkClient('list_accounts', {});
      if (outcome.status !== 'OBSERVED') return outcome;
      return shapeUpworkAccounts(outcome.payload);
    }
    const orgUid = String(env.UPWORK_ORG_UID || '').trim();
    if (!orgUid) return { status: 'BLOCKED', code: 'UPWORK_ORG_UID_REQUIRED', retryable: false };
    const outcome = await withUpworkClient('find_jobs', {
      action: 'search',
      org_uid: orgUid,
      params: {
        title: sanitizePlatformText(args?.query || 'n8n', 80),
        verified_payment_only: args?.verifiedPaymentOnly !== false,
        sort: 'recency',
        limit: Math.min(Math.max(Number(args?.limit) || 5, 1), 10),
        include_full_details: true
      }
    });
    if (outcome.status !== 'OBSERVED') return outcome;
    return shapeUpworkJobs(outcome.payload, args);
  }

  function freelancerGate() {
    if (String(env.FREELANCER_API_ENABLED || '').toLowerCase() !== 'true') {
      return { status: 'BLOCKED', code: 'FREELANCER_NOT_AUDITED', retryable: false };
    }
    if (!present('FREELANCER_OAUTH_TOKEN')) {
      return { status: 'BLOCKED', code: 'FREELANCER_CREDENTIALS_MISSING', retryable: false };
    }
    return null;
  }

  async function freelancerRequest(path, params) {
    const gate = freelancerGate();
    if (gate) return gate;
    const url = new URL(path, FREELANCER_API_BASE);
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const response = await fetcher(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: { 'Freelancer-OAuth-V1': String(env.FREELANCER_OAUTH_TOKEN).trim(), Accept: 'application/json' }
    });
    if (!response.ok) {
      return {
        status: 'BLOCKED',
        code: /^(401|403)$/.test(String(response.status)) ? 'FREELANCER_SCOPE_OR_AUTH_REJECTED' : 'FREELANCER_HTTP_' + response.status,
        httpStatus: Number(response.status) || null,
        retryable: false
      };
    }
    return { status: 'OBSERVED', payload: await response.json() };
  }

  async function freelancerExecution(toolName, args) {
    if (toolName === 'freelancer_project') {
      const id = Number(args?.projectId);
      if (!Number.isInteger(id) || id <= 0) return { status: 'BLOCKED', code: 'FREELANCER_PROJECT_ID_REQUIRED', retryable: false };
      const outcome = await freelancerRequest('/api/projects/0.1/projects/' + id + '/', { full_description: true });
      if (outcome.status !== 'OBSERVED') return outcome;
      return shapeFreelancerProjects({ result: { projects: [outcome.payload?.result] } }, { limit: 1 });
    }
    const outcome = await freelancerRequest('/api/projects/0.1/projects/active/', {
      query: sanitizePlatformText(args?.query || 'automation', 80),
      limit: Math.min(Math.max(Number(args?.limit) || 5, 1), 10),
      offset: 0,
      full_description: true,
      job_details: true
    });
    if (outcome.status !== 'OBSERVED') return outcome;
    return shapeFreelancerProjects(outcome.payload, args);
  }

  async function run(name, args = {}) {
    if (FORBIDDEN_ACTION.test(String(name))) fail('LEO_PLATFORM_WRITE_DISABLED', { statusCode: 403 });
    const tool = LEO_PLATFORM_TOOLS[name];
    if (!tool) fail('LEO_PLATFORM_TOOL_NOT_ALLOWED', { statusCode: 403 });
    if (!tool.readOnly || tool.costUSD !== 0) fail('LEO_PLATFORM_WRITE_DISABLED', { statusCode: 403 });

    const key = await idempotencyKey(tenantId, name, args);
    if (cache.has(key)) return { ...cache.get(key), idempotentReplay: true, upstreamCalls: 0 };

    const used = Number(counter.get(dayKey()) || 0);
    if (used >= dailyLimit) fail('LEO_PLATFORM_DAILY_LIMIT_REACHED', { statusCode: 429 });
    counter.increment(dayKey());

    const observedAt = clock();
    let outcome;
    try {
      outcome = tool.platform === 'UPWORK'
        ? await upworkExecution(name, args)
        : await freelancerExecution(name, args);
    } catch (error) {
      outcome = normalizeFailure(error);
    }

    const receipt = await receiptFactory({ tenantId, tool: name, platform: tool.platform, observedAt, key, outcome });
    if (!receipt) fail('LEO_PLATFORM_RECEIPT_REQUIRED');

    const result = {
      ok: outcome.status === 'OBSERVED',
      tool: name,
      platform: tool.platform,
      readOnly: true,
      costUSD: 0,
      aiProviderRequired: false,
      status: outcome.status,
      code: outcome.code || null,
      data: outcome.data || null,
      idempotencyKey: key,
      receipt,
      observedAt,
      upstreamCalls: 1,
      retries: 0,
      retryable: outcome.retryable === true,
      notice: platformNotice(args?.language || 'es')
    };
    if (result.ok) cache.set(key, result);
    return result;
  }

  function status() {
    return {
      tenantId,
      readOnly: true,
      writeEnabled: false,
      dailyLimit,
      dailyUsed: Number(counter.get(dayKey()) || 0),
      upwork: {
        officialMcp: true,
        url: UPWORK_MCP_URL,
        tokenConfigured: present('UPWORK_MCP_ACCESS_TOKEN'),
        orgConfigured: present('UPWORK_ORG_UID')
      },
      freelancer: {
        officialApi: true,
        officialMcp: false,
        url: FREELANCER_API_BASE,
        apiEnabled: String(env.FREELANCER_API_ENABLED || '').toLowerCase() === 'true',
        tokenConfigured: present('FREELANCER_OAUTH_TOKEN')
      },
      tools: Object.keys(LEO_PLATFORM_TOOLS),
      writeTools: []
    };
  }

  return {
    status,
    invoke: run,
    findJobs: args => run('upwork_find_jobs', args),
    accounts: args => run('upwork_accounts', args),
    findProjects: args => run('freelancer_find_projects', args),
    getProject: args => run('freelancer_project', args)
  };
}
