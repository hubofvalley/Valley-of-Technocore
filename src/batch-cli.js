import { InputError, parseStrictJson, verifyEvidence } from './cli.js';
import { canonicalJson } from './format.js';
import { normalizeReceipt } from './receipt.js';
import { verifyTechnocoreMessage } from './technocore-message.js';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_RECORD_BYTES = 1024 * 1024;
const MAX_RECORDS = 4096;
const PROFILES = new Set(['evidence', 'message', 'receipt']);
const USAGE = `usage: valley-technocore batch verify <evidence|message|receipt>
Reads bounded newline-delimited JSON (NDJSON) from stdin and emits canonical JSONL.
Each input line produces one item record, followed by one summary record.
No paths, directories, network resources, private keys, key generation, signing, or writes are used; supplied public-key material is verified locally.
`;

function writeLine(stream, value) {
  stream.write(`${canonicalJson(value)}\n`);
}

async function readNdjson(stream) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new InputError('batch input exceeds 8 MiB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new InputError('batch input must be UTF-8');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > MAX_RECORDS) throw new InputError('batch input exceeds 4096 records');
  return lines;
}

function verify(profile, input) {
  if (profile === 'evidence') {
    const report = verifyEvidence(input);
    return {
      outcome: report.payload_hash_status === 'valid' && report.signature_status === 'valid' ? 'verified' : 'invalid',
      report
    };
  }
  const report = verifyTechnocoreMessage(profile === 'receipt' ? normalizeReceipt(input) : input);
  return { outcome: report.decision, report };
}

export async function runBatch(args, stdin, stdout, stderr) {
  if ((args.length === 1 && ['--help', '-h'].includes(args[0]))
    || (args.length === 2 && args[0] === 'verify' && ['--help', '-h'].includes(args[1]))) {
    stdout.write(USAGE); return 0;
  }
  if (args.length !== 2 || args[0] !== 'verify' || !PROFILES.has(args[1])) {
    stderr.write(`error: unknown batch command or profile\n${USAGE}`); return 2;
  }
  const profile = args[1];
  try {
    const lines = await readNdjson(stdin);
    const counts = { invalid: 0, malformed: 0, verified: 0 };
    for (const [offset, line] of lines.entries()) {
      const index = offset + 1;
      if (Buffer.byteLength(line, 'utf8') > MAX_RECORD_BYTES) {
        counts.malformed += 1;
        writeLine(stdout, { error: 'record exceeds 1 MiB', index, outcome: 'malformed', profile, type: 'item' });
        continue;
      }
      try {
        const { outcome, report } = verify(profile, parseStrictJson(line));
        counts[outcome] += 1;
        writeLine(stdout, { index, outcome, profile, report, type: 'item' });
      } catch (error) {
        if (!(error instanceof InputError)) throw error;
        counts.malformed += 1;
        writeLine(stdout, { error: error.message, index, outcome: 'malformed', profile, type: 'item' });
      }
    }
    writeLine(stdout, { invalid: counts.invalid, malformed: counts.malformed, profile, total: lines.length, type: 'summary', verified: counts.verified });
    return counts.malformed ? 2 : counts.invalid ? 3 : 0;
  } catch (error) {
    stderr.write(`error: ${error instanceof InputError ? error.message : 'internal failure'}\n`);
    return error instanceof InputError ? 2 : 1;
  }
}
