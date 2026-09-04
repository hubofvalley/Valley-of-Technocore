import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const CLI = new URL('../bin/valley-technocore.js', import.meta.url);
const RECEIPT_INTAKE_CLI = new URL('../bin/valley-technocore-receipt-intake.js', import.meta.url);
const ATTESTATION_CLI = new URL('../bin/valley-attestation.js', import.meta.url);
const ROOT_DIR = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const INPUT = readFileSync(new URL('../fixtures/valid-input.json', import.meta.url), 'utf8');
const ATTESTATION = readFileSync(new URL('../fixtures/release-attestation-v1.json', import.meta.url), 'utf8');
const TECHNOCORE_MESSAGE = readFileSync(new URL('../fixtures/technocore-msg-v1-gauntlet.json', import.meta.url), 'utf8');

function runInEmptyDirectory(env, command = 'create-evidence', input = INPUT, args = []) {
  const cwd = mkdtempSync(join(tmpdir(), 'valley-technocore-boundary-'));
  try {
    const before = readdirSync(cwd);
    const result = spawnSync(process.execPath, [CLI.pathname, command, ...args], {
      cwd, input, encoding: 'utf8', env
    });
    return { result, before, after: readdirSync(cwd) };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function reachableRuntimeFiles(entrypoints) {
  const found = new Set();
  const visit = (file) => {
    const path = resolve(file);
    if (found.has(path)) return;
    found.add(path);
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/gu)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) visit(resolve(dirname(path), specifier));
    }
  };
  for (const entrypoint of entrypoints) visit(fileURLToPath(entrypoint));
  return [...found].sort();
}

function auditRuntimeSource(source, label) {
  const forbiddenBuiltins = /node:(?:fs(?:\/promises)?|http2?|net|tls|dgram|dns|child_process|cluster|worker_threads|module|vm|v8)/u;
  const forbiddenGlobals = /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/u;
  const forbiddenCryptoNames = new Set(['createPrivateKey', 'createSecretKey', 'generateKey', 'generateKeyPair', 'sign', 'diffieHellman', 'createECDH']);
  assert.doesNotMatch(source, forbiddenBuiltins, label);
  assert.doesNotMatch(source, forbiddenGlobals, label);
  assert.doesNotMatch(source, /\b(?:require|import)\s*\(/u, label);
  for (const match of source.matchAll(/\b(?:import|export)\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"]/gu)) {
    const [, clause, specifier] = match;
    assert.ok(specifier.startsWith('.') || specifier === 'node:crypto', `${label} imports unsupported runtime module ${specifier}`);
    if (specifier === 'node:crypto') {
      assert.doesNotMatch(clause, /^\s*(?:\*|[A-Za-z_$])/u, `${label} must use named node:crypto imports`);
      const named = clause.match(/\{([^}]*)\}/u)?.[1] ?? '';
      for (const binding of named.split(',').map((part) => part.trim()).filter(Boolean)) {
        const imported = binding.split(/\s+as\s+/u)[0].trim();
        assert.ok(!forbiddenCryptoNames.has(imported), `${label} imports forbidden node:crypto API ${imported}`);
      }
    }
  }
  const withoutAllowedProcess = source.replace(/\bprocess\.(?:argv|exitCode|stdin|stdout|stderr)\b/gu, '');
  assert.doesNotMatch(withoutAllowedProcess, /\bprocess\b/u, `${label} accesses process outside the CLI stream boundary`);
}

test('every runtime module reachable from every entrypoint stays capability-bounded', () => {
  const runtimeFiles = reachableRuntimeFiles([CLI, RECEIPT_INTAKE_CLI, ATTESTATION_CLI]);
  assert.deepEqual(runtimeFiles.map((file) => file.replace(`${ROOT_DIR}/`, '')).sort(), [
    'bin/valley-attestation.js', 'bin/valley-technocore-receipt-intake.js', 'bin/valley-technocore.js', 'src/attestation.js', 'src/batch-cli.js', 'src/cli.js',
    'src/format.js', 'src/provenance.js', 'src/receipt-cli.js', 'src/receipt-intake.js', 'src/receipt.js', 'src/technocore-message.js', 'src/verify-cli.js'
  ]);
  for (const file of runtimeFiles) {
    const source = readFileSync(file, 'utf8');
    auditRuntimeSource(source, file);
  }
});

test('capability scanner catches re-exports, crypto aliases, and indirect process access', () => {
  assert.throws(() => auditRuntimeSource("export { x } from './hidden.js';\nimport { sign as harmless } from 'node:crypto';", 'alias'));
  for (const source of ['globalThis.process.env', 'const { env } = process;', 'const p = process; p.env']) {
    assert.throws(() => auditRuntimeSource(source, 'process alias'));
  }
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
  assert.deepEqual(readdirSync(new URL('../src', import.meta.url)).sort(), ['attestation.js', 'batch-cli.js', 'cli.js', 'format.js', 'provenance.js', 'receipt-cli.js', 'receipt-intake.js', 'receipt.js', 'technocore-message.js', 'verify-cli.js']);
  assert.deepEqual(readdirSync(new URL('../bin', import.meta.url)).sort(), ['valley-attestation.js', 'valley-technocore-receipt-intake.js', 'valley-technocore.js']);
});

test('lossless receipt intake is environment-invariant and writes no files', () => {
  const receipt = JSON.parse(TECHNOCORE_MESSAGE);
  const input = JSON.stringify({ room: receipt.room, did: receipt.did, nonce: receipt.nonce, text: receipt.text, signature: receipt.signature_b64u });
  const run = (env) => {
    const cwd = mkdtempSync(join(tmpdir(), 'valley-technocore-intake-boundary-'));
    try {
      const before = readdirSync(cwd);
      const result = spawnSync(process.execPath, [RECEIPT_INTAKE_CLI.pathname, 'verify'], { cwd, input, encoding: 'utf8', env });
      return { result, before, after: readdirSync(cwd) };
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  };
  const first = run({ HOME: '/nonexistent', TZ: 'UTC', LANG: 'C', SECRET_TOKEN: 'must-not-appear' });
  const second = run({ HOME: '/tmp', TZ: 'Asia/Jakarta', LANG: 'id_ID.UTF-8' });
  assert.equal(first.result.status, 0); assert.equal(second.result.status, 0);
  assert.equal(first.result.stdout, second.result.stdout);
  assert.deepEqual(first.before, []); assert.deepEqual(first.after, []);
  assert.deepEqual(second.before, []); assert.deepEqual(second.after, []);
  assert.doesNotMatch(first.result.stdout + first.result.stderr, /must-not-appear/u);
});

test('Technocore message verification is environment-invariant and writes no files', () => {
  const first = runInEmptyDirectory({ PATH: '/nonexistent', HOME: '/nonexistent', TZ: 'UTC', LANG: 'C', SECRET_TOKEN: 'must-not-appear' }, 'verify-technocore-message', TECHNOCORE_MESSAGE);
  const second = runInEmptyDirectory({ PATH: '/tmp', HOME: '/tmp', TZ: 'Asia/Jakarta', LANG: 'id_ID.UTF-8' }, 'verify-technocore-message', TECHNOCORE_MESSAGE);
  assert.equal(first.result.status, 0); assert.equal(second.result.status, 0);
  assert.equal(first.result.stdout, second.result.stdout);
  assert.deepEqual(first.before, []); assert.deepEqual(first.after, []);
  assert.deepEqual(second.before, []); assert.deepEqual(second.after, []);
  assert.doesNotMatch(first.result.stdout + first.result.stderr, /must-not-appear/u);
});

test('universal verification is environment-invariant and writes no files', () => {
  const first = runInEmptyDirectory({ PATH: '/nonexistent', HOME: '/nonexistent', TZ: 'UTC', LANG: 'C', SECRET_TOKEN: 'must-not-appear' }, 'verify', TECHNOCORE_MESSAGE);
  const second = runInEmptyDirectory({ PATH: '/tmp', HOME: '/tmp', TZ: 'Asia/Jakarta', LANG: 'id_ID.UTF-8' }, 'verify', TECHNOCORE_MESSAGE);
  assert.equal(first.result.status, 0); assert.equal(second.result.status, 0);
  assert.equal(first.result.stdout, second.result.stdout);
  assert.deepEqual(first.before, []); assert.deepEqual(first.after, []);
  assert.deepEqual(second.before, []); assert.deepEqual(second.after, []);
  assert.doesNotMatch(first.result.stdout + first.result.stderr, /must-not-appear/u);
});

test('provenance bundle construction is environment-invariant and writes no files', () => {
  const capture = readFileSync(new URL('../fixtures/technocore-provenance-capture-v1.json', import.meta.url), 'utf8');
  const run = (env) => {
    const cwd = mkdtempSync(join(tmpdir(), 'valley-technocore-provenance-boundary-'));
    try {
      const before = readdirSync(cwd);
      const result = spawnSync(process.execPath, [CLI.pathname, 'provenance', 'create'], { cwd, input: capture, encoding: 'utf8', env });
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

test('batch verification is environment-invariant and writes no files', () => {
  const record = JSON.stringify(JSON.parse(TECHNOCORE_MESSAGE));
  const input = `${record}\n${record}`;
  const first = runInEmptyDirectory({ PATH: '/nonexistent', HOME: '/nonexistent', TZ: 'UTC', LANG: 'C', SECRET_TOKEN: 'must-not-appear' }, 'batch', input, ['verify', 'message']);
  const second = runInEmptyDirectory({ PATH: '/tmp', HOME: '/tmp', TZ: 'Asia/Jakarta', LANG: 'id_ID.UTF-8' }, 'batch', input, ['verify', 'message']);
  assert.equal(first.result.status, 0); assert.equal(second.result.status, 0);
  assert.equal(first.result.stdout, second.result.stdout);
  assert.deepEqual(first.before, []); assert.deepEqual(first.after, []);
  assert.deepEqual(second.before, []); assert.deepEqual(second.after, []);
  assert.doesNotMatch(first.result.stdout + first.result.stderr, /must-not-appear/u);
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
