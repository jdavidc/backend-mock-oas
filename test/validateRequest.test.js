import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest, matchMediaType } from '../src/validation/validateRequest.js';
import { createSchemaCompiler } from '../src/validation/schemaCompiler.js';

const compile = createSchemaCompiler();
const operation = {
  parameters: [
    { name: 'petId', in: 'path', required: true, schema: { type: 'integer' } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
    { name: 'tags', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
    { name: 'ids', in: 'query', schema: { type: 'array', items: { type: 'integer' } } },
    { name: 'flag', in: 'query', schema: { type: 'boolean' } },
    { name: 'X-Api-Key', in: 'header', required: true, schema: { type: 'string' } },
    { name: 'session', in: 'cookie', schema: { type: 'string', minLength: 3 } },
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'integer', readOnly: true }, name: { type: 'string' } } },
      },
    },
  },
};

const base = () => ({
  pathParams: { petId: '7' },
  query: {},
  headers: { 'x-api-key': 'k', 'content-type': 'application/json' },
  cookies: {},
  body: { name: 'Rex' },
  hasBody: true,
});

const run = (overrides) => validateRequest(operation, { ...base(), ...overrides }, compile);

test('accepts a valid request', () => {
  assert.deepEqual(run({ query: { limit: '5', tags: ['a', 'b'], ids: '1,2', flag: 'true' } }), { ok: true });
});

test('rejects path params with the wrong type', () => {
  const res = run({ pathParams: { petId: 'abc' } });
  assert.equal(res.status, 400);
  assert.equal(res.details[0].in, 'path');
  assert.equal(res.details[0].name, 'petId');
});

test('validates query constraints and array items', () => {
  const res = run({ query: { limit: '0', ids: ['1', 'x'] } });
  assert.equal(res.status, 400);
  assert.deepEqual(res.details.map((d) => d.name).sort(), ['ids', 'limit']);
});

test('requires headers case-insensitively', () => {
  const headers = { 'content-type': 'application/json' };
  const res = run({ headers });
  assert.equal(res.details[0].in, 'header');
  assert.match(res.details[0].message, /required/);
});

test('validates cookies when provided', () => {
  assert.equal(run({ cookies: { session: 'x' } }).details[0].in, 'cookie');
});

test('requires the body when requestBody.required', () => {
  const res = run({ body: undefined, hasBody: false });
  assert.equal(res.status, 400);
  assert.equal(res.details[0].in, 'body');
});

test('returns 415 for an undeclared content type', () => {
  const res = run({ headers: { 'x-api-key': 'k', 'content-type': 'text/plain' }, body: 'hi' });
  assert.equal(res.status, 415);
});

test('validates JSON body and ignores readOnly required props', () => {
  const res = run({ body: { name: 5 } });
  assert.equal(res.status, 400);
  assert.equal(res.details[0].path, '/name');
  assert.deepEqual(run({ body: { name: 'ok' } }), { ok: true });
});

test('matchMediaType handles params, wildcards and +json', () => {
  assert.equal(matchMediaType('application/json; charset=utf-8', ['application/json']), 'application/json');
  assert.equal(matchMediaType('application/merge-patch+json', ['application/*']), 'application/*');
  assert.equal(matchMediaType('image/png', ['*/*']), '*/*');
  assert.equal(matchMediaType('application/vnd.x+json', ['application/json']), 'application/json');
  assert.equal(matchMediaType('text/plain', ['application/json']), null);
});
