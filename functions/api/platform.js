// Cloudflare Pages Function - /api/platform
// Read-only bridge between Leo and Upwork / Freelancer. Requires a bearer token.
import { createLeoPlatformConnector } from '../../src/leo_platform_connectors.mjs';

const ALLOWED = new Set(['status', 'upwork_accounts', 'upwork_jobs', 'freelancer_projects', 'freelancer_project']);

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function safeEqual(left, right) {
  const a = String(left);
  const b = String(right);
  if (!a || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  const expected = String(env.LEO_PLATFORM_TOKEN || '').trim();
  if (!expected) return json({ success: false, code: 'LEO_PLATFORM_AUTH_NOT_CONFIGURED' }, 503);

  const authorization = String(request.headers.get('authorization') || '');
  const supplied = /^Bearer /i.test(authorization) ? authorization.slice(7).trim() : '';
  if (!safeEqual(supplied, expected)) return json({ success: false, code: 'LEO_PLATFORM_AUTH_REQUIRED' }, 401);
  if (!['GET', 'POST'].includes(request.method)) return json({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405);

  let body = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      return json({ success: false, code: 'LEO_PLATFORM_BODY_INVALID' }, 400);
    }
  }

  const url = new URL(request.url);
  const action = String(body.action || url.searchParams.get('action') || 'status');
  if (!ALLOWED.has(action)) return json({ success: false, code: 'LEO_PLATFORM_ACTION_NOT_ALLOWED' }, 403);

  try {
    const connector = createLeoPlatformConnector({ tenantId: 'boltech', env });
    if (action === 'status') return json({ success: true, ...connector.status() });

    const language = String(body.language || 'es');
    if (action === 'upwork_accounts') {
      const result = await connector.invoke('upwork_accounts', {});
      return json({ success: result.ok, result });
    }
    if (action === 'freelancer_project') {
      const result = await connector.invoke('freelancer_project', { projectId: Number(body.projectId), language });
      return json({ success: result.ok, result });
    }

    const tool = action === 'upwork_jobs' ? 'upwork_find_jobs' : 'freelancer_find_projects';
    const result = await connector.invoke(tool, {
      query: String(body.query || (tool === 'upwork_find_jobs' ? 'n8n' : 'automation')),
      limit: Number(body.limit) || 5,
      language
    });
    return json({ success: result.ok, result });
  } catch (error) {
    const raw = String(error?.code || '');
    const code = /^LEO_PLATFORM_[A-Z0-9_]+$/.test(raw) ? raw : 'LEO_PLATFORM_REQUEST_FAILED';
    console.error('[LEO PLATFORM]', code);
    return json({ success: false, code }, code === 'LEO_PLATFORM_DAILY_LIMIT_REACHED' ? 429 : 403);
  }
}
