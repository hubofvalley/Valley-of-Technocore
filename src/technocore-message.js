import { InputError, parseStrictJson, verifyDidKeySignature } from './cli.js';
import { parseFormatArgs, writeReport } from './format.js';

const PROFILE = 'technocore.msg.v1';
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_TEXT_CHARS = 4096;
const INPUT_KEYS = ['schema', 'room', 'did', 'nonce', 'text', 'signature_b64u'];
const NON_CATEGORIES = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;
const STRIP = /^\p{White_Space}+|\p{White_Space}+$/gu;
const USAGE = 'usage: valley-technocore verify-technocore-message < message.json\nrequired fields: schema, room, did, nonce, text, signature_b64u\n';

function fail(message) { throw new InputError(message); }

function exactKeys(value, expected, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object') fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(`${label} has missing or unknown fields`);
}

export function sweepText(text) {
  if (typeof text !== 'string') fail('text must be a string');
  return text.replace(NON_CATEGORIES, ' ').replace(STRIP, '');
}

function validateMessage(input) {
  exactKeys(input, INPUT_KEYS, 'input');
  if (input.schema !== PROFILE) fail('unsupported schema');
  if (typeof input.room !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/u.test(input.room)) fail('room must match the pinned Technocore grammar');
  if (typeof input.did !== 'string') fail('did must be a string');
  if (typeof input.nonce !== 'string' || !/^[0-9]{1,19}$/u.test(input.nonce)) fail('nonce must be 1-19 ASCII decimal digits');
  const text = sweepText(input.text);
  if (!text) fail('text is empty after the Technocore sweep');
  if ([...text].length > MAX_TEXT_CHARS) fail('text exceeds 4096 characters after the Technocore sweep');
  if (typeof input.signature_b64u !== 'string') fail('signature_b64u must be a string');
  return text;
}

const NON_CLAIMS = [
  'identity_not_established',
  'authorship_beyond_key_control_not_established',
  'source_authenticity_not_established',
  'server_inclusion_not_established',
  'recognition_eligibility_rewards_authority_not_established'
];

export function verifyTechnocoreMessage(input) {
  const text = validateMessage(input);
  const message = Buffer.from(`${input.room}|${input.nonce}|${text}`, 'utf8');
  const valid = verifyDidKeySignature(input.did, message, input.signature_b64u);
  return {
    profile: PROFILE,
    decision: valid ? 'verified' : 'invalid',
    signature_status: valid ? 'valid' : 'invalid',
    reasons: valid ? [] : ['signature_invalid'],
    non_claims: NON_CLAIMS
  };
}

async function readInput(stream) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += chunk.length; if (size > MAX_INPUT_BYTES) fail('input exceeds 1 MiB'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks); const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) fail('input must be UTF-8');
  return parseStrictJson(text);
}

export async function runTechnocoreMessage(args, stdin, stdout, stderr) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { stdout.write(USAGE); return 0; }
  const formatArgs = parseFormatArgs(args);
  if (!formatArgs) { stderr.write('error: unknown option\nusage: valley-technocore message verify [--format json|human]\n'); return 2; }
  try {
    const report = verifyTechnocoreMessage(await readInput(stdin));
    writeReport(stdout, report, formatArgs.format);
    return report.decision === 'verified' ? 0 : 3;
  } catch (error) {
    stderr.write(`error: ${error instanceof InputError ? error.message : 'internal failure'}\n`);
    return error instanceof InputError ? 2 : 1;
  }
}
