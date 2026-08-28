import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createProvenanceBundle, verifyProvenanceBundle } from '../src/provenance.js';

const root = new URL('..', import.meta.url);
const captureText = readFileSync(new URL('../fixtures/technocore-provenance-capture-v1.json', import.meta.url), 'utf8');
const capture = JSON.parse(captureText);

function cli(args, input) {
  return spawnSync(process.execPath, ['bin/valley-technocore.js', 'provenance', ...args], { cwd: root, input, encoding: 'utf8' });
}

test('creates one deterministic, strict bundle from a captured signed request and matching response record', () => {
  const first = cli(['create'], captureText); const second = cli(['create'], JSON.stringify(capture));
  assert.equal(first.status, 0); assert.equal(first.stderr, ''); assert.equal(first.stdout, second.stdout);
  const output = JSON.parse(first.stdout);
  assert.deepEqual(output, {
    schema: 'gv.valley-of-technocore.provenance/1',
    request: capture.request,
    response: capture.response
  });
  assert.deepEqual(createProvenanceBundle(capture).bundle, output);
});

test('verifies a provenance bundle offline without turning an observed response into an inclusion claim', () => {
  const bundle = cli(['create'], captureText).stdout;
  const result = cli(['verify', '--format', 'human'], bundle);
  assert.equal(result.status, 0); assert.match(result.stdout, /^decision: verified$/mu);
  assert.match(result.stdout, /^non claims: .*server_inclusion_not_established/mu);
  assert.equal(result.stderr, '');
  assert.equal(verifyProvenanceBundle(JSON.parse(bundle)).decision, 'verified');
});

test('returns exit 3 with a deterministic report for processable but invalid request signatures', () => {
  const invalid = structuredClone(capture);
  invalid.request.text += '!';
  invalid.response.posted.text += '!';
  const result = cli(['create'], JSON.stringify(invalid));
  assert.equal(result.status, 3); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    profile: 'gv.valley-of-technocore.provenance/1', decision: 'invalid', signature_status: 'invalid', reasons: ['request_signature_invalid'],
    non_claims: ['identity_not_established', 'authorship_beyond_key_control_not_established', 'source_authenticity_not_established', 'server_inclusion_not_established', 'recognition_eligibility_rewards_authority_not_established']
  });
});

test('rejects malformed or mismatched captures rather than bundling a different response record', () => {
  const badStatus = structuredClone(capture); badStatus.response.http_status = 201;
  const mismatch = structuredClone(capture); mismatch.response.posted.from = 'did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw';
  const extra = structuredClone(capture); extra.response.trace = 'untrusted';
  for (const value of [badStatus, mismatch, extra, { schema: 'technocore.provenance.capture.v2' }]) {
    const result = cli(['create'], JSON.stringify(value));
    assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.match(result.stderr, /^error: /mu);
  }
});

test('bundle verification reports processable signature tampering as invalid and structural tampering as malformed', () => {
  const bundle = JSON.parse(cli(['create'], captureText).stdout);
  const invalid = structuredClone(bundle); invalid.request.signature_b64u = `${invalid.request.signature_b64u.slice(0, -1)}A`;
  const invalidResult = cli(['verify'], JSON.stringify(invalid));
  assert.equal(invalidResult.status, 3); assert.equal(JSON.parse(invalidResult.stdout).reasons[0], 'request_signature_invalid');
  const malformed = structuredClone(bundle); malformed.response.posted.seq = 0;
  const malformedResult = cli(['verify'], JSON.stringify(malformed));
  assert.equal(malformedResult.status, 2); assert.equal(malformedResult.stdout, '');
});

test('provenance command help describes the local capture boundary', () => {
  for (const args of [['--help'], ['create', '--help'], ['verify', '--help']]) {
    const result = cli(args, '{not JSON');
    assert.equal(result.status, 0); assert.equal(result.stderr, '');
    assert.match(result.stdout, /does not fetch a server, replay a request, or prove server inclusion/u);
  }
});
