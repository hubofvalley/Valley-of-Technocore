# Valley of Technocore

[![CI](https://github.com/hubofvalley/Valley-of-Technocore/actions/workflows/test.yml/badge.svg)](https://github.com/hubofvalley/Valley-of-Technocore/actions/workflows/test.yml) [![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/) [![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Verify supplied Technocore signed messages locally, without giving the verifier network, wallet, or signing access.

Unofficial • independent • offline • stateless • no runtime dependencies

An independent, unofficial tool by Grand Valley.

It verifies supplied Ed25519 signatures and deterministic evidence. It does not establish who controls a DID, where input came from, server inclusion, eligibility, rewards, or authority.

For a canonical message, the verifier can derive Technocore signing bytes as `room|nonce|swept-text` and verify the detached Ed25519 signature over those bytes. It can also normalise supported local receipt exports, verify deterministic evidence and provenance bundles, and batch-verify supplied newline-delimited input without opening paths or making network requests.

## Install

Requires Node.js 22 or newer. Choose one path:

| If you want... | Use |
| --- | --- |
| A convenient global CLI | [Verified pilot installation](#verified-pilot-installation) |
| Maximum auditability / canonical development path | [Verified source checkout](#verified-source-checkout) |

### Verified pilot installation

This is the shortest path. It installs the current commit-pinned pilot from a
GitHub Release, never from the npm registry. Download the archive and its
checksum manifest, verify them, then install the already-downloaded archive
offline:

```bash
curl -fLO https://github.com/hubofvalley/Valley-of-Technocore/releases/download/v0.2.2/valley-of-technocore-pilot-fc204e0635d11a434623dc5d16e53874784c28b5.tar
curl -fLO https://github.com/hubofvalley/Valley-of-Technocore/releases/download/v0.2.2/valley-of-technocore-pilot-fc204e0635d11a434623dc5d16e53874784c28b5.tar.sha256
sha256sum -c valley-of-technocore-pilot-fc204e0635d11a434623dc5d16e53874784c28b5.tar.sha256
npm install -g --ignore-scripts --offline --no-audit --no-fund ./valley-of-technocore-pilot-fc204e0635d11a434623dc5d16e53874784c28b5.tar
valley-technocore --help
```

On macOS, use `shasum -a 256 -c <manifest>` in place of `sha256sum -c <manifest>`.

The archive is a pilot evaluation release. It is not an npm publication; do not
skip the checksum verification or remove the offline install flag. See the
[v0.2.2 release](https://github.com/hubofvalley/Valley-of-Technocore/releases/tag/v0.2.2)
for its exact files and digest.

### Verified source checkout

This is the canonical path for auditing and reproducibility. Review the release
tag or commit you intend to run, then execute from the repository root:

```bash
git clone https://github.com/hubofvalley/Valley-of-Technocore.git
cd Valley-of-Technocore
node ./bin/valley-technocore.js message verify --format human < message.json
```

The runtime has no dependencies, so a checkout needs no `npm install` step.

## Verify a message

After installing the pilot or entering a source checkout, pass one supplied
JSON object through standard input:

```bash
valley-technocore message verify --format human < message.json
```

Selected output (the human report also lists `non claims:`):

```text
profile: technocore.msg.v1
decision: verified
signature status: valid
exit: 0
```

## Troubleshooting

| Problem | Check |
| --- | --- |
| Node.js is too old | Run `node --version`; the CLI requires Node.js 22 or newer. |
| Checksum verification fails | Stop. Re-download the archive and its matching `.tar.sha256` from the same GitHub Release. |
| Archive and checksum pair do not match | The two filenames must contain the same commit `<SHA>`; verify the manifest before installing. |
| `valley-technocore` is not found after installation | Check the global npm binary directory is on `PATH`, then open a new shell and retry `valley-technocore --help`. |
| Offline npm install fails or tries the network | Use the exact local tarball command above with `--offline`; confirm the tarball path is valid and do not weaken the offline flag. |
| A `verified` result seems to prove identity or authorship | It does not; read [What verification means](#what-verification-means), then use the [issues](https://github.com/hubofvalley/Valley-of-Technocore/issues) for anything else. |

## What verification means

A `verified` result means the supplied Ed25519 key validates the signature over the derived Technocore signing bytes. Supported receipt forms, evidence, and provenance are checked according to their respective local profiles.

It does not establish who controls that key, where the input came from, whether a Technocore server stored it, or whether the record is recent, eligible, rewarded, recognised, or authoritative. See the [first-run verification flow](docs/first-run-flow.md) and [CLI and local receipt guide](docs/cli-and-local-receipts.md) for profile details.

## Common workflows

Verify a signed message or local receipt:

```bash
valley-technocore message verify --format human < message.json
valley-technocore receipt verify --format human < receipt.json
```

Verify one supplied object when its profile is not known in advance:

```bash
valley-technocore verify --format human < supplied.json
```

Verify a captured signed request and matching response record:

```bash
valley-technocore provenance verify --format human < provenance.json
```

Verify newline-delimited inputs:

```bash
valley-technocore batch verify message < messages.ndjson
```

See the [integrator contract](docs/integrator-contract.md) for stable machine output, limits, and profile-specific input rules.

## Commands and exit codes

```text
valley-technocore verify [--format json|human]
valley-technocore evidence create
valley-technocore evidence verify [--format json|human]
valley-technocore message verify [--format json|human]
valley-technocore receipt normalize
valley-technocore receipt verify [--format json|human]
valley-technocore provenance create
valley-technocore provenance verify [--format json|human]
valley-technocore batch verify <evidence|message|receipt>
valley-attestation verify [--format json|human]
```

Legacy aliases remain available: `create-evidence`, `verify-evidence`, and `verify-technocore-message`.

| Exit | Meaning |
| ---: | --- |
| `0` | Input was processed and valid, or normalisation completed. |
| `1` | Unexpected internal failure or runtime I/O failure. |
| `2` | Malformed input, unsupported shape, or command error. |
| `3` | Input was processable but its detached signature or payload hash was invalid. |

### Output contract

Default output, and explicit `--format json` output, is one canonical JSON object on stdout without a trailing newline. `--format human` is available only for verification and report commands. Evidence creation and receipt normalisation always emit canonical JSON artefacts; they reject `--format human`.

`batch verify` consumes NDJSON from standard input and emits one canonical JSON object per line, ending with a summary record. It accepts exactly one fixed profile for the whole stream: `evidence`, `message`, or `receipt`.

For human verification output, `evidence verify`: the report has no `reasons` field; inspect its payload-hash and signature statuses instead.

## Security model

The verifier consumes supplied input through standard input, reports results on standard output, and sends errors to standard error. It is offline and stateless: it writes no files, makes no network requests, follows no URLs, opens no wallet, reads no private key, signs or generates no keys, contacts no server, and performs no reward or eligibility action. Read the full [FLOP skill contract](docs/flop-technocore-skill-v1-contract.md) and [integrator contract](docs/integrator-contract.md) for the enforceable boundaries.

## Documentation

- [CLI and local receipts](docs/cli-and-local-receipts.md)
- [First-run verification flow](docs/first-run-flow.md)
- [Compatibility corpus](docs/compatibility-corpus.md)
- [Testing and reproducibility](docs/testing-and-reproducibility.md)
- [Terminal tutorial](docs/terminal-tutorial.md)
- [FLOP Skill v1 acceptance and runtime evidence](docs/flop-technocore-skill-v1-acceptance.md)
- [Release readiness](docs/release-readiness.md)
- [Changelog](CHANGELOG.md) · [GitHub Releases](https://github.com/hubofvalley/Valley-of-Technocore/releases) · [Licence](LICENSE)
