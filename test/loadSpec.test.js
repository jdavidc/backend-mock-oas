import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadSpec } from '../src/spec/loadSpec.js';

const fixture = fileURLToPath(new URL('./fixtures/petstore.yaml', import.meta.url));

test('loads a YAML spec and lists normalized operations', async () => {
  const { operations, basePath } = await loadSpec(fixture);
  assert.equal(basePath, '/v1');
  const ids = operations.map((o) => `${o.method} ${o.path}`);
  assert.ok(ids.includes('get /pets'));
  assert.ok(ids.includes('delete /pets/{petId}'));
  const getPet = operations.find((o) => o.operationId === 'getPet');
  assert.equal(getPet.parameters[0].name, 'petId'); // path-level params merged
});

test('accepts an object without mutating it', async () => {
  const spec = {
    openapi: '3.0.3', info: { title: 't', version: '1' },
    paths: { '/a': { get: { responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/A' } } } } } } } },
    components: { schemas: { A: { type: 'string' } } },
  };
  const copy = structuredClone(spec);
  const { operations, basePath } = await loadSpec(spec);
  assert.deepEqual(spec, copy);
  assert.equal(basePath, '');
  assert.equal(operations[0].responses['200'].content['application/json'].schema.type, 'string');
});

test('rejects Swagger 2.0', async () => {
  await assert.rejects(loadSpec({ swagger: '2.0', info: { title: 't', version: '1' }, paths: {} }), /OpenAPI 3/);
});

test('rejects an invalid spec', async () => {
  await assert.rejects(loadSpec({ openapi: '3.0.3', paths: {} }));
});

test('derives base path from server variables defaults', async () => {
  const { basePath } = await loadSpec({
    openapi: '3.0.3', info: { title: 't', version: '1' }, paths: {},
    servers: [{ url: '{scheme}://x.com/{ver}/api/', variables: { scheme: { default: 'https' }, ver: { default: 'v2' } } }],
  });
  assert.equal(basePath, '/v2/api');
});
