// Official Explee Public API adapter. Secrets stay in Cloudflare env.
// This client exposes reads/search only; outreach mutations are deliberately
// not reachable until an explicit operational gate is configured.

const BASE = 'https://api.explee.com/public/api/v1';
const clean = (value, max = 240) => String(value || '').trim().slice(0, max);

export function expleeConfig(env = {}) {
  return {
    configured: Boolean(clean(env.EXPLEE_API_KEY)),
    projectId: clean(env.EXPLEE_PROJECT_ID, 120),
    outreachEnabled: String(env.EXPLEE_OUTREACH_ENABLED || '').toLowerCase() === 'true',
    searchEnabled: String(env.EXPLEE_SEARCH_ENABLED || '').toLowerCase() === 'true'
  };
}

export function createExpleeClient(env = {}, fetchImpl = fetch) {
  const key = clean(env.EXPLEE_API_KEY, 500);
  if (!key) throw Object.assign(new Error('EXPLEE_NOT_CONFIGURED'), { statusCode: 503 });
  const request = async (path, { method = 'GET', query = {}, body, idempotencyKey } = {}) => {
    const url = new URL(BASE + path);
    for (const [name, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
    const headers = { Accept: 'application/json', 'X-API-Key': key };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = clean(idempotencyKey, 160);
    const response = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error('EXPLEE_HTTP_' + response.status), { statusCode: response.status, details: data });
    return data;
  };
  return Object.freeze({
    campaigns: query => request('/autogtm/campaigns', { query }),
    projects: query => request('/autogtm/projects', { query }),
    hotLeads: query => request('/autogtm/hot-leads', { query }),
    campaign: id => request('/autogtm/campaigns/' + encodeURIComponent(clean(id, 120))),
    campaignLeads: (id, query) => request('/autogtm/campaigns/' + encodeURIComponent(clean(id, 120)) + '/leads', { query }),
    inbox: (projectId, query) => request('/autogtm/projects/' + encodeURIComponent(clean(projectId, 120)) + '/inbox', { query }),
    conversation: (campaignId, personId) => request('/autogtm/campaigns/' + encodeURIComponent(clean(campaignId, 120)) + '/inbox/' + encodeURIComponent(clean(personId, 160))),
    searchCompanies: (body, idempotencyKey) => request('/search/companies', { method: 'POST', body, idempotencyKey }),
    searchPeople: (body, idempotencyKey) => request('/search/people', { method: 'POST', body, idempotencyKey })
  });
}

export const EXPLEE_API_BASE = BASE;
