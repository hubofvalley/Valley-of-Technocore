import { createHash } from 'node:crypto';
import { InputError } from './cli.js';
import { writeReport } from './format.js';
import { parseLosslessJson } from './receipt-intake.js';
import { verifyTechnocoreMessage } from './technocore-message.js';

const PROFILE = 'gv.valley-of-technocore.room-export/1';
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_RECORDS = 262144;
const BASE_KEYS = ['seq', 'ts', 'from', 'text'];
const LEGACY_SIGNED_KEYS = [...BASE_KEYS, 'nonce'];
const SIGNED_KEYS = [...LEGACY_SIGNED_KEYS, 'sig'];
const NON_CLAIMS = [
  'source_authenticity_not_established',
  'server_inclusion_not_established',
  'capture_completeness_beyond_supplied_bytes_not_established',
  'generation_header_authenticity_not_established',
  'checkpoint_authenticity_not_established',
  'recency_not_established',
  'embedded_protocol_conformance_not_established',
  'identity_authority_eligibility_rewards_not_established'
];
const USAGE = `usage: valley-technocore-room-export inspect --room <room> --generation <decimal> [--checkpoint-seq <decimal> --checkpoint-generation <decimal>] [--format json|human]
Reads one already-supplied Technocore GET /r/<room>/export body from stdin.
The caller supplies the observed X-Room-Generation header separately; this command never fetches it.
An optional durable checkpoint must supply both sequence and generation; omit both on a cold start.
Input is bounded, offline, read-only, and never signs or writes anything.
`;

function fail(message) { throw new InputError(message); }

function exact(value, expected) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return false;
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function parseArgs(args) {
  if ((args.length === 1 && ['--help', '-h'].includes(args[0]))
    || (args.length === 2 && args[0] === 'inspect' && ['--help', '-h'].includes(args[1]))) return { help: true };
  if (args[0] !== 'inspect') return null;
  let room; let generation; let checkpointSeq; let checkpointGeneration; let format = 'json';
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index]; const value = args[index + 1];
    if (value === undefined) return null;
    if (flag === '--room' && room === undefined) room = value;
    else if (flag === '--generation' && generation === undefined) generation = value;
    else if (flag === '--checkpoint-seq' && checkpointSeq === undefined) checkpointSeq = value;
    else if (flag === '--checkpoint-generation' && checkpointGeneration === undefined) checkpointGeneration = value;
    else if (flag === '--format' && ['json', 'human'].includes(value) && format === 'json') format = value;
    else return null;
  }
  if (room === undefined || generation === undefined) return null;
  if ((checkpointSeq === undefined) !== (checkpointGeneration === undefined)) return null;
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/u.test(room)) fail('room must match the pinned Technocore grammar');
  if (!/^(?:0|[1-9][0-9]{0,63})$/u.test(generation)) fail('generation must be canonical non-negative decimal text up to 64 digits');
  const checkpoint = checkpointSeq === undefined ? null : validateCheckpoint({
    seq: checkpointSeq,
    generation: checkpointGeneration
  });
  return { checkpoint, format, generation, room };
}

function validateCheckpoint(checkpoint) {
  if (!checkpoint || Array.isArray(checkpoint) || typeof checkpoint !== 'object'
    || !exact(checkpoint, ['seq', 'generation'])) fail('checkpoint must contain only seq and generation');
  if (typeof checkpoint.seq !== 'string' || !/^[1-9][0-9]{0,63}$/u.test(checkpoint.seq)) {
    fail('checkpoint seq must be canonical positive decimal text up to 64 digits');
  }
  if (typeof checkpoint.generation !== 'string' || !/^(?:0|[1-9][0-9]{0,63})$/u.test(checkpoint.generation)) {
    fail('checkpoint generation must be canonical non-negative decimal text up to 64 digits');
  }
  return { seq: checkpoint.seq, generation: checkpoint.generation };
}

function validateCommon(record, index, previousSeq) {
  if (typeof record.seq !== 'string' || !/^[1-9][0-9]{0,63}$/u.test(record.seq)) fail(`record ${index} seq must be canonical positive decimal text up to 64 digits`);
  if (previousSeq !== null && BigInt(record.seq) <= BigInt(previousSeq)) fail(`record ${index} seq must increase strictly`);
  if (typeof record.ts !== 'string' || record.ts.length === 0 || record.ts.length > 128) fail(`record ${index} ts must be a non-empty string up to 128 characters`);
  if (typeof record.from !== 'string' || record.from.length === 0 || record.from.length > 256) fail(`record ${index} from must be a non-empty string up to 256 characters`);
  if (typeof record.text !== 'string') fail(`record ${index} text must be a string`);
}

function validateNonce(record, index) {
  if (typeof record.nonce !== 'string' || !/^[0-9]{1,19}$/u.test(record.nonce)) fail(`record ${index} nonce must be 1-19 ASCII decimal digits`);
}

function signatureStatus(valid, invalid, unavailable) {
  if (invalid > 0) return 'invalid';
  if (unavailable > 0) return valid > 0 ? 'partial' : 'unverifiable';
  return valid > 0 ? 'valid' : 'not_present';
}

function assessCheckpoint(checkpoint, generation, records, firstSeqAfterCheckpoint) {
  const empty = {
    checkpoint_seq: checkpoint?.seq ?? null,
    checkpoint_generation: checkpoint?.generation ?? null,
    next_seq_expected: null,
    first_seq_after_checkpoint_observed: null,
    unobserved_seq_start: null,
    unobserved_seq_end: null
  };
  if (!checkpoint) return { ...empty, checkpoint_status: 'not_supplied' };
  if (checkpoint.generation !== generation) return { ...empty, checkpoint_status: 'generation_mismatch' };

  const expected = (BigInt(checkpoint.seq) + 1n).toString(10);
  const common = { ...empty, next_seq_expected: expected };
  if (records === 0) return { ...common, checkpoint_status: 'empty_capture' };
  if (firstSeqAfterCheckpoint === null) return { ...common, checkpoint_status: 'no_newer_record_observed' };
  if (firstSeqAfterCheckpoint === expected) {
    return { ...common, checkpoint_status: 'continuous_from_checkpoint', first_seq_after_checkpoint_observed: firstSeqAfterCheckpoint };
  }
  return {
    ...common,
    checkpoint_status: 'gap_after_checkpoint',
    first_seq_after_checkpoint_observed: firstSeqAfterCheckpoint,
    unobserved_seq_start: expected,
    unobserved_seq_end: (BigInt(firstSeqAfterCheckpoint) - 1n).toString(10)
  };
}

export function inspectRoomExport(bytes, room, generation, suppliedCheckpoint = null) {
  if (!Buffer.isBuffer(bytes)) fail('export input must be bytes');
  if (bytes.length > MAX_INPUT_BYTES) fail('export input exceeds 16 MiB');
  const checkpoint = suppliedCheckpoint === null ? null : validateCheckpoint(suppliedCheckpoint);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) fail('export input must be UTF-8');
  if (bytes.length > 0 && !text.endsWith('\n')) fail('export must end with a complete JSONL record');
  const lines = bytes.length === 0 ? [] : text.slice(0, -1).split('\n');
  if (lines.length > MAX_RECORDS) fail('export exceeds 262144 records');

  let previousSeq = null; let firstSeq = null; let lastSeq = null; let firstSeqAfterCheckpoint = null;
  let unsigned = 0; let unverifiable = 0; let valid = 0; let invalid = 0;
  for (const [offset, line] of lines.entries()) {
    const index = offset + 1;
    if (line.length === 0) fail(`record ${index} is empty`);
    if (Buffer.byteLength(line, 'utf8') > MAX_RECORD_BYTES) fail(`record ${index} exceeds 64 KiB`);
    const record = parseLosslessJson(line, { nonce: 19, seq: 64 });
    const kind = exact(record, SIGNED_KEYS) ? 'signed'
      : exact(record, LEGACY_SIGNED_KEYS) ? 'legacy-signed'
        : exact(record, BASE_KEYS) ? 'unsigned' : null;
    if (kind === null) fail(`record ${index} has unsupported fields`);
    validateCommon(record, index, previousSeq);
    previousSeq = record.seq; firstSeq ??= record.seq; lastSeq = record.seq;
    if (checkpoint && checkpoint.generation === generation && firstSeqAfterCheckpoint === null
      && BigInt(record.seq) > BigInt(checkpoint.seq)) firstSeqAfterCheckpoint = record.seq;
    if (kind === 'unsigned') { unsigned += 1; continue; }
    validateNonce(record, index);
    if (kind === 'legacy-signed') { unverifiable += 1; continue; }
    const report = verifyTechnocoreMessage({
      schema: 'technocore.msg.v1', room, did: record.from, nonce: record.nonce,
      text: record.text, signature_b64u: record.sig
    });
    if (report.signature_status === 'valid') valid += 1;
    else invalid += 1;
  }

  return {
    profile: PROFILE,
    room,
    generation,
    input_sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    bytes: bytes.length,
    records: lines.length,
    first_seq_observed: firstSeq,
    last_seq_observed: lastSeq,
    unsigned_records: unsigned,
    signed_records_reverified: valid + invalid,
    valid_signatures: valid,
    invalid_signatures: invalid,
    signed_records_unverifiable: unverifiable,
    signature_status: signatureStatus(valid, invalid, unverifiable),
    ...assessCheckpoint(checkpoint, generation, lines.length, firstSeqAfterCheckpoint),
    non_claims: NON_CLAIMS
  };
}

async function readBounded(stream) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) fail('export input exceeds 16 MiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function runRoomExport(args, stdin, stdout, stderr) {
  try {
    const parsed = parseArgs(args);
    if (parsed?.help) { stdout.write(USAGE); return 0; }
    if (!parsed) { stderr.write(`error: unknown room export command or option\n${USAGE}`); return 2; }
    const report = inspectRoomExport(await readBounded(stdin), parsed.room, parsed.generation, parsed.checkpoint);
    writeReport(stdout, report, parsed.format);
    return report.signature_status === 'invalid' ? 3 : 0;
  } catch (error) {
    stderr.write(`error: ${error instanceof InputError ? error.message : 'internal failure'}\n`);
    return error instanceof InputError ? 2 : 1;
  }
}
