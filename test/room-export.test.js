import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { inspectRoomExport } from '../src/room-export.js';

const root = new URL('..', import.meta.url);
const corpus = JSON.parse(readFileSync(new URL('../fixtures/technocore-msg-v1-compatibility.json', import.meta.url), 'utf8'));
const message = corpus.vectors.find((vector) => vector.id === 'max-nonce').input;

function exportText({ tamper = false, legacy = false } = {}) {
  const text = tamper ? `${message.text}!` : message.text;
  const unsigned = JSON.stringify({ seq: 40, ts: '2026-09-09T00:00:00.000000Z', from: 'observer', text: 'unsigned observation' });
  const signed = `{"seq":41,"ts":"2026-09-09T00:00:01.000000Z","from":${JSON.stringify(message.did)},"text":${JSON.stringify(text)},"nonce":${message.nonce}${legacy ? '' : `,"sig":${JSON.stringify(message.signature_b64u)}`}}`;
  return `${unsigned}\n${signed}\n`;
}

function run(args, input) {
  return spawnSync(process.execPath, ['bin/valley-technocore-room-export.js', ...args], {
    cwd: root, input, encoding: 'utf8'
  });
}

test('inspects exact export bytes and re-verifies a bare 19-digit signed record', () => {
  const input = exportText(); const bytes = Buffer.from(input);
  const report = inspectRoomExport(bytes, message.room, '7');
  assert.deepEqual(report, {
    profile: 'gv.valley-of-technocore.room-export/1', room: message.room, generation: '7',
    input_sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    bytes: bytes.length, records: 2, first_seq_observed: '40', last_seq_observed: '41',
    unsigned_records: 1, signed_records_reverified: 1, valid_signatures: 1,
    invalid_signatures: 0, signed_records_unverifiable: 0, signature_status: 'valid',
    non_claims: [
      'source_authenticity_not_established', 'server_inclusion_not_established',
      'capture_completeness_beyond_supplied_bytes_not_established',
      'generation_header_authenticity_not_established', 'recency_not_established',
      'identity_authority_eligibility_rewards_not_established'
    ]
  });
  const result = run(['inspect', '--room', message.room, '--generation', '7'], input);
  assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), report);
});

test('reports cryptographic invalidity without losing the capture hash', () => {
  const input = exportText({ tamper: true });
  const result = run(['inspect', '--room', message.room, '--generation', '8'], input);
  assert.equal(result.status, 3); assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.signature_status, 'invalid');
  assert.equal(report.invalid_signatures, 1); assert.equal(report.valid_signatures, 0);
  assert.equal(report.input_sha256, `sha256:${createHash('sha256').update(input).digest('hex')}`);
});

test('distinguishes legacy signed records without stored signatures from invalid signatures', () => {
  const report = inspectRoomExport(Buffer.from(exportText({ legacy: true })), message.room, '9');
  assert.equal(report.signature_status, 'unverifiable');
  assert.equal(report.signed_records_unverifiable, 1);
  assert.equal(report.invalid_signatures, 0);
});

test('empty supplied exports remain deterministic and make no completeness claim', () => {
  const report = inspectRoomExport(Buffer.alloc(0), 'empty-room', '0');
  assert.equal(report.records, 0); assert.equal(report.first_seq_observed, null); assert.equal(report.last_seq_observed, null);
  assert.equal(report.signature_status, 'not_present');
  assert.ok(report.non_claims.includes('capture_completeness_beyond_supplied_bytes_not_established'));
});

test('malformed export structure fails closed', () => {
  const cases = [
    [exportText().trimEnd(), /complete JSONL record/u],
    ['{"seq":1,"seq":2,"ts":"t","from":"a","text":"x"}\n', /duplicate key: seq/u],
    ['{"seq":2,"ts":"t","from":"a","text":"x"}\n{"seq":1,"ts":"t","from":"a","text":"y"}\n', /seq must increase strictly/u],
    ['{"seq":1,"ts":"t","from":"a","text":"x","extra":"y"}\n', /unsupported fields/u],
    ['\n', /record 1 is empty/u]
  ];
  for (const [input, pattern] of cases) {
    const result = run(['inspect', '--room', message.room, '--generation', '1'], input);
    assert.equal(result.status, 2, input); assert.equal(result.stdout, '', input); assert.match(result.stderr, pattern, input);
  }
});

test('preserves large sequence integers lexically instead of rounding them', () => {
  const seq = '9999999999999999999999999999999999999999';
  const input = `{"seq":${seq},"ts":"t","from":"observer","text":"x"}\n`;
  const report = inspectRoomExport(Buffer.from(input), 'large-seq', '1');
  assert.equal(report.first_seq_observed, seq); assert.equal(report.last_seq_observed, seq);
});

test('room and generation metadata are bounded and explicit', () => {
  for (const args of [
    ['inspect', '--room', 'UPPER', '--generation', '1'],
    ['inspect', '--room', message.room, '--generation', '01'],
    ['inspect', '--room', message.room],
    ['inspect', '--generation', '1']
  ]) assert.equal(run(args, exportText()).status, 2, args.join(' '));
  const human = run(['inspect', '--room', message.room, '--generation', '1', '--format', 'human'], exportText());
  assert.equal(human.status, 0); assert.match(human.stdout, /^profile: gv\.valley-of-technocore\.room-export\/1$/mu);
  const help = run(['--help'], '{not json'); assert.equal(help.status, 0); assert.match(help.stdout, /X-Room-Generation/u);
});

test('input, record, and UTF-8 resource boundaries fail closed', () => {
  const tooLarge = Buffer.alloc(16 * 1024 * 1024 + 1, 0x20);
  const oversized = spawnSync(process.execPath, ['bin/valley-technocore-room-export.js', 'inspect', '--room', message.room, '--generation', '1'], { cwd: root, input: tooLarge });
  assert.equal(oversized.status, 2); assert.match(oversized.stderr.toString('utf8'), /exceeds 16 MiB/u);
  const nonUtf8 = spawnSync(process.execPath, ['bin/valley-technocore-room-export.js', 'inspect', '--room', message.room, '--generation', '1'], { cwd: root, input: Buffer.from([0xff, 0xfe, 0xfd]) });
  assert.equal(nonUtf8.status, 2); assert.match(nonUtf8.stderr.toString('utf8'), /must be UTF-8/u);
});
