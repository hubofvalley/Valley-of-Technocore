#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const SKILL_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SKILL_ROOT, '../..');
const MANIFEST_PATH = join(SKILL_ROOT, 'runtime-manifest.json');
const PINNED_MANIFEST = Object.freeze({
  nodeMajor: 24,
  nodeMatrixVersion: '24.18.0',
  releaseTag: 'v0.2.0',
  releaseCommit: '908a5050d2c2222e92e08dd5352e454f876634d7',
  archive: Object.freeze({
    path: 'vendor/valley-of-technocore-v0.2.0.tar',
    prefix: 'valley-of-technocore-v0.2.0/',
    bytes: 296960,
    sha256: '5db00fad00a3973a09d867073208c899b550d43b73656cc6f521340c37a3649f'
  }),
  runtimeFiles: Object.freeze({
    'bin/valley-technocore.js': '616ac4d3e5a828b6a3f97517241581af154d204bf993f75a0701eeef7df47953',
    'src/attestation.js': '78d37bd43e6d525269c395faee778b73b299790e39b78dd1715afa500f495139',
    'src/batch-cli.js': 'deb5e01cde8db787e3fc8efd2f325a6a837f1351b5f91f202e40b926544758d0',
    'src/cli.js': 'eac9ebfc32144abdd90478bd0cc66ccd97a1f1d128110e3518e4a2a382f91af3',
    'src/format.js': '84d9d828a9812b56c7b15ff169622095d291f9b691b495c0dd01599a0fe99294',
    'src/provenance.js': '815ece643e9f290cbaa57d398efd586721229e767a86dfb7456d18f29888bdbe',
    'src/receipt-cli.js': '45c84626df3bd0a6e2bc1693adb84c8ead3d78babf6aaf9c910013d1333d9808',
    'src/receipt.js': '38f51aef970609c4c2f4d6994b4c30e3becca06fdc9598e8f156bf19dafb479a',
    'src/technocore-message.js': 'f604fa2c33275f7d3a3a2bb7d7de079ec0d2281d5cf80e6222e7df7ae789fc21',
    'src/verify-cli.js': '10f75752c0c2eeeea2c8ed2dfda6a29a7ae741002511fa00724d57bed92bd6f3'
  })
});
let manifestFile;
try {
  manifestFile = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
} catch {
  manifestFile = null;
}
const MANIFEST = manifestFile && matchesPin(manifestFile, PINNED_MANIFEST)
  ? PINNED_MANIFEST : null;
const ARCHIVE_PATH = join(SKILL_ROOT, PINNED_MANIFEST.archive.path);
const CLI_PATH = join(REPO_ROOT, 'bin/valley-technocore.js');
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_STDOUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;
const MAX_WALL_MS = 5000;
const MAX_HEAP_MB = 128;
const PROFILES = Object.freeze(new Map([
  ['message', Object.freeze(['message', 'verify'])],
  ['receipt', Object.freeze(['receipt', 'verify'])],
  ['evidence', Object.freeze(['evidence', 'verify'])],
  ['provenance', Object.freeze(['provenance', 'verify'])]
]));
const JSON_REPORT_KEYS = Object.freeze(['decision', 'non_claims', 'profile', 'reasons', 'signature_status']);
const EVIDENCE_REPORT_KEYS = Object.freeze(['authority', 'did_status', 'payload_hash_status', 'schema_status', 'server_attribution_status', 'signature_status']);
const NON_CLAIMS = Object.freeze([
  'identity_not_established',
  'authorship_beyond_key_control_not_established',
  'source_authenticity_not_established',
  'server_inclusion_not_established',
  'recognition_eligibility_rewards_authority_not_established'
]);
const NATIVE_DIAGNOSTICS = Object.freeze([
  /^expected JSON string$/u,
  /^control character in JSON string$/u,
  /^invalid JSON escape$/u,
  /^unpaired surrogate$/u,
  /^JSON string exceeds limit$/u,
  /^unterminated JSON string$/u,
  /^object key must be a string$/u,
  /^duplicate key: .+$/u,
  /^expected colon$/u,
  /^expected comma$/u,
  /^integer token exceeds safe limit$/u,
  /^only JSON objects, strings, and integers are supported$/u,
  /^trailing JSON content$/u,
  /^top level must be an object$/u,
  /^(?:input|request|response|response posted|source|attribution|statement|signature|evidence|capture|bundle) must be an object$/u,
  /^(?:input|request|response|response posted|source|attribution|statement|signature|evidence|capture|bundle) has missing or unknown fields$/u,
  /^unsupported schema$/u,
  /^request has unsupported schema$/u,
  /^unsupported provenance bundle schema$/u,
  /^unsupported schema or authority$/u,
  /^unsupported source kind$/u,
  /^unsupported signature$/u,
  /^unsupported receipt export shape$/u,
  /^receipt envelope has missing or unknown fields$/u,
  /^receipt is missing a detached signature \(expected signature or signature_b64u\)$/u,
  /^receipt is missing required field: (?:room|did|nonce|text)$/u,
  /^room must match the pinned Technocore grammar$/u,
  /^room must be 1-128 ASCII letters, digits, dots, underscores, or hyphens$/u,
  /^nonce must be 1-19 ASCII decimal digits$/u,
  /^text must be a string$/u,
  /^text is empty after the Technocore sweep$/u,
  /^text exceeds 4096 characters after the Technocore sweep$/u,
  /^did must be a string$/u,
  /^only did:key with base58btc is supported$/u,
  /^DID has invalid base58btc$/u,
  /^DID must use canonical base58btc$/u,
  /^only Ed25519 did:key is supported$/u,
  /^weak Ed25519 key is unsupported$/u,
  /^Ed25519 public key has noncanonical encoding$/u,
  /^Ed25519 public key is not a valid point encoding$/u,
  /^(?:signature_b64u|payload_b64u|signature value) must be canonical unpadded base64url$/u,
  /^(?:signature_b64u|payload_b64u|signature value) has invalid encoding or length$/u,
  /^invalid payload hash format$/u,
  /^response posted seq must be a positive safe integer$/u,
  /^sequence must be an integer from 0 through 9007199254740991$/u,
  /^response posted from does not match request did$/u,
  /^response posted nonce does not match request nonce$/u,
  /^response posted text does not match swept request text$/u,
  /^response http_status must be 200$/u,
  /^input must be UTF-8$/u
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function unavailable(reason) {
  return Object.freeze({ status: 'unavailable', report: null, reason });
}

function matchesPin(actual, expected) {
  if (actual === expected) return true;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object'
    || Array.isArray(actual) !== Array.isArray(expected)) return false;
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  return actualKeys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.hasOwn(actual, key) && matchesPin(actual[key], expected[key]));
}

function tarMembers(bytes) {
  const members = new Map();
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return members;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/u, '');
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/u, '').trim();
    if (!/^[0-7]+$/u.test(sizeText)) return null;
    const size = Number.parseInt(sizeText, 8);
    const start = offset + 512;
    const end = start + size;
    if (!Number.isSafeInteger(size) || end > bytes.length) return null;
    const type = header[156];
    if (type === 0 || type === 48) members.set(`${prefix}${name}`, bytes.subarray(start, end));
    offset = start + Math.ceil(size / 512) * 512;
  }
  return null;
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).join('\u0000') === keys.join('\u0000');
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function exactDiagnostic(text) {
  if (!text.startsWith('error: ') || !text.endsWith('\n')) return false;
  const body = text.slice('error: '.length, -1);
  return NATIVE_DIAGNOSTICS.some((pattern) => pattern.test(body)) && [...body].every((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint >= 0x20 && codePoint !== 0x7f
      && !(codePoint >= 0x80 && codePoint <= 0x9f)
      && codePoint !== 0x2028 && codePoint !== 0x2029;
  });
}

function canonicalJson(bytes) {
  const text = decodeUtf8(bytes);
  if (text === null) return null;
  if (!text || text.endsWith('\n') || text.endsWith('\r')) return null;
  try {
    const value = JSON.parse(text);
    const canonical = (entry) => {
      if (entry === null || typeof entry !== 'object') return JSON.stringify(entry);
      if (Array.isArray(entry)) return `[${entry.map(canonical).join(',')}]`;
      return `{${Object.keys(entry).sort().map((key) => `${JSON.stringify(key)}:${canonical(entry[key])}`).join(',')}}`;
    };
    return canonical(value) === text ? value : null;
  } catch {
    return null;
  }
}

function validReport(profile, value, status) {
  if (profile === 'evidence') {
    if (!exactKeys(value, EVIDENCE_REPORT_KEYS)) return false;
    if (value.authority !== 'none' || value.did_status !== 'valid'
      || value.schema_status !== 'valid' || value.server_attribution_status !== 'observed-only') return false;
    if (!['valid', 'invalid'].includes(value.signature_status)
      || !['valid', 'invalid'].includes(value.payload_hash_status)) return false;
    return status === 'verified'
      ? value.signature_status === 'valid' && value.payload_hash_status === 'valid'
      : value.signature_status === 'invalid' || value.payload_hash_status === 'invalid';
  }
  if (!exactKeys(value, JSON_REPORT_KEYS) || !Array.isArray(value.non_claims)
    || JSON.stringify(value.non_claims) !== JSON.stringify(NON_CLAIMS)
    || !Array.isArray(value.reasons)) return false;
  const expectedProfile = profile === 'provenance' ? 'gv.valley-of-technocore.provenance/1' : 'technocore.msg.v1';
  if (value.profile !== expectedProfile || !['valid', 'invalid'].includes(value.signature_status)) return false;
  if (status === 'verified') return value.decision === 'verified' && value.signature_status === 'valid' && value.reasons.length === 0;
  const expectedReason = profile === 'provenance' ? 'request_signature_invalid' : 'signature_invalid';
  return value.decision === 'invalid' && value.signature_status === 'invalid'
    && JSON.stringify(value.reasons) === JSON.stringify([expectedReason]);
}

async function readBounded(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new Error('input exceeds 1 MiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function verifyPin() {
  if (!matchesPin(MANIFEST, PINNED_MANIFEST)) return unavailable('release manifest pin mismatch');
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== PINNED_MANIFEST.nodeMajor) return unavailable('node major mismatch');
  if (!(await lstat(ARCHIVE_PATH)).isFile()) return unavailable('release archive path mismatch');
  const archive = await readFile(ARCHIVE_PATH);
  if (archive.length !== PINNED_MANIFEST.archive.bytes || sha256(archive) !== PINNED_MANIFEST.archive.sha256) {
    return unavailable('release archive pin mismatch');
  }
  const members = tarMembers(archive);
  if (!members) return unavailable('release archive format mismatch');
  for (const [relativePath, expected] of Object.entries(PINNED_MANIFEST.runtimeFiles)) {
    const runtimePath = join(REPO_ROOT, relativePath);
    if (!(await lstat(runtimePath)).isFile()) return unavailable(`runtime path mismatch: ${relativePath}`);
    const actual = await readFile(runtimePath);
    if (sha256(actual) !== expected) return unavailable(`runtime member mismatch: ${relativePath}`);
    const archived = members.get(`${PINNED_MANIFEST.archive.prefix}${relativePath}`);
    if (!archived || !archived.equals(actual)) return unavailable(`runtime archive member mismatch: ${relativePath}`);
  }
  return null;
}

function cleanEnvironment() {
  return Object.freeze({
    LANG: 'C',
    LC_ALL: 'C',
    NODE_OPTIONS: `--max-old-space-size=${MAX_HEAP_MB}`
  });
}

export async function invoke(profile, input) {
  const argv = PROFILES.get(profile);
  if (!argv || !Buffer.isBuffer(input)) return unavailable('invalid adapter request');
  let pinFailure;
  try {
    pinFailure = await verifyPin();
  } catch {
    return unavailable('release pin unavailable');
  }
  if (pinFailure) return pinFailure;
  if (input.length > MAX_INPUT_BYTES) {
    return Object.freeze({ status: 'input_rejected', report: null, stdout: '', stderr: 'error: input exceeds 1 MiB\n' });
  }
  let child;
  try {
    child = spawn(process.execPath, [CLI_PATH, ...argv], {
      cwd: REPO_ROOT,
      env: cleanEnvironment(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch {
    return unavailable('pinned verifier unavailable');
  }
  const stdoutChunks = [];
  const stderrChunks = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let overLimit = false;
  const collect = (target, limit, chunk) => {
    if (overLimit) return;
    if ((target === stdoutChunks ? stdoutBytes : stderrBytes) + chunk.length > limit) {
      overLimit = true;
      child.kill('SIGKILL');
      return;
    }
    target.push(chunk);
    if (target === stdoutChunks) stdoutBytes += chunk.length;
    else stderrBytes += chunk.length;
  };
  child.stdout.on('data', (chunk) => collect(stdoutChunks, MAX_STDOUT_BYTES, chunk));
  child.stderr.on('data', (chunk) => collect(stderrChunks, MAX_STDERR_BYTES, chunk));
  const timer = setTimeout(() => { overLimit = true; child.kill('SIGKILL'); }, MAX_WALL_MS);
  child.stdin.end(input);
  const outcome = await new Promise((resolveOutcome) => {
    child.once('error', () => resolveOutcome({ error: true }));
    child.once('close', (code, signal) => resolveOutcome({ code, signal }));
  });
  clearTimeout(timer);
  if (overLimit || outcome.error || outcome.signal) return unavailable('verifier runtime deviation');
  const stdoutBuffer = Buffer.concat(stdoutChunks);
  const stderrBuffer = Buffer.concat(stderrChunks);
  const stdout = decodeUtf8(stdoutBuffer);
  const stderr = decodeUtf8(stderrBuffer);
  if (stdout === null || stderr === null) return unavailable('verifier output is not UTF-8');
  if (outcome.code === 0 || outcome.code === 3) {
    if (stderr !== '') return unavailable('unexpected verifier stderr');
    const report = canonicalJson(stdoutBuffer);
    const status = outcome.code === 0 ? 'verified' : 'cryptographic_invalid';
    if (!validReport(profile, report, status)) return unavailable('verifier result mismatch');
    return Object.freeze({ status, report, stdout, stderr });
  }
  if (outcome.code === 2 && stdout === '' && exactDiagnostic(stderr)) {
    return Object.freeze({ status: 'input_rejected', report: null, stdout, stderr });
  }
  return unavailable('verifier contract mismatch');
}

async function main() {
  const [profile, operation, ...extra] = process.argv.slice(2);
  if (!PROFILES.has(profile) || operation !== 'verify' || extra.length !== 0) {
    process.stderr.write('error: only explicit stdin-only verifier profiles are supported\n');
    return 2;
  }
  try {
    const pinFailure = await verifyPin();
    if (pinFailure) {
      process.stderr.write('error: verifier unavailable\n');
      return 1;
    }
  } catch {
    process.stderr.write('error: verifier unavailable\n');
    return 1;
  }
  let input;
  try {
    input = await readBounded(process.stdin);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return 2;
  }
  let result;
  try {
    result = await invoke(profile, input);
  } catch {
    result = unavailable('verifier unavailable');
  }
  if (result.status === 'unavailable') {
    process.stderr.write('error: verifier unavailable\n');
    return 1;
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 'cryptographic_invalid' ? 3 : result.status === 'input_rejected' ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
