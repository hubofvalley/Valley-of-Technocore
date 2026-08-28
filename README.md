# Valley of Technocore

Valley of Technocore is an unofficial, stateless, offline CLI for checking supplied Ed25519-signed Technocore message bytes and packaging supplied signed bytes as deterministic evidence.

It is a verifier, not a Technocore client. It does not connect to Technocore, create keys, sign messages, decide eligibility, or prove who controls a DID.

An independent, unofficial tool by Grand Valley.

## Contents

- [What this verifies](#what-this-verifies)
- [Quick demo](#quick-demo)
- [Verify your own local receipt export](#verify-your-own-local-receipt-export)
- [Public compatibility corpus](#public-compatibility-corpus)
- [Read the result correctly](#read-the-result-correctly)
- [Commands and exit codes](#commands-and-exit-codes)
- [Offline and safety boundary](#offline-and-safety-boundary)
- [Troubleshooting](#troubleshooting)

## What this verifies

Given a complete local input, the CLI can:

- derive Technocore signing bytes as `room|nonce|swept-text`, then verify a detached Ed25519 signature over those derived bytes;
- normalise one bounded local receipt export into the `technocore.msg.v1` profile;
- bind a captured signed request to the matching local response record in a deterministic provenance bundle; and
- package already-supplied signed bytes into deterministic evidence JSON; and
- show that changing input in a way that changes the derived signing bytes invalidates a detached signature.

It cannot establish source authenticity, DID ownership, authorship beyond control of the supplied key, server inclusion, recency, replay protection, contribution, recognition, eligibility, rewards, or authority.

## Quick demo

Requirements: Git and Node.js 22 or newer. The runtime has no dependencies, so the CLI needs no `npm install` step.

```bash
node --version
git clone https://github.com/hubofvalley/Valley-of-Technocore.git
cd Valley-of-Technocore
node ./bin/valley-technocore.js message verify --format human \
  < fixtures/technocore-msg-v1-gauntlet.json
printf 'exit: %s\n' "$?"
```

Selected output (the human report also lists `non claims:`):

```text
profile: technocore.msg.v1
decision: verified
signature status: valid
reasons: none
exit: 0
```

The checked-in sample maps one receipt published by a third party at an [immutable GitHub commit](https://github.com/vaibhav0xq/technocore-gauntlet/blob/661ed9647e33f3eddf18deea716434be6a7a4823/evidence/technocore-receipts.json). It is a one-sample offline compatibility check, not proof that the source is authentic or that Technocore stored the record. See the [compatibility record](docs/technocore-receipt-compatibility.md).

### See a signature fail after one-byte tampering

Keep the original sample intact and create a second local file whose text differs by one printable character, so its derived signing bytes change:

```bash
node -e "const fs = require('node:fs'); const x = JSON.parse(fs.readFileSync('fixtures/technocore-msg-v1-gauntlet.json', 'utf8')); x.text += '!'; fs.writeFileSync('technocore-tampered.json', JSON.stringify(x));"

node ./bin/valley-technocore.js message verify --format human \
  < technocore-tampered.json
printf 'exit: %s\n' "$?"
```

Expected result: `decision: invalid`, `signature status: invalid`, and `exit: 3`. Remove `technocore-tampered.json` when finished or keep it out of commits.

## Verify your own local receipt export

If you already have one exported receipt with its detached signature, verify it in one step:

```bash
node ./bin/valley-technocore.js receipt verify --format human \
  < exported-receipt.json
printf 'exit: %s\n' "$?"
```

The normaliser accepts one object in these bounded shapes:

```json
{"room":"lobby","did":"did:key:z...","nonce":"123","text":"hello","signature":"..."}
```

```json
{"room":"lobby","receipt":{"did":"did:key:z...","nonce":"123","text":"hello","signature":"..."}}
```

It also accepts canonical `technocore.msg.v1` input. It rejects unknown fields, ambiguous collections, and a missing detached signature. For the complete local-receipt contract, see [CLI and local receipt workflow](docs/cli-and-local-receipts.md).

## Public compatibility corpus

The checked-in [compatibility corpus](fixtures/technocore-msg-v1-compatibility.json) pins Unicode sweep, byte-exact NFC, maximum nonce, and malformed-input boundaries. It is useful for independent implementations and remains entirely offline. See [its contract and limits](docs/compatibility-corpus.md).

## Read the result correctly

`decision: verified` means the supplied public key verifies the detached signature over the derived Technocore signing bytes: `room|nonce|swept-text`. It does not make the message trusted or authoritative. A raw-text change that Technocore sweep removes may leave those signing bytes unchanged.

The human report deliberately lists its non-claims, including `identity_not_established`, `source_authenticity_not_established`, and `server_inclusion_not_established`.

This distinction matters because current documented Technocore room-read responses do not return detached signatures. A live read can be a separate source of message fields, but it cannot by itself recreate a complete offline verification input.

## Build a local provenance bundle

When another, separate posting tool has already captured both its signed request and the response record it received, package that pair without retrying the request or contacting Technocore:

```bash
node ./bin/valley-technocore.js provenance create < captured-request-and-response.json > provenance.json
node ./bin/valley-technocore.js provenance verify --format human < provenance.json
printf 'exit: %s\n' "$?"
```

The capture has exactly this shape: a canonical `technocore.msg.v1` request plus the response's matching `posted` record and HTTP `200` status. The CLI requires the DID, nonce, and swept text to match exactly. A valid bundle proves only that this supplied request signature verifies and that the supplied response record matches it. It does not prove that Technocore included, retained, or authorised the record.

## Commands and exit codes

```text
valley-technocore evidence create
valley-technocore evidence verify [--format json|human]
valley-technocore message verify [--format json|human]
valley-technocore receipt normalize
valley-technocore receipt verify [--format json|human]
valley-technocore provenance create
valley-technocore provenance verify [--format json|human]
valley-attestation verify [--format json|human]
```

Legacy aliases remain available: `create-evidence`, `verify-evidence`, and `verify-technocore-message`.

| Exit | Meaning |
| ---: | --- |
| `0` | Input was processed and valid, or normalisation completed. |
| `1` | Unexpected internal failure or runtime I/O failure. |
| `2` | Malformed input, unsupported shape, or command error. |
| `3` | Input was processable but its detached signature or payload hash was invalid. |

Default output, and explicit `--format json` output, is one canonical JSON object on stdout without a trailing newline. `--format human` is available only for verification and report commands. Evidence creation and receipt normalisation always emit canonical JSON artefacts; they reject `--format human`.

## Offline and safety boundary

The runtime reads one object from local standard input and writes its result to standard output. It makes no network requests and has no URL fetching, wallet access, private-key handling or generation, server process, subprocess execution, watcher, cron job, token logic, or deployment behaviour.

The command shown above only reads repository files. Fetching a third-party receipt, if you choose to do so, is a separate action outside the verifier.

Generated evidence grants no permission to act. Independently validate any source or external claim before relying on it.

## Troubleshooting

- `node --version` is below 22: install Node.js 22 or newer, then retry.
- `MODULE_NOT_FOUND`: run the command from the cloned repository root and keep the leading `./` in `./bin/valley-technocore.js`.
- Exit `2`: check that the receipt has exactly one supported object shape, an allowed room and nonce, and an unpadded base64url detached signature.
- Exit `3` from `message verify` or `receipt verify`: the input was readable but the detached signature did not verify. Inspect `signature status` and `reasons`.
- Exit `3` from `evidence verify`: the input was readable but its payload hash or detached signature did not verify. Inspect `payload hash status` and `signature status`; this report has no `reasons` field.
- JSON appears beside your shell prompt: expected. JSON reports deliberately have no trailing newline; redirect to a file or print a newline after the command.

For the full reproducibility walkthrough, see [testing and reproducibility](docs/testing-and-reproducibility.md), the [terminal tutorial](docs/terminal-tutorial.md), and the [terminal video plan](docs/terminal-video-plan.md).

## Release status

Stable `v0.1.0` is published on GitHub: [release notes, deterministic source archive, and SHA-256 manifest](https://github.com/hubofvalley/Valley-of-Technocore/releases/tag/v0.1.0). The package remains `private: true` and is not published to npm. See [release readiness](docs/release-readiness.md) for the exact release contract and its deterministic checker.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
