// Cloudflare Pages Function - /api/freelancer-skills
// Loads a FIXED allowlist of demonstrable skills into the Freelancer profile.
// Guarded: bearer auth, write gate, provider flag, fixed IDs (no arbitrary writes).
// GET  -> preview: current profile skills vs allowlist (no write).
// POST -> apply:   merges the allowlist into the profile and verifies the result.

const API = 'https://www.freelancer.com/api';

// Only skills with verifiable backing in this repository. Names and IDs were
// checked against GET /api/projects/0.1/jobs/ (3,490 registered skills, 13 nov 2026).
const SKILL_ALLOWLIST = Object.freeze([
  { id: 3028, name: 'AI Agents', evidence: 'agents runtime in src/leo_*.mjs' },
  { id: 2917, name: 'AI Chatbot', evidence: 'WhatsApp Cloud API + Telegram bot handlers' },
  { id: 3101, name: 'LLM Integration', evidence: 'Gemini/Groq/Workers AI provider chain' },
  { id: 3283, name: 'Supabase', evidence: 'durable queue migrations and atomic RPC' },
  { id: 2205, name: 'Cloudflare', evidence: 'Pages Functions, scheduled Worker, KV' },
  { id: 2380, name: 'Telegram API', evidence: 'webhook with secret validation' }
]);

// Declared now, kept in the profile. Listed only so the receipt can show them.
const KEPT_SKILLS = Object.freeze([38, 500, 1023, 1977, 2164, 2165]);

// Not declared yet: n8n (3112) needs a recorded demo before it becomes a public claim.
const PENDING_SKILLS = Object.freeze([{ id: 3112, name: 'n8n', reason: 'requires a 2-minute recorded demo' }]);

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

function readJobs(profile) {
  return (Array.isArray(profile?.jobs) ? profile.jobs : [])
    .map((job) => ({ id: Number(job?.id) || null, name: job?.name ?? null }))
    .filter((job) => Number.isInteger(job.id) && job.id > 0);
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  const expected = String(env.LEO_PLATFORM_TOKEN || '').trim();
  if (!expected) return json({ success: false, code: 'LEO_PLATFORM_AUTH_NOT_CONFIGURED' }, 503);

  const authorization = String(request.headers.get('authorization') || '');
  const supplied = /^Bearer /i.test(authorization) ? authorization.slice(7).trim() : '';
  if (!safeEqual(supplied, expected)) return json({ success: false, code: 'LEO_PLATFORM_AUTH_REQUIRED' }, 401);

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }
  if (String(env.FREELANCER_API_ENABLED || '').toLowerCase() !== 'true') {
    return json({ success: false, code: 'FREELANCER_NOT_AUDITED' }, 403);
  }

  const token = String(env.FREELANCER_OAUTH_TOKEN || '').trim();
  if (!token) return json({ success: false, code: 'FREELANCER_CREDENTIALS_MISSING' }, 503);

  const headers = { 'Freelancer-OAuth-V1': token, Accept: 'application/json' };

  const readSelf = async () => {
    const res = await fetch(`${API}/users/0.1/self/?jobs=true&country=true&currency=true`, {
      headers,
      signal: AbortSignal.timeout(15000)
    });
    const body = await res.json().catch(() => null);
    return { http: res.status, body, profile: body?.result || null };
  };

  try {
    const before = await readSelf();
    if (before.http !== 200 || !before.profile) {
      return json({
        success: false,
        code: 'FREELANCER_SELF_UNAVAILABLE',
        httpStatus: before.http,
        errorCode: before.body?.error_code ?? null,
        message: before.body?.message ?? null
      }, 502);
    }

    const current = readJobs(before.profile);
    const currentIds = new Set(current.map((job) => job.id));
    const missing = SKILL_ALLOWLIST.filter((skill) => !currentIds.has(skill.id));
    const base = {
      success: true,
      profile: { id: before.profile.id ?? null, username: before.profile.username ?? null },
      current,
      allowlist: SKILL_ALLOWLIST,
      missing,
      pending: PENDING_SKILLS
    };

    if (request.method === 'GET') return json({ ...base, mode: 'PREVIEW', written: false });

    if (String(env.LEO_PLATFORM_WRITE_ENABLED || '').toLowerCase() !== 'true') {
      return json({ ...base, mode: 'PREVIEW', written: false, code: 'LEO_PLATFORM_WRITE_DISABLED' }, 403);
    }

    // Nothing to add: report without touching the provider.
    if (missing.length === 0) {
      return json({ ...base, mode: 'APPLY', written: false, code: 'FREELANCER_SKILLS_ALREADY_PRESENT' });
    }

    const targetIds = [...new Set([...currentIds, ...SKILL_ALLOWLIST.map((skill) => skill.id)])];
    const attempts = [];

    const attempt = async (label, init, path = '/users/0.1/self/jobs') => {
      const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) }, signal: AbortSignal.timeout(20000) });
      const body = await res.json().catch(() => null);
      attempts.push({
        label,
        httpStatus: res.status,
        status: body?.status ?? null,
        errorCode: body?.error_code ?? null,
        message: body?.message ?? null
      });
      return { ok: res.ok && body?.status === 'success', httpStatus: res.status, body };
    };

    // Documented route: /users/0.1/self/jobs. Freelancer rejects JSON on this
    // endpoint: it expects application/x-www-form-urlencoded with repeated
    // "jobs[]" keys. POST adds, PUT replaces. Both attempts send the full target
    // list, so no already declared skill can be dropped.
    const formBody = (ids) => {
      const params = new URLSearchParams();
      for (const id of ids) params.append('jobs[]', String(id));
      return params.toString();
    };

    let result = await attempt('POST_SELF_JOBS_FORM', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody(targetIds)
    });
    let formUsed = true;

    if (!result.ok) {
      result = await attempt('PUT_SELF_JOBS_FORM', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody(targetIds)
      });
    }

    if (!result.ok) {
      result = await attempt('PUT_SELF_JOBS_JSON', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'jobs[]': targetIds })
      });
      formUsed = false;
    }

    const after = await readSelf();
    const afterJobs = readJobs(after.profile);
    const afterIds = new Set(afterJobs.map((job) => job.id));
    const applied = SKILL_ALLOWLIST.filter((skill) => afterIds.has(skill.id));

    if (!result?.ok) {
      return json({
        ...base,
        mode: 'APPLY',
        written: false,
        code: 'FREELANCER_PROFILE_WRITE_REJECTED',
        httpStatus: result?.httpStatus ?? null,
        errorCode: result?.body?.error_code ?? attempts[attempts.length - 1]?.errorCode ?? null,
        message: result?.body?.message ?? null,
        attempts,
        verification: { httpStatus: after.http, skillsNow: afterJobs, appliedCount: applied.length }
      }, 502);
    }

    return json({
      ...base,
      mode: 'APPLY',
      written: true,
      code: 'FREELANCER_SKILLS_WRITTEN',
      usedFormEncoding: formUsed,
      attempts,
      verification: { httpStatus: after.http, skillsNow: afterJobs, appliedCount: applied.length },
      receipt: {
        provider: 'freelancer.com',
        source: 'freelancer_official_api',
        profileId: before.profile.id ?? null,
        requestedIds: targetIds,
        appliedIds: applied.map((skill) => skill.id),
        beforeIds: [...currentIds],
        afterIds: [...afterIds],
        receivedAt: new Date().toISOString()
      },
      costUSD: 0
    });
  } catch (error) {
    return json({ success: false, code: 'FREELANCER_REQUEST_FAILED', detail: String(error?.message || error).slice(0, 200) }, 502);
  }
}
