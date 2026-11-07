// Bounded skills runtime: bundle integrity, allowlist and budget. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  LEO_SKILL_ALLOWLIST,
  LEO_SKILLS_BUNDLE,
  LEO_SKILLS_RECEIPT,
  getLeoSkillPrompt,
  loadLeoSkills
} from '../src/leo_skills_runtime.mjs';

const root = new URL('../skills/', import.meta.url);

test('1. the bundle ships the five Leo skills', () => {
  const result = loadLeoSkills();
  assert.equal(result.loadedCount, 5);
  assert.deepEqual(result.loaded.map(skill => skill.id), [...LEO_SKILL_ALLOWLIST]);
  assert.equal(result.receipt, LEO_SKILLS_RECEIPT);
  assert.match(result.receipt, /^skills:[a-f0-9]{24}$/);
  assert.ok(result.chars > 0 && result.chars <= 12000);
});

test('2. the generated bundle matches the repository SKILL.md files', () => {
  for (const skill of LEO_SKILLS_BUNDLE) {
    const text = readFileSync(new URL(skill.id + '/SKILL.md', root), 'utf8');
    const hash = createHash('sha256').update(text, 'utf8').digest('hex');
    assert.equal(skill.hash, hash, skill.id + ' is stale; run npm run skills:build');
  }
});

test('3. loading is deterministic and returns data only', () => {
  const first = loadLeoSkills();
  const second = loadLeoSkills();
  assert.equal(first.addendum, second.addendum);
  for (const skill of first.loaded) {
    assert.equal(skill.mode, 'knowledge_only');
    for (const value of Object.values(skill)) assert.notEqual(typeof value, 'function');
  }
});

test('4. a subset only includes the requested skills', () => {
  const result = loadLeoSkills({ tenantId: 'tenant-a', allowlist: ['leo-copywriting'] });
  assert.deepEqual(result.loaded.map(skill => skill.id), ['leo-copywriting']);
  assert.match(result.addendum, /\[leo-copywriting\]/);
  assert.doesNotMatch(result.addendum, /\[leo-product-marketing\]/);
});

test('5. skills outside the allowlist are rejected', () => {
  const result = loadLeoSkills({ allowlist: ['leo-copywriting', 'agent1-icp-targeting'] });
  assert.deepEqual(result.loaded.map(skill => skill.id), ['leo-copywriting']);
  assert.ok(result.rejected.some(item => item.id === 'agent1-icp-targeting' && item.code === 'SKILL_NOT_ALLOWED'));
});

test('6. path traversal identifiers are rejected', () => {
  const result = loadLeoSkills({ allowlist: ['../secret', '/etc/passwd'] });
  assert.equal(result.loadedCount, 0);
  assert.deepEqual(result.rejected.map(item => item.code), ['SKILL_ID_INVALID', 'SKILL_ID_INVALID']);
});

test('7. the total budget is enforced', () => {
  const result = loadLeoSkills({ maxTotalChars: 900 });
  assert.ok(result.chars <= 900);
  assert.ok(result.rejected.some(item => item.code === 'SKILL_TOTAL_BUDGET_EXCEEDED'));
});

test('8. the prompt helper never throws', () => {
  assert.equal(typeof getLeoSkillPrompt(), 'string');
  assert.ok(getLeoSkillPrompt({ allowlist: ['nope'] }) === '');
});
