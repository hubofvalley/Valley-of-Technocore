import { InputError, parseStrictJson, verifyEvidence } from './cli.js';
import { humanReport, parseFormatArgs, writeReport } from './format.js';
import { AttestationInputError, verifyAttestation } from './attestation.js';
import { normalizeReceipt } from './receipt.js';
import { createProvenanceBundle, ProvenanceMismatchError, verifyProvenanceBundle } from './provenance.js';
import { verifyTechnocoreMessage } from './technocore-message.js';

const MAX_INPUT_BYTES = 1024 * 1024;
const EVIDENCE_SCHEMA = 'gv.valley-of-technocore.evidence/1';
const MESSAGE_SCHEMA = 'technocore.msg.v1';
const PROVENANCE_CAPTURE_SCHEMA = 'technocore.provenance.capture.v1';
const PROVENANCE_BUNDLE_SCHEMA = 'gv.valley-of-technocore.provenance/1';
const ATTESTATION_SCHEMA = 'gv.valley-of-technocore.release-attestation/1';
const RECEIPT_KEYS = new Set(['room', 'receipt', 'did', 'signer_did', 'nonce', 'text', 'message', 'signature', 'signature_b64u']);
const USAGE = `usage: valley-technocore verify [--format json|human]
Reads exactly one supported JSON object from stdin and classifies it as evidence, message, receipt, provenance, or release attestation.
No paths, directories, URLs, network resources, private keys, key generation, signing, or writes are used; supplied public-key material is verified locally.
`;

const CATEGORY = {
  json: {
    diagnostic: 'The input is not one valid UTF-8 JSON object.',
    action: 'fix_local_json',
    next: 'Provide exactly one JSON object on stdin and check its quotes, braces, encoding, and size.'
  },
  schema: {
    diagnostic: 'The object is not valid for the selected verifier shape, or its shape is ambiguous.',
    action: 'use_one_supported_shape',
    next: 'Use one documented exact object shape and remove unknown or overlapping fields; do not fetch or generate replacement data.'
  },
  missing_signature: {
    diagnostic: 'The supplied object has no detached signature to verify.',
    action: 'supply_existing_detached_signature',
    next: 'Supply the detached signature with the local export, or stop; do not create a key or sign new data.'
  },
  normalisation: {
    diagnostic: 'The local receipt export cannot be mapped to the canonical message profile.',
    action: 'convert_supported_receipt_shape',
    next: 'Use one supported flat or envelope receipt shape, with no extra fields, then retry from stdin.'
  },
  cryptographic_invalidity: {
    diagnostic: 'The supplied signed bytes or payload hash did not verify.',
    action: 'recheck_exact_supplied_bytes',
    next: 'Re-check the exact local bytes, public DID, hash, and detached signature; do not infer identity, source authenticity, or authority.'
  },
  provenance_mismatch: {
    diagnostic: 'The captured provenance response does not match the signed request.',
    action: 'compare_captured_request_response',
    next: 'Use the exact matching local response record, or stop; do not retry a server request or claim server inclusion.'
  },
  none: {
    diagnostic: 'The supplied object verified under its selected profile.',
    action: 'interpret_with_non_claims',
    next: 'Keep this as a local verification result and independently assess source, identity, inclusion, eligibility, rewards, and authority claims.'
  }
};

function isObject(value) {
  return value && !Array.isArray(value) && typeof value === 'object';
}

function hasAnyKey(value, keys) {
  return keys.some((key) => Object.hasOwn(value, key));
}

function candidateKinds(input) {
  if (!isObject(input)) return [];
  const keys = Object.keys(input);
  const candidates = [];
  if (input.schema === EVIDENCE_SCHEMA || hasAnyKey(input, ['source', 'attribution', 'authority'])) candidates.push('evidence');
  if (input.schema === MESSAGE_SCHEMA || (Object.hasOwn(input, 'schema') && hasAnyKey(input, ['did', 'signer_did', 'nonce', 'text', 'message', 'signature_b64u']))) candidates.push('message');
  if (input.schema === PROVENANCE_CAPTURE_SCHEMA) candidates.push('provenance_capture');
  else if (input.schema === PROVENANCE_BUNDLE_SCHEMA || hasAnyKey(input, ['request', 'response'])) candidates.push('provenance_bundle');
  if (input.statement?.schema === ATTESTATION_SCHEMA || (Object.hasOwn(input, 'statement') && Object.hasOwn(input, 'signature'))) candidates.push('release_attestation');
  if (!Object.hasOwn(input, 'schema') && keys.length > 0 && keys.every((key) => RECEIPT_KEYS.has(key))
    && (Object.hasOwn(input, 'receipt') || (Object.hasOwn(input, 'room') && hasAnyKey(input, ['did', 'signer_did', 'nonce', 'text', 'message', 'signature', 'signature_b64u'])))) {
    candidates.push('receipt');
  }
  return [...new Set(candidates)];
}

export function classifyInput(input) {
  const candidates = candidateKinds(input);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) throw new InputError('unsupported or unknown input shape');
  throw new InputError(`ambiguous input shape; matches ${candidates.join(', ')}`);
}

function reportStatus(kind, report) {
  if (kind === 'evidence') return report.payload_hash_status === 'valid' && report.signature_status === 'valid' ? 'verified' : 'invalid';
  if (kind === 'release_attestation') return report.signature_status === 'valid' ? 'verified' : 'invalid';
  return report.decision === 'verified' ? 'verified' : 'invalid';
}

function verifyClassified(kind, input) {
  if (kind === 'evidence') return { report: verifyEvidence(input) };
  if (kind === 'message') return { report: verifyTechnocoreMessage(input) };
  if (kind === 'receipt') return { report: verifyTechnocoreMessage(normalizeReceipt(input)) };
  if (kind === 'release_attestation') return { report: verifyAttestation(input) };
  if (kind === 'provenance_capture') {
    const result = createProvenanceBundle(input);
    return { report: result.report };
  }
  return { report: verifyProvenanceBundle(input) };
}

function failureCategory(kind, report) {
  if (reportStatus(kind, report) === 'verified') return 'none';
  return 'cryptographic_invalidity';
}

function hasMissingSignature(kind, input) {
  if (!input) return false;
  if (kind === 'message') return !input.signature_b64u;
  if (kind === 'evidence') return !input.statement || !input.statement.signature || !input.statement.signature.value;
  if (kind === 'release_attestation') return !input.signature || !input.signature.value;
  if (kind === 'provenance_capture' || kind === 'provenance_bundle') return !input.request || !input.request.signature_b64u;
  return false;
}

function categoryForError(kind, message, stage, input, error) {
  if (stage === 'json') return 'json';
  if (error instanceof ProvenanceMismatchError) return 'provenance_mismatch';
  if (hasMissingSignature(kind, input)) return 'missing_signature';
  if (/missing (?:a detached )?signature|detached signature/u.test(message)) return 'missing_signature';
  if (kind === 'receipt' && /receipt|normalis/u.test(message)) return 'normalisation';
  return 'schema';
}

function universalError(kind, category, message) {
  const details = CATEGORY[category];
  return { classification: kind ?? null, error: message, failure_category: category, next_safe_action: details.action, report: null };
}

function humanError(kind, category, message) {
  const details = CATEGORY[category];
  return `classification: ${kind ?? 'unknown'}\nfailure category: ${category}\ndiagnostic: ${details.diagnostic}\nnext safe action: ${details.next}\nerror: ${message}\n`;
}

async function readInput(stream) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new InputError('input exceeds 1 MiB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks); const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new InputError('input must be UTF-8');
  return parseStrictJson(text);
}

function universalReport(kind, report) {
  const category = failureCategory(kind, report);
  const details = CATEGORY[category];
  return {
    classification: kind,
    failure_category: category,
    next_safe_action: details.action,
    report
  };
}

export async function runUniversalVerify(args, stdin, stdout, stderr) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { stdout.write(USAGE); return 0; }
  const formatArgs = parseFormatArgs(args);
  if (!formatArgs) { stderr.write(`error: unknown verify option\n${USAGE}`); return 2; }
  let stage = 'json'; let kind; let input;
  try {
    input = await readInput(stdin);
    stage = 'classification'; kind = classifyInput(input);
    const { report } = verifyClassified(kind, input);
    const output = universalReport(kind, report);
    if (formatArgs.format === 'human') {
      const details = CATEGORY[output.failure_category];
      stdout.write(`classification: ${output.classification}\nstatus: ${reportStatus(kind, report)}\nfailure category: ${output.failure_category}\ndiagnostic: ${details.diagnostic}\nnext safe action: ${details.next}\nreport:\n${humanReport(output.report).replace(/^/gmu, '  ')}`);
    } else writeReport(stdout, output, 'json');
    return output.failure_category === 'cryptographic_invalidity' ? 3 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal failure';
    const category = categoryForError(kind, message, stage, input, error);
    if (formatArgs.format === 'human') stderr.write(humanError(kind, category, message));
    else writeReport(stdout, universalError(kind, category, message), 'json');
    return error instanceof InputError || error instanceof AttestationInputError ? 2 : 1;
  }
}
