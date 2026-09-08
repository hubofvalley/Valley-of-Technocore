#!/usr/bin/env node

import { runReceiptIntake } from '../src/receipt-intake.js';

process.exitCode = await runReceiptIntake(process.argv.slice(2), process.stdin, process.stdout, process.stderr);
