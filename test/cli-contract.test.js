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
  for (const command of ['create-evidence', 'verify-evidence', 'verify-technocore-message']) assert.match(rootHelp.stdout, new RegExp(`\\b${command}\\b`, 'u'));

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
});

test('documented CLI commands remain discoverable from README', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const command of ['create-evidence', 'verify-evidence', 'verify-technocore-message', 'valley-attestation']) {
    assert.match(readme, new RegExp(`\\b${command}\\b`, 'u'));
  }
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
