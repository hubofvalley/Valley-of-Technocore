#!/usr/bin/env node

import { runAttestation } from '../src/attestation.js';

process.exitCode = await runAttestation(process.argv.slice(2), process.stdin, process.stdout, process.stderr);
