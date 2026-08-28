import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
  const packagePath = join(directory, 'package.json');
  const archivePath = join(directory, archiveName);
  try {
    writeFileSync(packagePath, '{"version":"0.2.0-rc.1","private":true}\n');
    for (const args of [['init', '-q'], ['add', 'package.json'], ['-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid', 'commit', '-qm', 'candidate']]) {
      const git = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
      assert.equal(git.status, 0, git.stderr);
    }
    const archive = spawnSync('git', ['archive', '--format=tar', '--prefix=valley-of-technocore-v0.2.0-rc.1/', 'HEAD'], { cwd: directory });
    assert.equal(archive.status, 0, archive.stderr?.toString());
    writeFileSync(archivePath, archive.stdout);
    const digest = createHash('sha256').update(archive.stdout).digest('hex');
    writeFileSync(join(directory, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`);
    const result = spawnSync(process.execPath, [fileURLToPath(script), '--mode', 'candidate', '--package', packagePath, '--archive', archivePath], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
    assert.equal(result.status, 0, result.stderr);
    const candidateCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' });
    assert.equal(candidateCommit.status, 0, candidateCommit.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { version: '0.2.0-rc.1', tag: 'v0.2.0-rc.1', channel: 'release-candidate', commit: candidateCommit.stdout.trim(), archive: archiveName, sha256: digest, attestation: 'not-present' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('release candidate contract binds committed metadata and archive filename', () => {
  const directory = mkdtempSync(join(tmpdir(), 'valley-release-candidate-binding-'));
  const packagePath = join(directory, 'package.json');
  const archiveName = 'valley-of-technocore-v0.2.0-rc.1.tar';
  const archivePath = join(directory, archiveName);
  try {
    writeFileSync(packagePath, '{"version":"0.2.0-rc.1","private":true}\n');
    for (const args of [['init', '-q'], ['add', 'package.json'], ['-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid', 'commit', '-qm', 'candidate']]) {
      const git = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
      assert.equal(git.status, 0, git.stderr);
    }
    const archive = spawnSync('git', ['archive', '--format=tar', '--prefix=valley-of-technocore-v0.2.0-rc.1/', 'HEAD'], { cwd: directory });
    assert.equal(archive.status, 0, archive.stderr?.toString());
    writeFileSync(archivePath, archive.stdout);
    const digest = createHash('sha256').update(archive.stdout).digest('hex');
    writeFileSync(join(directory, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`);

    writeFileSync(packagePath, '{"version":"9.9.9-rc.9","private":true}\n');
    const dirtyMetadata = spawnSync(process.execPath, [fileURLToPath(script), '--mode', 'candidate', '--package', packagePath, '--archive', archivePath], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
    assert.equal(dirtyMetadata.status, 1);
    assert.match(dirtyMetadata.stderr, /local package metadata must match committed HEAD:package\.json/u);

    writeFileSync(packagePath, '{"version":"0.2.0-rc.1","private":false}\n');
    const dirtyPrivate = spawnSync(process.execPath, [fileURLToPath(script), '--mode', 'candidate', '--package', packagePath, '--archive', archivePath], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
    assert.equal(dirtyPrivate.status, 1);
    assert.match(dirtyPrivate.stderr, /local package metadata must match committed HEAD:package\.json/u);

    writeFileSync(packagePath, '{"version":"0.2.0-rc.1","private":true}\n');
    const wrongName = join(directory, 'wrong-name.tar');
    writeFileSync(wrongName, archive.stdout);
    const wrongFilename = spawnSync(process.execPath, [fileURLToPath(script), '--mode', 'candidate', '--package', packagePath, '--archive', wrongName], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
    assert.equal(wrongFilename.status, 1);
    assert.match(wrongFilename.stderr, /must be named valley-of-technocore-v0\.2\.0-rc\.1\.tar/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('local stable contract validates HEAD without GitHub access', () => {
  const directory = mkdtempSync(join(tmpdir(), 'valley-stable-local-'));
  const packagePath = join(directory, 'package.json');
  const archiveName = 'valley-of-technocore-v0.2.0.tar';
  const archivePath = join(directory, archiveName);
  try {
    writeFileSync(packagePath, '{"version":"0.2.0","private":true}\n');
    for (const args of [['init', '-q'], ['add', 'package.json'], ['-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid', 'commit', '-qm', 'stable']]) {
      const git = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
      assert.equal(git.status, 0, git.stderr);
    }
    const archive = spawnSync('git', ['archive', '--format=tar', '--prefix=valley-of-technocore-v0.2.0/', 'HEAD'], { cwd: directory });
    assert.equal(archive.status, 0, archive.stderr?.toString());
    writeFileSync(archivePath, archive.stdout);
    const digest = createHash('sha256').update(archive.stdout).digest('hex');
    writeFileSync(join(directory, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`);
    const result = spawnSync(process.execPath, [fileURLToPath(script), '--mode', 'local', '--package', packagePath, '--archive', archivePath], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
    assert.equal(result.status, 0, result.stderr);
    const stableCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' });
    assert.equal(stableCommit.status, 0, stableCommit.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { version: '0.2.0', tag: 'v0.2.0', channel: 'stable', commit: stableCommit.stdout.trim(), archive: archiveName, sha256: digest, attestation: 'not-present' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('CI selects local candidate mode for prerelease metadata', () => {
  const workflow = readFileSync(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8');
  assert.match(workflow, /release:\s+types: \[published\]/u);
  assert.match(workflow, /ref: \$\{\{ github\.event\.release\.tag_name \|\| github\.ref \}\}/u);
  assert.match(workflow, /name: Check local release contract\s+if: github\.event_name != 'release'/u);
  assert.match(workflow, /name: Check published release contract\s+if: github\.event_name == 'release'/u);
  assert.match(workflow, /contract_mode='local'/u);
  assert.match(workflow, /package_version=.*package\.json/u);
  assert.ok(workflow.includes('if [[ "$package_version" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+-rc\\.[0-9]+$ ]]; then'));
  assert.match(workflow, /git archive --format=tar --prefix="/u);
  assert.match(workflow, /HEAD > "\$archive_dir\/\$archive_name"/u);
  assert.match(workflow, /sha256sum "\$archive_name" > "\$archive_name\.sha256"/u);
  assert.match(workflow, /--archive "\$archive_dir\/\$archive_name"/u);
  assert.match(workflow, /contract_mode='candidate'/u);
  assert.match(workflow, /--mode "\$contract_mode"/u);
  const localStep = workflow.split('      - name: Check published release contract')[0];
  assert.doesNotMatch(localStep, /GH_TOKEN/u);
});
