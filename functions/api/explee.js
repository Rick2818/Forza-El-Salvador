import { createExpleeClient, expleeConfig } from '../../src/explee_client.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const allowed = new Set(['campaigns', 'projects', 'hot-leads', 'campaign', 'leads', 'inbox', 'conversation', 'search-companies', 'search-people']);

function authorized(request, env) {
  const expected = String(env.EXPLEE_INTERNAL_TOKEN || '').trim();
  const supplied = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return Boolean(expected && supplied && supplied === expected);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'POST') return json({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  if (request.method === 'GET' && new URL(request.url).searchParams.get('action') === 'status') {
    const config = expleeConfig(env);
    return json({ success: true, provider: 'EXPLEE_OFFICIAL_API', ...config, mcpAvailable: false, outreachMutationRoute: 'disabled' });
  }
  if (!authorized(request, env)) return json({ success: false, code: 'EXPLEE_INTERNAL_AUTH_REQUIRED' }, 401);
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  if (!allowed.has(action)) return json({ success: false, code: 'EXPLEE_ACTION_NOT_ALLOWED' }, 403);
  const config = expleeConfig(env);
  if (action.startsWith('search-') && !config.searchEnabled) return json({ success: false, code: 'EXPLEE_SEARCH_DISABLED' }, 403);
  try {
    const api = createExpleeClient(env);
    let data;
    if (action === 'campaigns') data = await api.campaigns({ project_id: config.projectId, ...Object.fromEntries(url.searchParams) });
    else if (action === 'projects') data = await api.projects();
    else if (action === 'hot-leads') data = await api.hotLeads({ project_id: config.projectId, ...Object.fromEntries(url.searchParams) });
    else if (action === 'campaign') data = await api.campaign(url.searchParams.get('campaign_id'));
    else if (action === 'leads') data = await api.campaignLeads(url.searchParams.get('campaign_id'), Object.fromEntries(url.searchParams));
    else if (action === 'inbox') data = await api.inbox(url.searchParams.get('project_id') || config.projectId, Object.fromEntries(url.searchParams));
    else if (action === 'conversation') data = await api.conversation(url.searchParams.get('campaign_id'), url.searchParams.get('person_id'));
    else {
      const body = await request.json().catch(() => ({}));
      data = action === 'search-companies' ? await api.searchCompanies(body, request.headers.get('Idempotency-Key')) : await api.searchPeople(body, request.headers.get('Idempotency-Key'));
    }
    return json({ success: true, data });
  } catch (error) {
    return json({ success: false, code: String(error?.message || 'EXPLEE_REQUEST_FAILED').slice(0, 80) }, Number(error?.statusCode) || 502);
  }
}
