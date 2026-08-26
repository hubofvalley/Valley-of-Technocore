import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { verifyAttestation } from '../src/attestation.js';

const root = new URL('..', import.meta.url);
const fixtureText = readFileSync(new URL('../fixtures/release-attestation-v1.json', import.meta.url), 'utf8');
const fixture = JSON.parse(fixtureText);
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes) {
  let number = BigInt(`0x${bytes.toString('hex') || '0'}`); let encoded = '';
  while (number) { encoded = BASE58[Number(number % 58n)] + encoded; number /= 58n; }
  let zeros = 0; while (bytes[zeros] === 0) zeros += 1;
  return `${'1'.repeat(zeros)}${encoded}`;
}

function didFromHex(hex) { return `did:key:z${encodeBase58(Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(hex, 'hex')]))}`; }

function cli(input, args = [], env = process.env) {
  return spawnSync(process.execPath, ['bin/valley-attestation.js', ...args], { cwd: root, input, encoding: 'utf8', env });
}

test('verifies the signed RC5 release attestation', () => {
  const report = verifyAttestation(fixture);
  assert.deepEqual(report, {
    schema_status: 'valid', did_status: 'valid', signature_status: 'valid',
    external_facts_status: 'not-checked', signed_at_status: 'declared-only', authority: 'none'
  });
  const result = cli(fixtureText);
  assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.equal(result.stdout, '{"authority":"none","did_status":"valid","external_facts_status":"not-checked","schema_status":"valid","signature_status":"valid","signed_at_status":"declared-only"}');
});

test('locks the exact public RC5 ceremony binding', () => {
  assert.deepEqual(fixture.statement, {
    schema: 'gv.valley-of-technocore.release-attestation/1',
    attestation_key_did: 'did:key:z6MkjiuDrYh5Q1ck7WsvNDyLfLNLe763vaoAKhfN2JegDMQF',
    repository: 'https://github.com/hubofvalley/Valley-of-Technocore',
    commit: '57a3119bb0686bf914b8a89b72937c700d10b147', tag: 'v0.1.0-rc.5',
    digest: { kind: 'artifact', sha256: 'sha256:1e480b75f9c85580bde2d08a4153aae1585a9ffba02f34ace1f03f0afbfa896a' },
    signed_at: '2026-08-26T10:16:26Z'
  });
});

test('returns exit 3 when any signed statement byte changes', () => {
  for (const mutate of [
    (value) => { value.statement.tag = 'v0.1.0-rc.6'; },
    (value) => { value.statement.commit = `0${value.statement.commit.slice(1)}`; },
    (value) => { value.statement.digest.sha256 = `sha256:${'0'.repeat(64)}`; },
    (value) => { value.statement.signed_at = '2026-08-26T10:16:27Z'; }
  ]) {
    const changed = structuredClone(fixture); mutate(changed);
    const result = cli(JSON.stringify(changed));
    assert.equal(result.status, 3); assert.match(result.stdout, /"signature_status":"invalid"/u);
  }
});

test('rejects signature mutation, padding, wrong length, and unsupported algorithm', () => {
  const values = [
    `${fixture.signature.value.slice(0, -1)}A`,
    `${fixture.signature.value}=`,
    fixture.signature.value.slice(1)
  ];
  assert.equal(cli(JSON.stringify({ ...fixture, signature: { ...fixture.signature, value: values[0] } })).status, 3);
  for (const value of values.slice(1)) assert.equal(cli(JSON.stringify({ ...fixture, signature: { ...fixture.signature, value } })).status, 2);
  assert.equal(cli(JSON.stringify({ ...fixture, signature: { ...fixture.signature, algorithm: 'Ed25519ph' } })).status, 2);
});

test('classifies invalid R and out-of-range S as processable invalid signatures', () => {
  const order = (1n << 252n) + 27742317777372353535851937790883648493n;
  const littleEndian = (number) => { const bytes = Buffer.alloc(32); for (let i = 0; i < 32; i += 1) { bytes[i] = Number(number & 255n); number >>= 8n; } return bytes; };
  const original = Buffer.from(fixture.signature.value, 'base64url');
  const signatures = [
    Buffer.concat([Buffer.alloc(32), original.subarray(32)]),
    Buffer.concat([Buffer.alloc(32, 0xff), original.subarray(32)]),
    Buffer.concat([original.subarray(0, 32), littleEndian(order)]),
    Buffer.concat([original.subarray(0, 32), littleEndian(order + 1n)])
  ];
  for (const signature of signatures) {
    const changed = structuredClone(fixture); changed.signature.value = signature.toString('base64url');
    const result = cli(JSON.stringify(changed));
    assert.equal(result.status, 3); assert.match(result.stdout, /"signature_status":"invalid"/u);
  }
});

test('rejects duplicate, unknown, missing, malformed, oversized, and non-UTF8 input', () => {
  const duplicate = fixtureText.replace('"schema":', '"schema":"wrong","schema":');
  assert.equal(cli(duplicate).status, 2);
  assert.equal(cli(JSON.stringify({ ...fixture, extra: 'no' })).status, 2);
  const missing = structuredClone(fixture); delete missing.statement.tag;
  assert.equal(cli(JSON.stringify(missing)).status, 2);
  assert.equal(cli('{').status, 2);
  assert.equal(cli(' '.repeat(1024 * 1024 + 1)).status, 2);
  assert.equal(cli(Buffer.from([0xff])).status, 2);
  const escapedOversize = fixtureText.replace('"v0.1.0-rc.5"', `"${'\\n'.repeat(262145)}"`);
  const escapedResult = cli(escapedOversize);
  assert.equal(escapedResult.status, 2); assert.match(escapedResult.stderr, /JSON string exceeds limit/u);
  const excessiveDepth = `${'{"x":'.repeat(17)}"end"${'}'.repeat(17)}`;
  const depthResult = cli(excessiveDepth);
  assert.equal(depthResult.status, 2); assert.match(depthResult.stderr, /JSON nesting exceeds limit/u);
});

test('rejects malformed fields and weak or invalid Ed25519 keys', () => {
  const cases = [
    ['commit', '57a3119'], ['signed_at', '2026-08-26T10:16:26.000Z']
  ];
  for (const [field, value] of cases) {
    const changed = structuredClone(fixture); changed.statement[field] = value;
    assert.equal(cli(JSON.stringify(changed)).status, 2);
  }
  for (const did of [
    'did:web:example.com',
    ...[
      '0000000000000000000000000000000000000000000000000000000000000000',
      '0100000000000000000000000000000000000000000000000000000000000000',
      'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
      'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
      'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
      '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
      'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39cc3c0e0d174c5e44377a'
    ].map(didFromHex),
    'did:key:z6MkqRYqQiSgvMVa8mHoVXdYGrGJ5Z7kCqKxYS1a7nZKrX1R'
  ]) {
    const changed = structuredClone(fixture); changed.statement.attestation_key_did = did;
    assert.equal(cli(JSON.stringify(changed)).status, 2);
  }
});

test('treats repository and tag as exact signed strings without normalization', () => {
  for (const [field, value] of [['repository', 'http://example.invalid/repo'], ['tag', '../rc5']]) {
    const changed = structuredClone(fixture); changed.statement[field] = value;
    assert.equal(cli(JSON.stringify(changed)).status, 3);
  }
});

test('is environment-invariant and writes no files', () => {
  const hostile = { ...process.env, TZ: 'Pacific/Kiritimati', LANG: 'C', HOME: '/nonexistent', HTTP_PROXY: 'http://127.0.0.1:1' };
  const normal = cli(fixtureText); const changed = cli(fixtureText, [], hostile);
  assert.equal(changed.status, 0); assert.equal(changed.stdout, normal.stdout); assert.equal(changed.stderr, '');
});

test('unsupported command returns exit 2', () => {
  assert.equal(cli(fixtureText, ['unknown']).status, 2);
});

test('accepts equivalent JSON representation and rejects impossible timestamps', () => {
  const reordered = JSON.stringify({ signature: fixture.signature, statement: fixture.statement });
  assert.equal(cli(` \n${reordered}\n`).status, 0);
  for (const signedAt of ['2026-02-30T10:16:26Z', '2026-08-26T24:00:00Z', '2026-08-26T10:16:60Z']) {
    const changed = structuredClone(fixture); changed.statement.signed_at = signedAt;
    assert.equal(cli(JSON.stringify(changed)).status, 2);
  }
});
