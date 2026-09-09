#!/usr/bin/env node

import { runRoomExport } from '../src/room-export.js';

process.exitCode = await runRoomExport(process.argv.slice(2), process.stdin, process.stdout, process.stderr);
