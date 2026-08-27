#!/usr/bin/env node

import { runActionsServer } from '../src/actions-server.js';

process.exitCode = await runActionsServer(process.argv.slice(2), process.stdout, process.stderr);
