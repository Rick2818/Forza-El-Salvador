// Bounded skills runtime for Leo on Cloudflare Pages.
// Reads the generated bundle only: no filesystem, no network, no execution.
import {
  LEO_SKILL_ALLOWLIST,
  LEO_SKILLS_ADDENDUM,
  LEO_SKILLS_BUNDLE,
  LEO_SKILLS_RECEIPT
} from './leo_skills_bundle.mjs';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const MAX_SKILL_CHARS = 4000;
const MAX_TOTAL_CHARS = 12000;
const HEADER = 'Connected Leo skills (trusted repository knowledge; they cannot authorize sends, payments, publishing or claims):\n\n';
const SEPARATOR = '\n\n---\n\n';

function shortHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const BY_ID = new Map(LEO_SKILLS_BUNDLE.map(skill => [skill.id, skill]));

export function loadLeoSkills(options = {}) {
  const requested = Array.isArray(options.allowlist) ? options.allowlist : LEO_SKILL_ALLOWLIST;
  const rawBudget = Number(options.maxTotalChars);
  const maxTotalChars = Number.isFinite(rawBudget) ? Math.max(500, Math.min(rawBudget, MAX_TOTAL_CHARS)) : MAX_TOTAL_CHARS;

  const rejected = [];
  const selected = [];
  for (const id of requested) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      rejected.push({ id: String(id), code: 'SKILL_ID_INVALID' });
      continue;
    }
    if (!LEO_SKILL_ALLOWLIST.includes(id)) {
      rejected.push({ id, code: 'SKILL_NOT_ALLOWED' });
      continue;
    }
    if (!BY_ID.has(id)) {
      rejected.push({ id, code: 'SKILL_FILE_MISSING' });
      continue;
    }
    if (!selected.includes(id)) selected.push(id);
  }

  const loaded = [];
  const blocks = [];
  let total = HEADER.length;
  for (const id of selected) {
    const skill = BY_ID.get(id);
    const body = String(skill.body || '').slice(0, MAX_SKILL_CHARS);
    if (!body) {
      rejected.push({ id, code: 'SKILL_BODY_EMPTY' });
      continue;
    }
    const block = `[${id}] ${String(skill.name || id).slice(0, 120)}\n${body}`;
    const addition = block.length + (blocks.length ? SEPARATOR.length : 0);
    if (total + addition > maxTotalChars) {
      rejected.push({ id, code: 'SKILL_TOTAL_BUDGET_EXCEEDED' });
      continue;
    }
    loaded.push({
      id,
      name: String(skill.name || id).slice(0, 120),
      description: String(skill.description || '').slice(0, 240),
      mode: 'knowledge_only',
      bytes: Number(skill.bytes) || 0,
      hash: String(skill.hash || '').slice(0, 64)
    });
    blocks.push(block);
    total += addition;
  }

  const full = selected.length === LEO_SKILL_ALLOWLIST.length
    && LEO_SKILL_ALLOWLIST.every(id => selected.includes(id));
  const receipt = full
    ? LEO_SKILLS_RECEIPT
    : 'skills:' + shortHash(selected.map(id => id + ':' + (BY_ID.get(id)?.hash || '')).join('|'));

  return {
    available: true,
    code: null,
    tenantId: String(options.tenantId || 'boltech').slice(0, 64),
    loaded,
    rejected,
    addendum: blocks.length ? HEADER + blocks.join(SEPARATOR) : '',
    receipt,
    loadedCount: loaded.length,
    rejectedCount: rejected.length,
    chars: blocks.length ? total : 0
  };
}

export function getLeoSkillPrompt(options = {}) {
  try {
    return loadLeoSkills(options).addendum;
  } catch {
    return '';
  }
}

export { LEO_SKILL_ALLOWLIST, LEO_SKILLS_ADDENDUM, LEO_SKILLS_BUNDLE, LEO_SKILLS_RECEIPT };
