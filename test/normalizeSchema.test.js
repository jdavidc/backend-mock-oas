import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchema } from '../src/validation/normalizeSchema.js';

test('nullable adds null to type', () => {
  assert.deepEqual(normalizeSchema({ type: 'string', nullable: true }).type, ['string', 'null']);
});

test('strips OAS-only keywords', () => {
  const out = normalizeSchema({ type: 'object', discriminator: { propertyName: 'x' }, xml: {}, externalDocs: {}, example: 1 });
  for (const k of ['discriminator', 'xml', 'externalDocs', 'example']) assert.equal(k in out, false);
});

test('request mode drops readOnly properties from required', () => {
  const s = { type: 'object', required: ['id', 'name'], properties: { id: { type: 'integer', readOnly: true }, name: { type: 'string' } } };
  assert.deepEqual(normalizeSchema(s, { mode: 'request' }).required, ['name']);
  assert.deepEqual(normalizeSchema(s).required, ['id', 'name']);
});

test('generate mode turns example into examples', () => {
  assert.deepEqual(normalizeSchema({ type: 'string', example: 'x' }, { mode: 'generate' }).examples, ['x']);
});

test('converts boolean exclusiveMinimum from OAS 3.0', () => {
  const out = normalizeSchema({ type: 'number', minimum: 1, exclusiveMinimum: true });
  assert.equal(out.exclusiveMinimum, 1);
  assert.equal('minimum' in out, false);
});

test('breaks cycles into a finite tree', () => {
  const node = { type: 'object', properties: {} };
  node.properties.parent = node;
  const out = normalizeSchema(node, { maxDepth: 2 });
  assert.doesNotThrow(() => JSON.stringify(out));
  assert.deepEqual(out.properties.parent.properties.parent, {});
});
