#!/usr/bin/env node

import { run } from '../src/cli.js';
import { runTechnocoreMessage } from '../src/technocore-message.js';

const [command, ...args] = process.argv.slice(2);
process.exitCode = command === 'verify-technocore-message'
  ? await runTechnocoreMessage(args, process.stdin, process.stdout, process.stderr)
  : await run(command === undefined ? [] : [command, ...args], process.stdin, process.stdout, process.stderr);
