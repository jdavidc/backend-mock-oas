import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePath, createRouter } from '../src/routing/pathMatcher.js';

test('compilePath extracts params and escapes static parts', () => {
  const { regex, paramNames } = compilePath('/files/{name}.json');
  assert.deepEqual(paramNames, ['name']);
  assert.ok(regex.test('/files/a.json'));
  assert.ok(!regex.test('/files/axjson'));
});

const ops = [
  { method: 'get', path: '/pets/{petId}', operationId: 'getPet' },
  { method: 'delete', path: '/pets/{petId}', operationId: 'deletePet' },
  { method: 'get', path: '/pets/mine', operationId: 'mine' },
  { method: 'get', path: '/pets', operationId: 'list' },
];
const router = createRouter(ops);

test('matches templated paths and decodes params', () => {
  const m = router.match('GET', '/pets/a%20b');
  assert.equal(m.operation.operationId, 'getPet');
  assert.deepEqual(m.pathParams, { petId: 'a b' });
});

test('static routes win over templated ones', () => {
  assert.equal(router.match('get', '/pets/mine').operation.operationId, 'mine');
});

test('reports allowed methods when method is not defined', () => {
  assert.deepEqual(router.match('put', '/pets/1').allowedMethods.sort(), ['DELETE', 'GET']);
});

test('returns null for unknown paths and tolerates trailing slash', () => {
  assert.equal(router.match('get', '/nope'), null);
  assert.equal(router.match('get', '/pets/').operation.operationId, 'list');
});
