import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveLeoConversion } from '../src/leo_conversion_runtime.mjs';
import { respondAsLeo } from '../src/leo_sales_runtime.mjs';

test('pricing request is an advancing hot lead and asks qualification before proposal', () => {
  const result = deriveLeoConversion({ message: '¿Cuánto cuesta automatizar WhatsApp?' });
  assert.equal(result.leadTemperature, 'hot');
  assert.equal(result.nextTrigger, 'QUALIFY_BEFORE_PROPOSAL');
  assert.ok(result.missing.includes('timeline'));
});

test('pilot interest prepares a pilot draft without closing', () => {
  const result = deriveLeoConversion({ message: 'Quiero probar un piloto para mis facturas.' });
  assert.equal(result.stage, 'PILOT_REVIEW');
  assert.equal(result.nextTrigger, 'PREPARE_PILOT_DRAFT');
  assert.deepEqual(result.authorizedActions, []);
});

test('explicit rejection stops follow-up', () => {
  const result = deriveLeoConversion({ message: 'No me interesa, no me contacten.' });
  assert.equal(result.nextTrigger, 'STOP_FOLLOW_UP');
  assert.equal(result.stage, 'STOPPED');
});

test('Leo response carries conversion metadata', async () => {
  const result = await respondAsLeo({ message: 'Necesito una demo para WhatsApp' }, { env: {} });
  assert.equal(result.conversion.leadTemperature, 'hot');
  assert.equal(result.conversion.nextTrigger, 'PREPARE_DEMO_DRAFT');
});
