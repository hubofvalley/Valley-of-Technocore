import { InputError, parseStrictJson } from './cli.js';
import { parseFormatArgs, writeReport } from './format.js';
import { normalizeReceipt } from './receipt.js';
import { verifyTechnocoreMessage } from './technocore-message.js';

const MAX_INPUT_BYTES = 1024 * 1024;
const USAGE = `usage: valley-technocore receipt normalize
       valley-technocore receipt verify [--format json|human]
Reads one supported local JSON receipt export from stdin.
Accepted shapes: canonical technocore.msg.v1, flat receipt, or {"room":...,"receipt":{...}}.
No files or network resources are read by the command.
`;

async function readReceipt(stream) {
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

export async function runReceipt(args, stdin, stdout, stderr) {
  if ((args.length === 1 && ['--help', '-h'].includes(args[0]))
    || (args.length === 2 && ['normalize', 'verify'].includes(args[0]) && ['--help', '-h'].includes(args[1]))) {
    stdout.write(USAGE); return 0;
  }
  const [command, ...options] = args; const formatArgs = parseFormatArgs(options);
  if (!['normalize', 'verify'].includes(command) || !formatArgs
    || (command === 'normalize' && formatArgs.format !== 'json')) {
    stderr.write(`error: unknown receipt command or option\n${USAGE}`); return 2;
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
