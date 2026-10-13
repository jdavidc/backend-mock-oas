import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFromSchema } from '../src/responses/generateFromSchema.js';

test('generates data matching basic types and nested examples', () => {
  const out = generateFromSchema({
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'integer' }, name: { type: 'string', example: 'Rex' }, tag: { type: 'string', nullable: true } },
    discriminator: { propertyName: 'id' },
  });
  assert.equal(typeof out.id, 'number');
  assert.equal(out.name, 'Rex');
  assert.ok('tag' in out); // optionals are always faked
});

test('terminates on recursive schemas', () => {
  const node = { type: 'object', required: ['name'], properties: { name: { type: 'string', example: 'root' } } };
  node.properties.parent = node;
  const out = generateFromSchema(node);
  assert.equal(out.name, 'root');
  assert.doesNotThrow(() => JSON.stringify(out));
});

test('returns undefined for missing schema', () => {
  assert.equal(generateFromSchema(undefined), undefined);
});
