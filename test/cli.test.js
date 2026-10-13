import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/oas-mock.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

test('prints usage with --help', () => {
  const res = run('--help');
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Usage: oas-mock <spec>/);
});

test('fails without a spec', () => {
  const res = run();
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Missing <spec>/);
});

test('fails on an invalid spec file', () => {
  const res = run(fileURLToPath(new URL('./cli.test.js', import.meta.url)));
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Failed to load spec/);
});
