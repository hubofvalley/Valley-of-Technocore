#!/usr/bin/env node

import { run } from '../src/cli.js';
import { runTechnocoreMessage } from '../src/technocore-message.js';
import { runReceipt } from '../src/receipt-cli.js';
import { runProvenance } from '../src/provenance.js';
import { runBatch } from '../src/batch-cli.js';

const argv = process.argv.slice(2); const [command, ...args] = argv;
let result;
if (command === 'evidence' && args.length === 1 && ['--help', '-h'].includes(args[0])) {
  process.stdout.write('usage: valley-technocore evidence create\n       valley-technocore evidence verify [--format json|human]\n'); result = 0;
} else if (command === 'message' && args.length === 1 && ['--help', '-h'].includes(args[0])) {
  process.stdout.write('usage: valley-technocore message verify [--format json|human]\n'); result = 0;
} else if (command === 'provenance') result = await runProvenance(args, process.stdin, process.stdout, process.stderr);
else if (command === 'receipt') result = await runReceipt(args, process.stdin, process.stdout, process.stderr);
else if (command === 'batch') result = await runBatch(args, process.stdin, process.stdout, process.stderr);
else if (command === 'message' && args[0] === 'verify') result = await runTechnocoreMessage(args.slice(1), process.stdin, process.stdout, process.stderr);
else if (command === 'evidence' && ['create', 'verify'].includes(args[0])) {
  result = await run([args[0] === 'create' ? 'create-evidence' : 'verify-evidence', ...args.slice(1)], process.stdin, process.stdout, process.stderr);
} else if (command === 'verify-technocore-message') result = await runTechnocoreMessage(args, process.stdin, process.stdout, process.stderr);
else result = await run(command === undefined ? [] : [command, ...args], process.stdin, process.stdout, process.stderr);
process.exitCode = result;
