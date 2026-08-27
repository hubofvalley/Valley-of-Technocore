# Valley of Technocore

An unofficial, fully local toolkit for packaging supplied Ed25519-signed data as portable evidence and checking it for later tampering.

An independent, unofficial tool by Grand Valley.

## Try it from a clean clone

Requirements: Git and Node.js 22 or newer. The project has no runtime dependencies, so no `npm install` step is needed.

```bash
node --version
git clone https://github.com/hubofvalley/Valley-of-Technocore.git
cd Valley-of-Technocore
npm test

node ./bin/valley-technocore.js create-evidence \
  < fixtures/valid-input.json \
  > evidence.json

node ./bin/valley-technocore.js verify-evidence \
  < evidence.json

echo $?
```

`node --version` must print `v22.0.0` or newer. The fixture is a public RFC 8032 Ed25519 test vector; it contains no secret or private key. Successful verification prints this report and `echo $?` prints `0`:

```json
{"authority":"none","did_status":"valid","payload_hash_status":"valid","schema_status":"valid","server_attribution_status":"observed-only","signature_status":"valid"}
```

### See tamper detection fail safely

Make a separate local copy with only its recorded payload hash changed, then verify it:

```bash
node -e "const fs = require('node:fs'); const evidence = JSON.parse(fs.readFileSync('evidence.json', 'utf8')); evidence.statement.payload_sha256 = 'sha256:' + '0'.repeat(64); fs.writeFileSync('evidence-tampered.json', JSON.stringify(evidence));"

node ./bin/valley-technocore.js verify-evidence \
  < evidence-tampered.json

echo $?
```

The report contains `"payload_hash_status":"invalid"`, and `echo $?` prints `3`. This changes only the new `evidence-tampered.json` file; the fixture and `evidence.json` remain untouched.

Remove the generated files when finished, or keep them outside commits:

```bash
rm evidence.json evidence-tampered.json
```

For exact testing commands, reproducibility limits, and result-source boundaries, see [Testing and reproducibility](docs/testing-and-reproducibility.md).
For a copy-paste valid-to-one-byte-tampered walkthrough, see the [terminal tutorial](docs/terminal-tutorial.md).

## When this is useful

Use this toolkit to package already-supplied signed bytes in a deterministic JSON format, verify the included Ed25519 signature and payload hash offline, or demonstrate that a packaged file changed after creation.

One third-party public GitHub receipt, presented by its source as a Technocore signed-room receipt, has passed a one-sample offline mapping check: its published room, sequence, DID, nonce, text, and signature were mapped to this toolkit's input and the detached Ed25519 signature verified. See [the compatibility record](docs/technocore-receipt-compatibility.md). This is not an authenticity check: the toolkit did not fetch the room or independently validate the external source.

A valid report cannot prove authenticity, identity, authorship, contribution, ownership, recognition, eligibility, rewards, repository control, or authority. It proves only that the public key in `signer_did` verifies the exact supplied payload bytes and that the recorded payload hash matches them. `server_attributed_did` remains observed attribution only; no relationship between the two DIDs is inferred.

## Evidence commands

v1 exposes two evidence commands:

- `create-evidence` writes deterministic evidence JSON to stdout from a supported object supplied on stdin.
- `verify-evidence` checks the evidence schema, payload hash, Ed25519 `did:key`, and detached signature.

See [the evidence v1 specification](docs/v1-spec.md) for the exact schema and validation contract.

The CLI also provides a grouped command hierarchy, optional human-readable verification reports, and bounded normalisation for one local receipt export at a time. Evidence creation and receipt normalisation always emit canonical JSON artefacts; `--format human` applies only to verification/report commands. See [CLI and local receipt workflow](docs/cli-and-local-receipts.md). Existing command names and default JSON reports remain supported.

## Verify a supplied Technocore signed message

The stateless `technocore.msg.v1` profile verifies the exact byte format used by the pinned upstream Technocore implementation. Think of it as checking a letter's seal: it confirms that the supplied message matches the supplied signature and public key. It does not identify who controls the key or prove that a server included the message. It also provides no authority, eligibility decision, or replay protection.

Run the checked-in signed fixture with one command:

```bash
node ./bin/valley-technocore.js verify-technocore-message < fixtures/technocore-msg-v1-gauntlet.json; printf '\nexit: %s\n' "$?"
```

Expected result: the JSON report contains `"decision":"verified"` and `"signature_status":"valid"`, followed by `exit: 0`. This checks only the supplied bytes, signature, and public key. It does not prove source authenticity, identity, server inclusion, contribution, eligibility, rewards, authority, or that the message has not been replayed. See [the `technocore.msg.v1` profile](docs/technocore-msg-v1.md) for the pinned upstream revision, exact sweep semantics, input schema, and exclusions.

### Exit codes

`create-evidence`:

- `0` — evidence created.
- `2` — malformed input, unsupported input, or invalid command usage.

`verify-evidence`:

- `0` — schema, payload hash, DID, and signature verified.
- `1` — internal failure or runtime I/O failure.
- `2` — malformed evidence, unsupported evidence, or invalid command usage.
- `3` — evidence was processable, but its payload hash or signature was invalid.

`verify-technocore-message`:

- `0` — the supplied DID verifies the exact pinned Technocore message bytes.
- `1` — internal failure or runtime I/O failure.
- `2` — malformed or unsupported profile input.
- `3` — the input was processable, but its detached signature was invalid.

Diagnostics go to stderr. Default output, and explicit `--format json` output, is one canonical JSON object on stdout without a trailing newline. `--format human` is available only for verification and report commands. Evidence creation and receipt normalisation always emit canonical JSON artefacts.

## Verify the release attestation

The separate `valley-attestation` command verifies the checked-in self-signed release attestation locally:

```bash
node ./bin/valley-attestation.js \
  < fixtures/release-attestation-v1.json

echo $?
```

Successful verification prints a canonical report with `signature_status` set to `valid`, `external_facts_status` set to `not-checked`, and `authority` set to `none`; `echo $?` then prints `0`.

This verifier verifies only the signature over the exact signed statement bytes using the public key encoded by the public DID. It does not independently prove identity, authorship, contribution, ownership, repository control, source authenticity, external recognition, FLOP eligibility, rewards, or authority.

See [the release-attestation v1 specification](docs/release-attestation-v1.md) for the exact schema, signing bytes, limitations, and exit codes.

## Offline and safety boundary

The toolkit consumes only data explicitly supplied through local stdin. It cannot discover whether that input is genuine, complete, recognised, eligible, or current.

It makes no network requests and has no URL fetching, wallet access, private-key handling or key generation, server process, subprocess execution, watcher, cron job, npm publishing flow, token logic, or deployment behaviour. `npm` is used here only to run the repository's local test script; the package remains private and is not published to npm.

Generated or verified evidence grants no permission to act and carries no authority. Independent source validation remains the user's responsibility.

## Troubleshooting

- `npm test` reports an unsupported Node.js version: install Node.js 22 or newer, confirm with `node --version`, then rerun the test.
- Node reports `MODULE_NOT_FOUND`: run the CLI command from the cloned repository root and keep the leading `./` in `./bin/valley-technocore.js`.
- CLI prints the usage line and exits `2`: supply exactly one supported command.
- `create-evidence` or `verify-evidence` prints `error: ...` and exits `2`: input must match [the evidence v1 specification](docs/v1-spec.md). Do not add duplicate or unknown fields, comments, trailing commas, padded base64url, or a BOM.
- `verify-technocore-message` prints `error: ...` and exits `2`: input must match [the `technocore.msg.v1` profile](docs/technocore-msg-v1.md), including its stricter room and nonce grammar.
- `verify-evidence` exits `3`: inspect `payload_hash_status` and `signature_status` in stdout. The file was parsed, but its hash or detached signature did not verify.
- `verify-technocore-message` exits `3`: inspect `signature_status` and `reasons` in stdout. The supplied message profile was processable, but its detached signature did not verify.
- Shell prompt appears on the same line as JSON: expected. Successful CLI output deliberately has no trailing newline; redirect it to a file or append a newline when viewing.

## Status

This branch prepares package metadata as `0.1.0` while retaining `private: true`. GitHub currently has no stable `v0.1.0` tag or release; the latest published `v0.1.0*` release is the prerelease `v0.1.0-rc.6`. Its attached tar archive is explicitly named `valley-of-technocore-v0.1.0-rc.5.tar`, so this repository does not describe it as a stable v0.1.0 artefact. No stable release attestation is present. See the [release-readiness facts](docs/release-readiness.md) and [changelog](CHANGELOG.md); verify mutable release facts again before any release action.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
