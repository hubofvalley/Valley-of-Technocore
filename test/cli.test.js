import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createEvidence, parseStrictJson, verifyEvidence } from '../src/cli.js';

const DID = 'did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw';
const SIGNATURE = '5VZDAMNgrHKQhuLMgG6CioSHfx645dl02HPgZSJJAVVfuIIVkKM7rMYeOXAc-bRr0lv18FlbviRlUUFDjnoQCw';
const validInput = {
  room: 'lobby', sequence: 0, server_attributed_did: DID, signer_did: DID,
  payload_b64u: '', signature_b64u: SIGNATURE
};

function cli(command, input) {
  return spawnSync(process.execPath, ['bin/valley-technocore.js', command], {
    cwd: new URL('..', import.meta.url), input, encoding: 'utf8'
  });
}

test('creates byte-identical canonical evidence', () => {
  const a = cli('create-evidence', JSON.stringify(validInput));
  const b = cli('create-evidence', JSON.stringify({ signature_b64u: SIGNATURE, payload_b64u: '', signer_did: DID, server_attributed_did: DID, sequence: 0, room: 'lobby' }));
  assert.equal(a.status, 0); assert.equal(a.stdout, b.stdout);
  assert.match(a.stdout, /"payload_sha256":"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"/u);
});

test('verifies RFC 8032 Ed25519 test vector', () => {
  const report = verifyEvidence(createEvidence(validInput));
  assert.equal(report.payload_hash_status, 'valid'); assert.equal(report.signature_status, 'valid');
  assert.equal(report.authority, 'none'); assert.equal(report.server_attribution_status, 'observed-only');
});

test('returns exit 3 for modified hash or signature', () => {
  const evidence = createEvidence(validInput);
  evidence.statement.payload_sha256 = `sha256:${'0'.repeat(64)}`;
  let result = cli('verify-evidence', JSON.stringify(evidence));
  assert.equal(result.status, 3); assert.match(result.stdout, /"payload_hash_status":"invalid"/u);
  evidence.statement.payload_sha256 = createEvidence(validInput).statement.payload_sha256;
  evidence.statement.signature.value = `${SIGNATURE.slice(0, -1)}A`;
  result = cli('verify-evidence', JSON.stringify(evidence));
  assert.equal(result.status, 3); assert.match(result.stdout, /"signature_status":"invalid"/u);
});

test('rejects duplicate keys, floats, trailing content, and unknown fields', () => {
  for (const input of ['{"room":"a","room":"b"}', '{"n":1.5}', '{} trailing']) assert.throws(() => parseStrictJson(input));
  assert.throws(() => createEvidence({ ...validInput, extra: true }));
});

test('rejects unsupported DID, invalid base64url, and oversized input', () => {
  assert.throws(() => createEvidence({ ...validInput, signer_did: 'did:web:example.com' }));
  assert.throws(() => createEvidence({ ...validInput, payload_b64u: '===' }));
  const result = cli('create-evidence', ' '.repeat(1024 * 1024 + 1));
  assert.equal(result.status, 2); assert.match(result.stderr, /exceeds 1 MiB/u);
});

test('rejects BOM, nested duplicates, non-integer syntax, overflow, and weak keys', () => {
  assert.equal(cli('create-evidence', `\ufeff${JSON.stringify(validInput)}`).status, 2);
  assert.throws(() => parseStrictJson('{"x":{"value":1,"value":2}}'));
  for (const sequence of ['1.0', '1e0', '9223372036854775808']) {
    const text = JSON.stringify(validInput).replace('"sequence":0', `"sequence":${sequence}`);
    assert.equal(cli('create-evidence', text).status, 2);
  }
  const weakDid = 'did:key:z6MkeTG3bFFSLYVU7VqhgZxqr6YzpaGrQtFMh1uvqGy1vDnP';
  assert.throws(() => createEvidence({ ...validInput, signer_did: weakDid }));
});

test('preserves maximum signed 63-bit sequence without precision loss', () => {
  const text = JSON.stringify(validInput).replace('"sequence":0', '"sequence":9223372036854775807');
  const result = cli('create-evidence', text);
  assert.equal(result.status, 0); assert.match(result.stdout, /"sequence":9223372036854775807/u);
  assert.equal(cli('verify-evidence', result.stdout).status, 0);
});

test('server attribution remains observed-only regardless of DID equality', () => {
  const otherDid = 'did:key:z6MkqRYqQiSgvMVa8mHoVXdYGrGJ5Z7kCqKxYS1a7nZKrX1R';
  const evidence = createEvidence({ ...validInput, server_attributed_did: otherDid });
  const report = verifyEvidence(evidence);
  assert.equal(report.signature_status, 'valid'); assert.equal(report.server_attribution_status, 'observed-only');
});

test('room accepts bounded identifiers and rejects URL or shell-like strings', () => {
  assert.equal(createEvidence({ ...validInput, room: 'lobby-1.test_room' }).authority, 'none');
  for (const room of ['https://evil.invalid', '$(touch nope)', '../shadow', 'has space', 'a'.repeat(129)]) {
    assert.throws(() => createEvidence({ ...validInput, room }));
  }
});

test('malformed input and unsupported command return exit 2', () => {
  assert.equal(cli('create-evidence', '{').status, 2);
  assert.equal(cli('unknown', '{}').status, 2);
});
