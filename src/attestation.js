import { createPublicKey, verify } from 'node:crypto';
import { parseFormatArgs, writeReport } from './format.js';

const SCHEMA = 'gv.valley-of-technocore.release-attestation/1';
const MAX_INPUT_BYTES = 1024 * 1024;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B64U = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
const USAGE = 'usage: valley-attestation [verify] [--format json|human] < attestation.json\n';
const WEAK_KEYS = new Set([
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0100000000000000000000000000000000000000000000000000000000000000',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39cc3c0e0d174c5e44377a'
]);

export class AttestationInputError extends Error {}
const fail = (message) => { throw new AttestationInputError(message); };

function parseStrictJson(text) {
  let index = 0;
  const whitespace = () => { while (' \t\r\n'.includes(text[index] ?? '\0')) index += 1; };
  const parseString = () => {
    if (text[index++] !== '"') fail('expected JSON string');
    let output = '';
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') return output;
      if (character < ' ') fail('control character in JSON string');
      if (character !== '\\') { output += character; if (output.length > 262144) fail('JSON string exceeds limit'); continue; }
      const escape = text[index++];
      const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (Object.hasOwn(simple, escape)) { output += simple[escape]; if (output.length > 262144) fail('JSON string exceeds limit'); continue; }
      if (escape !== 'u' || !/^[0-9a-fA-F]{4}$/u.test(text.slice(index, index + 4))) fail('invalid JSON escape');
      const first = Number.parseInt(text.slice(index, index + 4), 16); index += 4;
      if (first >= 0xd800 && first <= 0xdbff) {
        if (text.slice(index, index + 2) !== '\\u' || !/^[0-9a-fA-F]{4}$/u.test(text.slice(index + 2, index + 6))) fail('unpaired surrogate');
        const second = Number.parseInt(text.slice(index + 2, index + 6), 16);
        if (second < 0xdc00 || second > 0xdfff) fail('unpaired surrogate');
        output += String.fromCodePoint(0x10000 + ((first - 0xd800) << 10) + second - 0xdc00); index += 6;
      } else if (first >= 0xdc00 && first <= 0xdfff) fail('unpaired surrogate');
      else output += String.fromCodePoint(first);
      if (output.length > 262144) fail('JSON string exceeds limit');
    }
    fail('unterminated JSON string');
  };
  const parseValue = (depth = 0) => {
    if (depth > 16) fail('JSON nesting exceeds limit');
    whitespace();
    if (text[index] === '"') return parseString();
    if (text[index] !== '{') fail('only JSON objects and strings are supported');
    index += 1; whitespace();
    const object = Object.create(null); const seen = new Set();
    if (text[index] === '}') { index += 1; return object; }
    while (true) {
      whitespace(); const key = parseString();
      if (seen.has(key)) fail(`duplicate key: ${key}`); seen.add(key);
      whitespace(); if (text[index++] !== ':') fail('expected colon');
      object[key] = parseValue(depth + 1); whitespace();
      if (text[index] === '}') { index += 1; return object; }
      if (text[index++] !== ',') fail('expected comma');
    }
  };
  const result = parseValue(); whitespace();
  if (index !== text.length) fail('trailing JSON content');
  return result;
}

function exactKeys(value, expected, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object') fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(`${label} has missing or unknown fields`);
}

function decodeBase58(value) {
  if (!value || [...value].some((character) => !BASE58.includes(character))) fail('DID has invalid base58btc');
  let number = 0n;
  for (const character of value) number = number * 58n + BigInt(BASE58.indexOf(character));
  let hex = number.toString(16); if (hex.length % 2) hex = `0${hex}`;
  const body = number === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  let zeros = 0; while (value[zeros] === '1') zeros += 1;
  return Buffer.concat([Buffer.alloc(zeros), body]);
}

function encodeBase58(bytes) {
  let number = BigInt(`0x${bytes.toString('hex') || '0'}`); let encoded = '';
  while (number) { encoded = BASE58[Number(number % 58n)] + encoded; number /= 58n; }
  let zeros = 0; while (bytes[zeros] === 0) zeros += 1;
  return `${'1'.repeat(zeros)}${encoded}`;
}

function mod(value, modulus) { const result = value % modulus; return result < 0n ? result + modulus : result; }
function modPow(base, exponent, modulus) {
  let result = 1n;
  for (let value = mod(base, modulus), power = exponent; power > 0n; power >>= 1n, value = value * value % modulus) {
    if (power & 1n) result = result * value % modulus;
  }
  return result;
}

function validatePoint(key) {
  const p = (1n << 255n) - 19n;
  const d = mod(-121665n * modPow(121666n, p - 2n, p), p);
  const bytes = Buffer.from(key); const sign = bytes[31] >> 7; bytes[31] &= 0x7f;
  let y = 0n; for (let index = 31; index >= 0; index -= 1) y = (y << 8n) + BigInt(bytes[index]);
  if (y >= p) fail('Ed25519 public key has noncanonical encoding');
  const y2 = y * y % p; const x2 = mod((y2 - 1n) * modPow(d * y2 + 1n, p - 2n, p), p);
  let x = modPow(x2, (p + 3n) / 8n, p);
  if (x * x % p !== x2) x = x * modPow(2n, (p - 1n) / 4n, p) % p;
  if (x * x % p !== x2 || (x === 0n && sign === 1)) fail('Ed25519 public key is not a valid point encoding');
  if (Number(x & 1n) !== sign) x = p - x;
  for (let round = 0; round < 3; round += 1) {
    const xx = x * x % p; const yy = y * y % p; const product = d * xx % p * yy % p;
    x = 2n * x * y % p * modPow(1n + product, p - 2n, p) % p;
    y = (yy + xx) * modPow(1n - product, p - 2n, p) % p;
  }
  if (x === 0n && y === 1n) fail('weak Ed25519 key is unsupported');
}

function didKeyBytes(did) {
  if (typeof did !== 'string' || did.length > 128 || !did.startsWith('did:key:z')) fail('only Ed25519 did:key is supported');
  const encoded = did.slice(9); const decoded = decodeBase58(encoded);
  if (encodeBase58(decoded) !== encoded || decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) fail('only canonical Ed25519 did:key is supported');
  const key = decoded.subarray(2);
  if (WEAK_KEYS.has(key.toString('hex'))) fail('weak Ed25519 key is unsupported');
  validatePoint(key);
  return key;
}

function decodeSignature(value) {
  if (typeof value !== 'string' || value.includes('=') || !B64U.test(value)) fail('signature must be canonical unpadded base64url');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== 64 || bytes.toString('base64url') !== value) fail('signature has invalid encoding or length');
  return bytes;
}

function canonicalJson(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (!value || Array.isArray(value) || typeof value !== 'object') fail('unsupported JCS value');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function validTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/u.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText);
  const hour = Number(hourText); const minute = Number(minuteText); const second = Number(secondText);
  if (year === 0 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function signatureMathValid(signature) {
  const r = signature.subarray(0, 32); const scalar = signature.subarray(32);
  let s = 0n; for (let index = 31; index >= 0; index -= 1) s = (s << 8n) + BigInt(scalar[index]);
  const order = (1n << 252n) + 27742317777372353535851937790883648493n;
  if (s >= order) return false;
  try { validatePoint(r); return true; } catch (error) { if (error instanceof AttestationInputError) return false; throw error; }
}

function validateAttestation(attestation) {
  exactKeys(attestation, ['statement', 'signature'], 'attestation');
  exactKeys(attestation.statement, ['schema', 'attestation_key_did', 'repository', 'commit', 'tag', 'digest', 'signed_at'], 'statement');
  exactKeys(attestation.statement.digest, ['kind', 'sha256'], 'digest');
  exactKeys(attestation.signature, ['algorithm', 'encoding', 'value'], 'signature');
  const statement = attestation.statement;
  if (statement.schema !== SCHEMA) fail('unsupported schema');
  if (typeof statement.repository !== 'string') fail('invalid repository');
  if (typeof statement.commit !== 'string' || !/^[0-9a-f]{40}$/u.test(statement.commit)) fail('invalid commit');
  if (typeof statement.tag !== 'string') fail('invalid tag');
  if (statement.digest.kind !== 'artifact' || typeof statement.digest.sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(statement.digest.sha256)) fail('invalid artifact digest');
  if (typeof statement.signed_at !== 'string' || !validTimestamp(statement.signed_at)) fail('invalid signed_at');
  if (attestation.signature.algorithm !== 'Ed25519' || attestation.signature.encoding !== 'base64url') fail('unsupported signature');
  return { key: didKeyBytes(statement.attestation_key_did), signature: decodeSignature(attestation.signature.value) };
}

export function verifyAttestation(attestation) {
  const { key, signature } = validateAttestation(attestation);
  const message = Buffer.concat([Buffer.from(SCHEMA), Buffer.from([0]), Buffer.from(canonicalJson(attestation.statement))]);
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key]);
  const valid = signatureMathValid(signature) && verify(null, message, createPublicKey({ key: spki, format: 'der', type: 'spki' }), signature);
  return { schema_status: 'valid', did_status: 'valid', signature_status: valid ? 'valid' : 'invalid', external_facts_status: 'not-checked', signed_at_status: 'declared-only', authority: 'none' };
}

async function readInput(stream) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += chunk.length; if (size > MAX_INPUT_BYTES) fail('input exceeds 1 MiB'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks); const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) fail('input must be UTF-8');
  return parseStrictJson(text);
}

export async function runAttestation(args, stdin, stdout, stderr) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { stdout.write(USAGE); return 0; }
  const commandArgs = args[0] === 'verify' ? args.slice(1) : args;
  const formatArgs = parseFormatArgs(commandArgs);
  if (!formatArgs) { stderr.write(`error: unknown command or option\n${USAGE}`); return 2; }
  try {
    const report = verifyAttestation(await readInput(stdin));
    writeReport(stdout, report, formatArgs.format);
    return report.signature_status === 'valid' ? 0 : 3;
  } catch (error) {
    stderr.write(`error: ${error instanceof AttestationInputError ? error.message : 'internal failure'}\n`);
    return error instanceof AttestationInputError ? 2 : 1;
  }
}
