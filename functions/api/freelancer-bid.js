// Cloudflare Pages Function - /api/freelancer-bid
// Submits ONE Freelancer.com bid. Guarded: auth, write gate, duplicate check, monthly cap.
// Cost: 1 Freelancer bid credit per submission (free monthly allotment). No card charge.

const API = 'https://www.freelancer.com/api';
const MAX_MONTHLY_BIDS = 8;

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

  if (request.method !== 'POST') return json({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  if (String(env.LEO_PLATFORM_WRITE_ENABLED || '').toLowerCase() !== 'true') {
    return json({ success: false, code: 'LEO_PLATFORM_WRITE_DISABLED' }, 403);
  }
  if (String(env.FREELANCER_API_ENABLED || '').toLowerCase() !== 'true') {
    return json({ success: false, code: 'FREELANCER_NOT_AUDITED' }, 403);
  }

  const token = String(env.FREELANCER_OAUTH_TOKEN || '').trim();
  if (!token) return json({ success: false, code: 'FREELANCER_CREDENTIALS_MISSING' }, 503);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, code: 'BODY_INVALID' }, 400);
  }

  const projectId = Number(body.projectId);
  const amount = Number(body.amount);
  const period = Math.min(Math.max(Number(body.period) || 7, 1), 90);
  const description = String(body.description || '').trim().slice(0, 1500);
  const milestone = Math.min(Math.max(Number(body.milestonePercentage) || 100, 1), 100);

  if (!Number.isInteger(projectId) || projectId <= 0) return json({ success: false, code: 'PROJECT_ID_REQUIRED' }, 400);
  if (!Number.isFinite(amount) || amount <= 0) return json({ success: false, code: 'AMOUNT_REQUIRED' }, 400);
  if (description.length < 40) return json({ success: false, code: 'DESCRIPTION_TOO_SHORT' }, 400);

  const headers = { 'Freelancer-OAuth-V1': token, Accept: 'application/json' };

  try {
    const selfRes = await fetch(`${API}/users/0.1/self/`, { headers, signal: AbortSignal.timeout(12000) });
    const self = await selfRes.json().catch(() => null);
    const bidderId = Number(self?.result?.id);
    if (!bidderId) {
      return json({
        success: false,
        code: 'FREELANCER_SELF_UNAVAILABLE',
        httpStatus: selfRes.status,
        detail: self?.message || self?.error_code || null
      }, 502);
    }

    const existingRes = await fetch(`${API}/projects/0.1/bids/?projects[]=${projectId}&bidders[]=${bidderId}&limit=1`, {
      headers,
      signal: AbortSignal.timeout(12000)
    });
    const existing = await existingRes.json().catch(() => null);
    if (existingRes.status === 401 || existingRes.status === 403) {
      return json({
        success: false,
        code: 'FREELANCER_SCOPE_OR_AUTH_REJECTED',
        httpStatus: existingRes.status,
        message: existing?.message ?? null,
        submitted: false
      }, 403);
    }
    if (!existingRes.ok) {
      return json({
        success: false,
        code: 'FREELANCER_DUPLICATE_CHECK_FAILED',
        httpStatus: existingRes.status,
        errorCode: existing?.error_code ?? null,
        message: existing?.message ?? null,
        submitted: false
      }, 503);
    }
    if (Array.isArray(existing?.result?.bids) && existing.result.bids.length > 0) {
      return json({ success: false, code: 'FREELANCER_DUPLICATE_BID', bidId: existing.result.bids[0].id ?? null }, 409);
    }

    // Tope mensual: cuenta las propuestas del mes en curso antes de gastar el crédito.
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthStartSeconds = Math.floor(monthStart.getTime() / 1000);
    const historyRes = await fetch(`${API}/projects/0.1/bids/?bidders[]=${bidderId}&limit=100&offset=0`, {
      headers,
      signal: AbortSignal.timeout(12000)
    });
    const history = await historyRes.json().catch(() => null);
    const bidsThisMonth = Array.isArray(history?.result?.bids)
      ? history.result.bids.filter((bid) => Number(bid?.time_submitted) >= monthStartSeconds).length
      : null;
    if (bidsThisMonth !== null && bidsThisMonth >= MAX_MONTHLY_BIDS) {
      return json({
        success: false,
        code: 'FREELANCER_MONTHLY_LIMIT_REACHED',
        bidsThisMonth,
        limit: MAX_MONTHLY_BIDS,
        submitted: false
      }, 429);
    }

    const bidRes = await fetch(`${API}/projects/0.1/bids/`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        bidder_id: bidderId,
        amount,
        period,
        milestone_percentage: milestone,
        description
      }),
      signal: AbortSignal.timeout(20000)
    });
    const bidBody = await bidRes.json().catch(() => null);

    if (!bidRes.ok || bidBody?.status !== 'success') {
      return json({
        success: false,
        code: bidRes.status === 401 || bidRes.status === 403 ? 'FREELANCER_SCOPE_OR_AUTH_REJECTED' : 'FREELANCER_BID_FAILED',
        httpStatus: bidRes.status,
        errorCode: bidBody?.error_code ?? null,
        message: bidBody?.message ?? null,
        submitted: false
      }, 502);
    }

    return json({
      success: true,
      submitted: true,
      receipt: {
        bidId: bidBody?.result?.id ?? null,
        projectId,
        amount,
        period,
        milestonePercentage: milestone,
        bidderId,
        receivedAt: new Date().toISOString(),
        provider: 'freelancer.com',
        source: 'freelancer_official_api'
      },
      costUSD: 0,
      creditsUsed: 1
    });
  } catch (error) {
    return json({ success: false, code: 'FREELANCER_REQUEST_FAILED', detail: String(error?.message || error).slice(0, 200) }, 502);
  }
}
