import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

const SCHEMA = 'gv.valley-of-technocore.evidence/1';
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 16;
const MAX_JSON_STRING_CHARS = 262144;
const MAX_DID_CHARS = 128;
const MAX_SEQUENCE = BigInt(Number.MAX_SAFE_INTEGER);
const INPUT_KEYS = ['room', 'sequence', 'server_attributed_did', 'signer_did', 'payload_b64u', 'signature_b64u'];
const B64U = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const WEAK_KEYS = new Set([
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0100000000000000000000000000000000000000000000000000000000000000',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39cc3c0e0d174c5e44377a'
]);

class InputError extends Error {}

function fail(message) {
  throw new InputError(message);
}

export function parseStrictJson(text) {
  let i = 0;
  const ws = () => { while (text[i] === ' ' || text[i] === '\t' || text[i] === '\r' || text[i] === '\n') i += 1; };
  const parseString = () => {
    if (text[i++] !== '"') fail('expected JSON string');
    let out = '';
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') return out;
      if (c < ' ') fail('control character in JSON string');
      if (c !== '\\') { out += c; if (out.length > MAX_JSON_STRING_CHARS) fail('JSON string exceeds limit'); continue; }
      const e = text[i++];
      const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (Object.hasOwn(simple, e)) { out += simple[e]; if (out.length > MAX_JSON_STRING_CHARS) fail('JSON string exceeds limit'); continue; }
      if (e !== 'u' || !/^[0-9a-fA-F]{4}$/u.test(text.slice(i, i + 4))) fail('invalid JSON escape');
      const first = Number.parseInt(text.slice(i, i + 4), 16); i += 4;
      if (first >= 0xd800 && first <= 0xdbff) {
        if (text.slice(i, i + 2) !== '\\u' || !/^[0-9a-fA-F]{4}$/u.test(text.slice(i + 2, i + 6))) fail('unpaired surrogate');
        const second = Number.parseInt(text.slice(i + 2, i + 6), 16);
        if (second < 0xdc00 || second > 0xdfff) fail('unpaired surrogate');
        out += String.fromCodePoint(0x10000 + ((first - 0xd800) << 10) + second - 0xdc00); i += 6;
      } else if (first >= 0xdc00 && first <= 0xdfff) fail('unpaired surrogate');
      else out += String.fromCodePoint(first);
      if (out.length > MAX_JSON_STRING_CHARS) fail('JSON string exceeds limit');
    }
    fail('unterminated JSON string');
  };
  const value = (depth = 0) => {
    if (depth > MAX_JSON_DEPTH) fail('JSON nesting exceeds limit');
    ws();
    if (text[i] === '"') return parseString();
    if (text[i] === '{') {
      i += 1; ws(); const object = Object.create(null); const seen = new Set();
      if (text[i] === '}') { i += 1; return object; }
      while (true) {
        ws(); if (text[i] !== '"') fail('object key must be a string');
        const key = parseString(); if (seen.has(key)) fail(`duplicate key: ${key}`); seen.add(key);
        ws(); if (text[i++] !== ':') fail('expected colon'); object[key] = value(depth + 1); ws();
        if (text[i] === '}') { i += 1; return object; }
        if (text[i++] !== ',') fail('expected comma');
      }
    }
    const integerToken = /-?(?:0|[1-9]\d{0,15})/uy;
    integerToken.lastIndex = i;
    const token = integerToken.exec(text)?.[0];
    if (token) {
      i += token.length;
      if (/\d/u.test(text[i] ?? '')) fail('integer token exceeds safe limit');
      const integer = BigInt(token);
      return integer <= BigInt(Number.MAX_SAFE_INTEGER) && integer >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(integer) : integer;
    }
    fail('only JSON objects, strings, and integers are supported');
  };
  const result = value(); ws(); if (i !== text.length) fail('trailing JSON content');
  if (!result || Array.isArray(result) || typeof result !== 'object') fail('top level must be an object');
  return result;
}

function exactKeys(object, expected, label) {
  if (!object || Array.isArray(object) || typeof object !== 'object') fail(`${label} must be an object`);
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, n) => key !== wanted[n])) fail(`${label} has missing or unknown fields`);
}

function decodeBase64url(value, label, length) {
  if (typeof value !== 'string' || !B64U.test(value) || value.includes('=')) fail(`${label} must be canonical unpadded base64url`);
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value || (length !== undefined && bytes.length !== length)) fail(`${label} has invalid encoding or length`);
  return bytes;
}

function decodeBase58(value) {
  if (!value || value.length > MAX_DID_CHARS || [...value].some((c) => !BASE58.includes(c))) fail('DID has invalid base58btc');
  let number = 0n;
  for (const c of value) number = number * 58n + BigInt(BASE58.indexOf(c));
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

function didKeyBytes(did) {
  if (typeof did !== 'string' || did.length > MAX_DID_CHARS || !did.startsWith('did:key:z')) fail('only did:key with base58btc is supported');
  const decoded = decodeBase58(did.slice(9));
  if (encodeBase58(decoded) !== did.slice(9)) fail('DID must use canonical base58btc');
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) fail('only Ed25519 did:key is supported');
  const key = decoded.subarray(2);
  if (WEAK_KEYS.has(key.toString('hex'))) fail('weak Ed25519 key is unsupported');
  validateEd25519Encoding(key);
  return key;
}

function mod(value, modulus) {
  const result = value % modulus;
  return result < 0n ? result + modulus : result;
}

function modPow(base, exponent, modulus) {
  let result = 1n;
  for (let value = mod(base, modulus), power = exponent; power > 0n; power >>= 1n, value = value * value % modulus) {
    if (power & 1n) result = result * value % modulus;
  }
  return result;
}

function validateEd25519Encoding(key) {
  const p = (1n << 255n) - 19n;
  const d = mod(-121665n * modPow(121666n, p - 2n, p), p);
  const bytes = Buffer.from(key);
  const sign = bytes[31] >> 7;
  bytes[31] &= 0x7f;
  let y = 0n;
  for (let index = 31; index >= 0; index -= 1) y = (y << 8n) + BigInt(bytes[index]);
  if (y >= p) fail('Ed25519 public key has noncanonical encoding');
  const y2 = y * y % p;
  const x2 = mod((y2 - 1n) * modPow(d * y2 + 1n, p - 2n, p), p);
  let x = modPow(x2, (p + 3n) / 8n, p);
  if (x * x % p !== x2) x = x * modPow(2n, (p - 1n) / 4n, p) % p;
  if (x * x % p !== x2 || (x === 0n && sign === 1)) fail('Ed25519 public key is not a valid point encoding');
  if (Number(x & 1n) !== sign) x = p - x;
  for (let round = 0; round < 3; round += 1) {
    const xx = x * x % p; const yy = y * y % p; const xy2 = 2n * x * y % p;
    const product = d * xx % p * yy % p;
    x = xy2 * modPow(1n + product, p - 2n, p) % p;
    y = (yy + xx) * modPow(1n - product, p - 2n, p) % p;
  }
  if (x === 0n && y === 1n) fail('weak Ed25519 key is unsupported');
}

function validateRoom(room) {
  if (typeof room !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(room)) fail('room must be 1-128 ASCII letters, digits, dots, underscores, or hyphens');
}

function validateSequence(sequence) {
  const integer = typeof sequence === 'bigint' ? sequence : Number.isSafeInteger(sequence) ? BigInt(sequence) : null;
  if (integer === null || integer < 0n || integer > MAX_SEQUENCE) fail(`sequence must be an integer from 0 through ${MAX_SEQUENCE}`);
}

function validateInput(input) {
  exactKeys(input, INPUT_KEYS, 'input');
  validateRoom(input.room);
  validateSequence(input.sequence);
  didKeyBytes(input.server_attributed_did); didKeyBytes(input.signer_did);
  decodeBase64url(input.payload_b64u, 'payload_b64u');
  decodeBase64url(input.signature_b64u, 'signature_b64u', 64);
}

function validateEvidence(evidence) {
  exactKeys(evidence, ['schema', 'source', 'attribution', 'statement', 'authority'], 'evidence');
  if (evidence.schema !== SCHEMA || evidence.authority !== 'none') fail('unsupported schema or authority');
  exactKeys(evidence.source, ['kind', 'room', 'sequence'], 'source');
  if (evidence.source.kind !== 'technocore-room') fail('unsupported source kind');
  validateRoom(evidence.source.room);
  validateSequence(evidence.source.sequence);
  exactKeys(evidence.attribution, ['server_attributed_did'], 'attribution');
  didKeyBytes(evidence.attribution.server_attributed_did);
  exactKeys(evidence.statement, ['signer_did', 'payload_b64u', 'payload_sha256', 'signature'], 'statement');
  didKeyBytes(evidence.statement.signer_did);
  decodeBase64url(evidence.statement.payload_b64u, 'payload_b64u');
  if (!/^sha256:[0-9a-f]{64}$/u.test(evidence.statement.payload_sha256)) fail('invalid payload hash format');
  exactKeys(evidence.statement.signature, ['algorithm', 'encoding', 'value'], 'signature');
  if (evidence.statement.signature.algorithm !== 'Ed25519' || evidence.statement.signature.encoding !== 'base64url') fail('unsupported signature');
  decodeBase64url(evidence.statement.signature.value, 'signature value', 64);
}

export function createEvidence(input) {
  validateInput(input);
  const payload = decodeBase64url(input.payload_b64u, 'payload_b64u');
  return {
    schema: SCHEMA,
    source: { kind: 'technocore-room', room: input.room, sequence: input.sequence },
    attribution: { server_attributed_did: input.server_attributed_did },
    statement: {
      signer_did: input.signer_did,
      payload_b64u: input.payload_b64u,
      payload_sha256: `sha256:${createHash('sha256').update(payload).digest('hex')}`,
      signature: { algorithm: 'Ed25519', encoding: 'base64url', value: input.signature_b64u }
    },
    authority: 'none'
  };
}

export function verifyEvidence(evidence) {
  validateEvidence(evidence);
  const payload = decodeBase64url(evidence.statement.payload_b64u, 'payload_b64u');
  const hash = `sha256:${createHash('sha256').update(payload).digest('hex')}`;
  const rawKey = didKeyBytes(evidence.statement.signer_did);
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawKey]);
  const signature = decodeBase64url(evidence.statement.signature.value, 'signature value', 64);
  const hashValid = hash === evidence.statement.payload_sha256;
  const signatureValid = verifySignature(null, payload, createPublicKey({ key: spki, format: 'der', type: 'spki' }), signature);
  return {
    schema_status: 'valid',
    payload_hash_status: hashValid ? 'valid' : 'invalid',
    did_status: 'valid',
    server_attribution_status: 'observed-only',
    signature_status: signatureValid ? 'valid' : 'invalid',
    authority: 'none'
  };
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'bigint') return value.toString(10);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

async function readInput(stream) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += chunk.length; if (size > MAX_INPUT_BYTES) fail('input exceeds 1 MiB'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks); const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) fail('input must be UTF-8');
  return parseStrictJson(text);
}

export async function run(args, stdin, stdout, stderr) {
  if (args.length !== 1 || !['create-evidence', 'verify-evidence'].includes(args[0])) { stderr.write('usage: valley-technocore <create-evidence|verify-evidence>\n'); return 2; }
  try {
    const input = await readInput(stdin);
    const output = args[0] === 'create-evidence' ? createEvidence(input) : verifyEvidence(input);
    stdout.write(canonicalJson(output));
    if (args[0] === 'verify-evidence' && (output.payload_hash_status !== 'valid' || output.signature_status !== 'valid')) return 3;
    return 0;
  } catch (error) {
    stderr.write(`error: ${error instanceof InputError ? error.message : 'internal failure'}\n`);
    return error instanceof InputError ? 2 : 1;
  }
}
