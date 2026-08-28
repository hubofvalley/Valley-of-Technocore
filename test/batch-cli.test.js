import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const message = JSON.parse(readFileSync(new URL('../fixtures/technocore-msg-v1-gauntlet.json', import.meta.url), 'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../fixtures/valid-evidence.json', import.meta.url), 'utf8'));

function batch(profile, records) {
  return spawnSync(process.execPath, ['bin/valley-technocore.js', 'batch', 'verify', profile], {
    cwd: root, input: records.join('\n'), encoding: 'utf8'
  });
}

function lines(result) {
  return result.stdout.trimEnd().split('\n').map((line) => JSON.parse(line));
}

test('batch message verification emits deterministic JSONL item records followed by a summary', () => {
  const valid = JSON.stringify(message);
  const invalid = JSON.stringify({ ...message, text: `${message.text}!` });
  const malformed = '{';
  const first = batch('message', [valid, invalid, malformed]);
  const second = batch('message', [valid, invalid, malformed]);
  assert.equal(first.status, 2); assert.equal(first.stderr, ''); assert.equal(first.stdout, second.stdout);
  assert.deepEqual(lines(first), [
    {
      index: 1, outcome: 'verified', profile: 'message', type: 'item', report: {
        decision: 'verified', non_claims: ['identity_not_established', 'authorship_beyond_key_control_not_established', 'source_authenticity_not_established', 'server_inclusion_not_established', 'recognition_eligibility_rewards_authority_not_established'],
        profile: 'technocore.msg.v1', reasons: [], signature_status: 'valid'
      }
    },
    {
      index: 2, outcome: 'invalid', profile: 'message', type: 'item', report: {
        decision: 'invalid', non_claims: ['identity_not_established', 'authorship_beyond_key_control_not_established', 'source_authenticity_not_established', 'server_inclusion_not_established', 'recognition_eligibility_rewards_authority_not_established'],
        profile: 'technocore.msg.v1', reasons: ['signature_invalid'], signature_status: 'invalid'
      }
    },
    { error: 'object key must be a string', index: 3, outcome: 'malformed', profile: 'message', type: 'item' },
    { invalid: 1, malformed: 1, profile: 'message', total: 3, type: 'summary', verified: 1 }
  ]);
});

test('batch exit code is stable: 0 all valid, 3 any invalid, 2 any malformed', () => {
  const valid = JSON.stringify(message);
  assert.equal(batch('message', [valid]).status, 0);
  assert.equal(batch('message', [JSON.stringify({ ...message, nonce: '1787676243536' })]).status, 3);
  assert.equal(batch('message', ['{}']).status, 2);
});

test('batch supports evidence and local receipt profiles without changing their report contracts', () => {
  const evidenceResult = batch('evidence', [JSON.stringify(evidence)]);
  assert.equal(evidenceResult.status, 0);
  const evidenceLines = lines(evidenceResult);
  assert.equal(evidenceLines[0].outcome, 'verified');
  assert.deepEqual(evidenceLines[0].report, {
    authority: 'none', did_status: 'valid', payload_hash_status: 'valid', schema_status: 'valid', server_attribution_status: 'observed-only', signature_status: 'valid'
  });
  const receipt = { room: message.room, did: message.did, nonce: message.nonce, text: message.text, signature: message.signature_b64u };
  const receiptResult = batch('receipt', [JSON.stringify(receipt)]);
  assert.equal(receiptResult.status, 0);
  assert.equal(lines(receiptResult)[0].report.decision, 'verified');
});

test('batch help and invalid invocations do not read or write paths', () => {
  const help = spawnSync(process.execPath, ['bin/valley-technocore.js', 'batch', '--help'], { cwd: root, input: '{', encoding: 'utf8' });
  assert.equal(help.status, 0); assert.equal(help.stderr, ''); assert.match(help.stdout, /NDJSON/u);
  const invalid = spawnSync(process.execPath, ['bin/valley-technocore.js', 'batch', 'verify', 'directory'], { cwd: root, input: '', encoding: 'utf8' });
  assert.equal(invalid.status, 2); assert.match(invalid.stderr, /^error: unknown batch command or profile/mu);
});
