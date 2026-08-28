import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { verifyAttestation } from '../src/attestation.js';

const REPOSITORY = 'hubofvalley/Valley-of-Technocore';
const REPOSITORY_URL = 'https://github.com/hubofvalley/Valley-of-Technocore';
const COMMIT = /^[0-9a-f]{40}$/u;
const STABLE_VERSION = /^\d+\.\d+\.\d+$/u;
const CANDIDATE_VERSION = /^\d+\.\d+\.\d+-rc\.\d+$/u;

function fail(message) { throw new Error(message); }

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--') || index + 1 >= args.length) fail(`usage: check-release-contract [--mode stable|candidate --package path --archive path --release-json path --expected-archive path --tag-commit sha --remote-tag-commit sha]`);
    options[arg.slice(2)] = args[index + 1];
    index += 1;
  }
  return options;
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, { encoding: options.binary ? undefined : 'utf8', cwd: options.cwd });
  if (result.error) fail(`cannot run ${commandName}: ${result.error.message}`);
  if (result.status !== 0) fail(`${commandName} ${args.join(' ')} failed: ${String(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function tagCommit(tag) { return command('git', ['rev-parse', `${tag}^{commit}`]).trim(); }

function remoteTagCommit(repository, tag) {
  let object = JSON.parse(command('gh', ['api', `repos/${repository}/git/ref/tags/${tag}`])).object;
  while (object.type === 'tag') object = JSON.parse(command('gh', ['api', `repos/${repository}/git/tags/${object.sha}`])).object;
  if (object.type !== 'commit' || !COMMIT.test(object.sha)) fail(`remote tag ${tag} does not resolve to a commit`);
  return object.sha;
}

function releaseMetadata(repository, tag) {
  return JSON.parse(command('gh', ['api', `repos/${repository}/releases/tags/${tag}`]));
}

function downloadAsset(repository, tag, name, directory) {
  command('gh', ['release', 'download', tag, '--repo', repository, '--pattern', name, '--dir', directory]);
  return join(directory, name);
}

function checkAttestation(path, { tag, commit, digest }) {
  const attestation = JSON.parse(readFileSync(path, 'utf8'));
  const report = verifyAttestation(attestation);
  if (report.signature_status !== 'valid') fail('release attestation signature is invalid');
  const statement = attestation.statement;
  if (statement.repository !== REPOSITORY_URL || statement.tag !== tag || statement.commit !== commit || statement.digest.sha256 !== `sha256:${digest}`) {
    fail('release attestation does not bind this repository, tag, commit, and archive digest');
  }
  return 'valid';
}

function check({ packagePath, metadata, archivePath, expectedArchivePath, localCommit, remoteCommit, tag }) {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  const isStable = typeof pkg.version === 'string' && STABLE_VERSION.test(pkg.version);
  const isCandidate = typeof pkg.version === 'string' && CANDIDATE_VERSION.test(pkg.version);
  if (!isStable && !isCandidate) fail('package version must be a stable x.y.z or release-candidate x.y.z-rc.n version');
  if (pkg.private !== true) fail('package must remain private');
  if (tag !== `v${pkg.version}`) fail(`tag ${tag} does not match package version ${pkg.version}`);
  if (!COMMIT.test(localCommit) || !COMMIT.test(remoteCommit) || localCommit !== remoteCommit) fail('local and remote tag targets differ');
  if (metadata.tag_name !== tag || metadata.draft || metadata.prerelease !== isCandidate) fail(`release metadata is not the expected ${isCandidate ? 'prerelease candidate' : 'published stable release'} for the package tag`);

  const archiveName = `valley-of-technocore-v${pkg.version}.tar`;
  const manifestName = `${archiveName}.sha256`;
  const assets = new Map((metadata.assets ?? []).map((asset) => [asset.name, asset]));
  if (!assets.has(archiveName) || !assets.has(manifestName)) fail(`release must attach ${archiveName} and ${manifestName}`);

  const archive = readFileSync(archivePath);
  const expectedArchive = readFileSync(expectedArchivePath);
  if (!archive.equals(expectedArchive)) fail('release archive is not the deterministic archive for the tag');
  const digest = sha256(archive);
  const expectedManifest = `${digest}  ${archiveName}\n`;
  if (readFileSync(join(resolve(archivePath, '..'), manifestName), 'utf8') !== expectedManifest) fail('release checksum manifest does not exactly match the archive digest');

  const attestation = assets.has('release-attestation-v1.json')
    ? checkAttestation(join(resolve(archivePath, '..'), 'release-attestation-v1.json'), { tag, commit: localCommit, digest })
    : 'not-present';
  return { version: pkg.version, tag, channel: isCandidate ? 'release-candidate' : 'stable', commit: localCommit, archive: archiveName, sha256: digest, attestation };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const packagePath = resolve(options.package ?? 'package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  const tag = `v${pkg.version}`;
  const candidateMode = options.mode === 'candidate';
  if (options.mode !== undefined && options.mode !== 'stable' && !candidateMode) fail(`unsupported release-contract mode: ${options.mode}`);
  const fixtureMode = options['release-json'] !== undefined;
  const temp = fixtureMode ? null : mkdtempSync(join(tmpdir(), 'valley-release-contract-'));
  try {
    const archiveName = `valley-of-technocore-v${pkg.version}.tar`;
    const metadata = fixtureMode
      ? JSON.parse(readFileSync(resolve(options['release-json']), 'utf8'))
      : candidateMode
        ? { tag_name: tag, draft: false, prerelease: true, assets: [{ name: archiveName }, { name: `${archiveName}.sha256` }] }
        : releaseMetadata(REPOSITORY, tag);
    const archivePath = fixtureMode ? resolve(options.archive) : candidateMode ? resolve(options.archive) : downloadAsset(REPOSITORY, tag, archiveName, temp);
    if (!fixtureMode && !candidateMode) downloadAsset(REPOSITORY, tag, `${archiveName}.sha256`, temp);
    const attestationAsset = (metadata.assets ?? []).find((asset) => asset.name === 'release-attestation-v1.json');
    if (!fixtureMode && !candidateMode && attestationAsset) downloadAsset(REPOSITORY, tag, attestationAsset.name, temp);
    const expectedArchivePath = fixtureMode ? resolve(options['expected-archive']) : join(temp, 'expected.tar');
    if (!fixtureMode) {
      const archiveRef = candidateMode ? 'HEAD' : tag;
      writeFileSync(expectedArchivePath, command('git', ['archive', '--format=tar', `--prefix=valley-of-technocore-v${pkg.version}/`, archiveRef], { cwd: resolve(packagePath, '..'), binary: true }));
    }
    const localCommit = fixtureMode ? options['tag-commit'] : candidateMode ? command('git', ['rev-parse', 'HEAD'], { cwd: resolve(packagePath, '..') }).trim() : tagCommit(tag);
    const remoteCommit = fixtureMode ? options['remote-tag-commit'] : candidateMode ? localCommit : remoteTagCommit(REPOSITORY, tag);
    process.stdout.write(`${JSON.stringify(check({ packagePath, metadata, archivePath, expectedArchivePath, localCommit, remoteCommit, tag }))}\n`);
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
  }
}

try { main(); } catch (error) { process.stderr.write(`release-contract: ${error.message}\n`); process.exitCode = 1; }
