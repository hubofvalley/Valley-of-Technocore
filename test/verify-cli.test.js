import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const evidence = JSON.parse(readFileSync(new URL('../fixtures/valid-evidence.json', import.meta.url), 'utf8'));
const message = JSON.parse(readFileSync(new URL('../fixtures/technocore-msg-v1-gauntlet.json', import.meta.url), 'utf8'));
const capture = JSON.parse(readFileSync(new URL('../fixtures/technocore-provenance-capture-v1.json', import.meta.url), 'utf8'));
const attestation = JSON.parse(readFileSync(new URL('../fixtures/release-attestation-v1.json', import.meta.url), 'utf8'));

function cli(args, input) {
  return spawnSync(process.execPath, ['bin/valley-technocore.js', 'verify', ...args], {
    cwd: root, input: JSON.stringify(input), encoding: 'utf8'
  });
}

function report(result) {
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('universal verify classifies all supported input representations', () => {
  const receipt = { room: message.room, did: message.did, nonce: message.nonce, text: message.text, signature: message.signature_b64u };
  const envelope = { room: message.room, receipt: { signer_did: message.did, nonce: message.nonce, message: message.text, signature: message.signature_b64u } };
  const provenance = JSON.parse(spawnSync(process.execPath, ['bin/valley-technocore.js', 'provenance', 'create'], {
    cwd: root, input: JSON.stringify(capture), encoding: 'utf8'
  }).stdout);
  for (const [kind, input] of [
    ['evidence', evidence], ['message', message], ['receipt-flat', receipt], ['receipt-envelope', envelope], ['provenance_capture', capture], ['provenance_bundle', provenance], ['release_attestation', attestation]
  ]) {
    const result = cli([], input);
    assert.equal(result.status, 0, kind);
    assert.equal(report(result).classification, kind.startsWith('receipt-') ? 'receipt' : kind);
    assert.equal(report(result).failure_category, 'none');
  }
});

test('canonical machine reports remain nested unchanged and human output is actionable', () => {
  const invalid = { ...message, text: `${message.text}!` };
  const jsonResult = cli([], invalid);
  assert.equal(jsonResult.status, 3);
  const json = report(jsonResult);
  assert.equal(json.classification, 'message');
  assert.equal(json.failure_category, 'cryptographic_invalidity');
  assert.deepEqual(json.report, {
    profile: 'technocore.msg.v1', decision: 'invalid', signature_status: 'invalid', reasons: ['signature_invalid'],
    non_claims: ['identity_not_established', 'authorship_beyond_key_control_not_established', 'source_authenticity_not_established', 'server_inclusion_not_established', 'recognition_eligibility_rewards_authority_not_established']
  });
  const human = spawnSync(process.execPath, ['bin/valley-technocore.js', 'verify', '--format', 'human'], {
    cwd: root, input: JSON.stringify(invalid), encoding: 'utf8'
  });
  assert.equal(human.status, 3); assert.equal(human.stderr, '');
  assert.match(human.stdout, /^classification: message$/mu);
  assert.match(human.stdout, /^failure category: cryptographic_invalidity$/mu);
  assert.match(human.stdout, /^next safe action: Re-check the exact local bytes/mu);
});

test('missing signatures and receipt normalisation failures identify safe recovery', () => {
  const missing = { room: message.room, did: message.did, nonce: message.nonce, text: message.text };
  const missingResult = spawnSync(process.execPath, ['bin/valley-technocore.js', 'verify', '--format', 'human'], {
    cwd: root, input: JSON.stringify(missing), encoding: 'utf8'
  });
  assert.equal(missingResult.status, 2); assert.equal(missingResult.stdout, '');
  assert.match(missingResult.stderr, /^classification: receipt$/mu);
  assert.match(missingResult.stderr, /^failure category: missing_signature$/mu);
  assert.match(missingResult.stderr, /^next safe action: Supply the detached signature/mu);

  const malformedReceipt = { room: message.room, did: message.did, nonce: message.nonce, signature: message.signature_b64u };
  const normalisation = spawnSync(process.execPath, ['bin/valley-technocore.js', 'verify', '--format', 'human'], {
    cwd: root, input: JSON.stringify(malformedReceipt), encoding: 'utf8'
  });
  assert.equal(normalisation.status, 2); assert.equal(normalisation.stdout, '');
  assert.match(normalisation.stderr, /^failure category: normalisation$/mu);
});

test('JSON, schema, provenance mismatch, ambiguous, and unknown failures are bounded', () => {
  const malformed = spawnSync(process.execPath, ['bin/valley-technocore.js', 'verify', '--format', 'human'], {
    cwd: root, input: '{', encoding: 'utf8'
  });
  assert.equal(malformed.status, 2); assert.match(malformed.stderr, /^classification: unknown$/mu); assert.match(malformed.stderr, /^failure category: json$/mu);

  const schema = cli(['--format', 'human'], { ...message, schema: 'unknown.profile.v1' });
  assert.equal(schema.status, 2); assert.match(schema.stderr, /^classification: message$/mu); assert.match(schema.stderr, /^failure category: schema$/mu);

  const missingAttestation = structuredClone(attestation); delete missingAttestation.signature;
  const missingAttestationResult = cli(['--format', 'human'], missingAttestation);
  assert.equal(missingAttestationResult.status, 2); assert.match(missingAttestationResult.stderr, /^classification: release_attestation$/mu); assert.match(missingAttestationResult.stderr, /^failure category: missing_signature$/mu);

  const provenance = JSON.parse(spawnSync(process.execPath, ['bin/valley-technocore.js', 'provenance', 'create'], {
    cwd: root, input: JSON.stringify(capture), encoding: 'utf8'
  }).stdout);
  provenance.response.posted.text += '!';
  const mismatch = cli(['--format', 'human'], provenance);
  assert.equal(mismatch.status, 2); assert.match(mismatch.stderr, /^classification: provenance_bundle$/mu); assert.match(mismatch.stderr, /^failure category: provenance_mismatch$/mu);

  const ambiguous = { ...message, source: {}, attribution: {}, authority: 'none' };
  const ambiguousResult = cli(['--format', 'human'], ambiguous);
  assert.equal(ambiguousResult.status, 2); assert.match(ambiguousResult.stderr, /ambiguous/u);

  const unknown = cli(['--format', 'human'], { not_a_supported_shape: 'x' });
  assert.equal(unknown.status, 2); assert.match(unknown.stderr, /unknown input shape/u);
});

test('JSON error output is canonical and keeps classification/report nullable', () => {
  const result = spawnSync(process.execPath, ['bin/valley-technocore.js', 'verify'], {
    cwd: root, input: '{', encoding: 'utf8'
  });
  assert.equal(result.status, 2); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    classification: null, error: 'object key must be a string', failure_category: 'json',
    next_safe_action: 'fix_local_json', report: null
  });
});

test('universal verify help never reads stdin', () => {
  const result = spawnSync(process.execPath, ['bin/valley-technocore.js', 'verify', '--help'], {
    cwd: root, input: '{not JSON', encoding: 'utf8'
  });
  assert.equal(result.status, 0); assert.equal(result.stderr, ''); assert.match(result.stdout, /classifies it as evidence/u);
});
