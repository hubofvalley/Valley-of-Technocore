import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { sweepText } from '../src/technocore-message.js';

const root = new URL('..', import.meta.url);
const corpus = JSON.parse(readFileSync(new URL('../fixtures/technocore-msg-v1-compatibility.json', import.meta.url), 'utf8'));

test('public compatibility corpus pins processable boundaries and malformed input', () => {
  assert.equal(corpus.schema, 'gv.valley-technocore.compatibility-corpus/1');
  assert.equal(corpus.profile, 'technocore.msg.v1');
  assert.match(corpus.scope, /not a server transcript/u);
  for (const vector of corpus.vectors) {
    const result = spawnSync(process.execPath, ['bin/valley-technocore.js', 'message', 'verify'], {
      cwd: root, input: JSON.stringify(vector.input), encoding: 'utf8'
    });
    assert.equal(result.status, vector.expect_exit, vector.id);
    if (vector.expect_exit === 0) {
      const bytes = Buffer.from(`${vector.input.room}|${vector.input.nonce}|${sweepText(vector.input.text)}`, 'utf8');
      assert.equal(bytes.toString('hex'), vector.signing_bytes_utf8_hex, vector.id);
      assert.equal(JSON.parse(result.stdout).decision, 'verified', vector.id);
    }
  }
});
