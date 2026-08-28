import { InputError, parseStrictJson } from './cli.js';
import { parseFormatArgs, writeReport } from './format.js';
import { sweepText, verifyTechnocoreMessage } from './technocore-message.js';

const CAPTURE_SCHEMA = 'technocore.provenance.capture.v1';
const BUNDLE_SCHEMA = 'gv.valley-of-technocore.provenance/1';
const MESSAGE_SCHEMA = 'technocore.msg.v1';
const MAX_INPUT_BYTES = 1024 * 1024;
const NON_CLAIMS = [
  'identity_not_established',
  'authorship_beyond_key_control_not_established',
  'source_authenticity_not_established',
  'server_inclusion_not_established',
  'recognition_eligibility_rewards_authority_not_established'
];
const USAGE = `usage: valley-technocore provenance create
       valley-technocore provenance verify [--format json|human]
Builds or verifies one strict, local provenance bundle from stdin.
The capture contains a signed request and the matching response record already captured by another tool.
It does not fetch a server, replay a request, or prove server inclusion.
`;

function fail(message) { throw new InputError(message); }

function exactKeys(value, expected, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object') fail(`${label} must be an object`);
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(`${label} has missing or unknown fields`);
}

function validatePositiveSequence(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('response posted seq must be a positive safe integer');
}

function validateMessageShape(request) {
  exactKeys(request, ['schema', 'room', 'did', 'nonce', 'text', 'signature_b64u'], 'request');
  if (request.schema !== MESSAGE_SCHEMA) fail('request has unsupported schema');
  // The message verifier owns the protocol grammar and cryptographic input validation.
  verifyTechnocoreMessage(request);
}

function validateResponse(response, request) {
  exactKeys(response, ['http_status', 'posted'], 'response');
  if (response.http_status !== 200) fail('response http_status must be 200');
  exactKeys(response.posted, ['seq', 'from', 'nonce', 'text'], 'response posted');
  validatePositiveSequence(response.posted.seq);
  if (response.posted.from !== request.did) fail('response posted from does not match request did');
  if (response.posted.nonce !== request.nonce) fail('response posted nonce does not match request nonce');
  if (response.posted.text !== sweepText(request.text)) fail('response posted text does not match swept request text');
}

function validateCapture(capture) {
  exactKeys(capture, ['schema', 'request', 'response'], 'capture');
  if (capture.schema !== CAPTURE_SCHEMA) fail('unsupported capture schema');
  validateMessageShape(capture.request);
  validateResponse(capture.response, capture.request);
}

function validateBundle(bundle) {
  exactKeys(bundle, ['schema', 'request', 'response'], 'bundle');
  if (bundle.schema !== BUNDLE_SCHEMA) fail('unsupported provenance bundle schema');
  validateMessageShape(bundle.request);
  validateResponse(bundle.response, bundle.request);
}

function reportFor(request) {
  const message = verifyTechnocoreMessage(request);
  return {
    profile: BUNDLE_SCHEMA,
    decision: message.decision,
    signature_status: message.signature_status,
    reasons: message.decision === 'verified' ? [] : ['request_signature_invalid'],
    non_claims: NON_CLAIMS
  };
}

export function createProvenanceBundle(capture) {
  validateCapture(capture);
  const report = reportFor(capture.request);
  if (report.decision !== 'verified') return { bundle: null, report };
  return {
    bundle: {
      schema: BUNDLE_SCHEMA,
      request: { ...capture.request },
      response: { http_status: capture.response.http_status, posted: { ...capture.response.posted } }
    },
    report
  };
}

export function verifyProvenanceBundle(bundle) {
  validateBundle(bundle);
  return reportFor(bundle.request);
}

async function readInput(stream) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) fail('input exceeds 1 MiB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks); const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) fail('input must be UTF-8');
  return parseStrictJson(text);
}

export async function runProvenance(args, stdin, stdout, stderr) {
  if ((args.length === 1 && ['--help', '-h'].includes(args[0]))
    || (args.length === 2 && ['create', 'verify'].includes(args[0]) && ['--help', '-h'].includes(args[1]))) {
    stdout.write(USAGE); return 0;
  }
  const [command, ...options] = args; const formatArgs = parseFormatArgs(options);
  if (!['create', 'verify'].includes(command) || !formatArgs || (command === 'create' && formatArgs.format !== 'json')) {
    stderr.write(`error: unknown provenance command or option\n${USAGE}`); return 2;
  }
  try {
    if (command === 'create') {
      const { bundle, report } = createProvenanceBundle(await readInput(stdin));
      if (!bundle) { writeReport(stdout, report, 'json'); return 3; }
      writeReport(stdout, bundle, 'json'); return 0;
    }
    const report = verifyProvenanceBundle(await readInput(stdin));
    writeReport(stdout, report, formatArgs.format);
    return report.decision === 'verified' ? 0 : 3;
  } catch (error) {
    stderr.write(`error: ${error instanceof InputError ? error.message : 'internal failure'}\n`);
    return error instanceof InputError ? 2 : 1;
  }
}
