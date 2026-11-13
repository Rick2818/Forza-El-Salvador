// Cloudflare Pages Function - /api/freelancer-check
// Read-only diagnostic: who is the token, and does it have bid scope?
import { createLeoPlatformConnector } from '../../src/leo_platform_connectors.mjs';

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

  const token = String(env.FREELANCER_OAUTH_TOKEN || '').trim();
  if (!token) return json({ success: false, code: 'FREELANCER_CREDENTIALS_MISSING' }, 503);

  const call = async (path, params = {}) => {
    const url = new URL(path, 'https://www.freelancer.com/api');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url, {
      headers: { 'Freelancer-OAuth-V1': token, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { http: res.status, body };
  };

  try {
    const self = await call('/api/users/0.1/self/');
    const bids = await call('/api/projects/0.1/bids/', { limit: 1, offset: 0 });

    let projectsProbe = null;
    try {
      const projectUrl = new URL('https://www.freelancer.com/api/projects/0.1/projects/active/');
      projectUrl.searchParams.set('query', 'automation');
      projectUrl.searchParams.set('limit', '3');
      const projectRes = await fetch(projectUrl, {
        redirect: 'error',
        headers: { 'Freelancer-OAuth-V1': token, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000)
      });
      const text = await projectRes.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      projectsProbe = {
        http: projectRes.status,
        contentType: projectRes.headers.get('content-type'),
        isJson: Boolean(parsed),
        projectsFound: parsed?.result?.projects?.length ?? null,
        firstChars: parsed ? null : text.slice(0, 160)
      };
    } catch (error) {
      projectsProbe = { error: String(error?.message || error).slice(0, 200) };
    }

    const me = self.body?.result || {};
    return json({
      success: true,
      self: {
        http: self.http,
        id: me.id ?? null,
        username: me.username ?? null,
        emailVerified: me.email_verified ?? null,
        country: me.country?.name ?? null,
        primaryCurrency: me.primary_currency?.code ?? null
      },
      bidsScope: {
        http: bids.http,
        errorCode: bids.body?.error_code ?? null,
        message: bids.body?.message ?? null,
        canReadBids: bids.http === 200 && bids.body?.status === 'success'
      },
      projectsProbe
    });
  } catch (error) {
    return json({ success: false, code: 'FREELANCER_PROBE_FAILED', detail: String(error?.message || error).slice(0, 200) }, 502);
  }
}
