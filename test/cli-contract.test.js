import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('..', import.meta.url);

function run(entrypoint, args = [], input = '{not JSON') {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: root, input, encoding: 'utf8'
  });
}

test('CLI help is discoverable, complete, and never reads stdin', () => {
  const rootHelp = run('bin/valley-technocore.js', ['--help']);
  assert.equal(rootHelp.status, 0); assert.equal(rootHelp.stderr, '');
  for (const command of ['verify', 'evidence', 'message', 'receipt', 'provenance', 'batch', 'create-evidence', 'verify-evidence', 'verify-technocore-message']) assert.match(rootHelp.stdout, new RegExp(`\\b${command}\\b`, 'u'));

  for (const command of ['create-evidence', 'verify-evidence', 'verify-technocore-message']) {
    const help = run('bin/valley-technocore.js', [command, '--help']);
    assert.equal(help.status, 0, command); assert.equal(help.stderr, '', command);
    assert.match(help.stdout, new RegExp(`usage: valley-technocore ${command}`, 'u'), command);
  }
  const verifierHelp = run('bin/valley-technocore.js', ['verify-technocore-message', '--help']);
  for (const field of ['schema', 'room', 'did', 'nonce', 'text', 'signature_b64u']) assert.match(verifierHelp.stdout, new RegExp(`\\b${field}\\b`, 'u'));

  const attestationHelp = run('bin/valley-attestation.js', ['--help']);
  assert.equal(attestationHelp.status, 0); assert.equal(attestationHelp.stderr, '');
  assert.match(attestationHelp.stdout, /usage: valley-attestation/u);
  for (const group of ['evidence', 'message', 'receipt', 'provenance', 'batch']) {
    const help = run('bin/valley-technocore.js', [group, '--help']);
    assert.equal(help.status, 0, group); assert.equal(help.stderr, '', group); assert.match(help.stdout, new RegExp(`valley-technocore ${group}`, 'u'));
  }
  for (const command of ['normalize', 'verify']) {
    const help = run('bin/valley-technocore.js', ['receipt', command, '--help']);
    assert.equal(help.status, 0, command); assert.equal(help.stderr, '', command);
    assert.match(help.stdout, /valley-technocore receipt/u);
  }
  for (const command of ['create', 'verify']) {
    const help = run('bin/valley-technocore.js', ['provenance', command, '--help']);
    assert.equal(help.status, 0, command); assert.equal(help.stderr, '', command);
    assert.match(help.stdout, /valley-technocore provenance/u);
  }
});

test('hierarchical commands retain canonical artefacts and offer human-readable verification reports', () => {
  const evidenceText = readFileSync(new URL('../fixtures/valid-evidence.json', import.meta.url), 'utf8');
  const legacy = run('bin/valley-technocore.js', ['verify-evidence'], evidenceText);
  const hierarchical = run('bin/valley-technocore.js', ['evidence', 'verify'], evidenceText);
  assert.equal(hierarchical.status, 0); assert.equal(hierarchical.stdout, legacy.stdout);
  const human = run('bin/valley-technocore.js', ['evidence', 'verify', '--format', 'human'], evidenceText);
  assert.equal(human.status, 0); assert.match(human.stdout, /^schema status: valid$/mu);
  assert.match(human.stdout, /^authority: none$/mu); assert.equal(human.stderr, '');
  const createHuman = run('bin/valley-technocore.js', ['evidence', 'create', '--format', 'human'], readFileSync(new URL('../fixtures/valid-input.json', import.meta.url), 'utf8'));
  assert.equal(createHuman.status, 2); assert.equal(createHuman.stdout, ''); assert.match(createHuman.stderr, /^error: unknown command or option/mu);
  const bad = run('bin/valley-technocore.js', ['evidence', 'wat']);
  assert.equal(bad.status, 2); assert.match(bad.stderr, /^error: unknown command or option/mu);
  const attestation = run('bin/valley-attestation.js', ['verify', '--format', 'human'], readFileSync(new URL('../fixtures/release-attestation-v1.json', import.meta.url), 'utf8'));
  assert.equal(attestation.status, 0); assert.match(attestation.stdout, /^signature status: valid$/mu);
});

test('normalises supported local receipt exports and reports missing signatures clearly', () => {
  const canonical = JSON.parse(readFileSync(new URL('../fixtures/technocore-msg-v1-gauntlet.json', import.meta.url), 'utf8'));
  const flat = { room: canonical.room, did: canonical.did, nonce: canonical.nonce, text: canonical.text, signature: canonical.signature_b64u };
  const normalised = run('bin/valley-technocore.js', ['receipt', 'normalize'], JSON.stringify(flat));
  assert.equal(normalised.status, 0); assert.deepEqual(JSON.parse(normalised.stdout), canonical);
  const normaliseHuman = run('bin/valley-technocore.js', ['receipt', 'normalize', '--format', 'human'], JSON.stringify(flat));
  assert.equal(normaliseHuman.status, 2); assert.equal(normaliseHuman.stdout, ''); assert.match(normaliseHuman.stderr, /^error: unknown receipt command or option/mu);
  const envelope = { room: canonical.room, receipt: { signer_did: canonical.did, nonce: canonical.nonce, message: canonical.text, signature: canonical.signature_b64u } };
  const verified = run('bin/valley-technocore.js', ['receipt', 'verify', '--format', 'human'], JSON.stringify(envelope));
  assert.equal(verified.status, 0); assert.match(verified.stdout, /^decision: verified$/mu);
  const missing = run('bin/valley-technocore.js', ['receipt', 'verify'], JSON.stringify({ ...flat, signature: undefined }));
  assert.equal(missing.status, 2); assert.match(missing.stderr, /missing a detached signature/u);
  const envelopeMissing = run('bin/valley-technocore.js', ['receipt', 'verify'], JSON.stringify({ room: canonical.room, receipt: { did: canonical.did, nonce: canonical.nonce, text: canonical.text } }));
  assert.equal(envelopeMissing.status, 2); assert.match(envelopeMissing.stderr, /missing a detached signature/u);
});

test('documented CLI commands remain discoverable from README', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const command of ['create-evidence', 'verify-evidence', 'verify-technocore-message', 'valley-attestation']) {
    assert.match(readme, new RegExp(`\\b${command}\\b`, 'u'));
  }
  assert.match(readme, /Default output, and explicit `--format json` output, is one canonical JSON object/u);
  assert.match(readme, /`--format human` is available only for verification and report commands/u);
  assert.match(readme, /Evidence creation and receipt normalisation always emit canonical JSON artefacts/u);
  assert.ok(readme.includes('derive Technocore signing bytes as `room|nonce|swept-text`'));
  assert.match(readme, /Selected output \(the human report also lists `non claims:`\)/u);
  assert.match(readme, /`evidence verify`:.*has no `reasons` field/u);
});

test('machine reports preserve their allowed schema and claim boundaries', () => {
  const evidence = run('bin/valley-technocore.js', ['verify-evidence'], readFileSync(new URL('../fixtures/valid-evidence.json', import.meta.url), 'utf8'));
  assert.equal(evidence.status, 0);
  assert.deepEqual(JSON.parse(evidence.stdout), {
    authority: 'none', did_status: 'valid', payload_hash_status: 'valid', schema_status: 'valid', server_attribution_status: 'observed-only', signature_status: 'valid'
  });

  const message = run('bin/valley-technocore.js', ['verify-technocore-message'], readFileSync(new URL('../fixtures/technocore-msg-v1-gauntlet.json', import.meta.url), 'utf8'));
  assert.equal(message.status, 0);
  assert.deepEqual(JSON.parse(message.stdout), {
    profile: 'technocore.msg.v1', decision: 'verified', signature_status: 'valid', reasons: [],
    non_claims: [
      'identity_not_established',
      'authorship_beyond_key_control_not_established',
      'source_authenticity_not_established',
      'server_inclusion_not_established',
      'recognition_eligibility_rewards_authority_not_established'
    ]
  });

  const attestation = run('bin/valley-attestation.js', [], readFileSync(new URL('../fixtures/release-attestation-v1.json', import.meta.url), 'utf8'));
  assert.equal(attestation.status, 0);
  assert.deepEqual(JSON.parse(attestation.stdout), {
    authority: 'none', did_status: 'valid', external_facts_status: 'not-checked', schema_status: 'valid', signature_status: 'valid', signed_at_status: 'declared-only'
  });
});

test('processable-invalid reports preserve exact schemas and enums', () => {
  const evidenceInput = JSON.parse(readFileSync(new URL('../fixtures/valid-evidence.json', import.meta.url), 'utf8'));
  evidenceInput.statement.payload_sha256 = `sha256:${'0'.repeat(64)}`;
  const evidence = run('bin/valley-technocore.js', ['verify-evidence'], JSON.stringify(evidenceInput));
  assert.equal(evidence.status, 3);
  assert.deepEqual(JSON.parse(evidence.stdout), {
    authority: 'none', did_status: 'valid', payload_hash_status: 'invalid', schema_status: 'valid', server_attribution_status: 'observed-only', signature_status: 'valid'
  });

  const messageInput = JSON.parse(readFileSync(new URL('../fixtures/technocore-msg-v1-gauntlet.json', import.meta.url), 'utf8'));
  messageInput.text += '!';
  const message = run('bin/valley-technocore.js', ['message', 'verify'], JSON.stringify(messageInput));
  assert.equal(message.status, 3);
  assert.deepEqual(JSON.parse(message.stdout), {
    profile: 'technocore.msg.v1', decision: 'invalid', signature_status: 'invalid', reasons: ['signature_invalid'],
    non_claims: ['identity_not_established', 'authorship_beyond_key_control_not_established', 'source_authenticity_not_established', 'server_inclusion_not_established', 'recognition_eligibility_rewards_authority_not_established']
  });

  const attestationInput = JSON.parse(readFileSync(new URL('../fixtures/release-attestation-v1.json', import.meta.url), 'utf8'));
  attestationInput.statement.tag += '-changed';
  const attestation = run('bin/valley-attestation.js', ['verify'], JSON.stringify(attestationInput));
  assert.equal(attestation.status, 3);
  assert.deepEqual(JSON.parse(attestation.stdout), {
    authority: 'none', did_status: 'valid', external_facts_status: 'not-checked', schema_status: 'valid', signature_status: 'invalid', signed_at_status: 'declared-only'
  });
});
