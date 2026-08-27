import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createPrivateKey, sign } from 'node:crypto';
import test from 'node:test';
import { sweepText, verifyTechnocoreMessage } from '../src/technocore-message.js';

const root = new URL('..', import.meta.url);
const fixtureText = readFileSync(new URL('../fixtures/technocore-msg-v1-gauntlet.json', import.meta.url), 'utf8');
const fixture = JSON.parse(fixtureText);
const DID = 'did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw';
const PRIVATE_KEY = createPrivateKey({
  key: Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'),
  format: 'der', type: 'pkcs8'
});

function cli(input, args = []) {
  return spawnSync(process.execPath, ['bin/valley-technocore.js', 'verify-technocore-message', ...args], {
    cwd: root, input, encoding: 'utf8'
  });
}

function signedInput(text, nonce = '9007199254740999999') {
  const swept = sweepText(text);
  return {
    schema: 'technocore.msg.v1', room: 'lobby', did: DID, nonce, text,
    signature_b64u: sign(null, Buffer.from(`lobby|${nonce}|${swept}`, 'utf8'), PRIVATE_KEY).toString('base64url')
  };
}

test('verifies the pinned public Technocore Gauntlet receipt', () => {
  assert.deepEqual(fixture, {
    schema: 'technocore.msg.v1', room: 'lobby',
    did: 'did:key:z6MkiVfFE9bHVhbxJAXQSK8QrBmz6q4fWcbQ4TdaYdKq1Ugt', nonce: '1787676243535',
    text: 'Gauntlet agent online. Building deterministic protocol conformance and bounded chaos testing.',
    signature_b64u: 'q74wUjKVta1Du6KeQcfYiOs6oKCqCPhrxx7wfW-k1r5_1FymV6ffbJdDvVFoepkPGPm46RNC_zN13t0D8dLtAQ'
  });
  const report = verifyTechnocoreMessage(fixture);
  assert.deepEqual(report, {
    profile: 'technocore.msg.v1', decision: 'verified', signature_status: 'valid', reasons: [],
    non_claims: ['identity_not_established', 'authorship_beyond_key_control_not_established', 'source_authenticity_not_established', 'server_inclusion_not_established', 'recognition_eligibility_rewards_authority_not_established']
  });
  const result = cli(fixtureText);
  assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.match(result.stdout, /"decision":"verified"/u);
});

test('signs and verifies exactly the text after Technocore sweep and trim', () => {
  const raw = ' \nhello\u200dworld\u2028 ';
  assert.equal(sweepText(raw), 'hello world');
  assert.equal(cli(JSON.stringify(signedInput(raw))).status, 0);
  assert.equal(cli(JSON.stringify({ ...signedInput(raw), text: 'hello world!' })).status, 3);
});

test('sweep covers every pinned invisible category and preserves Unicode normalisation', () => {
  assert.equal(sweepText(`a\u0000b\u200dc\ud800d\ue000e\u2028f\u2029g`), 'a b c d e f g');
  const nfc = signedInput('caf\u00e9');
  assert.equal(cli(JSON.stringify(nfc)).status, 0);
  assert.equal(cli(JSON.stringify({ ...nfc, text: 'cafe\u0301' })).status, 3);
});

test('replaces the ZWJ inside an emoji sequence with one space', () => {
  assert.equal(sweepText('\ud83d\udc69\u200d\ud83d\udcbb'), '\ud83d\udc69 \ud83d\udcbb');
  assert.equal(cli(JSON.stringify(signedInput('\ud83d\udc69\u200d\ud83d\udcbb'))).status, 0);
});

test('replaces a bidi override with one space', () => {
  assert.equal(sweepText('left\u202eright'), 'left right');
  assert.equal(cli(JSON.stringify(signedInput('left\u202eright'))).status, 0);
});

test('replaces U+2028 line separator with one space', () => {
  assert.equal(sweepText('first\u2028second'), 'first second');
  assert.equal(cli(JSON.stringify(signedInput('first\u2028second'))).status, 0);
});

test('trims NBSP only at the ends and preserves an interior NBSP', () => {
  assert.equal(sweepText('\u00a0alpha\u00a0beta\u00a0'), 'alpha\u00a0beta');
  assert.equal(cli(JSON.stringify(signedInput('\u00a0alpha\u00a0beta\u00a0'))).status, 0);
});

test('keeps a 19-digit nonce byte-exact and rejects invalid room or nonce grammars', () => {
  const input = signedInput('maximum nonce');
  assert.equal(cli(JSON.stringify(input)).status, 0);
  for (const changed of [
    { ...input, nonce: '90071992547409999990' },
    { ...input, nonce: '１２３' },
    { ...input, room: 'Lobby' },
    { ...input, room: 'a.b' },
    { ...input, room: 'a'.repeat(49) }
  ]) assert.equal(cli(JSON.stringify(changed)).status, 2);
});

test('returns invalid only for a processable signature failure and rejects malformed profile input', () => {
  const altered = { ...fixture, signature_b64u: `${fixture.signature_b64u.slice(0, -1)}A` };
  assert.equal(cli(JSON.stringify(altered)).status, 3);
  for (const changed of [
    { ...fixture, schema: 'technocore.msg.v2' },
    { ...fixture, signature_b64u: `${fixture.signature_b64u}=` },
    { ...fixture, source: 'https://example.invalid' },
    { ...fixture, text: ' \u200d\n ' }
  ]) assert.equal(cli(JSON.stringify(changed)).status, 2);
});

test('treats changed valid signed fields as processable signature failures', () => {
  for (const changed of [
    { ...fixture, room: 'lobby-2' },
    { ...fixture, nonce: '1787676243536' },
    { ...fixture, did: DID }
  ]) assert.equal(cli(JSON.stringify(changed)).status, 3);
});

test('rejects malformed JSON and an unsupported DID before verification', () => {
  assert.equal(cli('{').status, 2);
  assert.equal(cli(JSON.stringify({ ...fixture, did: 'did:web:example.invalid' })).status, 2);
});
