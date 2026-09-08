import { InputError } from './cli.js';
import { parseFormatArgs, writeReport } from './format.js';
import { normalizeReceipt } from './receipt.js';
import { verifyTechnocoreMessage } from './technocore-message.js';

const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 16;
const MAX_JSON_STRING_CHARS = 262144;
const USAGE = `usage: valley-technocore-receipt-intake <normalize|verify> [--format json|human]
Reads one supported local receipt JSON object from stdin.
For receipt nonce only, a bare 1-19 digit JSON integer is preserved lexically and normalised to the canonical string form.
No files or network resources are read by the command.
`;

function fail(message) {
  throw new InputError(message);
}

export function parseLosslessReceiptJson(text) {
  let i = 0;
  const ws = () => { while (text[i] === ' ' || text[i] === '\t' || text[i] === '\r' || text[i] === '\n') i += 1; };
  const parseString = () => {
    if (text[i++] !== '"') fail('expected JSON string');
    let out = '';
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') return out;
      if (c < ' ') fail('control character in JSON string');
      if (c !== '\\') {
        out += c;
        if (out.length > MAX_JSON_STRING_CHARS) fail('JSON string exceeds limit');
        continue;
      }
      const e = text[i++];
      const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (Object.hasOwn(simple, e)) {
        out += simple[e];
        if (out.length > MAX_JSON_STRING_CHARS) fail('JSON string exceeds limit');
        continue;
      }
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
  const value = (depth = 0, key = null) => {
    if (depth > MAX_JSON_DEPTH) fail('JSON nesting exceeds limit');
    ws();
    if (text[i] === '"') return parseString();
    if (text[i] === '{') {
      i += 1; ws(); const object = Object.create(null); const seen = new Set();
      if (text[i] === '}') { i += 1; return object; }
      while (true) {
        ws(); if (text[i] !== '"') fail('object key must be a string');
        const childKey = parseString(); if (seen.has(childKey)) fail(`duplicate key: ${childKey}`); seen.add(childKey);
        ws(); if (text[i++] !== ':') fail('expected colon'); object[childKey] = value(depth + 1, childKey); ws();
        if (text[i] === '}') { i += 1; return object; }
        if (text[i++] !== ',') fail('expected comma');
      }
    }
    if (key === 'nonce' && (text[i] === '-' || /\d/u.test(text[i] ?? ''))) {
      if (text[i] === '-') fail('nonce integer must be 1-19 ASCII decimal digits');
      const token = /(?:0|[1-9]\d{0,18})/uy;
      token.lastIndex = i;
      const decimal = token.exec(text)?.[0];
      if (!decimal) fail('nonce integer must be 1-19 ASCII decimal digits');
      i += decimal.length;
      if (/\d/u.test(text[i] ?? '') || text[i] === '.' || text[i] === 'e' || text[i] === 'E') {
        fail('nonce integer must be 1-19 ASCII decimal digits');
      }
      return decimal;
    }
    const integerToken = /-?(?:0|[1-9]\d{0,15})/uy;
    integerToken.lastIndex = i;
    const integerText = integerToken.exec(text)?.[0];
    if (integerText) {
      i += integerText.length;
      if (/\d/u.test(text[i] ?? '')) fail('integer token exceeds safe limit');
      const integer = BigInt(integerText);
      return integer <= BigInt(Number.MAX_SAFE_INTEGER) && integer >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(integer) : integer;
    }
    fail('only JSON objects, strings, and integers are supported');
  };
  const result = value(); ws(); if (i !== text.length) fail('trailing JSON content');
  if (!result || Array.isArray(result) || typeof result !== 'object') fail('top level must be an object');
  return result;
}

async function readReceipt(stream) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new InputError('input exceeds 1 MiB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks); const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new InputError('input must be UTF-8');
  return parseLosslessReceiptJson(text);
}

export async function runReceiptIntake(args, stdin, stdout, stderr) {
  if ((args.length === 1 && ['--help', '-h'].includes(args[0]))
    || (args.length === 2 && ['normalize', 'verify'].includes(args[0]) && ['--help', '-h'].includes(args[1]))) {
    stdout.write(USAGE); return 0;
  }
  const [command, ...options] = args;
  const formatArgs = parseFormatArgs(options);
  if (!['normalize', 'verify'].includes(command) || !formatArgs
    || (command === 'normalize' && formatArgs.format !== 'json')) {
    stderr.write(`error: unknown receipt intake command or option\n${USAGE}`); return 2;
  }
  try {
    const canonical = normalizeReceipt(await readReceipt(stdin));
    const output = command === 'normalize' ? canonical : verifyTechnocoreMessage(canonical);
    writeReport(stdout, output, formatArgs.format);
    return command === 'verify' && output.decision !== 'verified' ? 3 : 0;
  } catch (error) {
    stderr.write(`error: ${error instanceof InputError ? error.message : 'internal failure'}\n`);
    return error instanceof InputError ? 2 : 1;
  }
}
