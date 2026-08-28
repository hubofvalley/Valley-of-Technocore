import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const fixture = readFileSync(new URL('../fixtures/technocore-msg-v1-gauntlet.json', import.meta.url), 'utf8');

test('npm pack installs cleanly and exposes working binaries', () => {
  const temp = mkdtempSync(join(tmpdir(), 'valley-technocore-pack-'));
  try {
    const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', temp], { cwd: root, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    const metadata = JSON.parse(packed.stdout)[0];
    const names = metadata.files.map((entry) => entry.path).sort();
    assert.ok(names.includes('bin/valley-technocore.js')); assert.ok(names.includes('scripts/check-release-contract.mjs')); assert.ok(names.includes('src/receipt.js')); assert.ok(names.includes('src/provenance.js'));
    assert.ok(names.includes('docs/cli-and-local-receipts.md'));
    assert.ok(!names.some((name) => name.startsWith('test/') || name.startsWith('fixtures/')));
    const prefix = join(temp, 'install');
    const installed = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', prefix, join(temp, metadata.filename)], { encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr);
    const binary = join(prefix, 'node_modules', '.bin', 'valley-technocore');
    const verified = spawnSync(binary, ['message', 'verify'], { input: fixture, encoding: 'utf8' });
    assert.equal(verified.status, 0, verified.stderr); assert.equal(JSON.parse(verified.stdout).decision, 'verified');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
