import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const CLI = new URL('../bin/valley-technocore.js', import.meta.url);
const ATTESTATION_CLI = new URL('../bin/valley-attestation.js', import.meta.url);
const INPUT = readFileSync(new URL('../fixtures/valid-input.json', import.meta.url), 'utf8');
const ATTESTATION = readFileSync(new URL('../fixtures/release-attestation-v1.json', import.meta.url), 'utf8');

function runInEmptyDirectory(env, command = 'create-evidence', input = INPUT) {
  const cwd = mkdtempSync(join(tmpdir(), 'valley-technocore-boundary-'));
  try {
    const before = readdirSync(cwd);
    const result = spawnSync(process.execPath, [CLI.pathname, command], {
      cwd, input, encoding: 'utf8', env
    });
    return { result, before, after: readdirSync(cwd) };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('runtime source has no network, filesystem, subprocess, or environment access', () => {
  const runtime = [
    readFileSync(new URL('../src/cli.js', import.meta.url), 'utf8'),
    readFileSync(CLI, 'utf8')
  ].join('\n');
  assert.doesNotMatch(runtime, /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/u);
  assert.doesNotMatch(runtime, /\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(|process\.env|process\.cwd\s*\(/u);
});

test('hostile environment cannot affect output and runtime writes no files', () => {
  const first = runInEmptyDirectory({ PATH: '/nonexistent', HOME: '/nonexistent', TZ: 'UTC', LANG: 'C', AWS_SECRET_ACCESS_KEY: 'must-not-appear' });
  const second = runInEmptyDirectory({ PATH: '/tmp', HOME: '/tmp', TZ: 'Asia/Jakarta', LANG: 'id_ID.UTF-8' });
  assert.equal(first.result.status, 0); assert.equal(second.result.status, 0);
  assert.equal(first.result.stdout, second.result.stdout);
  assert.deepEqual(first.before, []); assert.deepEqual(first.after, []);
  assert.deepEqual(second.before, []); assert.deepEqual(second.after, []);
  assert.doesNotMatch(first.result.stdout + first.result.stderr, /must-not-appear/u);
});

test('verify-evidence is environment-invariant and writes no files', () => {
  const created = runInEmptyDirectory({}, 'create-evidence');
  assert.equal(created.result.status, 0);
  const first = runInEmptyDirectory({ HOME: '/nonexistent', TZ: 'UTC', SECRET_TOKEN: 'must-not-appear' }, 'verify-evidence', created.result.stdout);
  const second = runInEmptyDirectory({ HOME: '/tmp', TZ: 'Asia/Jakarta' }, 'verify-evidence', created.result.stdout);
  assert.equal(first.result.status, 0); assert.equal(second.result.status, 0);
  assert.equal(first.result.stdout, second.result.stdout);
  assert.deepEqual(first.before, []); assert.deepEqual(first.after, []);
  assert.deepEqual(second.before, []); assert.deepEqual(second.after, []);
  assert.doesNotMatch(first.result.stdout + first.result.stderr, /must-not-appear/u);
});

test('package has zero runtime dependencies and only declared runtime files', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined); assert.equal(pkg.optionalDependencies, undefined);
  assert.deepEqual(readdirSync(new URL('../src', import.meta.url)).sort(), ['attestation.js', 'cli.js']);
  assert.deepEqual(readdirSync(new URL('../bin', import.meta.url)).sort(), ['valley-attestation.js', 'valley-technocore.js']);
});

test('release-attestation runtime has no network, filesystem, subprocess, environment, or clock access', () => {
  const source = readFileSync(new URL('../src/attestation.js', import.meta.url), 'utf8');
  for (const forbidden of ['node:fs', 'node:net', 'node:http', 'node:https', 'node:dns', 'node:tls', 'node:child_process', 'process.env', 'process.cwd', 'Date.now', 'new Date', 'fetch(']) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
});

test('release-attestation is environment-invariant and writes no files in an empty cwd', () => {
  const run = (env) => {
    const cwd = mkdtempSync(join(tmpdir(), 'valley-attestation-boundary-'));
    try {
      const before = readdirSync(cwd);
      const result = spawnSync(process.execPath, [ATTESTATION_CLI.pathname], { cwd, input: ATTESTATION, encoding: 'utf8', env });
      return { result, before, after: readdirSync(cwd) };
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  };
  const first = run({ PATH: '/nonexistent', HOME: '/nonexistent', TZ: 'UTC', LANG: 'C', SECRET_TOKEN: 'must-not-appear' });
  const second = run({ PATH: '/tmp', HOME: '/tmp', TZ: 'Asia/Jakarta', LANG: 'id_ID.UTF-8' });
  assert.equal(first.result.status, 0); assert.equal(second.result.status, 0);
  assert.equal(first.result.stdout, second.result.stdout);
  assert.deepEqual(first.before, []); assert.deepEqual(first.after, []);
  assert.deepEqual(second.before, []); assert.deepEqual(second.after, []);
  assert.doesNotMatch(first.result.stdout + first.result.stderr, /must-not-appear/u);
});
