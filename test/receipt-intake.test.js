import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parseLosslessReceiptJson } from '../src/receipt-intake.js';

const root = new URL('..', import.meta.url);
const corpus = JSON.parse(readFileSync(new URL('../fixtures/technocore-msg-v1-compatibility.json', import.meta.url), 'utf8'));
const message = corpus.vectors.find((vector) => vector.id === 'max-nonce').input;

function run(args, input) {
  return spawnSync(process.execPath, ['bin/valley-technocore-receipt-intake.js', ...args], {
    cwd: root, input, encoding: 'utf8'
  });
}

function flatReceipt() {
  return { room: message.room, did: message.did, nonce: message.nonce, text: message.text, signature: message.signature_b64u };
}

function bareNonce(text, nonce = message.nonce) {
  return text.replace(`"nonce":"${message.nonce}"`, `"nonce":${nonce}`);
}

test('quoted and bare 19-digit receipt nonces normalise to byte-identical canonical output', () => {
  const quoted = JSON.stringify(flatReceipt());
  const bare = bareNonce(quoted);
  const quotedResult = run(['normalize'], quoted);
  const bareResult = run(['normalize'], bare);
  assert.equal(quotedResult.status, 0); assert.equal(quotedResult.stderr, '');
  assert.equal(bareResult.status, 0); assert.equal(bareResult.stderr, '');
  assert.equal(bareResult.stdout, quotedResult.stdout);
  assert.equal(JSON.parse(bareResult.stdout).nonce, message.nonce);
});

test('bare 19-digit nonce verifies cryptographically in flat and envelope receipt shapes', () => {
  const flat = bareNonce(JSON.stringify(flatReceipt()));
  const envelope = bareNonce(JSON.stringify({
    room: message.room,
    receipt: { signer_did: message.did, nonce: message.nonce, message: message.text, signature: message.signature_b64u }
  }));
  for (const input of [flat, envelope]) {
    const result = run(['verify'], input);
    assert.equal(result.status, 0); assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).decision, 'verified');
  }
});

test('non-canonical bare nonce spellings fail closed', () => {
  const quoted = JSON.stringify(flatReceipt());
  for (const token of ['-1', '01', '1.0', '1e3', '10000000000000000000']) {
    const result = run(['normalize'], bareNonce(quoted, token));
    assert.equal(result.status, 2, token);
    assert.equal(result.stdout, '', token);
    assert.match(result.stderr, /^error: nonce integer must be 1-19 ASCII decimal digits$/mu, token);
  }
});

test('lossless receipt parser retains duplicate-key and unrelated integer limits', () => {
  assert.throws(() => parseLosslessReceiptJson('{"nonce":"1","nonce":1}'), /duplicate key: nonce/u);
  assert.throws(() => parseLosslessReceiptJson('{"sequence":9999999999999999999}'), /integer token exceeds safe limit/u);
  assert.equal(parseLosslessReceiptJson('{"nonce":9999999999999999999}').nonce, '9999999999999999999');
});

test('existing canonical message verifier remains strict about nonce JSON type', () => {
  const canonicalBare = bareNonce(JSON.stringify(message));
  const result = spawnSync(process.execPath, ['bin/valley-technocore.js', 'message', 'verify'], {
    cwd: root, input: canonicalBare, encoding: 'utf8'
  });
  assert.equal(result.status, 2);
});

test('receipt intake keeps the existing stdin, format, UTF-8, and size boundaries', () => {
  const help = run(['--help'], '{not json');
  assert.equal(help.status, 0); assert.equal(help.stderr, ''); assert.match(help.stdout, /1-19 digit JSON integer/u);
  const human = run(['verify', '--format', 'human'], bareNonce(JSON.stringify(flatReceipt())));
  assert.equal(human.status, 0); assert.match(human.stdout, /^decision: verified$/mu);
  const tooLarge = run(['normalize'], ' '.repeat(1024 * 1024 + 1));
  assert.equal(tooLarge.status, 2); assert.match(tooLarge.stderr, /input exceeds 1 MiB/u);
  const nonUtf8 = spawnSync(process.execPath, ['bin/valley-technocore-receipt-intake.js', 'normalize'], {
    cwd: root, input: Buffer.from([0xff, 0xfe, 0xfd])
  });
  assert.equal(nonUtf8.status, 2); assert.match(nonUtf8.stderr.toString('utf8'), /input must be UTF-8/u);
});
