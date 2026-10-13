import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSchemaCompiler } from '../src/validation/schemaCompiler.js';

test('compiles OAS 3.0 schemas with nullable and formats', () => {
  const compile = createSchemaCompiler();
  const validate = compile({ type: 'object', properties: { tag: { type: 'string', nullable: true }, at: { type: 'string', format: 'date-time' } }, example: {} });
  assert.equal(validate({ tag: null, at: '2024-01-01T00:00:00Z' }), true);
  assert.equal(validate({ at: 'nope' }), false);
});

test('caches validators per schema object and mode', () => {
  const compile = createSchemaCompiler();
  const schema = { type: 'integer' };
  assert.equal(compile(schema), compile(schema));
  assert.notEqual(compile(schema), compile(schema, { mode: 'request' }));
});

test('request mode ignores readOnly required properties', () => {
  const compile = createSchemaCompiler();
  const schema = { type: 'object', required: ['id'], properties: { id: { type: 'integer', readOnly: true } } };
  assert.equal(compile(schema, { mode: 'request' })({}), true);
});

test('handles recursive schemas and OAS 3.1 keywords', () => {
  const compile = createSchemaCompiler();
  const node = { type: 'object', properties: { name: { type: ['string', 'null'] } } };
  node.properties.child = node;
  const validate = compile(node);
  assert.equal(validate({ name: null, child: { name: 'a' } }), true);
  assert.equal(validate({ name: 1 }), false);
});
