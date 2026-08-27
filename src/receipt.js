import { InputError } from './cli.js';

const PROFILE = 'technocore.msg.v1';
const CANONICAL_KEYS = ['schema', 'room', 'did', 'nonce', 'text', 'signature_b64u'];

function fail(message) { throw new InputError(message); }

function keys(value) {
  return value && !Array.isArray(value) && typeof value === 'object' ? Object.keys(value).sort() : [];
}

function exact(value, expected) {
  const actual = keys(value); const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function signature(record) {
  const value = record.signature_b64u ?? record.signature;
  if (value === undefined || value === '') fail('receipt is missing a detached signature (expected signature or signature_b64u)');
  return value;
}

function fields(record, room = record.room) {
  const did = record.did ?? record.signer_did;
  const nonce = record.nonce;
  const text = record.text ?? record.message;
  for (const [name, value] of Object.entries({ room, did, nonce, text })) {
    if (value === undefined) fail(`receipt is missing required field: ${name}`);
  }
  return { schema: PROFILE, room, did, nonce, text, signature_b64u: signature(record) };
}

export function normalizeReceipt(input) {
  if (exact(input, CANONICAL_KEYS)) return { ...input };
  if (exact(input, ['room', 'did', 'nonce', 'text', 'signature'])) return fields(input);
  if (exact(input, ['room', 'signer_did', 'nonce', 'message', 'signature'])) return fields(input);
  if (exact(input, ['room', 'receipt']) && input.receipt && typeof input.receipt === 'object') {
    const record = input.receipt;
    if (!Object.hasOwn(record, 'signature') && !Object.hasOwn(record, 'signature_b64u')) signature(record);
    const allowed = [
      ['did', 'nonce', 'text', 'signature'],
      ['signer_did', 'nonce', 'message', 'signature']
    ];
    if (!allowed.some((shape) => exact(record, shape))) fail('receipt envelope has missing or unknown fields');
    return fields(record, input.room);
  }
  if (keys(input).length && !Object.hasOwn(input, 'signature') && !Object.hasOwn(input, 'signature_b64u')) {
    fail('receipt is missing a detached signature (expected signature or signature_b64u)');
  }
  fail('unsupported receipt export shape');
}
