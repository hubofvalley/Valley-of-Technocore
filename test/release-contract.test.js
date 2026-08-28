import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = new URL('../scripts/check-release-contract.mjs', import.meta.url);
const commit = 'a'.repeat(40);

function run({ prerelease = false, manifest = null } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'valley-release-contract-'));
  const archiveName = 'valley-of-technocore-v0.1.0.tar';
  const archive = Buffer.from('deterministic archive bytes');
  const digest = 'a584daf42486d7c87e4513fdcca9c58d2e2ec897774bafdbd43e6c0696c29979';
  try {
    writeFileSync(join(directory, 'package.json'), '{"version":"0.1.0","private":true}\n');
    writeFileSync(join(directory, archiveName), archive);
    writeFileSync(join(directory, 'expected.tar'), archive);
    writeFileSync(join(directory, `${archiveName}.sha256`), manifest ?? `${digest}  ${archiveName}\n`);
    writeFileSync(join(directory, 'release.json'), JSON.stringify({ tag_name: 'v0.1.0', draft: false, prerelease, assets: [{ name: archiveName }, { name: `${archiveName}.sha256` }] }));
    return spawnSync(process.execPath, [script.pathname, '--package', join(directory, 'package.json'), '--release-json', join(directory, 'release.json'), '--archive', join(directory, archiveName), '--expected-archive', join(directory, 'expected.tar'), '--tag-commit', commit, '--remote-tag-commit', commit], { encoding: 'utf8' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('release contract accepts a stable release with matching deterministic archive and checksum', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { version: '0.1.0', tag: 'v0.1.0', channel: 'stable', commit, archive: 'valley-of-technocore-v0.1.0.tar', sha256: 'a584daf42486d7c87e4513fdcca9c58d2e2ec897774bafdbd43e6c0696c29979', attestation: 'not-present' });
});

test('release contract rejects a bad checksum manifest', () => {
  const result = run({ manifest: '0'.repeat(64) + '  valley-of-technocore-v0.1.0.tar\n' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /checksum manifest/u);
});

test('release contract rejects prerelease metadata', () => {
  const result = run({ prerelease: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /expected published stable release/u);
});

test('release candidate contract accepts a prerelease package and exact archive', () => {
  const directory = mkdtempSync(join(tmpdir(), 'valley-release-candidate-'));
  const archiveName = 'valley-of-technocore-v0.2.0-rc.1.tar';
  const archive = Buffer.from('deterministic release candidate archive bytes');
  const digest = 'e4c7779af743a3b78faa48d2342c027ffd339946c80e9a376288963a3c15b1e1';
  try {
    writeFileSync(join(directory, 'package.json'), '{"version":"0.2.0-rc.1","private":true}\n');
    writeFileSync(join(directory, archiveName), archive);
    writeFileSync(join(directory, 'expected.tar'), archive);
    writeFileSync(join(directory, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`);
    writeFileSync(join(directory, 'release.json'), JSON.stringify({ tag_name: 'v0.2.0-rc.1', draft: false, prerelease: true, assets: [{ name: archiveName }, { name: `${archiveName}.sha256` }] }));
    const result = spawnSync(process.execPath, [script.pathname, '--mode', 'candidate', '--package', join(directory, 'package.json'), '--release-json', join(directory, 'release.json'), '--archive', join(directory, archiveName), '--expected-archive', join(directory, 'expected.tar'), '--tag-commit', commit, '--remote-tag-commit', commit], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { version: '0.2.0-rc.1', tag: 'v0.2.0-rc.1', channel: 'release-candidate', commit, archive: archiveName, sha256: 'e4c7779af743a3b78faa48d2342c027ffd339946c80e9a376288963a3c15b1e1', attestation: 'not-present' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
