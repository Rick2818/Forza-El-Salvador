import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Bilingual data attributes are complete and paired', () => {
  const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');
  const localized = [...html.matchAll(/<[^>]+data-es="([^"]*)"[^>]*data-en="([^"]*)"[^>]*>/g)];
  assert.ok(localized.length >= 50, `Expected at least 50 bilingual elements, found ${localized.length}`);
  for (const [, es, en] of localized) {
    assert.ok(es.trim(), 'Spanish translation must not be empty');
    assert.ok(en.trim(), 'English translation must not be empty');
  }
  assert.match(html, /id="lang"/, 'Language switcher must exist');
  assert.match(html, /boltech:language-change/, 'Language change event must be emitted');
});
