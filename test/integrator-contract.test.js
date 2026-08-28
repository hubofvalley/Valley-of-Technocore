import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contract = readFileSync(new URL('../docs/integrator-contract.md', import.meta.url), 'utf8');
const proof = readFileSync(new URL('../docs/first-run-proof-p05.md', import.meta.url), 'utf8');

test('integrator contract freezes every verifier profile and exit outcome', () => {
  for (const command of [
    '`evidence verify`', '`message verify`', '`receipt verify`', '`provenance verify`',
    '`valley-attestation verify`', 'universal `verify`', '`batch verify evidence|message|receipt`'
  ]) assert.ok(contract.includes(command), command);
  for (const code of ['`0`', '`1`', '`2`', '`3`']) assert.ok(contract.includes(code), code);
  for (const category of ['none', 'json', 'schema', 'missing_signature', 'normalisation', 'cryptographic_invalidity', 'provenance_mismatch']) {
    assert.ok(contract.includes(`\`${category}\``), category);
  }
  assert.match(contract, /Universal JSON input errors are canonical wrapper objects on stdout/u);
  assert.match(contract, /does not accept a path, directory, URL, glob, environment-backed configuration, network resource/u);
});

test('P0.5 proof records all three captured first-run representations', () => {
  for (const representation of ['canonical `technocore.msg.v1` message', 'flat receipt export', 'wrapped receipt export']) {
    assert.ok(proof.includes(representation), representation);
  }
  assert.match(proof, /\| canonical message \| `0` \| `message`/u);
  assert.match(proof, /\| flat receipt \| `0` \| `receipt`/u);
  assert.match(proof, /\| wrapped receipt \| `0` \| `receipt`/u);
  assert.match(proof, /no runtime behaviour change was made for P0\.5/u);
});

test('integrator contract includes a verifier-only GitHub Actions example', () => {
  assert.match(contract, /name: Verify supplied object/u);
  assert.match(contract, /node \.\/bin\/valley-technocore\.js verify --format json < fixtures\/technocore-msg-v1-gauntlet\.json/u);
  assert.match(contract, /persist-credentials: false/u);
  assert.doesNotMatch(contract, /npm install|npx\s/u);
});
