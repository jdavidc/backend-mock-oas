import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createMockServer } from '../src/index.js';

const spec = fileURLToPath(new URL('./fixtures/petstore.yaml', import.meta.url));
let app;

before(async () => {
  app = await createMockServer({ spec, logger: false });
});

test('GET /v1/pets returns the example and response header', async () => {
  const res = await request(app).get('/v1/pets').expect(200);
  assert.equal(res.body.length, 2);
  assert.equal(res.headers['x-rate-limit'], '100');
  assert.match(res.headers['content-type'], /application\/json/);
});

test('query validation errors return 400 with details', async () => {
  const res = await request(app).get('/v1/pets?limit=500').expect(400);
  assert.equal(res.body.error, 'RequestValidationError');
  assert.equal(res.body.details[0].name, 'limit');
  await request(app).get('/v1/pets?tags=a&tags=b&limit=3').expect(200);
});

test('path param type errors return 400', async () => {
  const res = await request(app).get('/v1/pets/abc').expect(400);
  assert.equal(res.body.details[0].in, 'path');
});

test('generated body when only a schema exists, including recursive schema', async () => {
  const res = await request(app).get('/v1/pets/1').expect(200);
  assert.equal(typeof res.body.name, 'string');
  const cat = await request(app).get('/v1/categories/x').expect(200);
  assert.equal(cat.body.name, 'Mammals');
});

test('Prefer: code=404 returns the 404 example', async () => {
  const res = await request(app).get('/v1/pets/1').set('Prefer', 'code=404').expect(404);
  assert.equal(res.body.message, 'Pet not found');
});

test('static route wins over templated route', async () => {
  const res = await request(app).get('/v1/pets/mine').expect(200);
  assert.equal(res.body[0].name, 'Mine');
});

test('POST validates the body', async () => {
  const missing = await request(app).post('/v1/pets').send({}).expect(400);
  assert.match(missing.body.details[0].message, /name/);
  await request(app).post('/v1/pets').set('Content-Type', 'text/plain').send('hi').expect(415);
  await request(app).post('/v1/pets').expect(400);
  const bad = await request(app).post('/v1/pets').set('Content-Type', 'application/json').send('{bad').expect(400);
  assert.equal(bad.body.error, 'RequestValidationError');
});

test('POST returns named examples via Prefer', async () => {
  const res = await request(app).post('/v1/pets').set('Prefer', 'example=dog').send({ name: 'Rex' }).expect(201);
  assert.equal(res.body.name, 'Rex');
  const first = await request(app).post('/v1/pets').send({ name: 'x', tag: null }).expect(201);
  assert.equal(first.body.name, 'Tom');
});

test('DELETE returns 204 with no body', async () => {
  const res = await request(app).delete('/v1/pets/1').expect(204);
  assert.equal(res.text, '');
});

test('unknown paths 404 and wrong methods 405 with Allow', async () => {
  const nf = await request(app).delete('/v1/nope').expect(404);
  assert.equal(nf.body.error, 'NotFound');
  await request(app).get('/pets').expect(404);
  const na = await request(app).put('/v1/pets').expect(405);
  assert.equal(na.headers.allow, 'GET, POST');
});

test('HEAD falls back to GET', async () => {
  await request(app).head('/v1/pets').expect(200);
});

test('CORS headers and preflight', async () => {
  const res = await request(app).options('/v1/pets').set('Origin', 'http://a.com').set('Access-Control-Request-Method', 'POST').expect(204);
  assert.equal(res.headers['access-control-allow-origin'], 'http://a.com');
  const plain = await request(app).get('/v1/pets').set('Origin', 'http://a.com');
  assert.equal(plain.headers['access-control-allow-origin'], 'http://a.com');
});

test('validation and CORS can be disabled', async () => {
  const loose = await createMockServer({ spec, logger: false, validateRequests: false, cors: false });
  await request(loose).get('/v1/pets/abc').expect(200);
  const res = await request(loose).get('/v1/pets').set('Origin', 'http://a.com');
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});
