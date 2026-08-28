import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
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
    if (!arg.startsWith('--') || index + 1 >= args.length) fail(`usage: check-release-contract [--mode stable|local|candidate --package path --archive path --release-json path --expected-archive path --tag-commit sha --remote-tag-commit sha]`);
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

function packageReleaseInfo(pkg, tag) {
  const isStable = typeof pkg.version === 'string' && STABLE_VERSION.test(pkg.version);
  const isCandidate = typeof pkg.version === 'string' && CANDIDATE_VERSION.test(pkg.version);
  if (!isStable && !isCandidate) fail('package version must be a stable x.y.z or release-candidate x.y.z-rc.n version');
  if (pkg.private !== true) fail('package must remain private');
  if (tag !== `v${pkg.version}`) fail(`tag ${tag} does not match package version ${pkg.version}`);
  return { isCandidate, channel: isCandidate ? 'release-candidate' : 'stable' };
}

function checkArchive({ pkg, archivePath, expectedArchivePath }) {
  const archiveName = `valley-of-technocore-v${pkg.version}.tar`;
  const manifestName = `${archiveName}.sha256`;
  if (basename(archivePath) !== archiveName) fail(`release archive must be named ${archiveName}`);
  const archive = readFileSync(archivePath);
  const expectedArchive = readFileSync(expectedArchivePath);
  if (!archive.equals(expectedArchive)) fail('release archive is not the deterministic archive for the checked revision');
  const digest = sha256(archive);
  const expectedManifest = `${digest}  ${archiveName}\n`;
  if (readFileSync(join(resolve(archivePath, '..'), manifestName), 'utf8') !== expectedManifest) fail('release checksum manifest does not exactly match the archive digest');
  return { archiveName, digest };
}

function checkLocal({ pkg, archivePath, expectedArchivePath, localCommit, tag }) {
  const { channel } = packageReleaseInfo(pkg, tag);
  if (!COMMIT.test(localCommit)) fail('local HEAD does not resolve to a commit');
  const { archiveName, digest } = checkArchive({ pkg, archivePath, expectedArchivePath });
  return { version: pkg.version, tag, channel, commit: localCommit, archive: archiveName, sha256: digest, attestation: 'not-present' };
}

function checkRemote({ pkg, metadata, archivePath, expectedArchivePath, localCommit, remoteCommit, tag }) {
  const { isCandidate, channel } = packageReleaseInfo(pkg, tag);
  if (!COMMIT.test(localCommit) || !COMMIT.test(remoteCommit) || localCommit !== remoteCommit) fail('local and remote tag targets differ');
  if (metadata.tag_name !== tag || metadata.draft || metadata.prerelease !== isCandidate) fail(`release metadata is not the expected ${isCandidate ? 'prerelease candidate' : 'published stable release'} for the package tag`);
  const archiveName = `valley-of-technocore-v${pkg.version}.tar`;
  const manifestName = `${archiveName}.sha256`;
  const assets = new Map((metadata.assets ?? []).map((asset) => [asset.name, asset]));
  if (!assets.has(archiveName) || !assets.has(manifestName)) fail(`release must attach ${archiveName} and ${manifestName}`);
  const { digest } = checkArchive({ pkg, archivePath, expectedArchivePath });

  const attestation = assets.has('release-attestation-v1.json')
    ? checkAttestation(join(resolve(archivePath, '..'), 'release-attestation-v1.json'), { tag, commit: localCommit, digest })
    : 'not-present';
  return { version: pkg.version, tag, channel, commit: localCommit, archive: archiveName, sha256: digest, attestation };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const packagePath = resolve(options.package ?? 'package.json');
  const candidateMode = options.mode === 'candidate';
  const localMode = options.mode === 'local';
  const offlineMode = localMode || candidateMode;
  if (options.mode !== undefined && options.mode !== 'stable' && !offlineMode) fail(`unsupported release-contract mode: ${options.mode}`);
  const packageRoot = resolve(packagePath, '..');
  const workingPkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  const committedPkg = offlineMode
    ? JSON.parse(command('git', ['show', 'HEAD:package.json'], { cwd: packageRoot }))
    : null;
  if (offlineMode && !isDeepStrictEqual(workingPkg, committedPkg)) {
    fail('local package metadata must match committed HEAD:package.json');
  }
  const pkg = committedPkg ?? workingPkg;
  const tag = `v${pkg.version}`;
  const fixtureMode = options['release-json'] !== undefined;
  const temp = fixtureMode ? null : mkdtempSync(join(tmpdir(), 'valley-release-contract-'));
  try {
    const archiveName = `valley-of-technocore-v${pkg.version}.tar`;
    const metadata = fixtureMode ? JSON.parse(readFileSync(resolve(options['release-json']), 'utf8')) : offlineMode ? null : releaseMetadata(REPOSITORY, tag);
    const archivePath = fixtureMode ? resolve(options.archive) : offlineMode ? resolve(options.archive) : downloadAsset(REPOSITORY, tag, archiveName, temp);
    if (!fixtureMode && !offlineMode) downloadAsset(REPOSITORY, tag, `${archiveName}.sha256`, temp);
    const attestationAsset = (metadata?.assets ?? []).find((asset) => asset.name === 'release-attestation-v1.json');
    if (!fixtureMode && !offlineMode && attestationAsset) downloadAsset(REPOSITORY, tag, attestationAsset.name, temp);
    const expectedArchivePath = fixtureMode ? resolve(options['expected-archive']) : join(temp, 'expected.tar');
    if (!fixtureMode) {
      const archiveRef = offlineMode ? 'HEAD' : tag;
      writeFileSync(expectedArchivePath, command('git', ['archive', '--format=tar', `--prefix=valley-of-technocore-v${pkg.version}/`, archiveRef], { cwd: resolve(packagePath, '..'), binary: true }));
    }
    const localCommit = fixtureMode ? options['tag-commit'] : offlineMode ? command('git', ['rev-parse', 'HEAD'], { cwd: packageRoot }).trim() : tagCommit(tag);
    const remoteCommit = fixtureMode ? options['remote-tag-commit'] : offlineMode ? localCommit : remoteTagCommit(REPOSITORY, tag);
    const report = fixtureMode || !offlineMode
      ? checkRemote({ pkg, metadata, archivePath, expectedArchivePath, localCommit, remoteCommit, tag })
      : checkLocal({ pkg, archivePath, expectedArchivePath, localCommit, tag });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
  }
}

try { main(); } catch (error) { process.stderr.write(`release-contract: ${error.message}\n`); process.exitCode = 1; }
