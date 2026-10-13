import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectResponse, parsePrefer } from '../src/responses/selectResponse.js';

const op = (responses) => ({ responses });
const json = (extra) => ({ content: { 'application/json': extra } });

test('parsePrefer reads code and example', () => {
  assert.deepEqual(parsePrefer('code=404, example=notFound'), { code: '404', example: 'notFound' });
  assert.deepEqual(parsePrefer(undefined), {});
});

test('picks the lowest 2xx by default', () => {
  const res = selectResponse(op({ 404: {}, 201: json({ example: 'b' }), 200: json({ example: 'a' }) }), {});
  assert.equal(res.status, 200);
  assert.equal(res.body, 'a');
});

test('maps 2XX range and default to 200, else first defined', () => {
  assert.equal(selectResponse(op({ '2XX': {} }), {}).status, 200);
  assert.equal(selectResponse(op({ default: {} }), {}).status, 200);
  assert.equal(selectResponse(op({ 404: {} }), {}).status, 404);
});

test('honors Prefer code, including range keys', () => {
  const responses = { 200: {}, 404: json({ example: { m: 'nf' } }), '5XX': json({ example: 'boom' }) };
  assert.deepEqual(selectResponse(op(responses), { prefer: 'code=404' }).body, { m: 'nf' });
  const r = selectResponse(op(responses), { prefer: 'code=503' });
  assert.equal(r.status, 503);
  assert.equal(r.body, 'boom');
  assert.equal(selectResponse(op(responses), { prefer: 'code=418' }).status, 200);
});

test('body precedence: named example, example, first examples, schema example, generated', () => {
  const examples = { cat: { value: 'cat' }, dog: { value: 'dog' }, ext: { externalValue: 'http://x' } };
  assert.equal(selectResponse(op({ 200: json({ examples }) }), { prefer: 'example=dog' }).body, 'dog');
  assert.equal(selectResponse(op({ 200: json({ examples }) }), {}).body, 'cat');
  assert.equal(selectResponse(op({ 200: json({ example: 'e', examples }) }), {}).body, 'e');
  assert.equal(selectResponse(op({ 200: json({ schema: { type: 'string', example: 's' } }) }), {}).body, 's');
  assert.equal(typeof selectResponse(op({ 200: json({ schema: { type: 'integer' } }) }), {}).body, 'number');
});

test('negotiates media type from Accept', () => {
  const responses = { 200: { content: { 'application/json': { example: 'j' }, 'text/plain': { example: 't' } } } };
  const r = selectResponse(op(responses), { accept: 'text/plain;q=0.9, application/xml' });
  assert.equal(r.mediaType, 'text/plain');
  assert.equal(r.body, 't');
  assert.equal(selectResponse(op(responses), { accept: 'image/png' }).mediaType, 'application/json');
  assert.equal(selectResponse(op(responses), { accept: '*/*' }).mediaType, 'application/json');
});

test('no content means empty body', () => {
  const r = selectResponse(op({ 204: { description: 'gone' } }), {});
  assert.equal(r.status, 204);
  assert.equal(r.mediaType, undefined);
  assert.equal(r.body, undefined);
});

test('builds response headers from examples and schemas, skipping Content-Type', () => {
  const r = selectResponse(op({
    200: {
      headers: {
        'X-Rate-Limit': { schema: { type: 'integer' }, example: 100 },
        'X-Id': { examples: { a: { value: 'abc' } } },
        'X-Def': { schema: { type: 'string', default: 'd' } },
        'X-Gen': { schema: { type: 'integer' } },
        'Content-Type': { schema: { type: 'string' } },
      },
    },
  }), {});
  assert.equal(r.headers['X-Rate-Limit'], '100');
  assert.equal(r.headers['X-Id'], 'abc');
  assert.equal(r.headers['X-Def'], 'd');
  assert.match(r.headers['X-Gen'], /^-?\d+$/);
  assert.equal('Content-Type' in r.headers, false);
});
